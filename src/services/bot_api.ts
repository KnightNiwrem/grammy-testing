import {
  BOT_API_UPDATE_TYPES,
  type BotApiPrivateTextMessage,
  type BotApiUpdate,
  type BotApiUpdateType,
  DEFAULT_ALLOWED_UPDATE_TYPES,
} from '../types/bot_api.ts';
import type { VirtualBot, VirtualBotProfile } from '../types/virtual_bot.ts';

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

export interface DeleteWebhookRequest {
  readonly dropPendingUpdates: boolean;
}

export interface SendMessageRequest {
  /** The Bot API `chat_id`, which for a private chat is the other user's ID. */
  readonly chatId: number;
  readonly text: string;
}

export type SendMessageFailureReason =
  | 'message_text_empty'
  | 'chat_not_found'
  | 'message_text_too_long';

export type SendMessageResult =
  | { readonly sent: true; readonly message: BotApiPrivateTextMessage }
  | { readonly sent: false; readonly reason: SendMessageFailureReason };

interface BotCredentialLookup {
  getByToken(token: string): VirtualBot | undefined;
}

interface BotUpdateMailboxPolling {
  resolveFirstUnconfirmedUpdateId(botId: number, offset: number | undefined): number | undefined;
  readPendingUpdates(
    botId: number,
    input: { readonly firstUnconfirmedUpdateId?: number; readonly limit: number },
  ): readonly BotApiUpdate[];
  waitForUpdate(
    botId: number,
    input: { readonly timeoutSeconds: number; readonly signal?: AbortSignal },
  ): Promise<void>;
  discardPendingUpdates(botId: number): void;
}

type BotMessageSendingResult =
  | { readonly sent: true; readonly message: BotApiPrivateTextMessage }
  | {
    readonly sent: false;
    readonly reason:
      | 'bot_not_found'
      | 'message_text_empty'
      | 'account_not_found'
      | 'conversation_not_started'
      | 'message_text_too_long';
  };

interface BotMessageSender {
  sendBotMessage(input: {
    readonly fromBotId: number;
    readonly to: { readonly type: 'private'; readonly accountId: number };
    readonly text: string;
  }): BotMessageSendingResult;
}

interface BotUpdateSubscriptionStore {
  setAllowedUpdateTypes(botId: number, allowedUpdateTypes: ReadonlySet<BotApiUpdateType>): void;
}

interface BotApiServiceDependencies {
  readonly bots: BotCredentialLookup;
  readonly botUpdates: BotUpdateMailboxPolling;
  readonly updateSubscriptions: BotUpdateSubscriptionStore;
  readonly botMessages: BotMessageSender;
}

/**
 * The application boundary for Bot API methods.
 *
 * Transport authenticates each call with `authenticate` before invoking a method, so that an
 * invalid token is rejected before request parameters are validated, as Telegram does. Invariants
 * that span a bot's configuration and update delivery, such as polling and webhook delivery being
 * mutually exclusive, belong here rather than in route handlers.
 */
export class BotApiService {
  readonly #bots: BotCredentialLookup;
  readonly #botUpdates: BotUpdateMailboxPolling;
  readonly #updateSubscriptions: BotUpdateSubscriptionStore;
  readonly #botMessages: BotMessageSender;
  /** Aborting a bot's controller terminates the long poll it holds. */
  readonly #heldLongPollsByBotId = new Map<number, AbortController>();
  /**
   * Aborted when long polling ends. Kept apart from the held long poll controllers so that the end
   * of polling is never reported as a conflict with another long poll.
   */
  readonly #longPollingEnd = new AbortController();

  constructor({ bots, botUpdates, updateSubscriptions, botMessages }: BotApiServiceDependencies) {
    this.#bots = bots;
    this.#botUpdates = botUpdates;
    this.#updateSubscriptions = updateSubscriptions;
    this.#botMessages = botMessages;
  }

  /** Returns the profile of the bot that owns `token`, or `undefined` if no bot does. */
  authenticate(token: string): VirtualBotProfile | undefined {
    return this.#bots.getByToken(token)?.profile;
  }

  /**
   * Changes the bot's subscription before reading its mailbox, as Telegram does. The new
   * subscription applies only to updates created afterward; pending updates are still returned.
   *
   * A request that finds no updates and has a timeout is held until an update arrives. Like
   * Telegram, a bot has at most one held request: holding a new one terminates the previous one.
   * Requests answered immediately never terminate a held one. Once long polling has ended, no
   * request is held.
   */
  async getUpdates(
    authenticatedBot: VirtualBotProfile,
    { offset, limit, timeoutSeconds, allowedUpdates, signal }: GetUpdatesRequest,
  ): Promise<GetUpdatesResult> {
    const botId = authenticatedBot.id;
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
    const updates = this.#botUpdates.readPendingUpdates(botId, { firstUnconfirmedUpdateId, limit });
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
      updates: this.#botUpdates.readPendingUpdates(botId, { firstUnconfirmedUpdateId, limit }),
    };
  }

  /**
   * Answers every held long poll with the updates it can read, as its timeout would, and stops
   * holding later ones. Other methods keep working.
   */
  endLongPolling(): void {
    this.#longPollingEnd.abort();
  }

  /**
   * Bots here never have a webhook, so, as on Telegram when none is set, this only discards
   * pending updates when asked to. A held long poll is left running, as Telegram does.
   */
  deleteWebhook(
    authenticatedBot: VirtualBotProfile,
    { dropPendingUpdates }: DeleteWebhookRequest,
  ): void {
    if (dropPendingUpdates) {
      this.#botUpdates.discardPendingUpdates(authenticatedBot.id);
    }
  }

  /** Sends text to a private chat; other chat types are not supported yet. */
  sendMessage(
    authenticatedBot: VirtualBotProfile,
    { chatId, text }: SendMessageRequest,
  ): SendMessageResult {
    const result = this.#botMessages.sendBotMessage({
      fromBotId: authenticatedBot.id,
      to: { type: 'private', accountId: chatId },
      text,
    });
    if (result.sent) {
      return result;
    }

    switch (result.reason) {
      case 'message_text_empty':
      case 'message_text_too_long':
        return { sent: false, reason: result.reason };
      // A bot can address a user only after the user has written to it. Telegram reports any
      // other user, like an unknown chat, as not found.
      case 'account_not_found':
      case 'conversation_not_started':
        return { sent: false, reason: 'chat_not_found' };
      case 'bot_not_found':
        throw new Error(`Authenticated bot ${authenticatedBot.id} does not exist`);
      default: {
        const unhandledReason: never = result.reason;
        throw new Error(`Unhandled bot message failure: ${unhandledReason}`);
      }
    }
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
