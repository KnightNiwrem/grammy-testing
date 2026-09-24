import type { BotApiPrivateTextMessage } from '../types/bot_api.ts';
import type { CallbackQueryId } from '../types/callback_query.ts';
import type { InlineKeyboard } from '../types/inline_keyboard.ts';
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
  readonly inlineKeyboard?: InlineKeyboard;
}

export type SendMessageFailureReason =
  | 'message_text_empty'
  | 'chat_not_found'
  | 'message_text_too_long'
  | 'callback_data_invalid';

export type SendMessageResult =
  | { readonly sent: true; readonly message: BotApiPrivateTextMessage }
  | { readonly sent: false; readonly reason: SendMessageFailureReason };

interface EditMessageTarget {
  /** The Bot API `chat_id`, which for a private chat is the other user's ID. */
  readonly chatId: number;
  /** The message's ID in the bot's chat. */
  readonly messageId: number;
}

export interface EditMessageTextRequest extends EditMessageTarget {
  readonly text: string;
  /** Omitting the keyboard removes the message's keyboard, as on Telegram. */
  readonly inlineKeyboard?: InlineKeyboard;
}

export interface EditMessageReplyMarkupRequest extends EditMessageTarget {
  /** Omitting the keyboard removes the message's keyboard, as on Telegram. */
  readonly inlineKeyboard?: InlineKeyboard;
}

export type EditMessageReplyMarkupFailureReason =
  | 'chat_not_found'
  | 'message_not_found'
  | 'message_not_editable'
  | 'callback_data_invalid'
  | 'message_not_modified';

export type EditMessageTextFailureReason =
  | EditMessageReplyMarkupFailureReason
  | 'message_text_empty'
  | 'message_text_too_long';

export type EditMessageResult<FailureReason extends string> =
  | { readonly edited: true; readonly message: BotApiPrivateTextMessage }
  | { readonly edited: false; readonly reason: FailureReason };

export interface AnswerCallbackQueryRequest {
  readonly callbackQueryId: CallbackQueryId;
  readonly text?: string;
  readonly showAlert: boolean;
  readonly cacheTimeSeconds: number;
}

export type AnswerCallbackQueryResult =
  | { readonly answered: true }
  | { readonly answered: false; readonly reason: 'query_id_invalid' };

interface BotCredentialLookup {
  getByToken(token: string): VirtualBot | undefined;
}

interface BotUpdatePolling {
  getUpdates(botId: number, request: GetUpdatesRequest): Promise<GetUpdatesResult>;
}

interface PendingBotUpdates {
  discardPendingUpdates(botId: number): void;
}

interface BotPrivateChat {
  readonly type: 'private';
  readonly accountId: number;
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
      | 'message_text_too_long'
      | 'callback_data_invalid';
  };

/** Why an edit of either kind can fail, apart from failures about the text. */
type BotMessageEditFailureReason =
  | 'bot_not_found'
  | 'account_not_found'
  | 'conversation_not_started'
  | 'message_not_found'
  | 'message_not_editable'
  | 'callback_data_invalid'
  | 'message_not_modified';

type BotMessageEditingResult<FailureReason extends string> =
  | { readonly edited: true; readonly message: PrivateTextMessage }
  | { readonly edited: false; readonly reason: FailureReason };

interface BotMessaging {
  sendBotMessage(input: {
    readonly fromBotId: number;
    readonly to: BotPrivateChat;
    readonly text: string;
    readonly inlineKeyboard?: InlineKeyboard;
  }): BotMessageSendingResult;
  editBotMessageText(input: {
    readonly fromBotId: number;
    readonly chat: BotPrivateChat;
    readonly botMessageId: number;
    readonly text: string;
    readonly inlineKeyboard?: InlineKeyboard;
  }): BotMessageEditingResult<
    BotMessageEditFailureReason | 'message_text_empty' | 'message_text_too_long'
  >;
  editBotMessageInlineKeyboard(input: {
    readonly fromBotId: number;
    readonly chat: BotPrivateChat;
    readonly botMessageId: number;
    readonly inlineKeyboard?: InlineKeyboard;
  }): BotMessageEditingResult<BotMessageEditFailureReason>;
}

interface CallbackQueryAnswering {
  answerCallbackQuery(input: {
    readonly fromBotId: number;
    readonly callbackQueryId: CallbackQueryId;
    readonly text?: string;
    readonly showAlert: boolean;
    readonly cacheTimeSeconds: number;
  }): { readonly answered: boolean };
}

interface BotMessageViews {
  viewPrivateTextMessageForBot(message: PrivateTextMessage): BotApiPrivateTextMessage;
}

interface BotApiServiceDependencies {
  readonly bots: BotCredentialLookup;
  readonly updatePolling: BotUpdatePolling;
  readonly pendingUpdates: PendingBotUpdates;
  readonly botMessages: BotMessaging;
  readonly botMessageViews: BotMessageViews;
  readonly callbackQueries: CallbackQueryAnswering;
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
  readonly #botMessages: BotMessaging;
  readonly #botMessageViews: BotMessageViews;
  readonly #callbackQueries: CallbackQueryAnswering;

  constructor(
    { bots, updatePolling, pendingUpdates, botMessages, botMessageViews, callbackQueries }:
      BotApiServiceDependencies,
  ) {
    this.#bots = bots;
    this.#updatePolling = updatePolling;
    this.#pendingUpdates = pendingUpdates;
    this.#botMessages = botMessages;
    this.#botMessageViews = botMessageViews;
    this.#callbackQueries = callbackQueries;
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
    { chatId, text, inlineKeyboard }: SendMessageRequest,
  ): SendMessageResult {
    const result = this.#botMessages.sendBotMessage({
      fromBotId: authenticatedBot.id,
      to: { type: 'private', accountId: chatId },
      text,
      inlineKeyboard,
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
      case 'callback_data_invalid':
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

  /** Replaces the text and inline keyboard of a message the bot sent to a private chat. */
  editMessageText(
    authenticatedBot: VirtualBotProfile,
    { chatId, messageId, text, inlineKeyboard }: EditMessageTextRequest,
  ): EditMessageResult<EditMessageTextFailureReason> {
    const result = this.#botMessages.editBotMessageText({
      fromBotId: authenticatedBot.id,
      chat: { type: 'private', accountId: chatId },
      botMessageId: messageId,
      text,
      inlineKeyboard,
    });
    if (result.edited) {
      return this.#presentEditedMessage(result.message);
    }

    switch (result.reason) {
      case 'message_text_empty':
      case 'message_text_too_long':
        return { edited: false, reason: result.reason };
      default:
        return {
          edited: false,
          reason: toEditMessageFailureReason(authenticatedBot, result.reason),
        };
    }
  }

  /** Replaces the inline keyboard of a message the bot sent to a private chat. */
  editMessageReplyMarkup(
    authenticatedBot: VirtualBotProfile,
    { chatId, messageId, inlineKeyboard }: EditMessageReplyMarkupRequest,
  ): EditMessageResult<EditMessageReplyMarkupFailureReason> {
    const result = this.#botMessages.editBotMessageInlineKeyboard({
      fromBotId: authenticatedBot.id,
      chat: { type: 'private', accountId: chatId },
      botMessageId: messageId,
      inlineKeyboard,
    });
    if (result.edited) {
      return this.#presentEditedMessage(result.message);
    }
    return { edited: false, reason: toEditMessageFailureReason(authenticatedBot, result.reason) };
  }

  /** Answers a callback query that an account created by pressing one of the bot's buttons. */
  answerCallbackQuery(
    authenticatedBot: VirtualBotProfile,
    { callbackQueryId, text, showAlert, cacheTimeSeconds }: AnswerCallbackQueryRequest,
  ): AnswerCallbackQueryResult {
    const result = this.#callbackQueries.answerCallbackQuery({
      fromBotId: authenticatedBot.id,
      callbackQueryId,
      text,
      showAlert,
      cacheTimeSeconds,
    });
    return result.answered ? { answered: true } : { answered: false, reason: 'query_id_invalid' };
  }

  #presentEditedMessage(
    message: PrivateTextMessage,
  ): { readonly edited: true; readonly message: BotApiPrivateTextMessage } {
    return { edited: true, message: this.#botMessageViews.viewPrivateTextMessageForBot(message) };
  }
}

/** Translates the edit failures shared by both edit methods into Bot API failures. */
function toEditMessageFailureReason(
  authenticatedBot: VirtualBotProfile,
  reason: BotMessageEditFailureReason,
): EditMessageReplyMarkupFailureReason {
  switch (reason) {
    case 'message_not_found':
    case 'message_not_editable':
    case 'callback_data_invalid':
    case 'message_not_modified':
      return reason;
    // As for sending, a chat the bot cannot address is not found.
    case 'account_not_found':
    case 'conversation_not_started':
      return 'chat_not_found';
    case 'bot_not_found':
      throw new Error(`Authenticated bot ${authenticatedBot.id} does not exist`);
    default: {
      const unhandledReason: never = reason;
      throw new Error(`Unhandled bot message edit failure: ${unhandledReason}`);
    }
  }
}
