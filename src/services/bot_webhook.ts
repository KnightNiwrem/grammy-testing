import {
  BOT_API_UPDATE_TYPES,
  type BotApiUpdate,
  type BotApiUpdateType,
  type BotApiWebhookInfo,
  DEFAULT_ALLOWED_UPDATE_TYPES,
  resolveAllowedUpdateTypes,
} from '../types/bot_api.ts';
import {
  type BotWebhook,
  getWebhookUpdateQueueKey,
  hasOnlyWebhookSecretTokenCharacters,
  MAX_WEBHOOK_SECRET_TOKEN_LENGTH,
  parseWebhookUrl,
  type WebhookDeliveryError,
} from '../types/bot_webhook.ts';

/** The header that carries a webhook's secret token, as Telegram names it. */
const SECRET_TOKEN_HEADER = 'X-Telegram-Bot-Api-Secret-Token';

/**
 * The longest wait before an update is sent again. Telegram caps it at a random value between 60
 * and 120 seconds; the emulator always caps it at 60, so that retries are timed the same way in
 * every test run.
 */
const MAX_RETRY_DELAY_SECONDS = 60;

/** The longest wait a webhook's `Retry-After` header can ask for, as Telegram limits it. */
const MAX_RETRY_AFTER_SECONDS = 3_600;

/**
 * The text of a `Retry-After` header that TDLib's `HttpQuery::get_retry_after` reads as a positive
 * number of seconds: a whole number written without a sign or leading zeros.
 */
const POSITIVE_RETRY_AFTER_PATTERN = /^[1-9]\d*$/;

/** The largest number TDLib reads from a `Retry-After` header, which is the largest `int`. */
const MAX_READABLE_RETRY_AFTER_SECONDS = 2 ** 31 - 1;

/**
 * How long a webhook may take to answer an update. Telegram's webhook connections give up after 60
 * seconds without data from the webhook.
 */
export const WEBHOOK_ATTEMPT_TIMEOUT_MILLISECONDS = 60_000;

/** Telegram's description of a webhook that answered nothing in time. */
const READ_TIMEOUT_ERROR_MESSAGE = 'Read timeout expired';

/** Update types that `getWebhookInfo` never lists, as the official Bot API server's `JsonUpdateTypes`. */
const UNLISTED_UPDATE_TYPES: readonly BotApiUpdateType[] = ['custom_event', 'custom_query'];

export interface SetWebhookRequest {
  /** Where to deliver updates; empty deletes the webhook. */
  readonly url: string;
  /** Ignored when `url` is empty. */
  readonly secretToken: string;
  /** Ignored when `url` is empty. */
  readonly maxConnections: number;
  /** Requested update type names; omitting them keeps the bot's current subscription. */
  readonly allowedUpdates?: readonly string[];
  readonly dropPendingUpdates: boolean;
}

export type SetWebhookResult =
  | {
    readonly accepted: true;
    readonly outcome:
      | 'webhook_set'
      | 'webhook_already_set'
      | 'webhook_deleted'
      | 'webhook_already_deleted';
  }
  | {
    readonly accepted: false;
    readonly reason: 'url_invalid' | 'secret_token_too_long' | 'secret_token_invalid';
  };

export interface DeleteWebhookRequest {
  readonly dropPendingUpdates: boolean;
}

export type DeleteWebhookOutcome = 'webhook_deleted' | 'webhook_already_deleted';

interface WebhookRegistration {
  readonly webhook: BotWebhook;
  readonly lastDeliveryError?: WebhookDeliveryError;
}

interface BotWebhookStore {
  get(botId: number): WebhookRegistration | undefined;
  set(botId: number, webhook: BotWebhook): void;
  delete(botId: number): void;
  recordDeliveryError(botId: number, error: WebhookDeliveryError): void;
}

interface PendingUpdateQueue {
  readPendingUpdates(botId: number): readonly BotApiUpdate[];
  confirmPendingUpdate(botId: number, updateId: number): void;
  waitForUpdate(botId: number, input: { readonly signal: AbortSignal }): Promise<void>;
  countPendingUpdates(botId: number): number;
  discardPendingUpdates(botId: number): void;
}

interface BotUpdateSubscriptionStore {
  getAllowedUpdateTypes(botId: number): ReadonlySet<BotApiUpdateType>;
  setAllowedUpdateTypes(botId: number, allowedUpdateTypes: ReadonlySet<BotApiUpdateType>): void;
}

/** Records the updates sent to webhooks and accepted by them in the session's bot activity. */
interface UpdateActivityRecorder {
  recordUpdateDeliveries(botId: number, updates: readonly BotApiUpdate[], via: 'webhook'): void;
  recordUpdateConfirmations(botId: number, updates: readonly BotApiUpdate[], via: 'webhook'): void;
}

interface BotWebhookServiceDependencies {
  readonly webhooks: BotWebhookStore;
  readonly pendingUpdates: PendingUpdateQueue;
  readonly updateSubscriptions: BotUpdateSubscriptionStore;
  readonly updateActivity: UpdateActivityRecorder;
  /** Sends a webhook request over the network, as `fetch` does. */
  readonly sendWebhookRequest: (request: Request) => Promise<Response>;
  /**
   * Runs the Bot API method, if any, that the bot's webhook names in its successful response to
   * an update, reading the response body. `signal` aborts when the delivery attempt ends.
   */
  readonly runWebhookReply: (botId: number, reply: Response, signal: AbortSignal) => Promise<void>;
  /**
   * How long an attempt to deliver an update may take before it is aborted and fails, which is
   * `WEBHOOK_ATTEMPT_TIMEOUT_MILLISECONDS` outside tests.
   */
  readonly attemptTimeoutMilliseconds: number;
  /**
   * Waits `delaySeconds` before a failed update is sent again, and resolves early once `signal`
   * aborts, as `waitForRetryDelay` does outside tests.
   */
  readonly waitBeforeRetry: (delaySeconds: number, signal: AbortSignal) => Promise<void>;
  readonly currentUnixTimeSeconds: () => number;
}

/** How an attempt to deliver an update to a webhook ended. */
type UpdateDeliveryOutcome =
  | { readonly accepted: true }
  | {
    readonly accepted: false;
    /**
     * Telegram's description of the failure, which `getWebhookInfo` reports. Telegram describes
     * no failure when the connection closes before the response is complete.
     */
    readonly errorMessage?: string;
    /** The wait the webhook asked for in its `Retry-After` header, or 0 when it asked for none. */
    readonly retryAfterSeconds: number;
  };

/** How the retries of a failing update stand, as `WebhookActor` keeps them for each update. */
interface UpdateRetryBackoff {
  readonly failureCount: number;
  /** Doubles with each later failure that has no `Retry-After`, up to the maximum. */
  readonly delaySeconds: number;
}

/** The backoff of an update that has not failed yet. */
const INITIAL_UPDATE_RETRY_BACKOFF: UpdateRetryBackoff = { failureCount: 0, delaySeconds: 1 };

/**
 * Keeps each bot's webhook and delivers the bot's pending updates to it.
 *
 * As on Telegram, an update stays pending until its webhook answers it with a 2xx status, and a
 * failed update is sent again after a growing delay, or after the delay the webhook asks for in a
 * `Retry-After` header. As the official Bot API server's `WebhookActor` does, updates wait in
 * queues, which `getWebhookUpdateQueueKey` names: each queue sends one update at a time, in order,
 * so a failing update holds back only the later updates of its queue, and up to `max_connections`
 * queues send at once. Telegram also opens its connections gradually, which the emulator does not.
 *
 * An attempt that takes too long fails as Telegram's read timeout does. Telegram times out a
 * connection that receives no data for a while; the emulator bounds each attempt as a whole,
 * whatever the sender of its requests does, so a webhook that never answers cannot stall delivery.
 */
export class BotWebhookService {
  readonly #webhooks: BotWebhookStore;
  readonly #pendingUpdates: PendingUpdateQueue;
  readonly #updateSubscriptions: BotUpdateSubscriptionStore;
  readonly #updateActivity: UpdateActivityRecorder;
  readonly #sendWebhookRequest: (request: Request) => Promise<Response>;
  readonly #runWebhookReply: (botId: number, reply: Response, signal: AbortSignal) => Promise<void>;
  readonly #attemptTimeoutMilliseconds: number;
  readonly #waitBeforeRetry: (delaySeconds: number, signal: AbortSignal) => Promise<void>;
  readonly #currentUnixTimeSeconds: () => number;
  /** Aborting a bot's controller stops delivery to its webhook, including a request in flight. */
  readonly #deliveriesByBotId = new Map<number, AbortController>();
  /** Aborted when delivery ends for good, after which no webhook delivers again. */
  readonly #deliveryEnd = new AbortController();

  constructor(
    {
      webhooks,
      pendingUpdates,
      updateSubscriptions,
      updateActivity,
      sendWebhookRequest,
      runWebhookReply,
      attemptTimeoutMilliseconds,
      waitBeforeRetry,
      currentUnixTimeSeconds,
    }: BotWebhookServiceDependencies,
  ) {
    this.#webhooks = webhooks;
    this.#pendingUpdates = pendingUpdates;
    this.#updateSubscriptions = updateSubscriptions;
    this.#updateActivity = updateActivity;
    this.#sendWebhookRequest = sendWebhookRequest;
    this.#runWebhookReply = runWebhookReply;
    this.#attemptTimeoutMilliseconds = attemptTimeoutMilliseconds;
    this.#waitBeforeRetry = waitBeforeRetry;
    this.#currentUnixTimeSeconds = currentUnixTimeSeconds;
  }

  hasWebhook(botId: number): boolean {
    return this.#webhooks.get(botId) !== undefined;
  }

  /**
   * Sets, replaces, or, with an empty URL, deletes the bot's webhook, as the official Bot API
   * server's `process_set_webhook_query` does. A request that changes nothing keeps the webhook
   * and its delivery error, and only changes the subscription. Otherwise delivery restarts, and
   * the previous webhook's delivery error is forgotten.
   *
   * Telegram validates the URL and secret token only after it has removed the previous webhook
   * and dropped pending updates; the emulator rejects them before changing anything.
   */
  setWebhook(botId: number, request: SetWebhookRequest): SetWebhookResult {
    if (request.url.length === 0) {
      return { accepted: true, outcome: this.#removeWebhook(botId, request) };
    }
    const requestedWebhook: BotWebhook = {
      url: request.url,
      secretToken: request.secretToken,
      maxConnections: request.maxConnections,
    };
    const rejectionReason = findWebhookRejectionReason(requestedWebhook);
    if (rejectionReason !== undefined) {
      return { accepted: false, reason: rejectionReason };
    }

    const currentWebhook = this.#webhooks.get(botId)?.webhook;
    if (
      currentWebhook !== undefined && isSameWebhook(currentWebhook, requestedWebhook) &&
      !request.dropPendingUpdates
    ) {
      this.#updateSubscription(botId, request.allowedUpdates);
      return { accepted: true, outcome: 'webhook_already_set' };
    }

    this.#stopDelivery(botId);
    if (request.dropPendingUpdates) {
      this.#pendingUpdates.discardPendingUpdates(botId);
    }
    this.#webhooks.set(botId, requestedWebhook);
    this.#updateSubscription(botId, request.allowedUpdates);
    this.#startDelivery(botId, requestedWebhook);
    return { accepted: true, outcome: 'webhook_set' };
  }

  /** Deletes the bot's webhook, as `setWebhook` with an empty URL does. */
  deleteWebhook(botId: number, { dropPendingUpdates }: DeleteWebhookRequest): DeleteWebhookOutcome {
    return this.#removeWebhook(botId, { dropPendingUpdates });
  }

  getWebhookInfo(botId: number): BotApiWebhookInfo {
    const registration = this.#webhooks.get(botId);
    const allowedUpdateTypes = this.#updateSubscriptions.getAllowedUpdateTypes(botId);
    return {
      url: registration?.webhook.url ?? '',
      has_custom_certificate: false,
      pending_update_count: this.#pendingUpdates.countPendingUpdates(botId),
      ...(registration?.lastDeliveryError === undefined ? {} : {
        last_error_date: registration.lastDeliveryError.dateUnixSeconds,
        last_error_message: registration.lastDeliveryError.message,
      }),
      ...(registration === undefined
        ? {}
        : { max_connections: registration.webhook.maxConnections }),
      ...(isDefaultSubscription(allowedUpdateTypes) ? {} : {
        allowed_updates: BOT_API_UPDATE_TYPES.filter((updateType) =>
          allowedUpdateTypes.has(updateType) && !UNLISTED_UPDATE_TYPES.includes(updateType)
        ),
      }),
    };
  }

  /**
   * Stops every delivery, including requests in flight, whose updates stay pending. Webhooks set
   * afterward deliver nothing.
   */
  endDelivery(): void {
    this.#deliveryEnd.abort();
    for (const botId of [...this.#deliveriesByBotId.keys()]) {
      this.#stopDelivery(botId);
    }
  }

  #removeWebhook(
    botId: number,
    { allowedUpdates, dropPendingUpdates }: {
      readonly allowedUpdates?: readonly string[];
      readonly dropPendingUpdates: boolean;
    },
  ): DeleteWebhookOutcome {
    const hadWebhook = this.hasWebhook(botId);
    if (!hadWebhook && !dropPendingUpdates) {
      // Like any request that changes no webhook, this one changes the subscription on Telegram.
      this.#updateSubscription(botId, allowedUpdates);
      return 'webhook_already_deleted';
    }

    this.#stopDelivery(botId);
    if (dropPendingUpdates) {
      this.#pendingUpdates.discardPendingUpdates(botId);
    }
    this.#webhooks.delete(botId);
    return hadWebhook ? 'webhook_deleted' : 'webhook_already_deleted';
  }

  #updateSubscription(botId: number, allowedUpdates: readonly string[] | undefined): void {
    if (allowedUpdates !== undefined) {
      this.#updateSubscriptions.setAllowedUpdateTypes(
        botId,
        resolveAllowedUpdateTypes(allowedUpdates),
      );
    }
  }

  #startDelivery(botId: number, webhook: BotWebhook): void {
    if (this.#deliveryEnd.signal.aborted) {
      return;
    }
    const delivery = new AbortController();
    this.#deliveriesByBotId.set(botId, delivery);
    void this.#deliverPendingUpdates(botId, webhook, delivery.signal);
  }

  #stopDelivery(botId: number): void {
    this.#deliveriesByBotId.get(botId)?.abort();
    this.#deliveriesByBotId.delete(botId);
  }

  /**
   * Delivers the bot's pending updates to its webhook until `signal` aborts, sending each queue's
   * updates with its own worker while the queue has any.
   */
  async #deliverPendingUpdates(
    botId: number,
    webhook: BotWebhook,
    signal: AbortSignal,
  ): Promise<void> {
    const connections = new WebhookConnectionLimit(webhook.maxConnections);
    const deliveringQueueKeys = new Set<string>();
    let wakeUp = () => {};
    while (!signal.aborted) {
      const queueEnded = new Promise<void>((resolve) => {
        wakeUp = resolve;
      });
      for (const update of this.#pendingUpdates.readPendingUpdates(botId)) {
        const queueKey = getWebhookUpdateQueueKey(update);
        if (deliveringQueueKeys.has(queueKey)) {
          continue;
        }
        deliveringQueueKeys.add(queueKey);
        void this.#deliverQueue(botId, webhook, queueKey, connections, signal).finally(() => {
          deliveringQueueKeys.delete(queueKey);
          wakeUp();
        });
      }

      const updateWait = new AbortController();
      await Promise.race([
        this.#pendingUpdates.waitForUpdate(botId, {
          signal: AbortSignal.any([signal, updateWait.signal]),
        }),
        queueEnded,
      ]);
      updateWait.abort();
    }
  }

  /**
   * Sends the pending updates of one queue to the webhook one at a time, each over a connection
   * of `connections`, until the queue has none left or `signal` aborts. An update is confirmed, and
   * its confirmation recorded as bot activity, once the webhook accepts it; a failed update is sent
   * again after its retry delay, during which the queue uses no connection. Aborting leaves the
   * update in flight pending.
   */
  async #deliverQueue(
    botId: number,
    webhook: BotWebhook,
    queueKey: string,
    connections: WebhookConnectionLimit,
    signal: AbortSignal,
  ): Promise<void> {
    let failingUpdateId: number | undefined;
    let retryBackoff = INITIAL_UPDATE_RETRY_BACKOFF;
    while (!signal.aborted) {
      const update = this.#pendingUpdates.readPendingUpdates(botId).find((pendingUpdate) =>
        getWebhookUpdateQueueKey(pendingUpdate) === queueKey
      );
      if (update === undefined) {
        return;
      }

      const releaseConnection = await connections.acquire(signal);
      if (releaseConnection === undefined) {
        return;
      }
      let outcome: UpdateDeliveryOutcome;
      try {
        outcome = await this.#sendUpdate(botId, webhook, update, signal);
      } finally {
        releaseConnection();
      }
      if (signal.aborted) {
        return;
      }
      if (outcome.accepted) {
        this.#pendingUpdates.confirmPendingUpdate(botId, update.update_id);
        this.#updateActivity.recordUpdateConfirmations(botId, [update], 'webhook');
        continue;
      }

      if (outcome.errorMessage !== undefined) {
        this.#webhooks.recordDeliveryError(botId, {
          dateUnixSeconds: this.#currentUnixTimeSeconds(),
          message: outcome.errorMessage,
        });
      }
      if (failingUpdateId !== update.update_id) {
        failingUpdateId = update.update_id;
        retryBackoff = INITIAL_UPDATE_RETRY_BACKOFF;
      }
      const retry = scheduleUpdateRetry(retryBackoff, outcome.retryAfterSeconds);
      retryBackoff = retry.backoff;
      await this.#waitBeforeRetry(retry.delaySeconds, signal);
    }
  }

  /**
   * Posts the update to the webhook as the official Bot API server's `WebhookActor` does, and
   * returns whether the webhook accepted it. The attempt ends when `deliverySignal` aborts, or
   * fails once it outlasts its timeout.
   *
   * As on Telegram, the webhook answers only once its whole response has arrived, so a response
   * whose body fails or does not arrive in time fails the attempt, whatever its status. A complete
   * successful response may name a Bot API method, which runs before the update's queue sends its
   * next update; the method's failure leaves the update delivered.
   *
   * Each attempt is recorded as a delivery of the update in the session's bot activity.
   */
  async #sendUpdate(
    botId: number,
    webhook: BotWebhook,
    update: BotApiUpdate,
    deliverySignal: AbortSignal,
  ): Promise<UpdateDeliveryOutcome> {
    const timeout = new AbortController();
    const timeoutId = setTimeout(() => timeout.abort(), this.#attemptTimeoutMilliseconds);
    const attemptSignal = AbortSignal.any([deliverySignal, timeout.signal]);
    try {
      const request = createWebhookRequest(webhook, update, attemptSignal);
      this.#updateActivity.recordUpdateDeliveries(botId, [update], 'webhook');
      let response: Response;
      try {
        response = await settleUnlessAborted(this.#sendWebhookRequest(request), attemptSignal);
      } catch {
        // Telegram reports other failures to connect without their cause.
        return {
          accepted: false,
          errorMessage: timeout.signal.aborted
            ? READ_TIMEOUT_ERROR_MESSAGE
            : "Can't connect to the webhook",
          retryAfterSeconds: 0,
        };
      }
      let body: ArrayBuffer;
      try {
        body = await settleUnlessAborted(response.arrayBuffer(), attemptSignal);
      } catch {
        // Telegram reports a response cut short by its connection closing without a description.
        return timeout.signal.aborted
          ? { accepted: false, errorMessage: READ_TIMEOUT_ERROR_MESSAGE, retryAfterSeconds: 0 }
          : { accepted: false, retryAfterSeconds: 0 };
      }
      if (response.status < 200 || response.status > 299) {
        return {
          accepted: false,
          errorMessage:
            `Wrong response from the webhook: ${response.status} ${response.statusText}`,
          retryAfterSeconds: readRetryAfterSeconds(response),
        };
      }

      const { status, statusText, headers } = response;
      const reply = new Response(body.byteLength === 0 ? null : body, {
        status,
        statusText,
        headers,
      });
      try {
        await settleUnlessAborted(
          this.#runWebhookReply(botId, reply, attemptSignal),
          attemptSignal,
        );
      } catch {
        // The complete response decides the outcome, so the method it names cannot change it.
      }
      return { accepted: true };
    } finally {
      clearTimeout(timeoutId);
    }
  }
}

/**
 * Limits how many updates a webhook is sent at once, as `max_connections` limits the official Bot
 * API server's connections to it. Waiting queues take connections in the order they asked.
 */
class WebhookConnectionLimit {
  #availableConnectionCount: number;
  readonly #waitingAcquirers: Array<() => void> = [];

  constructor(maxConnections: number) {
    this.#availableConnectionCount = maxConnections;
  }

  /**
   * Resolves with the release of a connection once one is available, or with `undefined` when
   * `signal` aborts first.
   */
  acquire(signal: AbortSignal): Promise<(() => void) | undefined> {
    if (signal.aborted) {
      return Promise.resolve(undefined);
    }
    if (this.#availableConnectionCount > 0) {
      this.#availableConnectionCount--;
      return Promise.resolve(this.#createRelease());
    }
    return new Promise((resolve) => {
      const acquireConnection = () => {
        signal.removeEventListener('abort', giveUp);
        resolve(this.#createRelease());
      };
      const giveUp = () => {
        this.#waitingAcquirers.splice(this.#waitingAcquirers.indexOf(acquireConnection), 1);
        resolve(undefined);
      };
      this.#waitingAcquirers.push(acquireConnection);
      signal.addEventListener('abort', giveUp, { once: true });
    });
  }

  /** Creates the release of an acquired connection, which hands it to the longest waiting queue. */
  #createRelease(): () => void {
    let isReleased = false;
    return () => {
      if (isReleased) {
        return;
      }
      isReleased = true;
      const nextAcquirer = this.#waitingAcquirers.shift();
      if (nextAcquirer === undefined) {
        this.#availableConnectionCount++;
      } else {
        nextAcquirer();
      }
    };
  }
}

function findWebhookRejectionReason(
  webhook: BotWebhook,
): Extract<SetWebhookResult, { readonly accepted: false }>['reason'] | undefined {
  if (parseWebhookUrl(webhook.url) === undefined) {
    return 'url_invalid';
  }
  if (webhook.secretToken.length > MAX_WEBHOOK_SECRET_TOKEN_LENGTH) {
    return 'secret_token_too_long';
  }
  if (!hasOnlyWebhookSecretTokenCharacters(webhook.secretToken)) {
    return 'secret_token_invalid';
  }
  return undefined;
}

function isSameWebhook(first: BotWebhook, second: BotWebhook): boolean {
  return first.url === second.url && first.secretToken === second.secretToken &&
    first.maxConnections === second.maxConnections;
}

/**
 * Counts another failure of an update and returns how long to wait before sending it again, as
 * the official Bot API server's `WebhookActor::on_update_error` does. A positive `Retry-After`
 * sets the wait, up to an hour, and leaves the backoff delay as it is. Otherwise the first failure
 * is retried at once, and each later one after twice the previous backoff delay, starting at 2
 * seconds.
 */
function scheduleUpdateRetry(
  backoff: UpdateRetryBackoff,
  retryAfterSeconds: number,
): { readonly delaySeconds: number; readonly backoff: UpdateRetryBackoff } {
  const failureCount = backoff.failureCount + 1;
  if (retryAfterSeconds > 0) {
    return {
      delaySeconds: Math.min(retryAfterSeconds, MAX_RETRY_AFTER_SECONDS),
      backoff: { failureCount, delaySeconds: backoff.delaySeconds },
    };
  }
  if (backoff.failureCount === 0) {
    return { delaySeconds: 0, backoff: { failureCount, delaySeconds: backoff.delaySeconds } };
  }
  const delaySeconds = Math.min(MAX_RETRY_DELAY_SECONDS, backoff.delaySeconds * 2);
  return { delaySeconds, backoff: { failureCount, delaySeconds } };
}

/**
 * Reads the wait, in seconds, that a failed response asks for in its `Retry-After` header, as
 * TDLib's `HttpQuery::get_retry_after` does. Anything but a whole number of seconds, such as an
 * HTTP date, asks for none, which is 0.
 */
function readRetryAfterSeconds(response: Response): number {
  const retryAfter = response.headers.get('Retry-After') ?? '';
  if (!POSITIVE_RETRY_AFTER_PATTERN.test(retryAfter)) {
    return 0;
  }
  const retryAfterSeconds = Number(retryAfter);
  return retryAfterSeconds <= MAX_READABLE_RETRY_AFTER_SECONDS ? retryAfterSeconds : 0;
}

function isDefaultSubscription(allowedUpdateTypes: ReadonlySet<BotApiUpdateType>): boolean {
  return allowedUpdateTypes.size === DEFAULT_ALLOWED_UPDATE_TYPES.size &&
    [...allowedUpdateTypes].every((updateType) => DEFAULT_ALLOWED_UPDATE_TYPES.has(updateType));
}

/**
 * Builds the POST request that delivers an update. As on Telegram, credentials in the URL become
 * a Basic `Authorization` header, and redirects are not followed, so they count as failures.
 */
function createWebhookRequest(
  webhook: BotWebhook,
  update: BotApiUpdate,
  signal: AbortSignal,
): Request {
  const url = parseWebhookUrl(webhook.url);
  if (url === undefined) {
    throw new Error(`Webhook URL ${webhook.url} was accepted but cannot be parsed`);
  }
  const headers = new Headers({ 'Content-Type': 'application/json' });
  if (url.username.length > 0 || url.password.length > 0) {
    const userInfo = url.password.length > 0 ? `${url.username}:${url.password}` : url.username;
    headers.set('Authorization', `Basic ${btoa(userInfo)}`);
    url.username = '';
    url.password = '';
  }
  if (webhook.secretToken.length > 0) {
    headers.set(SECRET_TOKEN_HEADER, webhook.secretToken);
  }
  return new Request(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(update),
    redirect: 'manual',
    signal,
  });
}

/**
 * Settles as `promise` does, unless `signal` aborts first, which rejects with its reason. The
 * promise may keep running; its later outcome is ignored.
 */
function settleUnlessAborted<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) {
    return Promise.reject(signal.reason);
  }
  return new Promise((resolve, reject) => {
    const rejectOnAbort = () => reject(signal.reason);
    signal.addEventListener('abort', rejectOnAbort, { once: true });
    promise.then(resolve, reject).finally(() => {
      signal.removeEventListener('abort', rejectOnAbort);
    });
  });
}

/** Resolves after the delay, or at once when `signal` aborts. */
export function waitForRetryDelay(delaySeconds: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) {
      resolve();
      return;
    }
    const finish = () => {
      clearTimeout(timeoutId);
      signal.removeEventListener('abort', finish);
      resolve();
    };
    const timeoutId = setTimeout(finish, delaySeconds * 1_000);
    signal.addEventListener('abort', finish, { once: true });
  });
}
