/** The server-assigned identity and Bot API location for an emulation session. */
export interface EmulationSession {
  readonly id: string;
  readonly botApiRoot: string;
}

export interface CreateVirtualBotInput {
  readonly first_name: string;
  readonly username: string;
}

export interface VirtualBotProfile {
  readonly id: number;
  readonly is_bot: true;
  readonly first_name: string;
  readonly username: string;
  readonly can_join_groups: boolean;
  readonly can_read_all_group_messages: boolean;
  readonly supports_guest_queries?: boolean;
  readonly supports_inline_queries: boolean;
  readonly can_connect_to_business: boolean;
  readonly has_main_web_app: boolean;
  readonly has_topics_enabled: boolean;
  readonly allows_users_to_create_topics: boolean;
  readonly can_manage_bots: boolean;
  readonly supports_join_request_queries: boolean;
}

export interface CreatedVirtualBot {
  readonly token: string;
  readonly bot: VirtualBotProfile;
}

export interface CreateVirtualAccountInput {
  readonly first_name: string;
  readonly last_name?: string;
  readonly username?: string;
  readonly language_code?: string;
}

export interface VirtualAccountProfile {
  readonly id: number;
  readonly is_bot: false;
  readonly first_name: string;
  readonly last_name?: string;
  readonly username?: string;
  readonly language_code?: string;
}

export interface PrivateMessageTarget {
  readonly type: 'private';
  readonly botId: number;
}

export interface AccountSendMessageInput {
  readonly to: PrivateMessageTarget;
  readonly text: string;
}

export interface AccountMessageHistoryInput {
  readonly chat: PrivateMessageTarget;
}

export interface PressCallbackButtonInput {
  readonly chat: PrivateMessageTarget;
  /** The ID of the message carrying the button, as message history shows it. */
  readonly message_id: number;
  /** The callback data of the button to press. */
  readonly callback_data: string;
  /**
   * Creates the query already expired: the bot still receives it but cannot answer it, as when a
   * bot that was offline catches up on queries whose answer deadline has passed.
   */
  readonly expired?: boolean;
}

export interface PrivateChat {
  readonly id: number;
  readonly type: 'private';
  readonly first_name: string;
  readonly last_name?: string;
  readonly username?: string;
}

/** Offsets and lengths count UTF-16 code units. */
interface MessageEntitySpan {
  readonly offset: number;
  readonly length: number;
}

/** Entity types that carry nothing beyond their span. */
export type PlainMessageEntityType =
  | 'bot_command'
  | 'bold'
  | 'italic'
  | 'underline'
  | 'strikethrough'
  | 'spoiler'
  | 'code'
  | 'blockquote'
  | 'expandable_blockquote';

/** A bot command the emulator detected, or formatting a bot applied to its message. */
export type MessageEntity =
  | (MessageEntitySpan & { readonly type: PlainMessageEntityType })
  | (MessageEntitySpan & { readonly type: 'pre'; readonly language?: string })
  | (MessageEntitySpan & { readonly type: 'text_link'; readonly url: string })
  | (MessageEntitySpan & {
    readonly type: 'text_mention';
    readonly user: VirtualAccountProfile | MessageSenderBot;
  })
  | (MessageEntitySpan & { readonly type: 'custom_emoji'; readonly custom_emoji_id: string });

/** A bot as a message sender, without the capabilities that only getMe reports. */
export interface MessageSenderBot {
  readonly id: number;
  readonly is_bot: true;
  readonly first_name: string;
  readonly last_name?: string;
  readonly username: string;
}

export interface CallbackInlineKeyboardButton {
  readonly text: string;
  readonly callback_data: string;
}

export interface UrlInlineKeyboardButton {
  readonly text: string;
  readonly url: string;
}

export type InlineKeyboardButton = CallbackInlineKeyboardButton | UrlInlineKeyboardButton;

export interface InlineKeyboardMarkup {
  readonly inline_keyboard: readonly (readonly InlineKeyboardButton[])[];
}

/**
 * A private-chat message as the conversation's bot sees it: numbered in the bot's message box,
 * with the account as its chat, whichever participant wrote it.
 */
export interface PrivateTextMessage {
  readonly message_id: number;
  readonly from: VirtualAccountProfile | MessageSenderBot;
  readonly chat: PrivateChat;
  readonly date: number;
  /** Present once the bot has edited the message's text. */
  readonly edit_date?: number;
  readonly text: string;
  readonly entities?: readonly MessageEntity[];
  /** The inline keyboard a bot attached to its message. */
  readonly reply_markup?: InlineKeyboardMarkup;
}

/** A bot command as an account's client lists it. */
export interface BotCommand {
  /** The command without its leading slash. */
  readonly command: string;
  readonly description: string;
  readonly is_ephemeral: boolean;
}

export interface CallbackQueryAnswer {
  /** Omitted when the answer shows no notification. */
  readonly text?: string;
  readonly show_alert: boolean;
  readonly cache_time: number;
}

/** Whether the bot can still answer a callback query, and if not, why. */
export type CallbackQueryStatus = 'awaiting_answer' | 'answered' | 'expired';

/** A callback button press by an account, with the bot's answer once it has answered. */
export interface CallbackQuery {
  readonly id: string;
  readonly callback_data: string;
  readonly status: CallbackQueryStatus;
  /** The bot's answer when `status` is `answered`, and `null` otherwise. */
  readonly answer: CallbackQueryAnswer | null;
}

export interface VirtualAccountClient extends VirtualAccountProfile {
  /** Sends a message as this virtual Telegram account. */
  sendMessage(input: AccountSendMessageInput): Promise<PrivateTextMessage>;
  /** Returns messages written by either participant of a private conversation, oldest first. */
  getMessages(input: AccountMessageHistoryInput): Promise<readonly PrivateTextMessage[]>;
  /**
   * Presses a callback button on a bot's message, which sends the bot a callback query. The bot
   * answers asynchronously; read the answer with `getCallbackQuery`.
   */
  pressCallbackButton(input: PressCallbackButtonInput): Promise<CallbackQuery>;
  /** Returns a callback query this account created, with the bot's answer once given. */
  getCallbackQuery(callbackQueryId: string): Promise<CallbackQuery>;
  /**
   * Returns the commands this account's client suggests in its private chat with a bot: the
   * bot's list for the chat, for all private chats, or by default, in the account's language if
   * the bot has one.
   */
  getBotCommands(input: AccountBotCommandsInput): Promise<readonly BotCommand[]>;
}

export interface AccountBotCommandsInput {
  readonly chat: PrivateMessageTarget;
}

export interface CreatedVirtualAccount {
  readonly account: VirtualAccountClient;
}

export type HttpMethod = 'DELETE' | 'GET' | 'POST';

export interface RequestDetails {
  readonly method: HttpMethod;
  readonly url: string;
}
