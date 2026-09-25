import type { SupergroupAdministratorRight } from './chat_membership.ts';
import type { VirtualAccountProfile } from './virtual_account.ts';
import type { PlainTextEntityType } from './virtual_message.ts';

export interface BotApiPrivateChat {
  readonly id: number;
  readonly type: 'private';
  readonly first_name: string;
  readonly last_name?: string;
  readonly username?: string;
}

/** A basic group, which the Bot API calls a group. */
export interface BotApiBasicGroupChat {
  readonly id: number;
  readonly title: string;
  readonly type: 'group';
}

export interface BotApiSupergroupChat {
  readonly id: number;
  readonly title: string;
  readonly type: 'supergroup';
}

/** A chat of several members that a bot can join. */
export type BotApiGroupChat = BotApiBasicGroupChat | BotApiSupergroupChat;

/** A bot as a message shows it, without the capabilities that only `getMe` reports. */
export interface BotApiBotUser {
  readonly id: number;
  readonly is_bot: true;
  readonly first_name: string;
  readonly last_name?: string;
  readonly username: string;
}

/** A user as a message shows it: its sender or a user it mentions. */
export type BotApiUser = VirtualAccountProfile | BotApiBotUser;

/** Offsets and lengths count UTF-16 code units. */
interface BotApiTextSpan {
  readonly offset: number;
  readonly length: number;
}

export type BotApiMessageEntity =
  | (BotApiTextSpan & { readonly type: PlainTextEntityType })
  | (BotApiTextSpan & { readonly type: 'pre'; readonly language?: string })
  | (BotApiTextSpan & { readonly type: 'text_link'; readonly url: string })
  | (BotApiTextSpan & { readonly type: 'text_mention'; readonly user: BotApiUser })
  | (BotApiTextSpan & { readonly type: 'custom_emoji'; readonly custom_emoji_id: string })
  | (BotApiTextSpan & {
    readonly type: 'date_time';
    readonly unix_time: number;
    /** Empty when the sender chose no format, which Telegram reports all the same. */
    readonly date_time_format: string;
  });

export interface BotApiCallbackInlineKeyboardButton {
  readonly text: string;
  readonly callback_data: string;
}

export interface BotApiUrlInlineKeyboardButton {
  readonly text: string;
  readonly url: string;
}

export type BotApiInlineKeyboardButton =
  | BotApiCallbackInlineKeyboardButton
  | BotApiUrlInlineKeyboardButton;

export interface BotApiInlineKeyboardMarkup {
  readonly inline_keyboard: readonly (readonly BotApiInlineKeyboardButton[])[];
}

/** A file as the Bot API shows it, in the field order Telegram uses. */
export interface BotApiFile {
  /** The observing user's own identifier of the file, which it can send and download. */
  readonly file_id: string;
  /** The same for every user; it can neither send nor download the file. */
  readonly file_unique_id: string;
  readonly file_size: number;
}

/** A file whose download path `getFile` reported. */
export interface BotApiDownloadableFile extends BotApiFile {
  readonly file_path: string;
}

export interface BotApiPhotoSize extends BotApiFile {
  readonly width: number;
  readonly height: number;
}

/** A document as the Bot API shows it: its name and type precede its file fields. */
export interface BotApiDocument extends BotApiFile {
  readonly file_name: string;
  readonly mime_type: string;
}

/** A caption's fields, which Telegram omits for a media message without a caption. */
interface BotApiCaption {
  readonly caption?: string;
  /** Omitted when the caption has no entities. */
  readonly caption_entities?: readonly BotApiMessageEntity[];
}

/** The fields that show what a message is, which follow its reply. */
export type BotApiMessageContent =
  | {
    readonly text: string;
    /** Omitted when the text has no entities, as Telegram does. */
    readonly entities?: readonly BotApiMessageEntity[];
  }
  | (BotApiCaption & {
    /** The photo's sizes, smallest first; the emulator keeps a single size. */
    readonly photo: readonly BotApiPhotoSize[];
    /** Present only for a caption that clients show above the photo. */
    readonly show_caption_above_media?: true;
    /** Present only for a photo that clients cover until the user reveals it. */
    readonly has_media_spoiler?: true;
  })
  | (BotApiCaption & { readonly document: BotApiDocument });

/**
 * The fields of a service message about a membership change, which take the place of content.
 * Telegram still sends each change's legacy fields before its current ones.
 */
export type BotApiMembershipServiceContent =
  | {
    /** Legacy alias of `new_chat_member`. */
    readonly new_chat_participant: BotApiUser;
    /** Legacy: the observing bot if it joined, otherwise the first new member. */
    readonly new_chat_member: BotApiUser;
    readonly new_chat_members: readonly BotApiUser[];
  }
  | {
    /** Legacy alias of `left_chat_member`. */
    readonly left_chat_participant: BotApiUser;
    readonly left_chat_member: BotApiUser;
  };

/** What a supergroup message shows: content, or a membership change. */
export type BotApiSupergroupMessageContent =
  | BotApiMessageContent
  | BotApiMembershipServiceContent;

/** Where a forward first appeared: always a user, because the emulator's senders are users. */
export interface BotApiMessageOriginUser {
  readonly type: 'user';
  readonly sender_user: BotApiUser;
  /** When the original message was sent. */
  readonly date: number;
}

interface BotApiMessageHeader<Chat> {
  readonly message_id: number;
  readonly from: BotApiUser;
  readonly chat: Chat;
  readonly date: number;
  /** Omitted for a message whose content was never edited. */
  readonly edit_date?: number;
  /** Present only for a forward. */
  readonly forward_origin?: BotApiMessageOriginUser;
  /** Legacy form of the origin's sender; present only for a forward. */
  readonly forward_from?: BotApiUser;
  /** Legacy form of the origin's date; present only for a forward. */
  readonly forward_date?: number;
}

interface BotApiMessageTrailer {
  /** Omitted when the message has no inline keyboard. */
  readonly reply_markup?: BotApiInlineKeyboardMarkup;
  /** The bot through whose inline mode the message was sent; omitted for other messages. */
  readonly via_bot?: BotApiBotUser;
  /** Present only for a message its sender protected from forwarding and saving. */
  readonly has_protected_content?: true;
}

/** A message as a reply shows it: Telegram never nests the replied message's own reply. */
type BotApiRepliedMessageInChat<Chat, Content> =
  & BotApiMessageHeader<Chat>
  & Content
  & BotApiMessageTrailer;

/** A message in a chat of the given type, in the field order Telegram uses. */
type BotApiMessageInChat<Chat, Content> =
  & BotApiMessageHeader<Chat>
  & {
    /**
     * The replied message, without its own reply; omitted when the message is no reply or the
     * replied message was deleted.
     */
    readonly reply_to_message?: BotApiRepliedMessageInChat<Chat, Content>;
  }
  & Content
  & BotApiMessageTrailer;

export type BotApiPrivateMessage = BotApiMessageInChat<BotApiPrivateChat, BotApiMessageContent>;

export type BotApiSupergroupMessage = BotApiMessageInChat<
  BotApiSupergroupChat,
  BotApiSupergroupMessageContent
>;

export type BotApiMessage = BotApiPrivateMessage | BotApiSupergroupMessage;

export type BotApiRepliedPrivateMessage = BotApiRepliedMessageInChat<
  BotApiPrivateChat,
  BotApiMessageContent
>;

export type BotApiRepliedSupergroupMessage = BotApiRepliedMessageInChat<
  BotApiSupergroupChat,
  BotApiSupergroupMessageContent
>;

/** A bot command as the Bot API shows it. */
export interface BotApiBotCommand {
  readonly command: string;
  readonly description: string;
  /** Present only when set. */
  readonly is_ephemeral?: true;
}

/**
 * A press of a callback button, in the field order Telegram uses: on a message of the bot's chat,
 * which it carries, or on a message sent through the bot's inline mode, which the bot knows only by
 * its `inline_message_id`.
 */
export type BotApiCallbackQuery =
  | {
    readonly id: string;
    readonly from: VirtualAccountProfile;
    readonly message: BotApiMessage;
    readonly chat_instance: string;
    readonly data: string;
  }
  | {
    readonly id: string;
    readonly from: VirtualAccountProfile;
    readonly inline_message_id: string;
    readonly chat_instance: string;
    readonly data: string;
  };

/** An inline query, in the field order Telegram uses. User locations are not supported. */
export interface BotApiInlineQuery {
  readonly id: string;
  readonly from: VirtualAccountProfile;
  /** `sender` for the private chat between the account and the inline bot itself. */
  readonly chat_type: 'sender' | 'private' | 'supergroup';
  readonly query: string;
  readonly offset: string;
}

/** An inline query result an account sent, in the field order Telegram uses. */
export interface BotApiChosenInlineResult {
  readonly from: VirtualAccountProfile;
  /** Present only when the sent message has an inline keyboard. */
  readonly inline_message_id?: string;
  readonly query: string;
  readonly result_id: string;
}

/** The bot's membership in a private chat: `kicked` while the account blocks the bot. */
export type BotApiPrivateChatBotMember =
  | { readonly user: BotApiBotUser; readonly status: 'member' }
  | { readonly user: BotApiBotUser; readonly status: 'kicked'; readonly until_date: 0 };

/**
 * A supergroup administrator's rights, in the order the Bot API shows them. Anonymous
 * administrators are not supported.
 */
export type BotApiSupergroupAdministratorRights =
  & { readonly [Right in SupergroupAdministratorRight]: boolean }
  & { readonly is_anonymous: false };

/**
 * A user's standing in a group, in the field order Telegram uses. Custom titles and member tags
 * are not supported.
 */
export type BotApiChatMember<User extends BotApiUser = BotApiUser> =
  | { readonly user: User; readonly status: 'creator'; readonly is_anonymous: false }
  | (
    & {
      readonly user: User;
      readonly status: 'administrator';
      /** Whether the observing bot may change the administrator's rights. */
      readonly can_be_edited: boolean;
    }
    & BotApiSupergroupAdministratorRights
    & {
      /** Legacy alias of `can_manage_video_chats`. */
      readonly can_manage_voice_chats: boolean;
    }
  )
  | { readonly user: User; readonly status: 'member' }
  | { readonly user: User; readonly status: 'left' }
  | {
    readonly user: User;
    readonly status: 'kicked';
    /** When the ban ends; 0 for a ban that lasts until it is lifted. */
    readonly until_date: number;
  };

/**
 * The bot's membership in a group: `left` before it joins and after it leaves, `kicked` while it is
 * banned, and `administrator` while the owner grants it rights. A bot never owns a group.
 */
export type BotApiGroupChatBotMember = Exclude<
  BotApiChatMember<BotApiBotUser>,
  { readonly status: 'creator' }
>;

/** A change of a user's membership in a chat, in the field order Telegram uses. */
interface BotApiChatMemberUpdatedInChat<Chat, ChatMember> {
  readonly chat: Chat;
  /**
   * The user who changed the membership: in a private chat, the account at its other end; in a
   * group, the account or bot that added, removed, promoted, demoted, banned, or unbanned the
   * member, or the member itself when it left.
   */
  readonly from: BotApiUser;
  readonly date: number;
  readonly old_chat_member: ChatMember;
  readonly new_chat_member: ChatMember;
}

/** A change of the bot's own membership in a chat. */
export type BotApiMyChatMemberUpdated =
  | BotApiChatMemberUpdatedInChat<BotApiPrivateChat, BotApiPrivateChatBotMember>
  | BotApiChatMemberUpdatedInChat<BotApiGroupChat, BotApiGroupChatBotMember>;

/** A change of another user's standing in a group, which administrator bots may subscribe to. */
export type BotApiChatMemberUpdated = BotApiChatMemberUpdatedInChat<
  BotApiGroupChat,
  BotApiChatMember
>;

export interface BotApiMessageUpdate {
  readonly update_id: number;
  readonly message: BotApiMessage;
}

export interface BotApiEditedMessageUpdate {
  readonly update_id: number;
  readonly edited_message: BotApiMessage;
}

export interface BotApiCallbackQueryUpdate {
  readonly update_id: number;
  readonly callback_query: BotApiCallbackQuery;
}

export interface BotApiInlineQueryUpdate {
  readonly update_id: number;
  readonly inline_query: BotApiInlineQuery;
}

export interface BotApiChosenInlineResultUpdate {
  readonly update_id: number;
  readonly chosen_inline_result: BotApiChosenInlineResult;
}

export interface BotApiMyChatMemberUpdate {
  readonly update_id: number;
  readonly my_chat_member: BotApiMyChatMemberUpdated;
}

export interface BotApiChatMemberUpdate {
  readonly update_id: number;
  readonly chat_member: BotApiChatMemberUpdated;
}

export type BotApiUpdate =
  | BotApiMessageUpdate
  | BotApiEditedMessageUpdate
  | BotApiInlineQueryUpdate
  | BotApiChosenInlineResultUpdate
  | BotApiCallbackQueryUpdate
  | BotApiMyChatMemberUpdate
  | BotApiChatMemberUpdate;

/**
 * Every update type name the official Bot API server recognizes in `allowed_updates`, including
 * types the emulator never produces. Mirrors `get_update_type_name` in `telegram-bot-api/Client.cpp`
 * at commit e3e9dd8e5b3d7ab8537cd5a10dc31d5ffa8f82d1.
 */
export const BOT_API_UPDATE_TYPES = [
  'message',
  'edited_message',
  'channel_post',
  'edited_channel_post',
  'inline_query',
  'chosen_inline_result',
  'callback_query',
  'custom_event',
  'custom_query',
  'shipping_query',
  'pre_checkout_query',
  'poll',
  'poll_answer',
  'my_chat_member',
  'chat_member',
  'chat_join_request',
  'chat_boost',
  'removed_chat_boost',
  'message_reaction',
  'message_reaction_count',
  'business_connection',
  'business_message',
  'edited_business_message',
  'deleted_business_messages',
  'purchased_paid_media',
  'managed_bot',
  'guest_message',
  'subscription',
  'stopped_message_generation',
] as const;

export type BotApiUpdateType = typeof BOT_API_UPDATE_TYPES[number];

/** Update types a bot receives only after requesting them explicitly in `allowed_updates`. */
const OPT_IN_UPDATE_TYPES: readonly BotApiUpdateType[] = [
  'chat_member',
  'message_reaction',
  'message_reaction_count',
];

/** The subscription of a bot that has not chosen one, or that requested no recognized type. */
export const DEFAULT_ALLOWED_UPDATE_TYPES: ReadonlySet<BotApiUpdateType> = new Set(
  BOT_API_UPDATE_TYPES.filter((updateType) => !OPT_IN_UPDATE_TYPES.includes(updateType)),
);

/**
 * Interprets `allowed_updates` as Telegram's `get_allowed_update_types` does: names match
 * case-insensitively, unrecognized names are ignored, and a list with no recognized name selects
 * the default subscription.
 */
export function resolveAllowedUpdateTypes(
  requestedUpdateTypeNames: readonly string[],
): ReadonlySet<BotApiUpdateType> {
  const requestedNames = new Set(requestedUpdateTypeNames.map((name) => name.toLowerCase()));
  const allowedUpdateTypes = new Set(
    BOT_API_UPDATE_TYPES.filter((updateType) => requestedNames.has(updateType)),
  );
  return allowedUpdateTypes.size === 0 ? DEFAULT_ALLOWED_UPDATE_TYPES : allowedUpdateTypes;
}

/**
 * A bot's webhook as `getWebhookInfo` reports it, with fields in the official Bot API server's
 * order. Telegram also reports the IP address it resolved the webhook host to, which the emulator
 * does not resolve. The emulator accepts no custom certificate, so it never reports one.
 */
export interface BotApiWebhookInfo {
  /** Empty when the bot has no webhook. */
  readonly url: string;
  readonly has_custom_certificate: false;
  readonly pending_update_count: number;
  readonly last_error_date?: number;
  readonly last_error_message?: string;
  /** Reported only while a webhook is set. */
  readonly max_connections?: number;
  /** Reported only for a subscription other than the default. */
  readonly allowed_updates?: readonly BotApiUpdateType[];
}
