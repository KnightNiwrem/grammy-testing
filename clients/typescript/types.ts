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
  /**
   * Turns on inline mode, so that accounts send the bot inline queries. Defaults to `false`, as
   * for a new Telegram bot.
   */
  readonly supports_inline_queries?: boolean;
  /**
   * Turns on inline feedback, so that the bot receives a `chosen_inline_result` update for each
   * result of its inline queries that an account sends. Defaults to `false`.
   */
  readonly receives_chosen_inline_results?: boolean;
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

/**
 * `429 Too Many Requests` answers queued for a bot's next Bot API calls, which receive them
 * instead of running.
 */
export interface RateLimitResponses {
  /** The method whose calls receive the answers, by its current name; omitted for every method. */
  readonly method?: string;
  /** The `retry_after`, in seconds, of every answer. */
  readonly retry_after: number;
  /** How many of the bot's next matching calls still receive an answer. */
  readonly remaining_count: number;
}

export interface QueueRateLimitResponsesInput {
  readonly bot_id: number;
  /** An implemented Bot API method, by any name Telegram accepts; omit it for every method. */
  readonly method?: string;
  /** The `retry_after`, in seconds, of every answer; at least 1. */
  readonly retry_after: number;
  /** How many of the bot's next matching calls receive an answer. Defaults to 1. */
  readonly count?: number;
}

export interface CreateVirtualAccountInput {
  readonly first_name: string;
  readonly last_name?: string;
  readonly username?: string;
  readonly language_code?: string;
  /**
   * Keeps forwards of the account's messages, and replies to them from other chats, from linking
   * to the account: their origin is a hidden user that shows only its name. Defaults to `false`.
   */
  readonly has_private_forwards?: boolean;
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
export type MessageIn<Target extends MessageTarget> = Target extends SupergroupMessageTarget
  ? SupergroupMessage
  : PrivateMessage;

export interface AccountSendMessageInput<Target extends MessageTarget = MessageTarget> {
  readonly to: Target;
  readonly text: string;
  /** The ID of the chat's message to reply to, as message history shows it. */
  readonly reply_to_message_id?: number;
}

export interface AccountSendPhotoInput<Target extends MessageTarget = MessageTarget> {
  readonly to: Target;
  /** A JPEG, PNG, GIF, WebP, or BMP image. */
  readonly photo: Uint8Array;
  /** Omitted or empty for no caption. */
  readonly caption?: string;
  /** The ID of the chat's message to reply to, as message history shows it. */
  readonly reply_to_message_id?: number;
}

export interface AccountSendDocumentInput<Target extends MessageTarget = MessageTarget> {
  readonly to: Target;
  readonly document: Uint8Array;
  /** The file name, whose extension decides the document's MIME type. */
  readonly file_name: string;
  /** Omitted or empty for no caption. */
  readonly caption?: string;
  /** The ID of the chat's message to reply to, as message history shows it. */
  readonly reply_to_message_id?: number;
}

export interface AccountForwardMessageInput<Target extends MessageTarget = MessageTarget> {
  /** The chat of the message to forward. */
  readonly from: MessageTarget;
  /** The ID of the message to forward, as message history shows it. */
  readonly message_id: number;
  readonly to: Target;
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

export interface RemoveChatMemberInput {
  readonly chat: SupergroupMessageTarget;
  /** The account or bot to remove. */
  readonly userId: number;
}

export interface LeaveChatInput {
  readonly chat: SupergroupMessageTarget;
}

/**
 * A supergroup administrator right, by the Bot API's name. Any right includes `can_manage_chat`,
 * as on Telegram.
 */
export type SupergroupAdministratorRight =
  | 'can_manage_chat'
  | 'can_change_info'
  | 'can_delete_messages'
  | 'can_invite_users'
  | 'can_restrict_members'
  | 'can_pin_messages'
  | 'can_manage_topics'
  | 'can_promote_members'
  | 'can_manage_video_chats'
  | 'can_post_stories'
  | 'can_edit_stories'
  | 'can_delete_stories'
  | 'can_manage_tags'
  | 'can_send_welcome_messages';

export interface PromoteChatMemberInput {
  readonly chat: SupergroupMessageTarget;
  /** The member, account or bot, to promote. */
  readonly userId: number;
  /** The rights the administrator holds from now on; a right set to `true` is held. */
  readonly rights: Readonly<Partial<Record<SupergroupAdministratorRight, boolean>>>;
}

export interface DemoteChatMemberInput {
  readonly chat: SupergroupMessageTarget;
  /** The administrator, account or bot, to demote. */
  readonly userId: number;
}

export interface AccountEditMessageInput<Target extends MessageTarget = MessageTarget> {
  readonly chat: Target;
  /** The ID of the account's message to edit, as message history shows it. */
  readonly message_id: number;
  /** The new text, which must differ from the message's current text. */
  readonly text: string;
}

export interface AccountDeleteMessageInput {
  readonly chat: MessageTarget;
  /** The ID of the message to delete, as message history shows it. */
  readonly message_id: number;
}

export interface AccountEditMessageCaptionInput<Target extends MessageTarget = MessageTarget> {
  readonly chat: Target;
  /** The ID of the account's photo or document to edit, as message history shows it. */
  readonly message_id: number;
  /** The new caption, which must differ from the current one; empty removes the caption. */
  readonly caption: string;
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

/**
 * Entity types that carry nothing beyond their span. Telegram detects mentions, hashtags,
 * cashtags, bot commands, URLs, email addresses and bank card numbers in text by itself.
 */
export type PlainMessageEntityType =
  | 'mention'
  | 'hashtag'
  | 'cashtag'
  | 'bot_command'
  | 'url'
  | 'email'
  | 'bank_card_number'
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
  | (MessageEntitySpan & { readonly type: 'custom_emoji'; readonly custom_emoji_id: string })
  | (MessageEntitySpan & {
    readonly type: 'date_time';
    readonly unix_time: number;
    /**
     * `r` for relative time, otherwise `w` for the day of the week, `d` or `D` for a short or
     * long date, then `t` or `T` for a short or long time; empty when the bot chose no format.
     */
    readonly date_time_format: string;
  });

/** A bot as a message sender, without the capabilities that only getMe reports. */
export interface MessageSenderBot {
  readonly id: number;
  readonly is_bot: true;
  readonly first_name: string;
  readonly last_name?: string;
  readonly username: string;
}

/** A button's text and how Telegram clients draw it. */
export interface KeyboardButtonFace {
  readonly text: string;
  /** The custom emoji shown before the text; omitted for none. */
  readonly icon_custom_emoji_id?: string;
  /** Omitted for the client's default style. */
  readonly style?: 'primary' | 'danger' | 'success';
}

export interface CallbackInlineKeyboardButton extends KeyboardButtonFace {
  readonly callback_data: string;
}

export interface UrlInlineKeyboardButton extends KeyboardButtonFace {
  readonly url: string;
}

export type InlineKeyboardButton = CallbackInlineKeyboardButton | UrlInlineKeyboardButton;

export interface InlineKeyboardMarkup {
  readonly inline_keyboard: readonly (readonly InlineKeyboardButton[])[];
}

/** A file of a message: a photo size or a document. */
interface MessageFile {
  /**
   * The identifier by which the message's observer knows the file. As on Telegram, each user
   * knows a file by a `file_id` of its own.
   */
  readonly file_id: string;
  /** The same for every user; `downloadFile` reads the file by it. */
  readonly file_unique_id: string;
  readonly file_size: number;
}

/** A photo in one size. The emulator keeps a photo in the one size it was sent in. */
export interface PhotoSize extends MessageFile {
  readonly width: number;
  readonly height: number;
}

export interface Document extends MessageFile {
  readonly file_name: string;
  readonly mime_type: string;
}

/**
 * The fields that show what a message is: text, a photo, or a document. Each kind declares the
 * others' fields absent, so that any of them can be read from a message of unknown kind.
 */
export type MessageContent =
  | {
    readonly text: string;
    readonly entities?: readonly MessageEntity[];
    readonly photo?: never;
    readonly document?: never;
    readonly caption?: never;
    readonly caption_entities?: never;
  }
  | {
    readonly text?: never;
    readonly entities?: never;
    /** The photo's sizes, smallest first. */
    readonly photo: readonly PhotoSize[];
    readonly document?: never;
    /** Omitted for a photo without a caption. */
    readonly caption?: string;
    readonly caption_entities?: readonly MessageEntity[];
    /** Present when clients show the caption above the photo. */
    readonly show_caption_above_media?: true;
    /** Present when clients cover the photo until the user reveals it. */
    readonly has_media_spoiler?: true;
  }
  | {
    readonly text?: never;
    readonly entities?: never;
    readonly photo?: never;
    readonly document: Document;
    /** Omitted for a document without a caption. */
    readonly caption?: string;
    readonly caption_entities?: readonly MessageEntity[];
  };

/** The fields of a membership change, which content never has. */
interface NoMembershipChange {
  readonly new_chat_participant?: never;
  readonly new_chat_member?: never;
  readonly new_chat_members?: never;
  readonly left_chat_participant?: never;
  readonly left_chat_member?: never;
}

/** The fields of content, which a service message never has. */
interface NoContent {
  readonly text?: never;
  readonly entities?: never;
  readonly photo?: never;
  readonly document?: never;
  readonly caption?: never;
  readonly caption_entities?: never;
}

/**
 * The fields of a service message about members joining or leaving a supergroup, which take the
 * place of content. As Telegram does, each change also carries its legacy fields.
 */
export type MembershipChangeContent =
  | (NoContent & {
    /** Legacy alias of `new_chat_member`. */
    readonly new_chat_participant: VirtualAccountProfile | MessageSenderBot;
    /** Legacy: the requesting account if it joined, otherwise the first new member. */
    readonly new_chat_member: VirtualAccountProfile | MessageSenderBot;
    readonly new_chat_members: readonly (VirtualAccountProfile | MessageSenderBot)[];
    readonly left_chat_participant?: never;
    readonly left_chat_member?: never;
  })
  | (NoContent & {
    readonly new_chat_participant?: never;
    readonly new_chat_member?: never;
    readonly new_chat_members?: never;
    /** Legacy alias of `left_chat_member`. */
    readonly left_chat_participant: VirtualAccountProfile | MessageSenderBot;
    /** The member that left or was removed. */
    readonly left_chat_member: VirtualAccountProfile | MessageSenderBot;
  });

/** What a supergroup message shows: content, or a membership change. */
export type SupergroupMessageContent =
  | (MessageContent & NoMembershipChange)
  | MembershipChangeContent;

/** Who first sent a forwarded message, and when. */
export interface MessageOriginUser {
  readonly type: 'user';
  readonly sender_user: VirtualAccountProfile | MessageSenderBot;
  readonly date: number;
}

/** The name of an account with private forwards that first sent a forwarded message, and when. */
export interface MessageOriginHiddenUser {
  readonly type: 'hidden_user';
  readonly sender_user_name: string;
  readonly date: number;
}

/** Where a forwarded message, or the message of another chat a reply shows, first appeared. */
export type MessageOrigin = MessageOriginUser | MessageOriginHiddenUser;

/**
 * A message of another chat that a message replies to: who first wrote it and when, the
 * supergroup message it is, and its media, whose caption the reply's quote shows instead.
 */
export type ExternalReplyInfo =
  & {
    readonly origin: MessageOrigin;
    /** The replied message's supergroup; absent for a message of a private chat. */
    readonly chat?: SupergroupChat;
    /** The replied message's ID in its supergroup; absent for a message of a private chat. */
    readonly message_id?: number;
  }
  & (
    | { readonly photo?: never; readonly has_media_spoiler?: never; readonly document?: never }
    | { readonly photo: readonly PhotoSize[]; readonly has_media_spoiler?: true }
    | { readonly document: Document }
  );

/** The quoted part of the text or caption of a replied message. */
export interface TextQuote {
  readonly text: string;
  readonly entities?: readonly MessageEntity[];
  /** Where the quote starts in the replied text, in UTF-16 code units. */
  readonly position: number;
  /** Present when the sender chose the quote, rather than Telegram quoting the message. */
  readonly is_manual?: true;
}

/** How a message replies to a message of another chat, and what it quotes of a replied message. */
interface MessageReplyInfo {
  /** Present for a reply to a message of another chat. */
  readonly external_reply?: ExternalReplyInfo;
  /** Present for a reply that quotes the replied message. */
  readonly quote?: TextQuote;
}

/** The fields that precede a message's reply and content. */
interface MessageHeader<Chat> {
  readonly message_id: number;
  readonly from: VirtualAccountProfile | MessageSenderBot;
  readonly chat: Chat;
  readonly date: number;
  /** Present once the message's author has edited its text or caption. */
  readonly edit_date?: number;
  /** Present for a forward. */
  readonly forward_origin?: MessageOrigin;
  /** Telegram's legacy form of the origin's sender, present for a forward of a user's message. */
  readonly forward_from?: VirtualAccountProfile | MessageSenderBot;
  /** Telegram's legacy form of the origin's name, present for a forward of a hidden user. */
  readonly forward_sender_name?: string;
  /** Telegram's legacy form of the origin's date, present for a forward. */
  readonly forward_date?: number;
}

/** The fields that follow a message's content. */
interface MessageTrailer {
  /** The inline keyboard a bot attached to its message, or to a message sent through it. */
  readonly reply_markup?: InlineKeyboardMarkup;
  /** The bot through whose inline mode an account sent the message. */
  readonly via_bot?: MessageSenderBot;
  /** Present when the bot protected its message from forwarding and saving. */
  readonly has_protected_content?: true;
  /** The message effect a bot sent a private message with. */
  readonly effect_id?: string;
}

/** A message as a reply shows it, without its own reply. */
export type RepliedPrivateMessage =
  & MessageHeader<PrivateChat>
  & MessageReplyInfo
  & MessageContent
  & MessageTrailer;

/**
 * A private-chat message as the conversation's bot sees it: numbered in the bot's message box,
 * with the account as its chat, whichever participant wrote it.
 */
export type PrivateMessage =
  & MessageHeader<PrivateChat>
  & {
    /** The message this one replies to, unless it was deleted; it never shows its own reply. */
    readonly reply_to_message?: RepliedPrivateMessage;
  }
  & MessageReplyInfo
  & MessageContent
  & MessageTrailer;

/** A message as a reply shows it, without its own reply. */
export type RepliedSupergroupMessage =
  & MessageHeader<SupergroupChat>
  & MessageReplyInfo
  & SupergroupMessageContent
  & MessageTrailer;

/**
 * A supergroup message as the requesting account sees it: numbered once by the supergroup, and
 * written by an account or a bot, or a service message about members joining or leaving, from the
 * member who made the change. Members see the same message, apart from the `file_id` of its file
 * and the legacy `new_chat_member` of a service message.
 */
export type SupergroupMessage =
  & MessageHeader<SupergroupChat>
  & {
    /** The message this one replies to, unless it was deleted; it never shows its own reply. */
    readonly reply_to_message?: RepliedSupergroupMessage;
  }
  & MessageReplyInfo
  & SupergroupMessageContent
  & MessageTrailer;

/** A reply keyboard button, which sends its text to the chat when pressed. */
export type ReplyKeyboardButton = KeyboardButtonFace;

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

export interface PressReplyKeyboardButtonInput<Target extends MessageTarget = MessageTarget> {
  readonly chat: Target;
  /** The text of the button to press, which the account then sends to the chat. */
  readonly text: string;
}

export interface AccountReplyInterfaceInput {
  readonly chat: MessageTarget;
}

/** A bot command as an account's client lists it. */
export interface BotCommand {
  /** The command without its leading slash. */
  readonly command: string;
  readonly description: string;
  readonly is_ephemeral: boolean;
}

/** The notification an account's client shows for another participant's message. */
export interface Notification {
  /** The notifying message's ID, as the chat's bots see it. */
  readonly message_id: number;
  /** Whether the sender asked for the notification to play no sound, as `disable_notification`. */
  readonly is_silent: boolean;
}

/** What a bot shows it is doing in a chat, by the Bot API's lowercase action name. */
export interface ChatAction {
  readonly bot_id: number;
  readonly action:
    | 'typing'
    | 'record_video'
    | 'upload_video'
    | 'record_voice'
    | 'upload_voice'
    | 'upload_photo'
    | 'upload_document'
    | 'choose_sticker'
    | 'find_location'
    | 'record_video_note'
    | 'upload_video_note';
}

/** The commands one bot of a supergroup suggests to an account. */
export interface SupergroupBotCommands {
  readonly bot_id: number;
  readonly commands: readonly BotCommand[];
}

export interface CallbackQueryAnswer {
  /** Omitted when the answer shows no notification. */
  readonly text?: string;
  readonly show_alert: boolean;
  /** The link that starts the bot, which the client opens; omitted when the answer has none. */
  readonly url?: string;
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

export interface SendInlineQueryInput {
  /** The inline bot, whose username the account types before the query. */
  readonly bot_id: number;
  /** The chat where the account types the query, to which a chosen result is sent. */
  readonly chat: MessageTarget;
  /** Up to 256 characters; omitted or empty when the account types only the bot's username. */
  readonly query?: string;
  /** The `next_offset` of an earlier answer, requesting more results; omitted for the first. */
  readonly offset?: string;
}

/** A result of an answer as the account's client lists it. */
export interface InlineQueryResultListing {
  readonly type: 'article' | 'photo' | 'document';
  readonly id: string;
  readonly title?: string;
  readonly description?: string;
  /** The URL an article shows. */
  readonly url?: string;
}

/** The button the account's client shows above the results. */
export type InlineQueryResultsButton =
  | { readonly text: string; readonly start_parameter: string }
  | { readonly text: string; readonly web_app: { readonly url: string } };

export interface InlineQueryAnswer {
  readonly results: readonly InlineQueryResultListing[];
  readonly cache_time: number;
  readonly is_personal: boolean;
  /** Empty when there are no more results. */
  readonly next_offset: string;
  readonly button?: InlineQueryResultsButton;
}

/** Whether the bot has answered an inline query. */
export type InlineQueryStatus = 'awaiting_answer' | 'answered';

/** An inline query an account sent, with the bot's answer once it has answered. */
export interface InlineQuery {
  readonly id: string;
  readonly bot_id: number;
  readonly chat: MessageTarget;
  readonly query: string;
  readonly offset: string;
  readonly status: InlineQueryStatus;
  /** The bot's answer when `status` is `answered`, and `null` otherwise. */
  readonly answer: InlineQueryAnswer | null;
}

export interface ChooseInlineQueryResultInput {
  readonly inline_query_id: string;
  /** The identifier of a result of the bot's answer. */
  readonly result_id: string;
}

export interface VirtualAccountClient extends VirtualAccountProfile {
  /**
   * Sends a message as this virtual Telegram account, to a bot or to a supergroup this account is
   * a member of. In a supergroup, bots in privacy mode receive only commands, replies to their
   * messages, and mentions of them.
   */
  sendMessage<Target extends MessageTarget>(
    input: AccountSendMessageInput<Target>,
  ): Promise<MessageIn<Target>>;
  /**
   * Sends a photo, with an optional caption, as this account, as `sendMessage` sends text. The
   * emulator reads the image's dimensions and rejects content that is not an image.
   */
  sendPhoto<Target extends MessageTarget>(
    input: AccountSendPhotoInput<Target>,
  ): Promise<MessageIn<Target>>;
  /** Sends a file as a document, with an optional caption, as `sendMessage` sends text. */
  sendDocument<Target extends MessageTarget>(
    input: AccountSendDocumentInput<Target>,
  ): Promise<MessageIn<Target>>;
  /**
   * Forwards a message of one of this account's chats to a chat it can write to, as the account's
   * message, which shows who first sent it. The chat's bots receive it as `sendMessage` describes.
   * Messages protected from forwarding and service messages cannot be forwarded.
   */
  forwardMessage<Target extends MessageTarget>(
    input: AccountForwardMessageInput<Target>,
  ): Promise<MessageIn<Target>>;
  /**
   * Edits the text of a message this account sent, which sends the chat's bots an
   * `edited_message` update as they received the message. Returns the edited message.
   */
  editMessage<Target extends MessageTarget>(
    input: AccountEditMessageInput<Target>,
  ): Promise<MessageIn<Target>>;
  /** Edits the caption of a photo or document this account sent, as `editMessage` edits text. */
  editMessageCaption<Target extends MessageTarget>(
    input: AccountEditMessageCaptionInput<Target>,
  ): Promise<MessageIn<Target>>;
  /**
   * Deletes a message for every participant of the chat, as Telegram's clients do; the chat's
   * bots receive no update for it. In a private chat, the account deletes either participant's
   * messages. In a supergroup, it deletes its own messages, and any message as the owner or as an
   * administrator with the `can_delete_messages` right.
   */
  deleteMessage(input: AccountDeleteMessageInput): Promise<void>;
  /** Creates a supergroup that this account owns. */
  createSupergroup(input: CreateSupergroupInput): Promise<Supergroup>;
  /**
   * Adds an account or a bot to a supergroup this account owns, which a `new_chat_members`
   * service message records. An added bot first receives a `my_chat_member` update. Adding a
   * removed member lifts its ban; adding a member again has no effect.
   */
  addChatMember(input: AddChatMemberInput): Promise<void>;
  /**
   * Removes an account or a bot from a supergroup this account owns, which bans it until it is
   * added again, and which a `left_chat_member` service message records. A removed bot receives a
   * `my_chat_member` update showing it as `kicked` and the service message, and its later
   * requests there fail with `403 Forbidden: bot was kicked from the supergroup chat`. Removing a
   * non-member has no effect.
   */
  removeChatMember(input: RemoveChatMemberInput): Promise<void>;
  /**
   * Leaves a supergroup, which a `left_chat_member` service message records. The owner cannot
   * leave. Leaving a supergroup this account is not a member of has no effect.
   */
  leaveChat(input: LeaveChatInput): Promise<void>;
  /**
   * Promotes a member of a supergroup this account owns to administrator with the given rights,
   * which must include at least one, or replaces an administrator's rights. A promoted bot
   * receives a `my_chat_member` update showing it as `administrator`, receives every message of
   * the supergroup, and uses its rights: `can_delete_messages` lets it delete any message there,
   * and `can_restrict_members` lets it ban and unban members.
   */
  promoteChatMember(input: PromoteChatMemberInput): Promise<void>;
  /**
   * Demotes an administrator of a supergroup this account owns to a member. A demoted bot
   * receives a `my_chat_member` update showing it as `member`. Demoting a member that is no
   * administrator has no effect.
   */
  demoteChatMember(input: DemoteChatMemberInput): Promise<void>;
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
  ): Promise<readonly MessageIn<Target>[]>;
  /**
   * Returns the chat actions, such as typing, that this account's client shows in its private
   * chat with a bot or in a supergroup it is a member of. A bot's action lasts 5.5 seconds unless
   * the bot sends it again, and ends when the bot cancels it or sends a message to the chat.
   */
  getChatActions(input: AccountChatActionsInput): Promise<readonly ChatAction[]>;
  /**
   * Returns the notifications this account's client shows for the messages other participants
   * sent to its private chat with a bot or to a supergroup it is a member of, oldest first. A
   * notification is silent when a bot sent its message with `disable_notification`.
   */
  getNotifications(input: AccountNotificationsInput): Promise<readonly Notification[]>;
  /**
   * Presses a callback button on a bot's message, in a private chat or a supergroup, which sends
   * the bot a callback query. The bot answers asynchronously; read the answer with
   * `getCallbackQuery`.
   */
  pressCallbackButton(input: PressCallbackButtonInput): Promise<CallbackQuery>;
  /** Returns a callback query this account created, with the bot's answer once given. */
  getCallbackQuery(callbackQueryId: string): Promise<CallbackQuery>;
  /**
   * Types an inline query for a bot with inline mode turned on, in a chat this account can write
   * to, which sends the bot an `inline_query` update. The bot answers asynchronously; read the
   * answer with `getInlineQuery`.
   */
  sendInlineQuery(input: SendInlineQueryInput): Promise<InlineQuery>;
  /** Returns an inline query this account sent, with the bot's answer once given. */
  getInlineQuery(inlineQueryId: string): Promise<InlineQuery>;
  /**
   * Sends a result of the bot's answer to the chat where the query was typed, as this account's
   * message with `via_bot`. The chat's bots receive it as any message of this account, and a bot
   * with inline feedback receives a `chosen_inline_result` update. Presses of the message's
   * callback buttons reach the inline bot, which edits the message by its `inline_message_id`.
   */
  chooseInlineQueryResult(
    input: ChooseInlineQueryResultInput,
  ): Promise<PrivateMessage | SupergroupMessage>;
  /**
   * Returns the commands this account's client suggests in its private chat with a bot: the
   * bot's list for the chat, for all private chats, or by default, in the account's language if
   * the bot has one.
   */
  getBotCommands(input: AccountBotCommandsInput): Promise<readonly BotCommand[]>;
  /**
   * Returns the commands this account's client suggests in a supergroup it is a member of, for
   * each bot of the supergroup that has any: the bot's list for the account as a member, for the
   * supergroup's administrators, for the supergroup, for all groups' administrators, for all
   * groups, or by default, where administrator lists apply only to administrators, in the
   * account's language if the bot has one.
   */
  getSupergroupBotCommands(
    input: AccountSupergroupBotCommandsInput,
  ): Promise<readonly SupergroupBotCommands[]>;
  /**
   * Returns the reply keyboard or forced reply this account's client shows in its private chat
   * with a bot or in a supergroup it is a member of, or `null` when it shows its usual input. In a
   * supergroup, a bot's selective markup reaches only the members its message mentions and the
   * sender of the message it replies to.
   */
  getReplyInterface(input: AccountReplyInterfaceInput): Promise<ReplyInterface | null>;
  /**
   * Presses a button of the reply keyboard the chat shows, which sends the button's text as this
   * account's message; in a supergroup, the message replies to the keyboard's message, as
   * Telegram's clients send it. Fails when the chat shows no keyboard with such a button.
   */
  pressReplyKeyboardButton<Target extends MessageTarget>(
    input: PressReplyKeyboardButtonInput<Target>,
  ): Promise<MessageIn<Target>>;
}

export interface AccountChatActionsInput {
  readonly chat: MessageTarget;
}

export interface AccountNotificationsInput {
  readonly chat: MessageTarget;
}

export interface AccountBotCommandsInput {
  readonly chat: PrivateMessageTarget;
}

export interface AccountSupergroupBotCommandsInput {
  readonly chat: SupergroupMessageTarget;
}

export interface CreatedVirtualAccount {
  readonly account: VirtualAccountClient;
}

export type HttpMethod = 'DELETE' | 'GET' | 'PATCH' | 'POST' | 'PUT';

export interface RequestDetails {
  readonly method: HttpMethod;
  readonly url: string;
}
