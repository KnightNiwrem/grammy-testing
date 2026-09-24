import type { CallbackQuery } from './callback_query.ts';
import type { SharedChat } from './virtual_chat.ts';
import type { ChatMessage } from './virtual_message.ts';

/** A canonical message was stored and numbered in the message boxes that hold it. */
export interface MessageCreatedEvent {
  readonly type: 'message_created';
  readonly message: ChatMessage;
}

/** The author of a stored message edited it. */
export interface MessageEditedEvent {
  readonly type: 'message_edited';
  /** The message as the edit left it. */
  readonly message: ChatMessage;
}

/** An account pressed a callback button on a message from the bot. */
export interface CallbackQueryCreatedEvent {
  readonly type: 'callback_query_created';
  readonly callbackQuery: CallbackQuery;
  /** The message carrying the pressed button, as it was when the button was pressed. */
  readonly message: ChatMessage;
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

/** An account added an account or a bot to a shared chat. */
export interface ChatMemberAddedEvent {
  readonly type: 'chat_member_added';
  readonly chat: SharedChat;
  /** The account that added the member. */
  readonly actorAccountId: number;
  /** The account or bot that became a member. */
  readonly memberId: number;
  readonly addedAtUnixSeconds: number;
}

/** A state change produced by a chat command, published in the order it happened. */
export type ChatDomainEvent =
  | MessageCreatedEvent
  | MessageEditedEvent
  | CallbackQueryCreatedEvent
  | BotBlockChangedEvent
  | ChatMemberAddedEvent;
