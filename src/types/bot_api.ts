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
  | (BotApiTextSpan & { readonly type: 'custom_emoji'; readonly custom_emoji_id: string });

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

/** A text message in a chat of the given type, in the field order Telegram uses. */
interface BotApiTextMessageInChat<Chat> {
  readonly message_id: number;
  readonly from: BotApiUser;
  readonly chat: Chat;
  readonly date: number;
  /** Omitted for a message whose text was never edited. */
  readonly edit_date?: number;
  /**
   * The replied message, without its own reply; omitted when the message is no reply or the
   * replied message was deleted.
   */
  readonly reply_to_message?: Omit<BotApiTextMessageInChat<Chat>, 'reply_to_message'>;
  readonly text: string;
  /** Omitted when the text has no entities, as Telegram does. */
  readonly entities?: readonly BotApiMessageEntity[];
  /** Omitted when the message has no inline keyboard. */
  readonly reply_markup?: BotApiInlineKeyboardMarkup;
  /** Present only for a message its sender protected from forwarding and saving. */
  readonly has_protected_content?: true;
}

export type BotApiPrivateTextMessage = BotApiTextMessageInChat<BotApiPrivateChat>;

export type BotApiSupergroupTextMessage = BotApiTextMessageInChat<BotApiSupergroupChat>;

export type BotApiTextMessage = BotApiPrivateTextMessage | BotApiSupergroupTextMessage;

/** A message as a reply shows it: Telegram never nests the replied message's own reply. */
export type BotApiRepliedPrivateTextMessage = Omit<BotApiPrivateTextMessage, 'reply_to_message'>;

/** A message as a reply shows it: Telegram never nests the replied message's own reply. */
export type BotApiRepliedSupergroupTextMessage = Omit<
  BotApiSupergroupTextMessage,
  'reply_to_message'
>;

/** A bot command as the Bot API shows it. */
export interface BotApiBotCommand {
  readonly command: string;
  readonly description: string;
  /** Present only when set. */
  readonly is_ephemeral?: true;
}

export interface BotApiCallbackQuery {
  readonly id: string;
  readonly from: VirtualAccountProfile;
  readonly message: BotApiTextMessage;
  readonly chat_instance: string;
  readonly data: string;
}

/** The bot's membership in a private chat: `kicked` while the account blocks the bot. */
export type BotApiPrivateChatBotMember =
  | { readonly user: BotApiBotUser; readonly status: 'member' }
  | { readonly user: BotApiBotUser; readonly status: 'kicked'; readonly until_date: 0 };

/** The bot's membership in a group: `left` before it joins. */
export type BotApiGroupChatBotMember =
  | { readonly user: BotApiBotUser; readonly status: 'left' }
  | { readonly user: BotApiBotUser; readonly status: 'member' };

/** A change of the bot's own membership in a chat, in the field order Telegram uses. */
interface BotApiMyChatMemberUpdatedInChat<Chat, ChatMember> {
  readonly chat: Chat;
  /**
   * The user who changed the membership: in a private chat, the account at its other end; in a
   * group, the account that added the bot.
   */
  readonly from: VirtualAccountProfile;
  readonly date: number;
  readonly old_chat_member: ChatMember;
  readonly new_chat_member: ChatMember;
}

export type BotApiMyChatMemberUpdated =
  | BotApiMyChatMemberUpdatedInChat<BotApiPrivateChat, BotApiPrivateChatBotMember>
  | BotApiMyChatMemberUpdatedInChat<BotApiGroupChat, BotApiGroupChatBotMember>;

export interface BotApiMessageUpdate {
  readonly update_id: number;
  readonly message: BotApiTextMessage;
}

export interface BotApiEditedMessageUpdate {
  readonly update_id: number;
  readonly edited_message: BotApiTextMessage;
}

export interface BotApiCallbackQueryUpdate {
  readonly update_id: number;
  readonly callback_query: BotApiCallbackQuery;
}

export interface BotApiMyChatMemberUpdate {
  readonly update_id: number;
  readonly my_chat_member: BotApiMyChatMemberUpdated;
}

export type BotApiUpdate =
  | BotApiMessageUpdate
  | BotApiEditedMessageUpdate
  | BotApiCallbackQueryUpdate
  | BotApiMyChatMemberUpdate;

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
