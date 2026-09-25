import type { InlineKeyboard } from './inline_keyboard.ts';
import type { ReplyInterfaceMarkup } from './reply_interface.ts';
import type { StoredFileId } from './stored_file.ts';
import type { PrivateConversationKey, PrivateConversationRole } from './virtual_chat.ts';

/** The most characters of message text that Telegram accepts, as `countTextCharacters` counts them. */
export const MAX_TEXT_MESSAGE_LENGTH = 4_096;

/**
 * Emulator-internal identity of a canonical message.
 *
 * It is never a Telegram `message_id`: Telegram numbers the same message differently for each
 * observer, so Bot API projections resolve `message_id` from the observer's message box instead.
 */
export type CanonicalMessageId = string;

/**
 * Telegram's `inline_message_id`: an opaque identifier of a message an account sent through a
 * bot's inline mode, by which that bot edits the message without being a member of its chat.
 */
export type InlineMessageId = string;

/** The bot through whose inline mode an account sent a message, as Telegram's `via_bot` shows. */
export interface ViaBot {
  readonly botId: number;
  /** How the inline bot addresses the message. */
  readonly inlineMessageId: InlineMessageId;
}

/**
 * Where a forwarded message first appeared, which the forward shows as Telegram's origin of a user.
 * Forwarding a forward keeps its origin.
 */
export interface MessageForwardInfo {
  /** The account or bot that wrote the original message. */
  readonly originalSenderId: number;
  readonly originalSentAtUnixSeconds: number;
  /**
   * The inline bot the original message was sent through, which the forward still shows; omitted
   * for none. Unlike the original's inline bot, it cannot edit the forward.
   */
  readonly viaBotId?: number;
}

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

/** How precisely clients show the time or the date of a date and time entity. */
export type DateTimePartPrecision = 'short' | 'long';

/**
 * How clients show a date and time entity, as TDLib's `FormattedDate` flags describe it: relative
 * to the present, or with the chosen parts.
 */
export type DateTimeFormat =
  | { readonly kind: 'relative' }
  | {
    readonly kind: 'absolute';
    /** Omitted to show no time. */
    readonly timePrecision?: DateTimePartPrecision;
    /** Omitted to show no date. */
    readonly datePrecision?: DateTimePartPrecision;
    readonly showsDayOfWeek: boolean;
  };

/** A date and time that clients show in each reader's time zone. */
export interface DateTimeEntity extends TextSpan {
  readonly type: 'date_time';
  /** The shown moment in Unix seconds, which Telegram requires to be positive. */
  readonly unixTime: number;
  /** Omitted when the sender chose no format. */
  readonly format?: DateTimeFormat;
}

/** A marked span of message text: formatting, a link, or a detected bot command. */
export type TextEntity =
  | PlainTextEntity
  | PreTextEntity
  | TextLinkEntity
  | TextMentionEntity
  | CustomEmojiEntity
  | DateTimeEntity;

/** Text with the entities that mark spans of it. */
export interface FormattedText {
  readonly text: string;
  readonly entities: readonly TextEntity[];
}

/**
 * The most characters of a caption that Telegram accepts from bots and non-premium users, as
 * `countTextCharacters` counts them.
 */
export const MAX_CAPTION_LENGTH = 1_024;

/**
 * Counts the characters of message text or a caption as Telegram's length limits do: TDLib counts
 * Unicode code points, whereas entity offsets and lengths count UTF-16 code units.
 */
export function countTextCharacters(text: string): number {
  return [...text].length;
}

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
  /**
   * Omitted when the message has no inline keyboard. Bots attach inline keyboards to their messages,
   * and inline bots to messages sent through them.
   */
  readonly inlineKeyboard?: InlineKeyboard;
  /** Omitted for a message not sent through a bot's inline mode. Only accounts send them. */
  readonly viaBot?: ViaBot;
  /** Omitted for a message that is no forward. */
  readonly forwardInfo?: MessageForwardInfo;
  /**
   * The change of the account client's reply interface the message carries: a reply keyboard or
   * forced reply to show, or the removal of a reply keyboard; omitted for none. Only bots send
   * one, and never with an inline keyboard. It stays with the message after the client stops
   * showing the interface, since, as in TDLib, it makes the message impossible to edit.
   */
  readonly replyInterfaceMarkup?: ReplyInterfaceMarkup;
  /**
   * When the text or caption was last edited; omitted for a message whose content was never
   * edited.
   */
  readonly contentEditedAtUnixSeconds?: number;
  /** Whether the sender protected the message from forwarding and saving. Only bots protect. */
  readonly isContentProtected: boolean;
  /**
   * The decimal text of the 64-bit identifier of the message effect clients play with the
   * message; omitted for none. Only bots add effects, which Telegram allows only in private chats.
   */
  readonly messageEffectId?: string;
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
  /**
   * Omitted when the message has no inline keyboard. Bots attach inline keyboards to their messages,
   * and inline bots to messages sent through them.
   */
  readonly inlineKeyboard?: InlineKeyboard;
  /** Omitted for a message not sent through a bot's inline mode. Only accounts send them. */
  readonly viaBot?: ViaBot;
  /** Omitted for a message that is no forward. */
  readonly forwardInfo?: MessageForwardInfo;
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

/**
 * The bot whose buttons a message carries, which receives the callback queries of their presses:
 * the inline bot of a message sent through one, otherwise the bot that wrote the message. Returns
 * `undefined` for an account's own message, which carries no buttons.
 */
export function getInlineKeyboardOwnerId(message: ChatMessage): number | undefined {
  if (message.viaBot !== undefined) {
    return message.viaBot.botId;
  }
  switch (message.kind) {
    case 'private_message':
      return message.authorRole === 'bot' ? message.conversation.botId : undefined;
    case 'supergroup_message':
      return message.author.kind === 'bot' ? message.author.botId : undefined;
    default: {
      const unhandledMessage: never = message;
      throw new Error(`Unhandled message: ${JSON.stringify(unhandledMessage)}`);
    }
  }
}

/**
 * Whether a bot may edit a message it has found, by its chat or by its inline message identifier,
 * as TDLib's `can_edit_message` decides for bots. The inline bot edits a message sent through it,
 * whoever sent it, and no other bot does; otherwise, a bot edits only its own messages. No one
 * edits a forward, or a message whose reply markup is not an inline keyboard, such as a keyboard
 * removal or a keyboard the client no longer shows.
 */
export function canBotEditMessage(message: ChatMessage, botId: number): boolean {
  if (
    message.forwardInfo !== undefined ||
    (message.kind === 'private_message' && message.replyInterfaceMarkup !== undefined)
  ) {
    return false;
  }
  if (message.viaBot !== undefined) {
    return message.viaBot.botId === botId;
  }
  switch (message.kind) {
    case 'private_message':
      return message.authorRole === 'bot' && message.conversation.botId === botId;
    case 'supergroup_message':
      return message.author.kind === 'bot' && message.author.botId === botId;
    default: {
      const unhandledMessage: never = message;
      throw new Error(`Unhandled message: ${JSON.stringify(unhandledMessage)}`);
    }
  }
}

/** The account or bot that wrote a message, or made the change a service message records. */
export function getMessageAuthorId(message: ChatMessage): number {
  switch (message.kind) {
    case 'private_message':
      return message.authorRole === 'account'
        ? message.conversation.accountId
        : message.conversation.botId;
    case 'supergroup_message':
      return message.author.kind === 'account' ? message.author.accountId : message.author.botId;
    default: {
      const unhandledMessage: never = message;
      throw new Error(`Unhandled message: ${JSON.stringify(unhandledMessage)}`);
    }
  }
}

/** A supergroup message that shows content its author wrote, rather than a membership change. */
export type SupergroupContentMessage = SupergroupMessage & { readonly content: MessageContent };

/** Whether a supergroup message shows content its author wrote, which only such a message has. */
export function isSupergroupContentMessage(
  message: SupergroupMessage,
): message is SupergroupContentMessage {
  return message.content.kind !== 'members_joined' && message.content.kind !== 'member_left';
}

/** A message of any chat that shows content its author wrote, rather than a membership change. */
export type ContentMessage = PrivateMessage | SupergroupContentMessage;

/** Whether a message of any chat shows content its author wrote. */
export function isContentMessage(message: ChatMessage): message is ContentMessage {
  return message.kind === 'private_message' || isSupergroupContentMessage(message);
}
