import type { VirtualAccountProfile } from './virtual_account.ts';

export interface BotApiPrivateChat {
  readonly id: number;
  readonly type: 'private';
  readonly first_name: string;
  readonly last_name?: string;
  readonly username?: string;
}

/** Offsets and lengths count UTF-16 code units. */
export interface BotApiMessageEntity {
  readonly type: 'bot_command';
  readonly offset: number;
  readonly length: number;
}

/** A bot as a message sender, without the capabilities that only `getMe` reports. */
export interface BotApiBotUser {
  readonly id: number;
  readonly is_bot: true;
  readonly first_name: string;
  readonly last_name?: string;
  readonly username: string;
}

export type BotApiMessageSender = VirtualAccountProfile | BotApiBotUser;

export interface BotApiPrivateTextMessage {
  readonly message_id: number;
  readonly from: BotApiMessageSender;
  readonly chat: BotApiPrivateChat;
  readonly date: number;
  readonly text: string;
  /** Omitted when the text has no entities, as Telegram does. */
  readonly entities?: readonly BotApiMessageEntity[];
}

export interface BotApiMessageUpdate {
  readonly update_id: number;
  readonly message: BotApiPrivateTextMessage;
}

export type BotApiUpdate = BotApiMessageUpdate;

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
