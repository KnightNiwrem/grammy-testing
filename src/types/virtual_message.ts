import type { InlineKeyboard } from './inline_keyboard.ts';
import type { ReplyInterface } from './reply_interface.ts';
import type { StoredFileId } from './stored_file.ts';
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

/** Text with the entities that mark spans of it. */
export interface FormattedText {
  readonly text: string;
  readonly entities: readonly TextEntity[];
}

/** The most UTF-16 code units of a caption that Telegram accepts from bots and non-premium users. */
export const MAX_CAPTION_LENGTH = 1_024;

export interface TextMessageContent extends FormattedText {
  readonly kind: 'text';
}

export interface PhotoMessageContent {
  readonly kind: 'photo';
  readonly fileId: StoredFileId;
  /** Empty for a photo without a caption. */
  readonly caption: FormattedText;
  /** Whether clients cover the photo until the user reveals it. */
  readonly hasSpoiler: boolean;
  /** Whether clients show the caption above the photo, which matters only with a caption. */
  readonly showsCaptionAboveMedia: boolean;
}

export interface DocumentMessageContent {
  readonly kind: 'document';
  readonly fileId: StoredFileId;
  /** Empty for a document without a caption. */
  readonly caption: FormattedText;
}

/** What a message shows: text, or a file with a caption. */
export type MessageContent = TextMessageContent | PhotoMessageContent | DocumentMessageContent;

/** A service message's record that accounts or bots joined a supergroup. */
export interface MembersJoinedMessageContent {
  readonly kind: 'members_joined';
  /** The accounts and bots that joined. */
  readonly memberIds: readonly number[];
}

/** A service message's record that a member left a supergroup or was removed from it. */
export interface MemberLeftMessageContent {
  readonly kind: 'member_left';
  readonly memberId: number;
}

/**
 * What a service message shows instead of content: a change of the supergroup's members, which
 * Telegram records as a message of the member who made the change.
 */
export type MembershipServiceContent = MembersJoinedMessageContent | MemberLeftMessageContent;

/** What a supergroup message shows: content its author wrote, or a membership change. */
export type SupergroupMessageContent = MessageContent | MembershipServiceContent;

/**
 * The text a message's content carries: the text of a text message, or the caption of a media
 * message, which is empty when it has none. A service message carries no text.
 */
export function getContentText(content: SupergroupMessageContent): FormattedText {
  switch (content.kind) {
    case 'text':
      return content;
    case 'photo':
    case 'document':
      return content.caption;
    case 'members_joined':
    case 'member_left':
      return { text: '', entities: [] };
    default: {
      const unhandledContent: never = content;
      throw new Error(`Unhandled message content: ${JSON.stringify(unhandledContent)}`);
    }
  }
}

/** A canonical message of a private conversation, written by either participant. */
export interface PrivateMessage {
  readonly kind: 'private_message';
  readonly id: CanonicalMessageId;
  readonly conversation: PrivateConversationKey;
  readonly authorRole: PrivateConversationRole;
  readonly sentAtUnixSeconds: number;
  readonly content: MessageContent;
  /** The message of the same conversation this one replies to; omitted when it is no reply. */
  readonly replyToMessageId?: CanonicalMessageId;
  /** Omitted when the message has no inline keyboard. Only bots attach inline keyboards. */
  readonly inlineKeyboard?: InlineKeyboard;
  /**
   * The reply interface the message asks the account's client to show; omitted for none. Only
   * bots send one, and never with an inline keyboard. Edits leave it unchanged.
   */
  readonly replyInterface?: ReplyInterface;
  /**
   * When the text or caption was last edited; omitted for a message whose content was never
   * edited.
   */
  readonly contentEditedAtUnixSeconds?: number;
  /** Whether the sender protected the message from forwarding and saving. Only bots protect. */
  readonly isContentProtected: boolean;
}

/**
 * The member of a supergroup who wrote a message there, or made the change a service message
 * records: an account or a bot.
 */
export type SupergroupMessageAuthor =
  | { readonly kind: 'account'; readonly accountId: number }
  | { readonly kind: 'bot'; readonly botId: number };

/**
 * A canonical message of a supergroup: one that a member wrote, or a service message recording a
 * membership change that its author made.
 */
export interface SupergroupMessage {
  readonly kind: 'supergroup_message';
  readonly id: CanonicalMessageId;
  readonly chatId: number;
  readonly author: SupergroupMessageAuthor;
  readonly sentAtUnixSeconds: number;
  readonly content: SupergroupMessageContent;
  /** The message of the same supergroup this one replies to; omitted when it is no reply. */
  readonly replyToMessageId?: CanonicalMessageId;
  /** Omitted when the message has no inline keyboard. Only bots attach inline keyboards. */
  readonly inlineKeyboard?: InlineKeyboard;
  /**
   * When the text or caption was last edited; omitted for a message whose content was never
   * edited.
   */
  readonly contentEditedAtUnixSeconds?: number;
  /** Whether the sender protected the message from forwarding and saving. Only bots protect. */
  readonly isContentProtected: boolean;
}

/** A canonical message of any chat the emulator supports. */
export type ChatMessage = PrivateMessage | SupergroupMessage;

/** A supergroup message that shows content its author wrote, rather than a membership change. */
export type SupergroupContentMessage = SupergroupMessage & { readonly content: MessageContent };

/** Whether a supergroup message shows content its author wrote, which only such a message has. */
export function isSupergroupContentMessage(
  message: SupergroupMessage,
): message is SupergroupContentMessage {
  return message.content.kind !== 'members_joined' && message.content.kind !== 'member_left';
}
