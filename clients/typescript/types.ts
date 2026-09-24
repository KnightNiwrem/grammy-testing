/** The server-assigned identity and Bot API location for an emulation session. */
export interface EmulationSession {
  readonly id: string;
  readonly botApiRoot: string;
}

export interface CreateVirtualBotInput {
  readonly first_name: string;
  readonly username: string;
  /**
   * Turns off the bot's privacy mode, so that it receives every message of its groups. Defaults to
   * `false`: the bot receives only commands, replies to its messages, and mentions of it.
   */
  readonly can_read_all_group_messages?: boolean;
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

/** A supergroup the account is a member of. */
export interface SupergroupMessageTarget {
  readonly type: 'supergroup';
  readonly chatId: number;
}

/** A chat an account writes to: its private chat with a bot, or a supergroup. */
export type MessageTarget = PrivateMessageTarget | SupergroupMessageTarget;

/** The messages a chat holds: private messages for a private chat, or supergroup messages. */
export type TextMessageIn<Target extends MessageTarget> = Target extends SupergroupMessageTarget
  ? SupergroupTextMessage
  : PrivateTextMessage;

export interface AccountSendMessageInput<Target extends MessageTarget = MessageTarget> {
  readonly to: Target;
  readonly text: string;
  /** The ID of the chat's message to reply to, as message history shows it. */
  readonly reply_to_message_id?: number;
}

export interface CreateSupergroupInput {
  readonly title: string;
  readonly description?: string;
}

/** A supergroup as its creator sees it once created. */
export interface Supergroup {
  /** The Bot API `chat_id` of the supergroup, a negative number. */
  readonly id: number;
  readonly type: 'supergroup';
  readonly title: string;
  readonly description?: string;
}

export interface AddChatMemberInput {
  readonly chat: SupergroupMessageTarget;
  /** The account or bot to add. */
  readonly userId: number;
}

export interface AccountEditMessageInput<Target extends MessageTarget = MessageTarget> {
  readonly chat: Target;
  /** The ID of the account's message to edit, as message history shows it. */
  readonly message_id: number;
  /** The new text, which must differ from the message's current text. */
  readonly text: string;
}

export interface BotBlockInput {
  readonly botId: number;
}

export interface AccountMessageHistoryInput<Target extends MessageTarget = MessageTarget> {
  readonly chat: Target;
}

export interface PressCallbackButtonInput {
  readonly chat: MessageTarget;
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

export interface SupergroupChat {
  readonly id: number;
  readonly title: string;
  readonly type: 'supergroup';
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
  /** Present once the message's author has edited its text. */
  readonly edit_date?: number;
  /** The message this one replies to, unless it was deleted; it never shows its own reply. */
  readonly reply_to_message?: RepliedPrivateTextMessage;
  readonly text: string;
  readonly entities?: readonly MessageEntity[];
  /** The inline keyboard a bot attached to its message. */
  readonly reply_markup?: InlineKeyboardMarkup;
  /** Present when the bot protected its message from forwarding and saving. */
  readonly has_protected_content?: true;
}

/** A message as a reply shows it, without its own reply. */
export type RepliedPrivateTextMessage = Omit<PrivateTextMessage, 'reply_to_message'>;

/**
 * A supergroup message, which every member sees alike: numbered once by the supergroup, and
 * written by an account or a bot.
 */
export interface SupergroupTextMessage {
  readonly message_id: number;
  readonly from: VirtualAccountProfile | MessageSenderBot;
  readonly chat: SupergroupChat;
  readonly date: number;
  /** Present once the message's author has edited its text. */
  readonly edit_date?: number;
  /** The message this one replies to, unless it was deleted; it never shows its own reply. */
  readonly reply_to_message?: RepliedSupergroupTextMessage;
  readonly text: string;
  readonly entities?: readonly MessageEntity[];
  /** The inline keyboard a bot attached to its message. */
  readonly reply_markup?: InlineKeyboardMarkup;
  /** Present when the bot protected its message from forwarding and saving. */
  readonly has_protected_content?: true;
}

/** A message as a reply shows it, without its own reply. */
export type RepliedSupergroupTextMessage = Omit<SupergroupTextMessage, 'reply_to_message'>;

/** A reply keyboard button, which sends its text to the chat when pressed. */
export interface ReplyKeyboardButton {
  readonly text: string;
}

/** A custom keyboard the account's client shows in place of its letter keyboard. */
export interface ReplyKeyboardInterface {
  readonly type: 'keyboard';
  /** The ID of the bot message that sent the keyboard, as message history shows it. */
  readonly message_id: number;
  readonly keyboard: readonly (readonly ReplyKeyboardButton[])[];
  readonly is_persistent: boolean;
  readonly resize_keyboard: boolean;
  /**
   * Whether clients hide the keyboard once it is used; the keyboard stays available, so its
   * buttons can still be pressed.
   */
  readonly one_time_keyboard: boolean;
  readonly input_field_placeholder?: string;
}

/** A reply interface to a bot message, which the account's client shows as if replying to it. */
export interface ForceReplyInterface {
  readonly type: 'force_reply';
  /** The ID of the bot message to reply to, as message history shows it. */
  readonly message_id: number;
  readonly input_field_placeholder?: string;
}

/** What the account's client shows in place of its usual input in a chat with a bot. */
export type ReplyInterface = ReplyKeyboardInterface | ForceReplyInterface;

export interface PressReplyKeyboardButtonInput {
  readonly chat: PrivateMessageTarget;
  /** The text of the button to press, which the account then sends to the chat. */
  readonly text: string;
}

export interface AccountReplyInterfaceInput {
  readonly chat: PrivateMessageTarget;
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
  /**
   * Sends a message as this virtual Telegram account, to a bot or to a supergroup this account is
   * a member of. In a supergroup, bots in privacy mode receive only commands, replies to their
   * messages, and mentions of them.
   */
  sendMessage<Target extends MessageTarget>(
    input: AccountSendMessageInput<Target>,
  ): Promise<TextMessageIn<Target>>;
  /**
   * Edits the text of a message this account sent, which sends the chat's bots an
   * `edited_message` update as they received the message. Returns the edited message.
   */
  editMessage<Target extends MessageTarget>(
    input: AccountEditMessageInput<Target>,
  ): Promise<TextMessageIn<Target>>;
  /** Creates a supergroup that this account owns. */
  createSupergroup(input: CreateSupergroupInput): Promise<Supergroup>;
  /**
   * Adds an account or a bot to a supergroup this account owns. An added bot receives a
   * `my_chat_member` update. Adding a member again has no effect.
   */
  addChatMember(input: AddChatMemberInput): Promise<void>;
  /**
   * Blocks a bot, which Telegram calls stopping it. The bot receives a `my_chat_member` update
   * showing it as `kicked`, its messages to this account fail with `403 Forbidden: bot was
   * blocked by the user`, and this account cannot write to it until it unblocks the bot. Blocking
   * a blocked bot has no effect.
   */
  blockBot(input: BotBlockInput): Promise<void>;
  /**
   * Unblocks a bot, which receives a `my_chat_member` update showing it as a `member` again.
   * Unblocking a bot that is not blocked has no effect.
   */
  unblockBot(input: BotBlockInput): Promise<void>;
  /**
   * Returns the messages of a private conversation or of a supergroup this account is a member
   * of, whoever wrote them, oldest first.
   */
  getMessages<Target extends MessageTarget>(
    input: AccountMessageHistoryInput<Target>,
  ): Promise<readonly TextMessageIn<Target>[]>;
  /**
   * Presses a callback button on a bot's message, in a private chat or a supergroup, which sends
   * the bot a callback query. The bot answers asynchronously; read the answer with
   * `getCallbackQuery`.
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
  /**
   * Returns the reply keyboard or forced reply this account's client shows in its private chat
   * with a bot, or `null` when it shows its usual input.
   */
  getReplyInterface(input: AccountReplyInterfaceInput): Promise<ReplyInterface | null>;
  /**
   * Presses a button of the reply keyboard the chat shows, which sends the button's text to the
   * bot as this account's message. Fails when the chat shows no keyboard with such a button.
   */
  pressReplyKeyboardButton(input: PressReplyKeyboardButtonInput): Promise<PrivateTextMessage>;
}

export interface AccountBotCommandsInput {
  readonly chat: PrivateMessageTarget;
}

export interface CreatedVirtualAccount {
  readonly account: VirtualAccountClient;
}

export type HttpMethod = 'DELETE' | 'GET' | 'PATCH' | 'POST' | 'PUT';

export interface RequestDetails {
  readonly method: HttpMethod;
  readonly url: string;
}
