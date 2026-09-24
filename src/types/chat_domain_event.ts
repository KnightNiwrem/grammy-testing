import type { CallbackQuery } from './callback_query.ts';
import type { PrivateTextMessage } from './virtual_message.ts';

/** A canonical message was stored and numbered in its participants' message boxes. */
export interface MessageCreatedEvent {
  readonly type: 'message_created';
  readonly message: PrivateTextMessage;
}

/** The author of a stored message changed its text. */
export interface MessageEditedEvent {
  readonly type: 'message_edited';
  /** The message as the edit left it. */
  readonly message: PrivateTextMessage;
}

/** An account pressed a callback button on a message from the bot. */
export interface CallbackQueryCreatedEvent {
  readonly type: 'callback_query_created';
  readonly callbackQuery: CallbackQuery;
  /** The message carrying the pressed button, as it was when the button was pressed. */
  readonly message: PrivateTextMessage;
}

/** An account blocked a bot, which Telegram calls stopping it, or unblocked it. */
export interface BotBlockChangedEvent {
  readonly type: 'bot_block_changed';
  readonly accountId: number;
  readonly botId: number;
  /** Whether the account blocks the bot after the change. */
  readonly isBlocked: boolean;
  readonly changedAtUnixSeconds: number;
}

/** A state change produced by a chat command, published in the order it happened. */
export type ChatDomainEvent =
  | MessageCreatedEvent
  | MessageEditedEvent
  | CallbackQueryCreatedEvent
  | BotBlockChangedEvent;
