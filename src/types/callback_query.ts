import type { PrivateConversationKey } from './virtual_chat.ts';
import type { CanonicalMessageId } from './virtual_message.ts';

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

/** An account's press of a callback button on a bot message in their private conversation. */
export interface CallbackQuery {
  readonly id: CallbackQueryId;
  readonly conversation: PrivateConversationKey;
  readonly messageId: CanonicalMessageId;
  /** Telegram's `chat_instance` of the message's chat, fixed when the conversation began. */
  readonly chatInstance: string;
  readonly callbackData: string;
  /** Omitted until the bot answers; a callback query is answered at most once. */
  readonly answer?: CallbackQueryAnswer;
}
