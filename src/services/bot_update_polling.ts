import {
  BOT_API_UPDATE_TYPES,
  type BotApiUpdate,
  type BotApiUpdateType,
  DEFAULT_ALLOWED_UPDATE_TYPES,
} from '../types/bot_api.ts';

export interface GetUpdatesRequest {
  readonly offset?: number;
  readonly limit: number;
  readonly timeoutSeconds: number;
  /** Requested update type names; omitting them keeps the bot's current subscription. */
  readonly allowedUpdates?: readonly string[];
  readonly signal?: AbortSignal;
}

export type GetUpdatesResult =
  | { readonly retrieved: true; readonly updates: readonly BotApiUpdate[] }
  | { readonly retrieved: false; readonly reason: 'terminated_by_other_long_poll' };

interface PendingUpdateQueue {
  resolveFirstUnconfirmedUpdateId(botId: number, offset: number | undefined): number | undefined;
  confirmAndReadPendingUpdates(
    botId: number,
    input: { readonly firstUnconfirmedUpdateId?: number; readonly limit: number },
  ): readonly BotApiUpdate[];
  waitForUpdate(
    botId: number,
    input: { readonly timeoutSeconds: number; readonly signal?: AbortSignal },
  ): Promise<void>;
}

interface BotUpdateSubscriptionStore {
  setAllowedUpdateTypes(botId: number, allowedUpdateTypes: ReadonlySet<BotApiUpdateType>): void;
}

interface BotUpdatePollingServiceDependencies {
  readonly botUpdates: PendingUpdateQueue;
  readonly updateSubscriptions: BotUpdateSubscriptionStore;
}

/**
 * Coordinates each bot's `getUpdates` requests against its subscription and pending update queue,
 * including request cancellation, competing held requests, and the end of long polling.
 */
export class BotUpdatePollingService {
  readonly #botUpdates: PendingUpdateQueue;
  readonly #updateSubscriptions: BotUpdateSubscriptionStore;
  /** Aborting a bot's controller terminates the long poll it holds. */
  readonly #heldLongPollsByBotId = new Map<number, AbortController>();
  /**
   * Aborted when long polling ends. Kept apart from the held long poll controllers so that the end
   * of polling is never reported as a conflict with another long poll.
   */
  readonly #longPollingEnd = new AbortController();

  constructor({ botUpdates, updateSubscriptions }: BotUpdatePollingServiceDependencies) {
    this.#botUpdates = botUpdates;
    this.#updateSubscriptions = updateSubscriptions;
  }

  /**
   * Changes the bot's subscription before reading its queue, as Telegram does. The new
   * subscription applies only to updates created afterward; pending updates are still returned.
   *
   * A request that finds no updates and has a timeout is held until an update arrives. Like
   * Telegram, a bot has at most one held request: holding a new one terminates the previous one.
   * Requests answered immediately never terminate a held one. Once long polling has ended, no
   * request is held.
   */
  async getUpdates(
    botId: number,
    { offset, limit, timeoutSeconds, allowedUpdates, signal }: GetUpdatesRequest,
  ): Promise<GetUpdatesResult> {
    if (allowedUpdates !== undefined) {
      this.#updateSubscriptions.setAllowedUpdateTypes(
        botId,
        resolveAllowedUpdateTypes(allowedUpdates),
      );
    }

    // Telegram resolves a negative offset once, when the request arrives, so updates enqueued while
    // this request waits are not cut from the tail again.
    const firstUnconfirmedUpdateId = this.#botUpdates.resolveFirstUnconfirmedUpdateId(
      botId,
      offset,
    );
    const updates = this.#botUpdates.confirmAndReadPendingUpdates(botId, {
      firstUnconfirmedUpdateId,
      limit,
    });
    if (
      updates.length > 0 || timeoutSeconds === 0 || signal?.aborted === true ||
      this.#longPollingEnd.signal.aborted
    ) {
      return { retrieved: true, updates };
    }

    const heldLongPoll = this.#holdLongPoll(botId);
    const waitEndingSignals = [heldLongPoll.signal, this.#longPollingEnd.signal];
    if (signal !== undefined) {
      waitEndingSignals.push(signal);
    }
    try {
      await this.#botUpdates.waitForUpdate(botId, {
        timeoutSeconds,
        signal: AbortSignal.any(waitEndingSignals),
      });
    } finally {
      if (this.#heldLongPollsByBotId.get(botId) === heldLongPoll) {
        this.#heldLongPollsByBotId.delete(botId);
      }
    }

    if (heldLongPoll.signal.aborted) {
      return { retrieved: false, reason: 'terminated_by_other_long_poll' };
    }
    return {
      retrieved: true,
      updates: this.#botUpdates.confirmAndReadPendingUpdates(botId, {
        firstUnconfirmedUpdateId,
        limit,
      }),
    };
  }

  /**
   * Answers every held long poll with the updates it can read, as its timeout would, and stops
   * holding later ones, which are answered at once with the updates they can read.
   */
  endLongPolling(): void {
    this.#longPollingEnd.abort();
  }

  /** Terminates the bot's previously held long poll and makes the returned one current. */
  #holdLongPoll(botId: number): AbortController {
    this.#heldLongPollsByBotId.get(botId)?.abort();
    const heldLongPoll = new AbortController();
    this.#heldLongPollsByBotId.set(botId, heldLongPoll);
    return heldLongPoll;
  }
}

/**
 * Interprets `allowed_updates` as Telegram's `get_allowed_update_types` does: names match
 * case-insensitively, unrecognized names are ignored, and a list with no recognized name selects
 * the default subscription.
 */
function resolveAllowedUpdateTypes(
  requestedUpdateTypeNames: readonly string[],
): ReadonlySet<BotApiUpdateType> {
  const requestedNames = new Set(requestedUpdateTypeNames.map((name) => name.toLowerCase()));
  const allowedUpdateTypes = new Set(
    BOT_API_UPDATE_TYPES.filter((updateType) => requestedNames.has(updateType)),
  );
  return allowedUpdateTypes.size === 0 ? DEFAULT_ALLOWED_UPDATE_TYPES : allowedUpdateTypes;
}
