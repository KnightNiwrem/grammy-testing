import type { CanonicalMessageId, InlineMessageId } from './virtual_message.ts';

/** Telegram's decimal text form of a 64-bit callback query identifier. */
export type CallbackQueryId = string;

/** The most characters of notification text a bot can show in answer to a callback query. */
export const MAX_CALLBACK_QUERY_ANSWER_TEXT_LENGTH = 200;

/** How the bot answered a callback query, as the pressing user's client shows it. */
export interface CallbackQueryAnswer {
  /** Omitted when the answer shows no notification. */
  readonly text?: string;
  /** Whether the text is an alert the user must dismiss rather than a transient notification. */
  readonly showAlert: boolean;
  /** How long the user's client may reuse this answer for the same button. */
  readonly cacheTimeSeconds: number;
}

/**
 * Where a callback query is in its life. A query starts awaiting an answer, or already expired,
 * as when a bot that was offline catches up after Telegram's answer deadline has passed. The bot's
 * accepted answer consumes an awaiting query; an answered or expired query accepts no answer.
 */
export type CallbackQueryState =
  | { readonly status: 'awaiting_answer' }
  | { readonly status: 'answered'; readonly answer: CallbackQueryAnswer }
  | { readonly status: 'expired' };

/**
 * An account's press of a callback button on a bot message, in their private conversation or in a
 * supergroup both are members of, or on a message the account's chat received through the bot's
 * inline mode.
 */
export interface CallbackQuery {
  readonly id: CallbackQueryId;
  /** The account that pressed the button. */
  readonly accountId: number;
  /**
   * The bot whose buttons the message carries, which receives and answers the query: the bot that
   * sent the message, or the inline bot it was sent through.
   */
  readonly botId: number;
  readonly messageId: CanonicalMessageId;
  /**
   * How the inline bot knows a message sent through it, which it receives instead of the message;
   * omitted for a bot's own message.
   */
  readonly inlineMessageId?: InlineMessageId;
  /** Telegram's `chat_instance` of the message's chat, fixed when the chat began. */
  readonly chatInstance: string;
  readonly callbackData: string;
  readonly state: CallbackQueryState;
}
