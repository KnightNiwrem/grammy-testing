import { cleanUploadedFileName } from '../media/document_file.ts';
import { isParseMode, parseMarkup } from '../text_entities/parse_mode.ts';
import type {
  BotApiBotCommand,
  BotApiDownloadableFile,
  BotApiMessage,
  BotApiPrivateMessage,
  BotApiSupergroupMessage,
} from '../types/bot_api.ts';
import type { BotCommand, BotCommandLanguageCode, BotCommandScope } from '../types/bot_command.ts';
import type { CallbackQueryId } from '../types/callback_query.ts';
import {
  type FormerSupergroupMemberFailureReason,
  getSupergroupNonMemberFailureReason,
} from '../types/chat_membership.ts';
import type { InlineKeyboard } from '../types/inline_keyboard.ts';
import type { BotMessageReplyMarkup } from '../types/reply_interface.ts';
import type { DocumentUpload, PhotoUpload, StoredFile } from '../types/stored_file.ts';
import type { VirtualBot, VirtualBotProfile } from '../types/virtual_bot.ts';
import type { ChatAction } from '../types/virtual_chat.ts';
import type { PrivateMessage, SupergroupMessage, TextEntity } from '../types/virtual_message.ts';
import type { GetUpdatesRequest, GetUpdatesResult } from './bot_update_polling.ts';
import type { LeaveChatResult } from './shared_chat_administration.ts';
import type {
  ContentNormalizationFailure,
  OutgoingDocument,
  OutgoingMessageContent,
  OutgoingPhoto,
  TextInvalidFailure,
} from './message_content.ts';

export interface DeleteWebhookRequest {
  readonly dropPendingUpdates: boolean;
}

/** The most UTF-8 bytes of text the Bot API reads before applying its formatting. */
const MAX_FORMATTED_TEXT_BYTES = 1 << 15;

/** A parse mode that leaves text as it is, as omitting it does. */
const NO_PARSE_MODE = 'none';

/** Formatted text as a bot specified it: entities from `entities` or from parsed markup. */
export interface SpecifiedFormattedText {
  readonly text: string;
  /**
   * Validated and normalized as Telegram does before the message is stored; omitted for plain
   * text.
   */
  readonly entities?: readonly TextEntity[];
}

export interface ReadFormattedTextRequest {
  /** Message text or a caption, which may be written in markup. */
  readonly text: string;
  /** The `parse_mode` parameter, matched case-insensitively. */
  readonly parseMode?: string;
  /** The `entities` parameter, which a parse mode overrides. */
  readonly entities: readonly TextEntity[];
}

export type ReadFormattedTextFailureReason =
  | 'text_too_long'
  | 'parse_mode_unsupported'
  | 'text_encoding_invalid'
  | 'date_time_unsupported';

export type ReadFormattedTextResult =
  | { readonly read: true; readonly formattedText: SpecifiedFormattedText }
  | { readonly read: false; readonly reason: ReadFormattedTextFailureReason }
  | {
    readonly read: false;
    readonly reason: 'markup_invalid';
    /** TDLib's description of the markup error. */
    readonly markupError: string;
  };

/** The message of the chat that a sent message replies to, as `reply_parameters` specify it. */
export interface ReplyTarget {
  /** The message's ID in the bot's chat. */
  readonly messageId: number;
  /** Sends the message as no reply, rather than failing, when the target is not found. */
  readonly allowSendingWithoutReply: boolean;
}

/**
 * Where and how every send method sends its message. The reply markup is an inline keyboard or a
 * change of the reply interface.
 */
export type SendRequestOptions = BotMessageReplyMarkup & {
  /**
   * The Bot API `chat_id`: for a private chat, the other user's ID, which is positive; for a
   * supergroup, its negative chat ID.
   */
  readonly chatId: number;
  /** Omitted for a message that replies to none. */
  readonly replyTo?: ReplyTarget;
  /** The Bot API `protect_content`; omitted for an unprotected message. */
  readonly isContentProtected?: boolean;
};

export type SendMessageRequest = SpecifiedFormattedText & SendRequestOptions;

/**
 * A file a request sends: one the bot knows by its `file_id`, or a file uploaded with the request
 * under the name its sender gave it.
 */
export type BotApiInputFile =
  | { readonly kind: 'file_id'; readonly fileId: string }
  | {
    readonly kind: 'upload';
    readonly fileName: string;
    readonly content: Uint8Array<ArrayBuffer>;
  };

export type SendPhotoRequest = SendRequestOptions & {
  readonly photo: BotApiInputFile;
  /** Empty text for no caption. */
  readonly caption: SpecifiedFormattedText;
  /** The Bot API `has_spoiler`. */
  readonly hasSpoiler: boolean;
  /** The Bot API `show_caption_above_media`. */
  readonly showsCaptionAboveMedia: boolean;
};

export type SendDocumentRequest = SendRequestOptions & {
  readonly document: BotApiInputFile;
  /** Empty text for no caption. */
  readonly caption: SpecifiedFormattedText;
};

export type SendFailureReason =
  | 'message_text_empty'
  | 'chat_not_found'
  | FormerSupergroupMemberFailureReason
  | 'reply_message_not_found'
  | 'message_text_too_long'
  | 'caption_too_long'
  | 'callback_data_invalid'
  | 'bot_blocked'
  | 'reply_interface_unsupported_in_groups'
  | 'file_empty'
  | 'image_invalid'
  | 'photo_dimensions_invalid'
  | 'file_id_invalid';

/** The file a `file_id` identifies is of another type than the method sends. */
export interface FileTypeMismatchFailure {
  readonly reason: 'file_type_mismatch';
  readonly expectedFileType: StoredFile['type'];
  readonly actualFileType: StoredFile['type'];
}

export type SendResult =
  | { readonly sent: true; readonly message: BotApiMessage }
  | (
    & { readonly sent: false }
    & (
      | { readonly reason: SendFailureReason }
      | TextInvalidFailure
      | FileTypeMismatchFailure
    )
  );

/** A message of one of the bot's chats, as Bot API methods address it. */
interface MessageTarget {
  /** The Bot API `chat_id`, as `SendRequestOptions` describes it. */
  readonly chatId: number;
  /** The message's ID in the bot's chat. */
  readonly messageId: number;
}

export interface EditMessageTextRequest extends MessageTarget, SpecifiedFormattedText {
  /** Omitting the keyboard removes the message's keyboard, as on Telegram. */
  readonly inlineKeyboard?: InlineKeyboard;
}

export interface EditMessageCaptionRequest extends MessageTarget {
  /** Empty text removes the caption. */
  readonly caption: SpecifiedFormattedText;
  /** The Bot API `show_caption_above_media`, which only a photo honors. */
  readonly showsCaptionAboveMedia: boolean;
  /** Omitting the keyboard removes the message's keyboard, as on Telegram. */
  readonly inlineKeyboard?: InlineKeyboard;
}

export interface EditMessageReplyMarkupRequest extends MessageTarget {
  /** Omitting the keyboard removes the message's keyboard, as on Telegram. */
  readonly inlineKeyboard?: InlineKeyboard;
}

export type EditMessageReplyMarkupFailureReason =
  | 'chat_not_found'
  | FormerSupergroupMemberFailureReason
  | 'message_not_found'
  | 'message_not_editable'
  | 'callback_data_invalid'
  | 'message_not_modified';

export type EditMessageTextFailureReason =
  | EditMessageReplyMarkupFailureReason
  | 'message_text_empty'
  | 'message_has_no_text'
  | 'message_text_too_long';

export type EditMessageCaptionFailureReason =
  | EditMessageReplyMarkupFailureReason
  | 'message_has_no_caption'
  | 'caption_too_long';

export type EditMessageResult<FailureReason extends string> =
  | { readonly edited: true; readonly message: BotApiMessage }
  | { readonly edited: false; readonly reason: FailureReason };

export type EditMessageTextResult =
  | EditMessageResult<EditMessageTextFailureReason>
  | ({ readonly edited: false } & TextInvalidFailure);

export type EditMessageCaptionResult =
  | EditMessageResult<EditMessageCaptionFailureReason>
  | ({ readonly edited: false } & TextInvalidFailure);

export type GetFileResult =
  | { readonly found: true; readonly file: BotApiDownloadableFile }
  | { readonly found: false; readonly reason: 'file_id_invalid' | 'file_too_big' };

export interface SendChatActionRequest {
  /** The Bot API `chat_id`, as `SendRequestOptions` describes it. */
  readonly chatId: number;
  readonly action: ChatAction;
}

export type SendChatActionResult =
  | { readonly sent: true }
  | {
    readonly sent: false;
    readonly reason: 'chat_not_found' | FormerSupergroupMemberFailureReason | 'bot_blocked';
  };

export interface LeaveChatRequest {
  /** The Bot API `chat_id`, as `SendRequestOptions` describes it. */
  readonly chatId: number;
}

export type BotApiLeaveChatFailureReason =
  | 'chat_not_found'
  | FormerSupergroupMemberFailureReason
  | 'private_chat_not_leavable';

export type BotApiLeaveChatResult =
  | { readonly left: true }
  | { readonly left: false; readonly reason: BotApiLeaveChatFailureReason };

export type DeleteMessageRequest = MessageTarget;

export type DeleteMessageResult =
  | { readonly deleted: true }
  | {
    readonly deleted: false;
    readonly reason:
      | 'chat_not_found'
      | FormerSupergroupMemberFailureReason
      | 'message_not_found'
      | 'message_not_deletable';
  };

export interface DeleteMessagesRequest {
  /** The Bot API `chat_id`, as `SendRequestOptions` describes it. */
  readonly chatId: number;
  /** The messages' IDs in the bot's chat. */
  readonly messageIds: readonly number[];
}

export type DeleteMessagesResult =
  | { readonly deleted: true }
  | {
    readonly deleted: false;
    readonly reason:
      | 'chat_not_found'
      | FormerSupergroupMemberFailureReason
      | 'message_not_deletable';
  };

export interface AnswerCallbackQueryRequest {
  readonly callbackQueryId: CallbackQueryId;
  readonly text?: string;
  readonly showAlert: boolean;
  readonly cacheTimeSeconds: number;
}

export type AnswerCallbackQueryResult =
  | { readonly answered: true }
  | { readonly answered: false; readonly reason: 'query_id_invalid' };

interface BotCredentialLookup {
  getByToken(token: string): VirtualBot | undefined;
}

interface BotUpdatePolling {
  getUpdates(botId: number, request: GetUpdatesRequest): Promise<GetUpdatesResult>;
}

interface PendingBotUpdates {
  discardPendingUpdates(botId: number): void;
}

interface BotPrivateChat {
  readonly type: 'private';
  readonly accountId: number;
}

type BotMessageSendingResult =
  | { readonly sent: true; readonly message: PrivateMessage }
  | {
    readonly sent: false;
    readonly reason:
      | 'bot_not_found'
      | 'message_text_empty'
      | 'account_not_found'
      | 'conversation_not_started'
      | 'reply_message_not_found'
      | 'callback_data_invalid'
      | 'bot_blocked';
  }
  | ({ readonly sent: false } & ContentNormalizationFailure);

/** Why an edit of any kind can fail, apart from failures about the new content. */
type BotMessageEditFailureReason =
  | 'bot_not_found'
  | 'account_not_found'
  | 'conversation_not_started'
  | 'message_not_found'
  | 'message_not_editable'
  | 'callback_data_invalid'
  | 'message_not_modified';

type BotMessageEditingResult<FailureReason extends string> =
  | { readonly edited: true; readonly message: PrivateMessage }
  | { readonly edited: false; readonly reason: FailureReason };

/** A caption edit as the messaging services take it. */
interface CaptionEdit {
  readonly caption: string;
  readonly captionEntities?: readonly TextEntity[];
  readonly showsCaptionAboveMedia: boolean;
  readonly inlineKeyboard?: InlineKeyboard;
}

interface BotMessaging {
  isPrivateConversationStarted(
    key: { readonly accountId: number; readonly botId: number },
  ): boolean;
  sendBotMessage(
    input: BotMessageReplyMarkup & {
      readonly fromBotId: number;
      readonly to: BotPrivateChat;
      readonly content: OutgoingMessageContent;
      readonly replyTo?: {
        readonly botMessageId: number;
        readonly allowSendingWithoutReply: boolean;
      };
      readonly isContentProtected?: boolean;
    },
  ): BotMessageSendingResult;
  editBotMessageText(input: {
    readonly fromBotId: number;
    readonly chat: BotPrivateChat;
    readonly botMessageId: number;
    readonly text: string;
    readonly entities?: readonly TextEntity[];
    readonly inlineKeyboard?: InlineKeyboard;
  }):
    | BotMessageEditingResult<
      | BotMessageEditFailureReason
      | 'message_text_empty'
      | 'message_has_no_text'
      | 'message_text_too_long'
    >
    | ({ readonly edited: false } & TextInvalidFailure);
  editBotMessageCaption(
    input: CaptionEdit & {
      readonly fromBotId: number;
      readonly chat: BotPrivateChat;
      readonly botMessageId: number;
    },
  ):
    | BotMessageEditingResult<
      BotMessageEditFailureReason | 'message_has_no_caption' | 'caption_too_long'
    >
    | ({ readonly edited: false } & TextInvalidFailure);
  editBotMessageInlineKeyboard(input: {
    readonly fromBotId: number;
    readonly chat: BotPrivateChat;
    readonly botMessageId: number;
    readonly inlineKeyboard?: InlineKeyboard;
  }): BotMessageEditingResult<BotMessageEditFailureReason>;
  sendBotChatAction(input: {
    readonly fromBotId: number;
    readonly to: BotPrivateChat;
    readonly action: ChatAction;
  }):
    | { readonly sent: true }
    | {
      readonly sent: false;
      readonly reason:
        | 'bot_not_found'
        | 'account_not_found'
        | 'conversation_not_started'
        | 'bot_blocked';
    };
  deleteMessagesByBot(input: {
    readonly fromBotId: number;
    readonly chat: BotPrivateChat;
    readonly botMessageIds: readonly number[];
  }):
    | { readonly deleted: true; readonly deletedMessageCount: number }
    | {
      readonly deleted: false;
      readonly reason: 'bot_not_found' | 'account_not_found' | 'conversation_not_started';
    };
}

type SupergroupBotMessageEditingResult<FailureReason extends string> =
  | { readonly edited: true; readonly message: SupergroupMessage }
  | { readonly edited: false; readonly reason: FailureReason };

/** Why an edit of any kind can fail in a supergroup, apart from failures about the content. */
type SupergroupBotMessageEditFailureReason =
  | 'bot_not_found'
  | 'chat_not_found'
  | FormerSupergroupMemberFailureReason
  | 'message_not_found'
  | 'message_not_editable'
  | 'callback_data_invalid'
  | 'message_not_modified';

interface SupergroupBotMessaging {
  sendBotMessage(input: {
    readonly fromBotId: number;
    readonly chatId: number;
    readonly content: OutgoingMessageContent;
    readonly inlineKeyboard?: InlineKeyboard;
    readonly replyTo?: { readonly messageId: number; readonly allowSendingWithoutReply: boolean };
    readonly isContentProtected?: boolean;
  }):
    | { readonly sent: true; readonly message: SupergroupMessage }
    | {
      readonly sent: false;
      readonly reason:
        | 'bot_not_found'
        | 'message_text_empty'
        | 'chat_not_found'
        | FormerSupergroupMemberFailureReason
        | 'reply_message_not_found'
        | 'callback_data_invalid';
    }
    | ({ readonly sent: false } & ContentNormalizationFailure);
  editBotMessageText(input: {
    readonly fromBotId: number;
    readonly chatId: number;
    readonly messageId: number;
    readonly text: string;
    readonly entities?: readonly TextEntity[];
    readonly inlineKeyboard?: InlineKeyboard;
  }):
    | SupergroupBotMessageEditingResult<
      | SupergroupBotMessageEditFailureReason
      | 'message_text_empty'
      | 'message_has_no_text'
      | 'message_text_too_long'
    >
    | ({ readonly edited: false } & TextInvalidFailure);
  editBotMessageCaption(
    input: CaptionEdit & {
      readonly fromBotId: number;
      readonly chatId: number;
      readonly messageId: number;
    },
  ):
    | SupergroupBotMessageEditingResult<
      SupergroupBotMessageEditFailureReason | 'message_has_no_caption' | 'caption_too_long'
    >
    | ({ readonly edited: false } & TextInvalidFailure);
  editBotMessageInlineKeyboard(input: {
    readonly fromBotId: number;
    readonly chatId: number;
    readonly messageId: number;
    readonly inlineKeyboard?: InlineKeyboard;
  }): SupergroupBotMessageEditingResult<SupergroupBotMessageEditFailureReason>;
  sendBotChatAction(input: {
    readonly fromBotId: number;
    readonly chatId: number;
    readonly action: ChatAction;
  }):
    | { readonly sent: true }
    | {
      readonly sent: false;
      readonly reason: 'bot_not_found' | 'chat_not_found' | FormerSupergroupMemberFailureReason;
    };
  deleteMessagesByBot(input: {
    readonly fromBotId: number;
    readonly chatId: number;
    readonly messageIds: readonly number[];
  }):
    | { readonly deleted: true; readonly deletedMessageCount: number }
    | {
      readonly deleted: false;
      readonly reason:
        | 'bot_not_found'
        | 'chat_not_found'
        | FormerSupergroupMemberFailureReason
        | 'message_not_deletable';
    };
}

interface ChatMemberships {
  leaveChat(input: { readonly memberId: number; readonly chatId: number }): LeaveChatResult;
}

interface MediaFiles {
  preparePhotoUpload(content: Uint8Array<ArrayBuffer>):
    | { readonly prepared: true; readonly upload: PhotoUpload }
    | {
      readonly prepared: false;
      readonly reason: 'file_empty' | 'image_invalid' | 'photo_dimensions_invalid';
    };
  prepareDocumentUpload(content: Uint8Array<ArrayBuffer>, fileName: string):
    | { readonly prepared: true; readonly upload: DocumentUpload }
    | { readonly prepared: false; readonly reason: 'file_empty' };
  findObserverFile(observerId: number, fileId: string): StoredFile | undefined;
  getBotFile(botId: number, fileId: string):
    | {
      readonly found: true;
      readonly downloadableFile: {
        readonly file: StoredFile;
        readonly fileId: string;
        readonly filePath: string;
      };
    }
    | { readonly found: false; readonly reason: 'file_id_invalid' | 'file_too_big' };
  findBotFileByPath(botId: number, filePath: string): StoredFile | undefined;
}

/** A command list of the bot, addressed as the command methods address it. */
export interface MyCommandsTarget {
  readonly scope: BotCommandScope;
  readonly languageCode: BotCommandLanguageCode;
}

export interface SetMyCommandsRequest extends MyCommandsTarget {
  readonly commands: readonly {
    readonly command: string;
    readonly description: string;
    readonly isEphemeral: boolean;
  }[];
}

/** Why a scope or language cannot address one of the bot's command lists. */
export type MyCommandsTargetFailureReason =
  | 'chat_not_found'
  | 'scope_not_allowed_in_private_chats'
  | 'language_code_invalid';

export type SetMyCommandsFailureReason =
  | MyCommandsTargetFailureReason
  | 'command_not_utf8'
  | 'command_description_not_utf8'
  | 'command_empty'
  | 'command_too_long'
  | 'command_description_empty'
  | 'command_description_too_long'
  | 'too_many_commands'
  | 'command_invalid';

export type SetMyCommandsResult =
  | { readonly set: true }
  | { readonly set: false; readonly reason: SetMyCommandsFailureReason };

export type GetMyCommandsResult =
  | { readonly found: true; readonly commands: readonly BotApiBotCommand[] }
  | { readonly found: false; readonly reason: MyCommandsTargetFailureReason };

export type DeleteMyCommandsResult =
  | { readonly deleted: true }
  | { readonly deleted: false; readonly reason: MyCommandsTargetFailureReason };

interface BotCommandListAddress extends MyCommandsTarget {
  readonly botId: number;
}

type BotCommandListTargetFailure = MyCommandsTargetFailureReason | 'bot_not_found';

interface BotCommandLists {
  setBotCommands(input: BotCommandListAddress & Pick<SetMyCommandsRequest, 'commands'>):
    | { readonly set: true }
    | {
      readonly set: false;
      readonly reason:
        | BotCommandListTargetFailure
        | Exclude<
          SetMyCommandsFailureReason,
          MyCommandsTargetFailureReason
        >;
    };
  getBotCommands(target: BotCommandListAddress):
    | { readonly found: true; readonly commands: readonly BotCommand[] }
    | { readonly found: false; readonly reason: BotCommandListTargetFailure };
  deleteBotCommands(target: BotCommandListAddress):
    | { readonly deleted: true }
    | { readonly deleted: false; readonly reason: BotCommandListTargetFailure };
}

interface CallbackQueryAnswering {
  answerCallbackQuery(input: {
    readonly fromBotId: number;
    readonly callbackQueryId: CallbackQueryId;
    readonly text?: string;
    readonly showAlert: boolean;
    readonly cacheTimeSeconds: number;
  }): { readonly answered: boolean };
}

interface BotMessageViews {
  viewPrivateMessageForBot(message: PrivateMessage): BotApiPrivateMessage;
  viewSupergroupMessage(message: SupergroupMessage, observerId: number): BotApiSupergroupMessage;
}

interface BotApiServiceDependencies {
  readonly bots: BotCredentialLookup;
  readonly updatePolling: BotUpdatePolling;
  readonly pendingUpdates: PendingBotUpdates;
  readonly botMessages: BotMessaging;
  readonly supergroupBotMessages: SupergroupBotMessaging;
  readonly chatMemberships: ChatMemberships;
  readonly botMessageViews: BotMessageViews;
  readonly mediaFiles: MediaFiles;
  readonly callbackQueries: CallbackQueryAnswering;
  readonly botCommands: BotCommandLists;
}

/**
 * The application boundary for Bot API methods.
 *
 * Transport authenticates each call with `authenticate` before invoking a method, so that an
 * invalid token is rejected before request parameters are validated, as Telegram does. Invariants
 * that span a bot's configuration and update delivery, such as polling and webhook delivery being
 * mutually exclusive, belong here rather than in route handlers.
 */
export class BotApiService {
  readonly #bots: BotCredentialLookup;
  readonly #updatePolling: BotUpdatePolling;
  readonly #pendingUpdates: PendingBotUpdates;
  readonly #botMessages: BotMessaging;
  readonly #supergroupBotMessages: SupergroupBotMessaging;
  readonly #chatMemberships: ChatMemberships;
  readonly #botMessageViews: BotMessageViews;
  readonly #mediaFiles: MediaFiles;
  readonly #callbackQueries: CallbackQueryAnswering;
  readonly #botCommands: BotCommandLists;

  constructor(
    {
      bots,
      updatePolling,
      pendingUpdates,
      botMessages,
      supergroupBotMessages,
      chatMemberships,
      botMessageViews,
      mediaFiles,
      callbackQueries,
      botCommands,
    }: BotApiServiceDependencies,
  ) {
    this.#bots = bots;
    this.#updatePolling = updatePolling;
    this.#pendingUpdates = pendingUpdates;
    this.#botMessages = botMessages;
    this.#supergroupBotMessages = supergroupBotMessages;
    this.#chatMemberships = chatMemberships;
    this.#botMessageViews = botMessageViews;
    this.#mediaFiles = mediaFiles;
    this.#callbackQueries = callbackQueries;
    this.#botCommands = botCommands;
  }

  /** Returns the profile of the bot that owns `token`, or `undefined` if no bot does. */
  authenticate(token: string): VirtualBotProfile | undefined {
    return this.#bots.getByToken(token)?.profile;
  }

  /** Polls the authenticated bot's pending updates. */
  getUpdates(
    authenticatedBot: VirtualBotProfile,
    request: GetUpdatesRequest,
  ): Promise<GetUpdatesResult> {
    return this.#updatePolling.getUpdates(authenticatedBot.id, request);
  }

  /**
   * Bots here never have a webhook, so, as on Telegram when none is set, this only discards
   * pending updates when asked to. A held long poll is left running, as Telegram does.
   */
  deleteWebhook(
    authenticatedBot: VirtualBotProfile,
    { dropPendingUpdates }: DeleteWebhookRequest,
  ): void {
    if (dropPendingUpdates) {
      this.#pendingUpdates.discardPendingUpdates(authenticatedBot.id);
    }
  }

  /**
   * Reads message text with its `parse_mode` or `entities`, as the official Bot API server's
   * `Client::get_formatted_text` does before it looks at the chat: a parse mode other than `none`
   * turns markup into entities and overrides `entities`. The result still has to pass the checks
   * that sending or editing applies.
   *
   * Date and time entities, which Telegram's markup can produce, are not supported.
   */
  readFormattedText(
    { text, parseMode, entities }: ReadFormattedTextRequest,
  ): ReadFormattedTextResult {
    if (new TextEncoder().encode(text).length > MAX_FORMATTED_TEXT_BYTES) {
      return { read: false, reason: 'text_too_long' };
    }
    const parseModeName = parseMode?.toLowerCase() ?? '';
    if (parseModeName.length === 0 || parseModeName === NO_PARSE_MODE) {
      return { read: true, formattedText: { text, entities } };
    }
    if (!isParseMode(parseModeName)) {
      return { read: false, reason: 'parse_mode_unsupported' };
    }
    if (!text.isWellFormed()) {
      return { read: false, reason: 'text_encoding_invalid' };
    }

    const parsing = parseMarkup(text, parseModeName);
    if (parsing.parsed) {
      return { read: true, formattedText: { text: parsing.text, entities: parsing.entities } };
    }
    return parsing.reason === 'markup_invalid'
      ? { read: false, reason: 'markup_invalid', markupError: parsing.error }
      : { read: false, reason: parsing.reason };
  }

  /**
   * Sends text to a private chat or a supergroup, optionally as a reply to one of the chat's
   * messages and with an inline keyboard. A message to a private chat can instead change the
   * account's reply interface. Telegram also shows a reply interface to chosen members of a group,
   * which the emulator does not support.
   */
  sendMessage(
    authenticatedBot: VirtualBotProfile,
    { text, entities, ...options }: SendMessageRequest,
  ): SendResult {
    return this.#send(authenticatedBot, { kind: 'text', text, entities }, options);
  }

  /**
   * Sends a photo with an optional caption, as `sendMessage` sends text. The photo is uploaded
   * with the request or reused by the `file_id` the bot knows it by.
   *
   * The file is resolved before the chat, while Telegram looks at the chat first; a request with
   * both an unknown chat and an unusable file fails for its file.
   */
  sendPhoto(
    authenticatedBot: VirtualBotProfile,
    { photo, caption, hasSpoiler, showsCaptionAboveMedia, ...options }: SendPhotoRequest,
  ): SendResult {
    const photoResolution = this.#resolvePhoto(authenticatedBot, photo);
    if (!photoResolution.resolved) {
      return { sent: false, ...photoResolution.failure };
    }
    return this.#send(authenticatedBot, {
      kind: 'photo',
      photo: photoResolution.file,
      caption: caption.text,
      captionEntities: caption.entities,
      hasSpoiler,
      showsCaptionAboveMedia,
    }, options);
  }

  /**
   * Sends a file as a document with an optional caption, as `sendPhoto` sends a photo. Telegram
   * sends some files, such as videos and GIF animations, as other media unless the request
   * disables content type detection; the emulator always sends a document.
   */
  sendDocument(
    authenticatedBot: VirtualBotProfile,
    { document, caption, ...options }: SendDocumentRequest,
  ): SendResult {
    const documentResolution = this.#resolveDocument(authenticatedBot, document);
    if (!documentResolution.resolved) {
      return { sent: false, ...documentResolution.failure };
    }
    return this.#send(authenticatedBot, {
      kind: 'document',
      document: documentResolution.file,
      caption: caption.text,
      captionEntities: caption.entities,
    }, options);
  }

  /** Returns a file the bot knows by its `file_id`, with the `file_path` to download it from. */
  getFile(authenticatedBot: VirtualBotProfile, fileId: string): GetFileResult {
    const result = this.#mediaFiles.getBotFile(authenticatedBot.id, fileId);
    if (!result.found) {
      return result;
    }
    const { file, filePath } = result.downloadableFile;
    return {
      found: true,
      file: {
        file_id: result.downloadableFile.fileId,
        file_unique_id: file.uniqueId,
        file_size: file.content.length,
        file_path: filePath,
      },
    };
  }

  /** Returns the file at a `file_path` that `getFile` gave the bot, for download. */
  downloadFile(authenticatedBot: VirtualBotProfile, filePath: string): StoredFile | undefined {
    return this.#mediaFiles.findBotFileByPath(authenticatedBot.id, filePath);
  }

  #send(
    authenticatedBot: VirtualBotProfile,
    content: OutgoingMessageContent,
    options: SendRequestOptions,
  ): SendResult {
    return isUserId(options.chatId)
      ? this.#sendPrivateMessage(authenticatedBot, content, options)
      : this.#sendSupergroupMessage(authenticatedBot, content, options);
  }

  #sendPrivateMessage(
    authenticatedBot: VirtualBotProfile,
    content: OutgoingMessageContent,
    { chatId, replyTo, isContentProtected, ...replyMarkup }: SendRequestOptions,
  ): SendResult {
    const result = this.#botMessages.sendBotMessage({
      ...replyMarkup,
      fromBotId: authenticatedBot.id,
      to: { type: 'private', accountId: chatId },
      content,
      replyTo: replyTo === undefined ? undefined : {
        botMessageId: replyTo.messageId,
        allowSendingWithoutReply: replyTo.allowSendingWithoutReply,
      },
      isContentProtected,
    });
    if (result.sent) {
      return {
        sent: true,
        message: this.#botMessageViews.viewPrivateMessageForBot(result.message),
      };
    }

    switch (result.reason) {
      case 'text_invalid':
        return result;
      case 'message_text_empty':
      case 'reply_message_not_found':
      case 'message_text_too_long':
      case 'caption_too_long':
      case 'callback_data_invalid':
      case 'bot_blocked':
        return { sent: false, reason: result.reason };
      // A bot can address a user only after the user has written to it. Telegram reports any
      // other user, like an unknown chat, as not found.
      case 'account_not_found':
      case 'conversation_not_started':
        return { sent: false, reason: 'chat_not_found' };
      case 'bot_not_found':
        throw new Error(`Authenticated bot ${authenticatedBot.id} does not exist`);
      default: {
        const unhandledFailure: never = result;
        throw new Error(`Unhandled bot message failure: ${JSON.stringify(unhandledFailure)}`);
      }
    }
  }

  #sendSupergroupMessage(
    authenticatedBot: VirtualBotProfile,
    content: OutgoingMessageContent,
    { chatId, replyTo, isContentProtected, inlineKeyboard, replyInterfaceMarkup }:
      SendRequestOptions,
  ): SendResult {
    if (replyInterfaceMarkup !== undefined) {
      return { sent: false, reason: 'reply_interface_unsupported_in_groups' };
    }
    const result = this.#supergroupBotMessages.sendBotMessage({
      fromBotId: authenticatedBot.id,
      chatId,
      content,
      inlineKeyboard,
      replyTo,
      isContentProtected,
    });
    if (result.sent) {
      return {
        sent: true,
        message: this.#botMessageViews.viewSupergroupMessage(result.message, authenticatedBot.id),
      };
    }

    switch (result.reason) {
      case 'text_invalid':
        return result;
      case 'message_text_empty':
      case 'chat_not_found':
      case 'bot_not_a_member':
      case 'bot_kicked':
      case 'reply_message_not_found':
      case 'message_text_too_long':
      case 'caption_too_long':
      case 'callback_data_invalid':
        return { sent: false, reason: result.reason };
      case 'bot_not_found':
        throw new Error(`Authenticated bot ${authenticatedBot.id} does not exist`);
      default: {
        const unhandledFailure: never = result;
        throw new Error(`Unhandled bot message failure: ${JSON.stringify(unhandledFailure)}`);
      }
    }
  }

  /** Resolves the photo a request sends: an upload, or a photo the bot knows by `file_id`. */
  #resolvePhoto(authenticatedBot: VirtualBotProfile, input: BotApiInputFile): FileResolution<
    OutgoingPhoto
  > {
    if (input.kind === 'file_id') {
      const file = this.#mediaFiles.findObserverFile(authenticatedBot.id, input.fileId);
      if (file?.type === 'photo') {
        return { resolved: true, file: { kind: 'stored', file } };
      }
      return { resolved: false, failure: fileIdFailure(file, 'photo') };
    }
    const preparation = this.#mediaFiles.preparePhotoUpload(input.content);
    return preparation.prepared
      ? { resolved: true, file: { kind: 'upload', upload: preparation.upload } }
      : { resolved: false, failure: { reason: preparation.reason } };
  }

  /**
   * Resolves the document a request sends: an upload, whose name the Bot API server cleans, or a
   * document the bot knows by `file_id`.
   */
  #resolveDocument(authenticatedBot: VirtualBotProfile, input: BotApiInputFile): FileResolution<
    OutgoingDocument
  > {
    if (input.kind === 'file_id') {
      const file = this.#mediaFiles.findObserverFile(authenticatedBot.id, input.fileId);
      if (file?.type === 'document') {
        return { resolved: true, file: { kind: 'stored', file } };
      }
      return { resolved: false, failure: fileIdFailure(file, 'document') };
    }
    const preparation = this.#mediaFiles.prepareDocumentUpload(
      input.content,
      cleanUploadedFileName(input.fileName),
    );
    return preparation.prepared
      ? { resolved: true, file: { kind: 'upload', upload: preparation.upload } }
      : { resolved: false, failure: { reason: preparation.reason } };
  }

  /** Shows a chat action, such as typing, in a private chat or a supergroup. */
  sendChatAction(
    authenticatedBot: VirtualBotProfile,
    { chatId, action }: SendChatActionRequest,
  ): SendChatActionResult {
    if (!isUserId(chatId)) {
      const supergroupResult = this.#supergroupBotMessages.sendBotChatAction({
        fromBotId: authenticatedBot.id,
        chatId,
        action,
      });
      if (supergroupResult.sent) {
        return supergroupResult;
      }
      if (supergroupResult.reason === 'bot_not_found') {
        throw new Error(`Authenticated bot ${authenticatedBot.id} does not exist`);
      }
      return { sent: false, reason: supergroupResult.reason };
    }
    const result = this.#botMessages.sendBotChatAction({
      fromBotId: authenticatedBot.id,
      to: { type: 'private', accountId: chatId },
      action,
    });
    if (result.sent) {
      return result;
    }
    switch (result.reason) {
      case 'bot_blocked':
        return { sent: false, reason: result.reason };
      // As for sending, a chat the bot cannot address is not found.
      case 'account_not_found':
      case 'conversation_not_started':
        return { sent: false, reason: 'chat_not_found' };
      case 'bot_not_found':
        throw new Error(`Authenticated bot ${authenticatedBot.id} does not exist`);
      default: {
        const unhandledReason: never = result.reason;
        throw new Error(`Unhandled chat action failure: ${unhandledReason}`);
      }
    }
  }

  /**
   * Leaves a supergroup, which the bot's own `my_chat_member` update and a service message record.
   * As on Telegram, a private chat cannot be left, and a supergroup the bot already left or was
   * removed from turns it away.
   */
  leaveChat(
    authenticatedBot: VirtualBotProfile,
    { chatId }: LeaveChatRequest,
  ): BotApiLeaveChatResult {
    if (isUserId(chatId)) {
      const isChatKnown = this.#botMessages.isPrivateConversationStarted({
        accountId: chatId,
        botId: authenticatedBot.id,
      });
      return { left: false, reason: isChatKnown ? 'private_chat_not_leavable' : 'chat_not_found' };
    }
    const result = this.#chatMemberships.leaveChat({ memberId: authenticatedBot.id, chatId });
    if (result.left) {
      return result;
    }
    switch (result.reason) {
      case 'chat_not_found':
        return { left: false, reason: 'chat_not_found' };
      case 'not_a_member':
        return { left: false, reason: getSupergroupNonMemberFailureReason(result.formerStatus) };
      case 'member_not_found':
        throw new Error(`Authenticated bot ${authenticatedBot.id} does not exist`);
      case 'owner_cannot_leave':
        throw new Error(`Bot ${authenticatedBot.id} owns chat ${chatId}`);
      default: {
        const unhandledReason: never = result.reason;
        throw new Error(`Unhandled leaveChat failure: ${unhandledReason}`);
      }
    }
  }

  /** Replaces the text, entities, and inline keyboard of a text message the bot sent. */
  editMessageText(
    authenticatedBot: VirtualBotProfile,
    { chatId, messageId, text, entities, inlineKeyboard }: EditMessageTextRequest,
  ): EditMessageTextResult {
    const result = isUserId(chatId)
      ? this.#presentPrivateEdit(this.#botMessages.editBotMessageText({
        fromBotId: authenticatedBot.id,
        chat: { type: 'private', accountId: chatId },
        botMessageId: messageId,
        text,
        entities,
        inlineKeyboard,
      }))
      : this.#presentSupergroupEdit(
        authenticatedBot,
        this.#supergroupBotMessages.editBotMessageText({
          fromBotId: authenticatedBot.id,
          chatId,
          messageId,
          text,
          entities,
          inlineKeyboard,
        }),
      );
    if (result.edited) {
      return result;
    }

    switch (result.reason) {
      case 'text_invalid':
        return result;
      case 'message_text_empty':
      case 'message_has_no_text':
      case 'message_text_too_long':
        return { edited: false, reason: result.reason };
      default:
        return {
          edited: false,
          reason: toEditMessageFailureReason(authenticatedBot, result.reason),
        };
    }
  }

  /**
   * Replaces the caption, its entities, and the inline keyboard of a photo or document the bot
   * sent; empty caption text removes the caption.
   */
  editMessageCaption(
    authenticatedBot: VirtualBotProfile,
    { chatId, messageId, caption, showsCaptionAboveMedia, inlineKeyboard }:
      EditMessageCaptionRequest,
  ): EditMessageCaptionResult {
    const captionEdit: CaptionEdit = {
      caption: caption.text,
      captionEntities: caption.entities,
      showsCaptionAboveMedia,
      inlineKeyboard,
    };
    const result = isUserId(chatId)
      ? this.#presentPrivateEdit(this.#botMessages.editBotMessageCaption({
        ...captionEdit,
        fromBotId: authenticatedBot.id,
        chat: { type: 'private', accountId: chatId },
        botMessageId: messageId,
      }))
      : this.#presentSupergroupEdit(
        authenticatedBot,
        this.#supergroupBotMessages.editBotMessageCaption({
          ...captionEdit,
          fromBotId: authenticatedBot.id,
          chatId,
          messageId,
        }),
      );
    if (result.edited) {
      return result;
    }

    switch (result.reason) {
      case 'text_invalid':
        return result;
      case 'message_has_no_caption':
      case 'caption_too_long':
        return { edited: false, reason: result.reason };
      default:
        return {
          edited: false,
          reason: toEditMessageFailureReason(authenticatedBot, result.reason),
        };
    }
  }

  /** Replaces the inline keyboard of a message the bot sent. */
  editMessageReplyMarkup(
    authenticatedBot: VirtualBotProfile,
    { chatId, messageId, inlineKeyboard }: EditMessageReplyMarkupRequest,
  ): EditMessageResult<EditMessageReplyMarkupFailureReason> {
    const result = isUserId(chatId)
      ? this.#presentPrivateEdit(this.#botMessages.editBotMessageInlineKeyboard({
        fromBotId: authenticatedBot.id,
        chat: { type: 'private', accountId: chatId },
        botMessageId: messageId,
        inlineKeyboard,
      }))
      : this.#presentSupergroupEdit(
        authenticatedBot,
        this.#supergroupBotMessages.editBotMessageInlineKeyboard({
          fromBotId: authenticatedBot.id,
          chatId,
          messageId,
          inlineKeyboard,
        }),
      );
    if (result.edited) {
      return result;
    }
    return { edited: false, reason: toEditMessageFailureReason(authenticatedBot, result.reason) };
  }

  /**
   * Deletes a message of a chat: in a private chat, a message of either participant; in a
   * supergroup, one of the bot's own messages. Unlike `deleteMessages`, it fails when the ID
   * identifies no message of the chat, as on Telegram.
   */
  deleteMessage(
    authenticatedBot: VirtualBotProfile,
    { chatId, messageId }: DeleteMessageRequest,
  ): DeleteMessageResult {
    const result = this.#deleteChatMessages(authenticatedBot, chatId, [messageId]);
    if (!result.deleted) {
      return result;
    }
    return result.deletedMessageCount === 0
      ? { deleted: false, reason: 'message_not_found' }
      : { deleted: true };
  }

  /**
   * Deletes messages of a chat, as `deleteMessage` does. As on Telegram, IDs that identify no
   * message of the chat are skipped.
   */
  deleteMessages(
    authenticatedBot: VirtualBotProfile,
    { chatId, messageIds }: DeleteMessagesRequest,
  ): DeleteMessagesResult {
    const result = this.#deleteChatMessages(authenticatedBot, chatId, messageIds);
    return result.deleted ? { deleted: true } : result;
  }

  /** Answers a callback query that an account created by pressing one of the bot's buttons. */
  answerCallbackQuery(
    authenticatedBot: VirtualBotProfile,
    { callbackQueryId, text, showAlert, cacheTimeSeconds }: AnswerCallbackQueryRequest,
  ): AnswerCallbackQueryResult {
    const result = this.#callbackQueries.answerCallbackQuery({
      fromBotId: authenticatedBot.id,
      callbackQueryId,
      text,
      showAlert,
      cacheTimeSeconds,
    });
    return result.answered ? { answered: true } : { answered: false, reason: 'query_id_invalid' };
  }

  /** Replaces the bot's command list for a scope and language; an empty list deletes it. */
  setMyCommands(
    authenticatedBot: VirtualBotProfile,
    { commands, scope, languageCode }: SetMyCommandsRequest,
  ): SetMyCommandsResult {
    const result = this.#botCommands.setBotCommands({
      botId: authenticatedBot.id,
      scope,
      languageCode,
      commands,
    });
    if (result.set) {
      return result;
    }
    if (result.reason === 'bot_not_found') {
      throw new Error(`Authenticated bot ${authenticatedBot.id} does not exist`);
    }
    return { set: false, reason: result.reason };
  }

  /** Returns the bot's command list for exactly this scope and language. */
  getMyCommands(
    authenticatedBot: VirtualBotProfile,
    { scope, languageCode }: MyCommandsTarget,
  ): GetMyCommandsResult {
    const result = this.#botCommands.getBotCommands({
      botId: authenticatedBot.id,
      scope,
      languageCode,
    });
    if (!result.found) {
      if (result.reason === 'bot_not_found') {
        throw new Error(`Authenticated bot ${authenticatedBot.id} does not exist`);
      }
      return { found: false, reason: result.reason };
    }
    return { found: true, commands: result.commands.map(projectBotCommand) };
  }

  /** Deletes the bot's command list for a scope and language. */
  deleteMyCommands(
    authenticatedBot: VirtualBotProfile,
    { scope, languageCode }: MyCommandsTarget,
  ): DeleteMyCommandsResult {
    const result = this.#botCommands.deleteBotCommands({
      botId: authenticatedBot.id,
      scope,
      languageCode,
    });
    if (result.deleted) {
      return result;
    }
    if (result.reason === 'bot_not_found') {
      throw new Error(`Authenticated bot ${authenticatedBot.id} does not exist`);
    }
    return { deleted: false, reason: result.reason };
  }

  #deleteChatMessages(
    authenticatedBot: VirtualBotProfile,
    chatId: number,
    messageIds: readonly number[],
  ):
    | { readonly deleted: true; readonly deletedMessageCount: number }
    | {
      readonly deleted: false;
      readonly reason:
        | 'chat_not_found'
        | FormerSupergroupMemberFailureReason
        | 'message_not_deletable';
    } {
    const result = isUserId(chatId)
      ? this.#botMessages.deleteMessagesByBot({
        fromBotId: authenticatedBot.id,
        chat: { type: 'private', accountId: chatId },
        botMessageIds: messageIds,
      })
      : this.#supergroupBotMessages.deleteMessagesByBot({
        fromBotId: authenticatedBot.id,
        chatId,
        messageIds,
      });
    if (result.deleted) {
      return result;
    }

    switch (result.reason) {
      case 'chat_not_found':
      case 'bot_not_a_member':
      case 'bot_kicked':
      case 'message_not_deletable':
        return { deleted: false, reason: result.reason };
      // As for sending, a chat the bot cannot address is not found.
      case 'account_not_found':
      case 'conversation_not_started':
        return { deleted: false, reason: 'chat_not_found' };
      case 'bot_not_found':
        throw new Error(`Authenticated bot ${authenticatedBot.id} does not exist`);
      default: {
        const unhandledFailure: never = result;
        throw new Error(
          `Unhandled bot message deletion failure: ${JSON.stringify(unhandledFailure)}`,
        );
      }
    }
  }

  #presentPrivateEdit<Failure extends { readonly edited: false }>(
    result: { readonly edited: true; readonly message: PrivateMessage } | Failure,
  ): { readonly edited: true; readonly message: BotApiMessage } | Failure {
    return result.edited
      ? {
        edited: true,
        message: this.#botMessageViews.viewPrivateMessageForBot(result.message),
      }
      : result;
  }

  #presentSupergroupEdit<Failure extends { readonly edited: false }>(
    authenticatedBot: VirtualBotProfile,
    result: { readonly edited: true; readonly message: SupergroupMessage } | Failure,
  ): { readonly edited: true; readonly message: BotApiMessage } | Failure {
    return result.edited
      ? {
        edited: true,
        message: this.#botMessageViews.viewSupergroupMessage(result.message, authenticatedBot.id),
      }
      : result;
  }
}

/** A file a send method resolved to send, or why it cannot be sent. */
type FileResolution<File> =
  | { readonly resolved: true; readonly file: File }
  | {
    readonly resolved: false;
    readonly failure:
      | { readonly reason: 'file_empty' | 'image_invalid' | 'photo_dimensions_invalid' }
      | { readonly reason: 'file_id_invalid' }
      | FileTypeMismatchFailure;
  };

/**
 * Why a `file_id` cannot send a file of the expected type. As on Telegram, an unknown `file_id`,
 * including one another bot knows a file by, identifies no file.
 */
function fileIdFailure(
  file: StoredFile | undefined,
  expectedFileType: StoredFile['type'],
): { readonly reason: 'file_id_invalid' } | FileTypeMismatchFailure {
  return file === undefined
    ? { reason: 'file_id_invalid' }
    : { reason: 'file_type_mismatch', expectedFileType, actualFileType: file.type };
}

/**
 * Whether a Bot API `chat_id` identifies a user, whose private chat it addresses. Telegram's user
 * IDs are positive, and the IDs of groups and channels negative.
 */
function isUserId(chatId: number): boolean {
  return chatId > 0;
}

/** Shows a command as the Bot API does, with `is_ephemeral` only when set. */
function projectBotCommand({ command, description, isEphemeral }: BotCommand): BotApiBotCommand {
  return { command, description, ...(isEphemeral ? { is_ephemeral: true as const } : {}) };
}

/** Translates the edit failures shared by both edit methods into Bot API failures. */
function toEditMessageFailureReason(
  authenticatedBot: VirtualBotProfile,
  reason: BotMessageEditFailureReason | SupergroupBotMessageEditFailureReason,
): EditMessageReplyMarkupFailureReason {
  switch (reason) {
    case 'chat_not_found':
    case 'bot_not_a_member':
    case 'bot_kicked':
    case 'message_not_found':
    case 'message_not_editable':
    case 'callback_data_invalid':
    case 'message_not_modified':
      return reason;
    // As for sending, a chat the bot cannot address is not found.
    case 'account_not_found':
    case 'conversation_not_started':
      return 'chat_not_found';
    case 'bot_not_found':
      throw new Error(`Authenticated bot ${authenticatedBot.id} does not exist`);
    default: {
      const unhandledReason: never = reason;
      throw new Error(`Unhandled bot message edit failure: ${unhandledReason}`);
    }
  }
}
