import type { BotApiPrivateTextMessage } from '../types/bot_api.ts';
import type { VirtualBot, VirtualBotProfile } from '../types/virtual_bot.ts';
import type { PrivateTextMessage } from '../types/virtual_message.ts';
import type { GetUpdatesRequest, GetUpdatesResult } from './bot_update_polling.ts';

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

interface BotUpdatePolling {
  getUpdates(botId: number, request: GetUpdatesRequest): Promise<GetUpdatesResult>;
}

interface PendingBotUpdates {
  discardPendingUpdates(botId: number): void;
}

type BotMessageSendingResult =
  | { readonly sent: true; readonly message: PrivateTextMessage }
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

interface BotMessageViews {
  viewPrivateTextMessageForBot(message: PrivateTextMessage): BotApiPrivateTextMessage;
}

interface BotApiServiceDependencies {
  readonly bots: BotCredentialLookup;
  readonly updatePolling: BotUpdatePolling;
  readonly pendingUpdates: PendingBotUpdates;
  readonly botMessages: BotMessageSender;
  readonly botMessageViews: BotMessageViews;
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
  readonly #updatePolling: BotUpdatePolling;
  readonly #pendingUpdates: PendingBotUpdates;
  readonly #botMessages: BotMessageSender;
  readonly #botMessageViews: BotMessageViews;

  constructor(
    { bots, updatePolling, pendingUpdates, botMessages, botMessageViews }:
      BotApiServiceDependencies,
  ) {
    this.#bots = bots;
    this.#updatePolling = updatePolling;
    this.#pendingUpdates = pendingUpdates;
    this.#botMessages = botMessages;
    this.#botMessageViews = botMessageViews;
  }

  /** Returns the profile of the bot that owns `token`, or `undefined` if no bot does. */
  authenticate(token: string): VirtualBotProfile | undefined {
    return this.#bots.getByToken(token)?.profile;
  }

  /** Polls the authenticated bot's pending updates. */
  getUpdates(
    authenticatedBot: VirtualBotProfile,
    request: GetUpdatesRequest,
  ): Promise<GetUpdatesResult> {
    return this.#updatePolling.getUpdates(authenticatedBot.id, request);
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
      this.#pendingUpdates.discardPendingUpdates(authenticatedBot.id);
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
      return {
        sent: true,
        message: this.#botMessageViews.viewPrivateTextMessageForBot(result.message),
      };
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
}
