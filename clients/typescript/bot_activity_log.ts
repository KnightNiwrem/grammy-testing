import { HTTP_STATUS_OK } from './constants.ts';
import { botActivityReadResponseSchema } from './schemas.ts';
import type {
  BotActivityCursor,
  BotActivityEntry,
  BotActivityEntryMatching,
  BotActivityFilter,
  BotActivityLog,
  BotActivityLogOptions,
  BotActivityPosition,
  BotActivityRange,
  WaitForBotActivityOptions,
} from './types.ts';
import { requestJson } from './utils.ts';

const DEFAULT_TIMEOUT_MILLISECONDS = 5_000;
/** The most entries the server answers a read with. */
const READ_LIMIT = 1_000;

/** Returns the latest of the positions, such as the later of two entries. */
export function latest(
  firstPosition: BotActivityPosition,
  ...otherPositions: readonly BotActivityPosition[]
): number {
  return Math.max(...[firstPosition, ...otherPositions].map(toPositionNumber));
}

/** No entry matching a filter was recorded after a position before the wait ended. */
export class BotActivityTimeoutError extends Error {
  override readonly name = 'BotActivityTimeoutError';
  readonly filter: BotActivityFilter;
  readonly after: number;
  readonly timeoutMs: number;

  constructor(filter: BotActivityFilter, after: number, timeoutMs: number) {
    super(
      `No bot activity matching ${describeFilter(filter)} was recorded after position ${after} ` +
        `within ${timeoutMs} ms`,
    );
    this.filter = filter;
    this.after = after;
    this.timeoutMs = timeoutMs;
  }
}

/** Entries matching a filter were recorded in a range that should hold none. */
export class UnexpectedBotActivityError extends Error {
  override readonly name = 'UnexpectedBotActivityError';
  readonly filter: BotActivityFilter;
  readonly after: number;
  readonly before: number;
  readonly entries: readonly BotActivityEntry[];

  constructor(
    filter: BotActivityFilter,
    after: number,
    before: number,
    entries: readonly BotActivityEntry[],
  ) {
    super(
      `Expected no bot activity matching ${describeFilter(filter)} after position ${after} ` +
        `and before position ${before}, found ${entries.length} entries: ${
          JSON.stringify(entries)
        }`,
    );
    this.filter = filter;
    this.after = after;
    this.before = before;
    this.entries = entries;
  }
}

export function createBotActivityLog(
  activityUrl: string,
  fetchImplementation: typeof globalThis.fetch,
  baseFilter: BotActivityFilter,
  { timeoutMs = DEFAULT_TIMEOUT_MILLISECONDS }: BotActivityLogOptions,
): BotActivityLog {
  validateTimeout(timeoutMs);
  return new HttpBotActivityLog(activityUrl, fetchImplementation, baseFilter, timeoutMs);
}

interface BotActivityRead {
  readonly after: number;
  readonly before?: number;
  readonly filter: BotActivityFilter;
  readonly limit: number;
  readonly waitMilliseconds?: number;
}

class HttpBotActivityLog implements BotActivityLog {
  readonly #activityUrl: string;
  readonly #fetch: typeof globalThis.fetch;
  readonly #baseFilter: BotActivityFilter;
  readonly #defaultTimeoutMilliseconds: number;

  constructor(
    activityUrl: string,
    fetchImplementation: typeof globalThis.fetch,
    baseFilter: BotActivityFilter,
    defaultTimeoutMilliseconds: number,
  ) {
    this.#activityUrl = activityUrl;
    this.#fetch = fetchImplementation;
    this.#baseFilter = baseFilter;
    this.#defaultTimeoutMilliseconds = defaultTimeoutMilliseconds;
  }

  async position(): Promise<number> {
    const { head_position } = await this.#read({ after: 0, filter: {}, limit: 0 });
    return head_position;
  }

  async waitFor<const Filter extends BotActivityFilter>(
    filter: Filter,
    { after, timeoutMs = this.#defaultTimeoutMilliseconds }: WaitForBotActivityOptions,
  ): Promise<BotActivityEntryMatching<Filter>> {
    validateTimeout(timeoutMs);
    const combinedFilter = combineFilters(this.#baseFilter, filter);
    const afterPosition = toPositionNumber(after);
    const deadline = performance.now() + timeoutMs;
    let unreadAfter = afterPosition;
    for (;;) {
      const remainingMilliseconds = Math.max(0, Math.ceil(deadline - performance.now()));
      const { entries, head_position } = await this.#read({
        after: unreadAfter,
        filter: combinedFilter,
        limit: READ_LIMIT,
        waitMilliseconds: remainingMilliseconds,
      });
      const match = entries.find((entry) => combinedFilter.where?.(entry) ?? true);
      if (match !== undefined) {
        if (!isEntryMatching(match, filter)) {
          throw new TypeError(
            `The emulator answered a read for ${describeFilter(filter)} with an entry of kind ` +
              match.kind,
          );
        }
        return match;
      }
      // A read that filled its limit may have left later entries unread, which are checked even
      // after the wait ends; any other read read every entry up to the head.
      const leftEntriesUnread = entries.length === READ_LIMIT;
      if (!leftEntriesUnread && remainingMilliseconds === 0) {
        throw new BotActivityTimeoutError(combinedFilter, afterPosition, timeoutMs);
      }
      unreadAfter = leftEntriesUnread
        ? entries[entries.length - 1].position
        : Math.max(unreadAfter, head_position);
    }
  }

  async assertNone(filter: BotActivityFilter, { after, before }: BotActivityRange): Promise<void> {
    const combinedFilter = combineFilters(this.#baseFilter, filter);
    const afterPosition = toPositionNumber(after);
    const beforePosition = toPositionNumber(before);
    const matchingEntries: BotActivityEntry[] = [];
    let unreadAfter = afterPosition;
    for (;;) {
      const { entries } = await this.#read({
        after: unreadAfter,
        before: beforePosition,
        filter: combinedFilter,
        limit: READ_LIMIT,
      });
      matchingEntries.push(
        ...entries.filter((entry) => combinedFilter.where?.(entry) ?? true),
      );
      if (entries.length < READ_LIMIT) {
        break;
      }
      unreadAfter = entries[entries.length - 1].position;
    }
    if (matchingEntries.length > 0) {
      throw new UnexpectedBotActivityError(
        combinedFilter,
        afterPosition,
        beforePosition,
        matchingEntries,
      );
    }
  }

  cursor({ after }: { readonly after: BotActivityPosition }): BotActivityCursor {
    let position = toPositionNumber(after);
    const waitFor = this.waitFor.bind(this);
    return {
      get position() {
        return position;
      },
      async next<const Filter extends BotActivityFilter>(
        filter: Filter,
        options: { readonly timeoutMs?: number } = {},
      ): Promise<BotActivityEntryMatching<Filter>> {
        const entry = await waitFor(filter, { after: position, ...options });
        position = entry.position;
        return entry;
      },
    };
  }

  #read({ after, before, filter, limit, waitMilliseconds }: BotActivityRead) {
    const query = new URLSearchParams({ after: String(after), limit: String(limit) });
    if (before !== undefined) {
      query.set('before', String(before));
    }
    if (waitMilliseconds !== undefined) {
      query.set('wait_ms', String(waitMilliseconds));
    }
    const { bot_id, kind, method, chat_id, user_id, ok, parameters } = filter;
    const criteria = { bot_id, kind, method, chat_id, user_id, ok };
    for (const [name, value] of Object.entries(criteria)) {
      if (value !== undefined) {
        query.set(name, String(value));
      }
    }
    for (const [name, text] of Object.entries(parameters ?? {})) {
      query.set(`parameters[${name}]`, text);
    }
    return requestJson(this.#fetch, {
      method: 'GET',
      url: `${this.#activityUrl}?${query}`,
      expectedStatus: HTTP_STATUS_OK,
      responseSchema: botActivityReadResponseSchema,
    });
  }
}

/**
 * Combines the log's filter with a read's into one that an entry satisfies only by satisfying
 * both. Two different values for one criterion could match no entry, so they are rejected as a
 * mistake.
 */
function combineFilters(
  logFilter: BotActivityFilter,
  readFilter: BotActivityFilter,
): BotActivityFilter {
  const parameters: Record<string, string> = { ...logFilter.parameters };
  for (const [name, text] of Object.entries(readFilter.parameters ?? {})) {
    assertCompatibleCriteria(`parameter ${name}`, parameters[name], text);
    parameters[name] = text;
  }
  const { where: logWhere } = logFilter;
  const { where: readWhere } = readFilter;
  return {
    bot_id: combineCriterion('bot_id', logFilter.bot_id, readFilter.bot_id),
    kind: combineCriterion('kind', logFilter.kind, readFilter.kind),
    method: combineCriterion(
      'method',
      logFilter.method,
      readFilter.method,
      (method) => method.toLowerCase(),
    ),
    chat_id: combineCriterion('chat_id', logFilter.chat_id, readFilter.chat_id),
    user_id: combineCriterion('user_id', logFilter.user_id, readFilter.user_id),
    ok: combineCriterion('ok', logFilter.ok, readFilter.ok),
    ...(Object.keys(parameters).length === 0 ? {} : { parameters }),
    ...(logWhere === undefined || readWhere === undefined
      ? { where: logWhere ?? readWhere }
      : { where: (entry: BotActivityEntry) => logWhere(entry) && readWhere(entry) }),
  };
}

function combineCriterion<Value>(
  name: string,
  logValue: Value | undefined,
  readValue: Value | undefined,
  normalize?: (value: Value) => unknown,
): Value | undefined {
  assertCompatibleCriteria(name, logValue, readValue, normalize);
  return readValue ?? logValue;
}

function assertCompatibleCriteria<Value>(
  name: string,
  logValue: Value | undefined,
  readValue: Value | undefined,
  normalize: (value: Value) => unknown = (value) => value,
): void {
  if (
    logValue !== undefined && readValue !== undefined &&
    normalize(logValue) !== normalize(readValue)
  ) {
    throw new TypeError(
      `The read's ${name} ${JSON.stringify(readValue)} conflicts with the log's ${
        JSON.stringify(logValue)
      }`,
    );
  }
}

/**
 * Checks that an entry the server matched is of a kind the filter can match, as its type
 * promises.
 */
function isEntryMatching<Filter extends BotActivityFilter>(
  entry: BotActivityEntry,
  filter: Filter,
): entry is BotActivityEntryMatching<Filter> {
  if (filter.kind !== undefined) {
    return entry.kind === filter.kind;
  }
  if (filter.method !== undefined || filter.ok !== undefined || filter.parameters !== undefined) {
    return entry.kind === 'bot_api_call';
  }
  if (filter.user_id !== undefined) {
    return entry.kind !== 'bot_api_call';
  }
  return true;
}

function toPositionNumber(position: BotActivityPosition): number {
  const positionNumber = typeof position === 'number' ? position : position.position;
  if (!Number.isInteger(positionNumber) || positionNumber < 0) {
    throw new TypeError(`A bot activity position must be a nonnegative integer: ${positionNumber}`);
  }
  return positionNumber;
}

function validateTimeout(timeoutMs: number): void {
  if (!Number.isFinite(timeoutMs) || timeoutMs < 0) {
    throw new TypeError(`A bot activity timeout must be a nonnegative number: ${timeoutMs}`);
  }
}

function describeFilter(filter: BotActivityFilter): string {
  const { where, ...criteria } = filter;
  return `${JSON.stringify(criteria)}${where === undefined ? '' : ' and its where predicate'}`;
}
