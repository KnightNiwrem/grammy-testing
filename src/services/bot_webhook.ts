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
  confirmAndReadPendingUpdates(
    botId: number,
    input: { readonly firstUnconfirmedUpdateId?: number; readonly limit: number },
  ): readonly BotApiUpdate[];
  waitForUpdate(botId: number, input: { readonly signal: AbortSignal }): Promise<void>;
  countPendingUpdates(botId: number): number;
  discardPendingUpdates(botId: number): void;
}

interface BotUpdateSubscriptionStore {
  getAllowedUpdateTypes(botId: number): ReadonlySet<BotApiUpdateType>;
  setAllowedUpdateTypes(botId: number, allowedUpdateTypes: ReadonlySet<BotApiUpdateType>): void;
}

interface BotWebhookServiceDependencies {
  readonly webhooks: BotWebhookStore;
  readonly pendingUpdates: PendingUpdateQueue;
  readonly updateSubscriptions: BotUpdateSubscriptionStore;
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
  readonly currentUnixTimeSeconds: () => number;
}

/**
 * Keeps each bot's webhook and delivers the bot's pending updates to it.
 *
 * As on Telegram, an update stays pending until its webhook answers it with a 2xx status, and a
 * failed update is sent again after a growing delay. Telegram sends updates of different chats
 * over up to `max_connections` connections at once; the emulator sends one update at a time, in
 * order, so a failing update holds back later ones.
 *
 * An attempt that takes too long fails as Telegram's read timeout does. Telegram times out a
 * connection that receives no data for a while; the emulator bounds each attempt as a whole,
 * whatever the sender of its requests does, so a webhook that never answers cannot stall delivery.
 */
export class BotWebhookService {
  readonly #webhooks: BotWebhookStore;
  readonly #pendingUpdates: PendingUpdateQueue;
  readonly #updateSubscriptions: BotUpdateSubscriptionStore;
  readonly #sendWebhookRequest: (request: Request) => Promise<Response>;
  readonly #runWebhookReply: (botId: number, reply: Response, signal: AbortSignal) => Promise<void>;
  readonly #attemptTimeoutMilliseconds: number;
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
      sendWebhookRequest,
      runWebhookReply,
      attemptTimeoutMilliseconds,
      currentUnixTimeSeconds,
    }: BotWebhookServiceDependencies,
  ) {
    this.#webhooks = webhooks;
    this.#pendingUpdates = pendingUpdates;
    this.#updateSubscriptions = updateSubscriptions;
    this.#sendWebhookRequest = sendWebhookRequest;
    this.#runWebhookReply = runWebhookReply;
    this.#attemptTimeoutMilliseconds = attemptTimeoutMilliseconds;
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
   * Sends the bot's pending updates to its webhook one at a time, until `signal` aborts. An update
   * is confirmed once the webhook accepts it; aborting leaves the update in flight pending.
   */
  async #deliverPendingUpdates(
    botId: number,
    webhook: BotWebhook,
    signal: AbortSignal,
  ): Promise<void> {
    let firstUnconfirmedUpdateId: number | undefined;
    let failingUpdateId: number | undefined;
    let consecutiveFailureCount = 0;
    while (!signal.aborted) {
      const [update] = this.#pendingUpdates.confirmAndReadPendingUpdates(botId, {
        firstUnconfirmedUpdateId,
        limit: 1,
      });
      if (update === undefined) {
        await this.#pendingUpdates.waitForUpdate(botId, { signal });
        continue;
      }

      const deliveryErrorMessage = await this.#sendUpdate(botId, webhook, update, signal);
      if (signal.aborted) {
        return;
      }
      if (deliveryErrorMessage === undefined) {
        firstUnconfirmedUpdateId = update.update_id + 1;
        continue;
      }

      this.#webhooks.recordDeliveryError(botId, {
        dateUnixSeconds: this.#currentUnixTimeSeconds(),
        message: deliveryErrorMessage,
      });
      if (failingUpdateId !== update.update_id) {
        failingUpdateId = update.update_id;
        consecutiveFailureCount = 0;
      }
      consecutiveFailureCount++;
      await waitFor(retryDelaySeconds(consecutiveFailureCount), signal);
    }
  }

  /**
   * Posts the update to the webhook as the official Bot API server's `WebhookActor` does, and
   * returns Telegram's description of the failure, or `undefined` when the webhook accepted it.
   * The attempt ends when `deliverySignal` aborts, or fails once it outlasts its timeout.
   *
   * As on Telegram, a successful response may name a Bot API method, which runs before the next
   * update is sent. The status alone decides the outcome of the delivery: the method's failure, or
   * a response body that cannot be read in time, leaves the update delivered.
   */
  async #sendUpdate(
    botId: number,
    webhook: BotWebhook,
    update: BotApiUpdate,
    deliverySignal: AbortSignal,
  ): Promise<string | undefined> {
    const timeout = new AbortController();
    const timeoutId = setTimeout(() => timeout.abort(), this.#attemptTimeoutMilliseconds);
    const attemptSignal = AbortSignal.any([deliverySignal, timeout.signal]);
    try {
      const request = createWebhookRequest(webhook, update, attemptSignal);
      let response: Response;
      try {
        response = await settleUnlessAborted(this.#sendWebhookRequest(request), attemptSignal);
      } catch {
        // Telegram reports other failures to connect without their cause.
        return timeout.signal.aborted ? READ_TIMEOUT_ERROR_MESSAGE : "Can't connect to the webhook";
      }
      const isAccepted = response.status >= 200 && response.status <= 299;
      try {
        await settleUnlessAborted(
          isAccepted
            ? this.#runWebhookReply(botId, response, attemptSignal)
            : response.body?.cancel() ?? Promise.resolve(),
          attemptSignal,
        );
      } catch {
        // The status alone decides the outcome, so neither the reply nor the body changes it.
      }
      return isAccepted
        ? undefined
        : `Wrong response from the webhook: ${response.status} ${response.statusText}`;
    } finally {
      clearTimeout(timeoutId);
    }
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
 * How long to wait before sending an update again after it failed the given number of times in a
 * row, as the official Bot API server's `WebhookActor::on_update_error` does: the first failure is
 * retried at once, and each later one after twice the previous delay, starting at 2 seconds.
 */
function retryDelaySeconds(consecutiveFailureCount: number): number {
  return consecutiveFailureCount === 1
    ? 0
    : Math.min(MAX_RETRY_DELAY_SECONDS, 2 ** (consecutiveFailureCount - 1));
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
function waitFor(delaySeconds: number, signal: AbortSignal): Promise<void> {
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
