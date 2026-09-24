import type { InlineKeyboard } from './inline_keyboard.ts';
import type { ReplyInterface } from './reply_interface.ts';
import type { PrivateConversationKey, PrivateConversationRole } from './virtual_chat.ts';

export const MAX_TEXT_MESSAGE_LENGTH = 4_096;

/**
 * Emulator-internal identity of a canonical message.
 *
 * It is never a Telegram `message_id`: Telegram numbers the same message differently for each
 * observer, so Bot API projections resolve `message_id` from the observer's message box instead.
 */
export type CanonicalMessageId = string;

/** A span of message text. Offsets and lengths count UTF-16 code units, as Telegram's do. */
interface TextSpan {
  readonly offset: number;
  readonly length: number;
}

/** Entity types that carry nothing beyond their span. */
export type PlainTextEntityType =
  | 'bot_command'
  | 'bold'
  | 'italic'
  | 'underline'
  | 'strikethrough'
  | 'spoiler'
  | 'code'
  | 'blockquote'
  | 'expandable_blockquote';

export interface PlainTextEntity extends TextSpan {
  readonly type: PlainTextEntityType;
}

/** Preformatted text, optionally naming the programming language of its code. */
export interface PreTextEntity extends TextSpan {
  readonly type: 'pre';
  /** Omitted for a block without a language. */
  readonly language?: string;
}

export interface TextLinkEntity extends TextSpan {
  readonly type: 'text_link';
  /** The link as Telegram normalized it. */
  readonly url: string;
}

/** A mention of a user by ID, for users without a username. */
export interface TextMentionEntity extends TextSpan {
  readonly type: 'text_mention';
  readonly userId: number;
}

export interface CustomEmojiEntity extends TextSpan {
  readonly type: 'custom_emoji';
  /** Telegram's decimal text form of the custom emoji's 64-bit identifier. */
  readonly customEmojiId: string;
}

/** A marked span of message text: formatting, a link, or a detected bot command. */
export type TextEntity =
  | PlainTextEntity
  | PreTextEntity
  | TextLinkEntity
  | TextMentionEntity
  | CustomEmojiEntity;

/** Canonical text stored in a private conversation, written by either participant. */
export interface PrivateTextMessage {
  readonly kind: 'private_text';
  readonly id: CanonicalMessageId;
  readonly conversation: PrivateConversationKey;
  readonly authorRole: PrivateConversationRole;
  readonly sentAtUnixSeconds: number;
  readonly text: string;
  readonly entities: readonly TextEntity[];
  /** The message of the same conversation this one replies to; omitted when it is no reply. */
  readonly replyToMessageId?: CanonicalMessageId;
  /** Omitted when the message has no inline keyboard. Only bots attach inline keyboards. */
  readonly inlineKeyboard?: InlineKeyboard;
  /**
   * The reply interface the message asks the account's client to show; omitted for none. Only
   * bots send one, and never with an inline keyboard. Edits leave it unchanged.
   */
  readonly replyInterface?: ReplyInterface;
  /** When the text was last edited; omitted for a message whose text was never edited. */
  readonly textEditedAtUnixSeconds?: number;
  /** Whether the sender protected the message from forwarding and saving. Only bots protect. */
  readonly isContentProtected: boolean;
}
