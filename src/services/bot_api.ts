import { cleanUploadedFileName } from '../media/document_file.ts';
import { isParseMode, parseMarkup } from '../text_entities/parse_mode.ts';
import type {
  BotApiBotCommand,
  BotApiChatMember,
  BotApiDownloadableFile,
  BotApiMessage,
  BotApiPrivateMessage,
  BotApiSupergroupMessage,
  BotApiWebhookInfo,
} from '../types/bot_api.ts';
import type { BotCommand, BotCommandLanguageCode, BotCommandScope } from '../types/bot_command.ts';
import type { CallbackQueryId } from '../types/callback_query.ts';
import {
  type ChatMemberStatus,
  type FormerSupergroupMemberFailureReason,
  getSupergroupNonMemberFailureReason,
} from '../types/chat_membership.ts';
import type { InlineQueryId, InlineQueryResultsButton } from '../types/inline_query.ts';
import type { InlineKeyboard } from '../types/inline_keyboard.ts';
import { createMessageForward, isForwardable } from '../types/message_forward.ts';
import { createExternalReply, type ExternalReplyWithQuote } from '../types/message_reply.ts';
import type { BotMessageReplyMarkup } from '../types/reply_interface.ts';
import type { DocumentUpload, PhotoUpload, StoredFile } from '../types/stored_file.ts';
import { isUserId } from '../types/telegram_identity.ts';
import type { VirtualBot, VirtualBotProfile } from '../types/virtual_bot.ts';
import type { ChatAction } from '../types/virtual_chat.ts';
import {
  type CanonicalMessageId,
  type ChatMessage,
  type ExternalReply,
  type InlineMessageId,
  isContentMessage,
  type MessageContent,
  type MessageForwardInfo,
  type PrivateMessage,
  type SupergroupMessage,
  type TextEntity,
  type TextQuote,
} from '../types/virtual_message.ts';
import type { GetUpdatesRequest, GetUpdatesResult } from './bot_update_polling.ts';
import type {
  DeleteWebhookOutcome,
  DeleteWebhookRequest,
  SetWebhookRequest,
  SetWebhookResult,
} from './bot_webhook.ts';
import type {
  BanChatMemberResult,
  GetChatAdministratorsResult,
  GetChatMemberCountResult,
  GetChatMemberStatusResult,
  LeaveChatResult,
  UnbanChatMemberResult,
} from './shared_chat_administration.ts';
import type {
  AnswerInlineQueryFailureReason,
  AnswerInlineQueryInput,
  AnswerInlineQueryResult,
  SpecifiedInlineQueryResult,
} from './inline_query.ts';
import type {
  ContentNormalizationFailure,
  OutgoingDocument,
  OutgoingMessageContent,
  OutgoingPhoto,
  TextInvalidFailure,
} from './message_content.ts';

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
  | 'text_encoding_invalid';

export type ReadFormattedTextResult =
  | { readonly read: true; readonly formattedText: SpecifiedFormattedText }
  | { readonly read: false; readonly reason: ReadFormattedTextFailureReason }
  | {
    readonly read: false;
    readonly reason: 'markup_invalid';
    /** TDLib's description of the markup error. */
    readonly markupError: string;
  };

/** The message that a sent message replies to, as `reply_parameters` specify it. */
export interface ReplyTarget {
  /** The message's ID in its chat, as the bot knows it. */
  readonly messageId: number;
  /**
   * The Bot API `chat_id` of the replied message's chat when it is another chat than the one the
   * message is sent to; omitted for that chat.
   */
  readonly chatId?: number;
  /** Sends the message as no reply, rather than failing, when the target is not found. */
  readonly allowSendingWithoutReply: boolean;
}

/**
 * Where and how a send method sends its message, apart from what it replies to. The reply markup
 * is an inline keyboard or a change of the reply interface.
 */
type SendDestinationOptions = BotMessageReplyMarkup & {
  /**
   * The Bot API `chat_id`: for a private chat, the other user's ID, which is positive; for a
   * supergroup, its negative chat ID.
   */
  readonly chatId: number;
  /** The Bot API `protect_content`; omitted for an unprotected message. */
  readonly isContentProtected?: boolean;
  /**
   * The Bot API `message_effect_id`, as the decimal text of a nonzero 64-bit identifier; omitted
   * for none. The emulator has no catalogue of Telegram's effects, so any identifier is accepted.
   */
  readonly messageEffectId?: string;
};

/** Where and how every send method sends its message. */
export type SendRequestOptions = SendDestinationOptions & {
  /** Omitted for a message that replies to none. */
  readonly replyTo?: ReplyTarget;
};

/**
 * What a message being sent replies to: a message of its own chat, which the chat's messaging
 * service looks up, or a resolved message of another chat; neither for a message that replies to
 * none.
 */
type OutgoingReply =
  | { readonly replyTo?: ReplyTarget; readonly externalReply?: never; readonly quote?: never }
  | (ExternalReplyWithQuote & { readonly replyTo?: never });

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
  | 'message_effect_not_allowed_in_chat'
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
export interface MessageTarget {
  /** The Bot API `chat_id`, as `SendRequestOptions` describes it. */
  readonly chatId: number;
  /** The message's ID in the bot's chat. */
  readonly messageId: number;
}

export interface ForwardMessageRequest {
  /** The Bot API `chat_id` of the chat to forward the message to. */
  readonly chatId: number;
  /** The forwarded message: the Bot API `from_chat_id` and `message_id`. */
  readonly forwardedMessage: MessageTarget;
  /** The Bot API `protect_content`; omitted for an unprotected message. */
  readonly isContentProtected?: boolean;
  /** As `SendRequestOptions` describes it. */
  readonly messageEffectId?: string;
}

/**
 * Why the message that a forward or copy repeats cannot be read: its chat is unknown to the bot,
 * or the bot is no member of it, or the chat has no such message.
 */
type RepeatedMessageFailureReason =
  | 'chat_not_found'
  | FormerSupergroupMemberFailureReason
  | 'repeated_message_not_found';

/** A failure of a forward or copy that a send cannot have. */
type RepetitionFailure<NotRepeatableReason extends string> = {
  readonly sent: false;
  readonly reason: 'repeated_message_not_found' | NotRepeatableReason;
};

export type ForwardMessageResult = SendResult | RepetitionFailure<'message_not_forwardable'>;

export type CopyMessageRequest = SendRequestOptions & {
  /** The copied message: the Bot API `from_chat_id` and `message_id`. */
  readonly copiedMessage: MessageTarget;
  /** A caption that replaces the caption of copied media; omitted to keep it. */
  readonly caption?: SpecifiedFormattedText;
  /** The Bot API `show_caption_above_media`, which applies only with a new caption of a photo. */
  readonly showsCaptionAboveMedia: boolean;
};

/** The Bot API answers a copy with the new message's ID rather than the message. */
export type CopyMessageResult =
  | { readonly sent: true; readonly messageId: number }
  | Extract<SendResult, { readonly sent: false }>
  | RepetitionFailure<'message_not_copyable'>;

/** Messages of one of the bot's chats that `forwardMessages` or `copyMessages` repeats at once. */
export interface RepeatMessagesRequest {
  /** The Bot API `chat_id` of the chat the messages go to. */
  readonly chatId: number;
  /** The Bot API `from_chat_id` of the chat of the repeated messages. */
  readonly fromChatId: number;
  /** The repeated messages' IDs in the bot's chat, in strictly increasing order. */
  readonly messageIds: readonly number[];
  /** The Bot API `protect_content`; omitted for unprotected messages. */
  readonly isContentProtected?: boolean;
  /**
   * As `SendRequestOptions` describes it. As TDLib's `forward_messages` allows, only a request
   * that finds a single message may add an effect to it.
   */
  readonly messageEffectId?: string;
}

export type CopyMessagesRequest = RepeatMessagesRequest & {
  /** The Bot API `remove_caption`, which sends media without their captions. */
  readonly removesCaptions: boolean;
};

/**
 * The Bot API answers `forwardMessages` and `copyMessages` with the new messages' IDs, in the
 * order of the repeated messages. As TDLib does, a request fails only when no message is left to
 * repeat: identifiers of no message are skipped, and so are messages that cannot be repeated.
 */
export type RepeatMessagesResult =
  | { readonly sent: true; readonly messageIds: readonly number[] }
  | Extract<SendResult, { readonly sent: false }>
  | {
    readonly sent: false;
    readonly reason:
      | 'repeated_messages_not_found'
      | 'message_effect_not_allowed_for_several_messages'
      | 'repeated_message_ids_not_increasing'
      | 'messages_not_repeatable';
  };

/** What a message sent by `forwardMessages` or `copyMessages` repeats of the original. */
interface MessageRepetition {
  readonly content: MessageContent;
  /** Omitted for a copy, which does not show where it came from. */
  readonly forwardInfo?: MessageForwardInfo;
  /** Omitted when the repetition shows no inline keyboard. */
  readonly inlineKeyboard?: InlineKeyboard;
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

/** A message sent through the bot's inline mode, as the Bot API addresses it. */
interface InlineMessageTarget {
  /** The Bot API `inline_message_id`. */
  readonly inlineMessageId: InlineMessageId;
}

export interface EditInlineMessageTextRequest extends InlineMessageTarget, SpecifiedFormattedText {
  /** Omitting the keyboard removes the message's keyboard, as on Telegram. */
  readonly inlineKeyboard?: InlineKeyboard;
}

export interface EditInlineMessageCaptionRequest extends InlineMessageTarget {
  /** Empty text removes the caption. */
  readonly caption: SpecifiedFormattedText;
  /** The Bot API `show_caption_above_media`, which only a photo honors. */
  readonly showsCaptionAboveMedia: boolean;
  /** Omitting the keyboard removes the message's keyboard, as on Telegram. */
  readonly inlineKeyboard?: InlineKeyboard;
}

export interface EditInlineMessageReplyMarkupRequest extends InlineMessageTarget {
  /** Omitting the keyboard removes the message's keyboard, as on Telegram. */
  readonly inlineKeyboard?: InlineKeyboard;
}

/**
 * Why an edit of an inline message can fail, apart from failures about the new content. An
 * identifier of no message, of a deleted one, or of another bot's inline message finds none.
 */
export type EditInlineMessageReplyMarkupFailureReason =
  | 'inline_message_not_found'
  | 'callback_data_invalid'
  | 'message_not_modified';

export type EditInlineMessageTextFailureReason =
  | EditInlineMessageReplyMarkupFailureReason
  | 'message_text_empty'
  | 'message_has_no_text'
  | 'message_text_too_long';

export type EditInlineMessageCaptionFailureReason =
  | EditInlineMessageReplyMarkupFailureReason
  | 'message_has_no_caption'
  | 'caption_too_long';

/** The Bot API answers an edit of an inline message with `true` rather than the message. */
export type EditInlineMessageResult<FailureReason extends string> =
  | { readonly edited: true }
  | { readonly edited: false; readonly reason: FailureReason }
  | ({ readonly edited: false } & TextInvalidFailure);

interface InlineQueryResultRequestBase {
  /** The bot's identifier of the result. */
  readonly id: string;
  /** Empty for none. */
  readonly description: string;
  /** The keyboard of the sent message; omitted for none. */
  readonly inlineKeyboard?: InlineKeyboard;
}

/**
 * A result of `answerInlineQuery`, as the Bot API specifies it. `messageText` is the text of its
 * `input_message_content`, which a photo or document result sends instead of its own file.
 */
export type InlineQueryResultRequest =
  | (InlineQueryResultRequestBase & {
    readonly kind: 'article';
    readonly title: string;
    /** Empty for none. */
    readonly url: string;
    readonly messageText: SpecifiedFormattedText;
  })
  | (InlineQueryResultRequestBase & {
    readonly kind: 'photo';
    /** The `file_id` the bot knows the photo by. */
    readonly photoFileId: string;
    /** Empty for none. */
    readonly title: string;
    /** Empty text for no caption. */
    readonly caption: SpecifiedFormattedText;
    readonly showsCaptionAboveMedia: boolean;
    readonly messageText?: SpecifiedFormattedText;
  })
  | (InlineQueryResultRequestBase & {
    readonly kind: 'document';
    /** The `file_id` the bot knows the document by. */
    readonly documentFileId: string;
    readonly title: string;
    /** Empty text for no caption. */
    readonly caption: SpecifiedFormattedText;
    readonly messageText?: SpecifiedFormattedText;
  });

export interface AnswerInlineQueryRequest {
  readonly inlineQueryId: InlineQueryId;
  readonly results: readonly InlineQueryResultRequest[];
  readonly cacheTimeSeconds: number;
  readonly isPersonal: boolean;
  /** Empty when there are no more results. */
  readonly nextOffset: string;
  /** Omitted when the client shows no button above the results. */
  readonly button?: InlineQueryResultsButton;
}

export type BotApiAnswerInlineQueryResult =
  | { readonly answered: true }
  | (
    & { readonly answered: false }
    & (
      | { readonly reason: AnswerInlineQueryFailureReason | 'file_id_invalid' }
      | ContentNormalizationFailure
      | FileTypeMismatchFailure
    )
  );

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

/** Why a bot cannot address a chat whose members it asks about or moderates. */
export type ChatMemberAccessFailureReason = 'chat_not_found' | FormerSupergroupMemberFailureReason;

export interface GetChatMemberRequest {
  /** The Bot API `chat_id`, as `SendRequestOptions` describes it. */
  readonly chatId: number;
  readonly userId: number;
}

export type GetChatMemberResult =
  | { readonly found: true; readonly member: BotApiChatMember }
  | {
    readonly found: false;
    readonly reason: ChatMemberAccessFailureReason | 'member_not_found';
  };

export interface GetChatAdministratorsRequest {
  /** The Bot API `chat_id`, as `SendRequestOptions` describes it. */
  readonly chatId: number;
  /** The Bot API `return_bots`: whether to include administrators that are other bots. */
  readonly includesOtherBots: boolean;
}

export type BotApiGetChatAdministratorsResult =
  | { readonly found: true; readonly administrators: readonly BotApiChatMember[] }
  | {
    readonly found: false;
    readonly reason: ChatMemberAccessFailureReason | 'private_chat_has_no_administrators';
  };

export interface GetChatMemberCountRequest {
  /** The Bot API `chat_id`, as `SendRequestOptions` describes it. */
  readonly chatId: number;
}

export type BotApiGetChatMemberCountResult =
  | { readonly found: true; readonly memberCount: number }
  | { readonly found: false; readonly reason: ChatMemberAccessFailureReason };

export interface BanChatMemberRequest {
  /** The Bot API `chat_id`, as `SendRequestOptions` describes it. */
  readonly chatId: number;
  readonly userId: number;
  /** The Bot API `until_date`; omitted for a ban that lasts until it is lifted. */
  readonly untilUnixSeconds?: number;
}

/** Why a bot cannot ban a user or lift its ban, as the Bot API reports it. */
export type ChatMemberModerationFailureReason =
  | ChatMemberAccessFailureReason
  | 'member_not_found'
  | 'member_is_owner'
  | 'not_enough_rights'
  | 'member_is_administrator';

export type BotApiBanChatMemberResult =
  | { readonly banned: true }
  | {
    readonly banned: false;
    readonly reason:
      | ChatMemberModerationFailureReason
      | 'cannot_restrict_self'
      | 'private_chat_members_not_bannable';
  };

export interface UnbanChatMemberRequest {
  /** The Bot API `chat_id`, as `SendRequestOptions` describes it. */
  readonly chatId: number;
  readonly userId: number;
  /** The Bot API `only_if_banned`. */
  readonly onlyIfBanned: boolean;
}

export type BotApiUnbanChatMemberResult =
  | { readonly unbanned: true }
  | {
    readonly unbanned: false;
    readonly reason: ChatMemberModerationFailureReason | 'method_unavailable_in_private_chats';
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
  terminateLongPollForWebhook(botId: number): void;
}

interface BotWebhooks {
  hasWebhook(botId: number): boolean;
  setWebhook(botId: number, request: SetWebhookRequest): SetWebhookResult;
  deleteWebhook(botId: number, request: DeleteWebhookRequest): DeleteWebhookOutcome;
  getWebhookInfo(botId: number): BotApiWebhookInfo;
}

/** The result of `getUpdates`, which fails while the bot has a webhook. */
export type BotApiGetUpdatesResult =
  | GetUpdatesResult
  | { readonly retrieved: false; readonly reason: 'webhook_active' };

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

/**
 * The message of a private chat that a bot edits: by its ID in the bot's chat, or by the inline
 * message identifier of a message sent through the bot.
 */
type PrivateMessageEditTarget =
  & { readonly fromBotId: number }
  & (
    | { readonly chat: BotPrivateChat; readonly botMessageId: number }
    | { readonly inlineMessageId: InlineMessageId }
  );

/** The supergroup message that a bot edits, addressed as `PrivateMessageEditTarget` describes. */
type SupergroupMessageEditTarget =
  & { readonly fromBotId: number }
  & (
    | { readonly chatId: number; readonly messageId: number }
    | { readonly inlineMessageId: InlineMessageId }
  );

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
  getMessageForBot(input: {
    readonly botId: number;
    readonly accountId: number;
    readonly botMessageId: number;
  }):
    | { readonly found: true; readonly message: PrivateMessage }
    | {
      readonly found: false;
      readonly reason:
        | 'bot_not_found'
        | 'account_not_found'
        | 'conversation_not_started'
        | 'message_not_found';
    };
  sendBotMessage(
    input: BotMessageReplyMarkup & {
      readonly fromBotId: number;
      readonly to: BotPrivateChat;
      readonly content: OutgoingMessageContent;
      readonly replyTo?: {
        readonly botMessageId: number;
        readonly allowSendingWithoutReply: boolean;
      };
      readonly externalReply?: ExternalReply;
      readonly quote?: TextQuote;
      readonly isContentProtected?: boolean;
      readonly forwardInfo?: MessageForwardInfo;
      readonly messageEffectId?: string;
    },
  ): BotMessageSendingResult;
  editBotMessageText(
    input: PrivateMessageEditTarget & {
      readonly text: string;
      readonly entities?: readonly TextEntity[];
      readonly inlineKeyboard?: InlineKeyboard;
    },
  ):
    | BotMessageEditingResult<
      | BotMessageEditFailureReason
      | 'message_text_empty'
      | 'message_has_no_text'
      | 'message_text_too_long'
    >
    | ({ readonly edited: false } & TextInvalidFailure);
  editBotMessageCaption(input: CaptionEdit & PrivateMessageEditTarget):
    | BotMessageEditingResult<
      BotMessageEditFailureReason | 'message_has_no_caption' | 'caption_too_long'
    >
    | ({ readonly edited: false } & TextInvalidFailure);
  editBotMessageInlineKeyboard(
    input: PrivateMessageEditTarget & { readonly inlineKeyboard?: InlineKeyboard },
  ): BotMessageEditingResult<BotMessageEditFailureReason>;
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
  getMessageForBot(input: {
    readonly botId: number;
    readonly chatId: number;
    readonly messageId: number;
  }):
    | { readonly found: true; readonly message: SupergroupMessage }
    | {
      readonly found: false;
      readonly reason:
        | 'bot_not_found'
        | 'chat_not_found'
        | FormerSupergroupMemberFailureReason
        | 'message_not_found';
    };
  sendBotMessage(input: {
    readonly fromBotId: number;
    readonly chatId: number;
    readonly content: OutgoingMessageContent;
    readonly inlineKeyboard?: InlineKeyboard;
    readonly replyTo?: { readonly messageId: number; readonly allowSendingWithoutReply: boolean };
    readonly externalReply?: ExternalReply;
    readonly quote?: TextQuote;
    readonly isContentProtected?: boolean;
    readonly forwardInfo?: MessageForwardInfo;
    readonly messageEffectId?: string;
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
        | 'message_effect_not_allowed_in_chat'
        | 'callback_data_invalid';
    }
    | ({ readonly sent: false } & ContentNormalizationFailure);
  editBotMessageText(
    input: SupergroupMessageEditTarget & {
      readonly text: string;
      readonly entities?: readonly TextEntity[];
      readonly inlineKeyboard?: InlineKeyboard;
    },
  ):
    | SupergroupBotMessageEditingResult<
      | SupergroupBotMessageEditFailureReason
      | 'message_text_empty'
      | 'message_has_no_text'
      | 'message_text_too_long'
    >
    | ({ readonly edited: false } & TextInvalidFailure);
  editBotMessageCaption(input: CaptionEdit & SupergroupMessageEditTarget):
    | SupergroupBotMessageEditingResult<
      SupergroupBotMessageEditFailureReason | 'message_has_no_caption' | 'caption_too_long'
    >
    | ({ readonly edited: false } & TextInvalidFailure);
  editBotMessageInlineKeyboard(
    input: SupergroupMessageEditTarget & { readonly inlineKeyboard?: InlineKeyboard },
  ): SupergroupBotMessageEditingResult<SupergroupBotMessageEditFailureReason>;
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
  getChatMemberStatus(input: {
    readonly observerBotId: number;
    readonly chatId: number;
    readonly userId: number;
  }): GetChatMemberStatusResult;
  getChatAdministrators(
    input: { readonly observerBotId: number; readonly chatId: number },
  ): GetChatAdministratorsResult;
  getChatMemberCount(
    input: { readonly observerBotId: number; readonly chatId: number },
  ): GetChatMemberCountResult;
  banChatMember(input: {
    readonly actorBotId: number;
    readonly chatId: number;
    readonly memberId: number;
    readonly requestedBanEndUnixSeconds?: number;
  }): BanChatMemberResult;
  unbanChatMember(input: {
    readonly actorBotId: number;
    readonly chatId: number;
    readonly memberId: number;
    readonly onlyIfBanned: boolean;
  }): UnbanChatMemberResult;
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
  | FormerSupergroupMemberFailureReason
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

interface InlineQueryAnswering {
  answerInlineQuery(input: AnswerInlineQueryInput): AnswerInlineQueryResult;
}

interface InlineMessageLookup {
  getMessageByInlineMessageId(inlineMessageId: InlineMessageId): ChatMessage | undefined;
}

interface BotMessageViews {
  viewPrivateMessageForBot(message: PrivateMessage): BotApiPrivateMessage;
  viewSupergroupMessage(message: SupergroupMessage, observerId: number): BotApiSupergroupMessage;
  viewChatMember(userId: number, status: ChatMemberStatus): BotApiChatMember | undefined;
}

interface BotApiServiceDependencies {
  readonly bots: BotCredentialLookup;
  readonly updatePolling: BotUpdatePolling;
  readonly webhooks: BotWebhooks;
  readonly botMessages: BotMessaging;
  readonly supergroupBotMessages: SupergroupBotMessaging;
  readonly chatMemberships: ChatMemberships;
  readonly botMessageViews: BotMessageViews;
  readonly mediaFiles: MediaFiles;
  readonly callbackQueries: CallbackQueryAnswering;
  readonly inlineQueries: InlineQueryAnswering;
  readonly inlineMessages: InlineMessageLookup;
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
  readonly #webhooks: BotWebhooks;
  readonly #botMessages: BotMessaging;
  readonly #supergroupBotMessages: SupergroupBotMessaging;
  readonly #chatMemberships: ChatMemberships;
  readonly #botMessageViews: BotMessageViews;
  readonly #mediaFiles: MediaFiles;
  readonly #callbackQueries: CallbackQueryAnswering;
  readonly #inlineQueries: InlineQueryAnswering;
  readonly #inlineMessages: InlineMessageLookup;
  readonly #botCommands: BotCommandLists;

  constructor(
    {
      bots,
      updatePolling,
      webhooks,
      botMessages,
      supergroupBotMessages,
      chatMemberships,
      botMessageViews,
      mediaFiles,
      callbackQueries,
      inlineQueries,
      inlineMessages,
      botCommands,
    }: BotApiServiceDependencies,
  ) {
    this.#bots = bots;
    this.#updatePolling = updatePolling;
    this.#webhooks = webhooks;
    this.#botMessages = botMessages;
    this.#supergroupBotMessages = supergroupBotMessages;
    this.#chatMemberships = chatMemberships;
    this.#botMessageViews = botMessageViews;
    this.#mediaFiles = mediaFiles;
    this.#callbackQueries = callbackQueries;
    this.#inlineQueries = inlineQueries;
    this.#inlineMessages = inlineMessages;
    this.#botCommands = botCommands;
  }

  /** Returns the profile of the bot that owns `token`, or `undefined` if no bot does. */
  authenticate(token: string): VirtualBotProfile | undefined {
    return this.#bots.getByToken(token)?.profile;
  }

  /**
   * Polls the authenticated bot's pending updates. As on Telegram, a bot with a webhook cannot
   * poll, and its subscription is left unchanged.
   */
  async getUpdates(
    authenticatedBot: VirtualBotProfile,
    request: GetUpdatesRequest,
  ): Promise<BotApiGetUpdatesResult> {
    if (this.#webhooks.hasWebhook(authenticatedBot.id)) {
      return { retrieved: false, reason: 'webhook_active' };
    }
    return await this.#updatePolling.getUpdates(authenticatedBot.id, request);
  }

  /**
   * Sets the authenticated bot's webhook, or deletes it for an empty URL. As on Telegram, setting
   * a new webhook terminates the bot's held long poll.
   */
  setWebhook(authenticatedBot: VirtualBotProfile, request: SetWebhookRequest): SetWebhookResult {
    const result = this.#webhooks.setWebhook(authenticatedBot.id, request);
    if (result.accepted && result.outcome === 'webhook_set') {
      this.#updatePolling.terminateLongPollForWebhook(authenticatedBot.id);
    }
    return result;
  }

  /** Deletes the authenticated bot's webhook. A held long poll is left running, as on Telegram. */
  deleteWebhook(
    authenticatedBot: VirtualBotProfile,
    request: DeleteWebhookRequest,
  ): DeleteWebhookOutcome {
    return this.#webhooks.deleteWebhook(authenticatedBot.id, request);
  }

  getWebhookInfo(authenticatedBot: VirtualBotProfile): BotApiWebhookInfo {
    return this.#webhooks.getWebhookInfo(authenticatedBot.id);
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
    return { read: false, reason: 'markup_invalid', markupError: parsing.error };
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

  /**
   * Forwards a message of one of the bot's chats to a private chat or a supergroup, as TDLib does:
   * the forward repeats the message's content and shows who first sent it and when. As on Telegram,
   * a message whose sender protected it cannot be forwarded, nor can a service message.
   *
   * The forwarded message is checked in full before the chat it goes to, while TDLib checks whether
   * it can be forwarded only after that chat; a request that fails both ways fails for the message.
   */
  forwardMessage(
    authenticatedBot: VirtualBotProfile,
    { chatId, forwardedMessage, isContentProtected, messageEffectId }: ForwardMessageRequest,
  ): ForwardMessageResult {
    const lookup = this.#findRepeatedMessage(authenticatedBot, forwardedMessage);
    if (!lookup.found) {
      return { sent: false, reason: lookup.reason };
    }
    if (!isForwardable(lookup.message)) {
      return { sent: false, reason: 'message_not_forwardable' };
    }
    const { content, forwardInfo, inlineKeyboard } = createMessageForward(lookup.message);
    return this.#send(
      authenticatedBot,
      { kind: 'existing', content },
      {
        chatId,
        isContentProtected,
        messageEffectId,
        ...(inlineKeyboard === undefined ? {} : { inlineKeyboard }),
      },
      forwardInfo,
    );
  }

  /**
   * Copies a message of one of the bot's chats to a private chat or a supergroup as the bot's own
   * message, which, unlike a forward, does not show where it came from, and which takes the reply
   * and reply markup of the request instead of the original's. A new caption replaces the caption
   * of copied media, while text stays as it is. As TDLib lets bots do, a bot may copy a message
   * whose sender protected it; a service message cannot be copied.
   *
   * As for `forwardMessage`, the copied message is checked in full before the chat it goes to.
   */
  copyMessage(
    authenticatedBot: VirtualBotProfile,
    { copiedMessage, caption, showsCaptionAboveMedia, ...options }: CopyMessageRequest,
  ): CopyMessageResult {
    const lookup = this.#findRepeatedMessage(authenticatedBot, copiedMessage);
    if (!lookup.found) {
      return { sent: false, reason: lookup.reason };
    }
    if (!isContentMessage(lookup.message)) {
      return { sent: false, reason: 'message_not_copyable' };
    }
    const result = this.#send(authenticatedBot, {
      kind: 'existing',
      content: lookup.message.content,
      ...(caption === undefined ? {} : {
        captionReplacement: {
          caption: caption.text,
          captionEntities: caption.entities,
          showsCaptionAboveMedia,
        },
      }),
    }, options);
    return result.sent ? { sent: true, messageId: result.message.message_id } : result;
  }

  /**
   * Forwards up to 100 messages of one of the bot's chats to a private chat or a supergroup, each
   * as `forwardMessage` does, as TDLib's `forward_messages` does. A message that is not found, or
   * that cannot be forwarded, is skipped; the request fails only when none is left.
   */
  forwardMessages(
    authenticatedBot: VirtualBotProfile,
    request: RepeatMessagesRequest,
  ): RepeatMessagesResult {
    return this.#repeatMessages(authenticatedBot, request, (message) => {
      if (!isForwardable(message)) {
        return undefined;
      }
      const { content, forwardInfo, inlineKeyboard } = createMessageForward(message);
      return { content, forwardInfo, ...(inlineKeyboard === undefined ? {} : { inlineKeyboard }) };
    });
  }

  /**
   * Copies up to 100 messages of one of the bot's chats to a private chat or a supergroup, as
   * `forwardMessages` forwards them. As TDLib's `dup_reply_markup` does for copies, the copies keep
   * no reply markup; `removesCaptions` sends media without their captions.
   */
  copyMessages(
    authenticatedBot: VirtualBotProfile,
    { removesCaptions, ...request }: CopyMessagesRequest,
  ): RepeatMessagesResult {
    return this.#repeatMessages(
      authenticatedBot,
      request,
      (message) =>
        isContentMessage(message)
          ? { content: removesCaptions ? withoutCaption(message.content) : message.content }
          : undefined,
    );
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

  /**
   * Sends the repetitions of messages of one of the bot's chats to a chat, in the order of their
   * IDs, as TDLib's `forward_messages_impl` does: a message that `repeat` cannot repeat is skipped,
   * and a message that replies to an earlier message of the request replies to that message's
   * repetition.
   *
   * As for `forwardMessage`, the messages are checked before the chat they go to; every repetition
   * goes to that chat, so a chat the bot cannot send to fails before any message is sent.
   */
  #repeatMessages(
    authenticatedBot: VirtualBotProfile,
    { chatId, fromChatId, messageIds, isContentProtected, messageEffectId }: RepeatMessagesRequest,
    repeat: (message: ChatMessage) => MessageRepetition | undefined,
  ): RepeatMessagesResult {
    const repeatedMessages: Array<{ readonly messageId: number; readonly message: ChatMessage }> =
      [];
    for (const messageId of messageIds) {
      const lookup = this.#findRepeatedMessage(authenticatedBot, { chatId: fromChatId, messageId });
      if (lookup.found) {
        repeatedMessages.push({ messageId, message: lookup.message });
      } else if (lookup.reason !== 'repeated_message_not_found') {
        return { sent: false, reason: lookup.reason };
      }
    }
    if (repeatedMessages.length === 0) {
      return { sent: false, reason: 'repeated_messages_not_found' };
    }
    if (messageEffectId !== undefined) {
      if (!isUserId(chatId)) {
        return { sent: false, reason: 'message_effect_not_allowed_in_chat' };
      }
      if (repeatedMessages.length > 1) {
        return { sent: false, reason: 'message_effect_not_allowed_for_several_messages' };
      }
    }
    if (
      repeatedMessages.some(({ messageId }, index) =>
        index > 0 && messageId <= repeatedMessages[index - 1].messageId
      )
    ) {
      return { sent: false, reason: 'repeated_message_ids_not_increasing' };
    }
    const repetitions = repeatedMessages.flatMap(({ message }) => {
      const repetition = repeat(message);
      return repetition === undefined ? [] : [{ message, repetition }];
    });
    if (repetitions.length === 0) {
      return { sent: false, reason: 'messages_not_repeatable' };
    }

    const sentMessageIdsByRepeatedMessageId = new Map<CanonicalMessageId, number>();
    for (const { message, repetition } of repetitions) {
      const repliedMessageId = message.replyToMessageId === undefined
        ? undefined
        : sentMessageIdsByRepeatedMessageId.get(message.replyToMessageId);
      const { content, forwardInfo, inlineKeyboard } = repetition;
      const result = this.#send(
        authenticatedBot,
        { kind: 'existing', content },
        {
          chatId,
          isContentProtected,
          messageEffectId,
          ...(inlineKeyboard === undefined ? {} : { inlineKeyboard }),
          ...(repliedMessageId === undefined
            ? {}
            : { replyTo: { messageId: repliedMessageId, allowSendingWithoutReply: true } }),
        },
        forwardInfo,
      );
      if (!result.sent) {
        return result;
      }
      sentMessageIdsByRepeatedMessageId.set(message.id, result.message.message_id);
    }
    return { sent: true, messageIds: [...sentMessageIdsByRepeatedMessageId.values()] };
  }

  /**
   * Finds the message of one of the bot's chats that a forward or copy repeats. As on Telegram, a
   * chat the bot cannot address is not found.
   */
  #findRepeatedMessage(
    authenticatedBot: VirtualBotProfile,
    { chatId, messageId }: MessageTarget,
  ):
    | { readonly found: true; readonly message: ChatMessage }
    | { readonly found: false; readonly reason: RepeatedMessageFailureReason } {
    const lookup = isUserId(chatId)
      ? this.#botMessages.getMessageForBot({
        botId: authenticatedBot.id,
        accountId: chatId,
        botMessageId: messageId,
      })
      : this.#supergroupBotMessages.getMessageForBot({
        botId: authenticatedBot.id,
        chatId,
        messageId,
      });
    if (lookup.found) {
      return lookup;
    }

    const { reason } = lookup;
    switch (reason) {
      case 'chat_not_found':
      case 'bot_not_a_member':
      case 'bot_kicked':
        return { found: false, reason };
      case 'account_not_found':
      case 'conversation_not_started':
        return { found: false, reason: 'chat_not_found' };
      case 'message_not_found':
        return { found: false, reason: 'repeated_message_not_found' };
      case 'bot_not_found':
        throw new Error(`Authenticated bot ${authenticatedBot.id} does not exist`);
      default: {
        const unhandledReason: never = reason;
        throw new Error(`Unhandled repeated message lookup failure: ${unhandledReason}`);
      }
    }
  }

  /**
   * Sends content to a private chat or a supergroup; a forward also shows where it came from.
   *
   * A reply to a message of another chat is resolved before the chat the message goes to, while
   * Telegram checks that chat and the text first; a request that fails both ways fails for its
   * reply.
   */
  #send(
    authenticatedBot: VirtualBotProfile,
    content: OutgoingMessageContent,
    { replyTo, ...options }: SendRequestOptions,
    forwardInfo?: MessageForwardInfo,
  ): SendResult {
    const replyResolution = this.#resolveOutgoingReply(authenticatedBot, replyTo);
    if (!replyResolution.resolved) {
      return { sent: false, reason: replyResolution.reason };
    }
    const { reply } = replyResolution;
    return isUserId(options.chatId)
      ? this.#sendPrivateMessage(authenticatedBot, content, options, reply, forwardInfo)
      : this.#sendSupergroupMessage(authenticatedBot, content, options, reply, forwardInfo);
  }

  /**
   * Resolves what a message being sent replies to. The chat's messaging service looks up a message
   * of the chat itself. A message of another chat is resolved here, as the official Bot API
   * server's `check_reply_parameters` does: the bot must be able to read that chat, and a message it
   * does not find fails the send unless the bot allowed sending without a reply. As TDLib's
   * `create_message_input_reply_to` does, a message that cannot be forwarded, such as protected
   * content or a service message, is silently not replied to.
   */
  #resolveOutgoingReply(authenticatedBot: VirtualBotProfile, replyTo: ReplyTarget | undefined):
    | { readonly resolved: true; readonly reply: OutgoingReply }
    | {
      readonly resolved: false;
      readonly reason:
        | 'chat_not_found'
        | FormerSupergroupMemberFailureReason
        | 'reply_message_not_found';
    } {
    if (replyTo?.chatId === undefined) {
      return { resolved: true, reply: replyTo === undefined ? {} : { replyTo } };
    }
    const { chatId, messageId, allowSendingWithoutReply } = replyTo;
    const lookup = this.#findRepeatedMessage(authenticatedBot, { chatId, messageId });
    if (!lookup.found) {
      if (lookup.reason !== 'repeated_message_not_found') {
        return { resolved: false, reason: lookup.reason };
      }
      return allowSendingWithoutReply
        ? { resolved: true, reply: {} }
        : { resolved: false, reason: 'reply_message_not_found' };
    }
    return {
      resolved: true,
      reply: isForwardable(lookup.message) ? createExternalReply(lookup.message, messageId) : {},
    };
  }

  #sendPrivateMessage(
    authenticatedBot: VirtualBotProfile,
    content: OutgoingMessageContent,
    { chatId, isContentProtected, messageEffectId, ...replyMarkup }: SendDestinationOptions,
    { replyTo, externalReply, quote }: OutgoingReply,
    forwardInfo: MessageForwardInfo | undefined,
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
      externalReply,
      quote,
      isContentProtected,
      forwardInfo,
      messageEffectId,
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
    {
      chatId,
      isContentProtected,
      messageEffectId,
      inlineKeyboard,
      replyInterfaceMarkup,
    }: SendDestinationOptions,
    { replyTo, externalReply, quote }: OutgoingReply,
    forwardInfo: MessageForwardInfo | undefined,
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
      externalReply,
      quote,
      isContentProtected,
      forwardInfo,
      messageEffectId,
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
      case 'message_effect_not_allowed_in_chat':
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
      return {
        left: false,
        reason: this.#isPrivateChatKnown(authenticatedBot, chatId)
          ? 'private_chat_not_leavable'
          : 'chat_not_found',
      };
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

  /**
   * Returns a user's standing in a chat: in a private chat, either participant is a member; in a
   * supergroup, the bot must be a member, and a user of the session that never joined has `left`.
   */
  getChatMember(
    authenticatedBot: VirtualBotProfile,
    { chatId, userId }: GetChatMemberRequest,
  ): GetChatMemberResult {
    if (isUserId(chatId)) {
      if (!this.#isPrivateChatKnown(authenticatedBot, chatId)) {
        return { found: false, reason: 'chat_not_found' };
      }
      return userId === authenticatedBot.id || userId === chatId
        ? { found: true, member: this.#viewChatMember(userId, { status: 'member' }) }
        : { found: false, reason: 'member_not_found' };
    }
    const result = this.#chatMemberships.getChatMemberStatus({
      observerBotId: authenticatedBot.id,
      chatId,
      userId,
    });
    if (!result.found) {
      return { found: false, reason: excludeMissingBotFailure(authenticatedBot, result.reason) };
    }
    return { found: true, member: this.#viewChatMember(userId, result.status) };
  }

  /**
   * Returns the owner and administrators of a supergroup the bot is a member of. As on Telegram,
   * administrators that are other bots are left out unless requested; a private chat has none.
   */
  getChatAdministrators(
    authenticatedBot: VirtualBotProfile,
    { chatId, includesOtherBots }: GetChatAdministratorsRequest,
  ): BotApiGetChatAdministratorsResult {
    if (isUserId(chatId)) {
      return {
        found: false,
        reason: this.#isPrivateChatKnown(authenticatedBot, chatId)
          ? 'private_chat_has_no_administrators'
          : 'chat_not_found',
      };
    }
    const result = this.#chatMemberships.getChatAdministrators({
      observerBotId: authenticatedBot.id,
      chatId,
    });
    if (!result.found) {
      return { found: false, reason: excludeMissingBotFailure(authenticatedBot, result.reason) };
    }
    const administrators = result.administrators
      .map(({ userId, status }) => this.#viewChatMember(userId, status))
      .filter(({ user }) => includesOtherBots || !user.is_bot || user.id === authenticatedBot.id);
    return { found: true, administrators };
  }

  /** Returns how many members a chat has: both participants of a private chat, or a supergroup's. */
  getChatMemberCount(
    authenticatedBot: VirtualBotProfile,
    { chatId }: GetChatMemberCountRequest,
  ): BotApiGetChatMemberCountResult {
    if (isUserId(chatId)) {
      return this.#isPrivateChatKnown(authenticatedBot, chatId)
        ? { found: true, memberCount: 2 }
        : { found: false, reason: 'chat_not_found' };
    }
    const result = this.#chatMemberships.getChatMemberCount({
      observerBotId: authenticatedBot.id,
      chatId,
    });
    return result.found
      ? result
      : { found: false, reason: excludeMissingBotFailure(authenticatedBot, result.reason) };
  }

  /**
   * Bans a user from a supergroup, removing it if it is a member, as an administrator with the
   * `can_restrict_members` right. A private chat has no members to ban.
   */
  banChatMember(
    authenticatedBot: VirtualBotProfile,
    { chatId, userId, untilUnixSeconds }: BanChatMemberRequest,
  ): BotApiBanChatMemberResult {
    if (isUserId(chatId)) {
      return {
        banned: false,
        reason: this.#isPrivateChatKnown(authenticatedBot, chatId)
          ? 'private_chat_members_not_bannable'
          : 'chat_not_found',
      };
    }
    const result = this.#chatMemberships.banChatMember({
      actorBotId: authenticatedBot.id,
      chatId,
      memberId: userId,
      requestedBanEndUnixSeconds: untilUnixSeconds,
    });
    if (result.banned) {
      return result;
    }
    return { banned: false, reason: excludeMissingBotFailure(authenticatedBot, result.reason) };
  }

  /**
   * Lifts a user's ban from a supergroup, so that it may join again. Unless only a ban is to be
   * lifted, this removes a member, as on Telegram.
   */
  unbanChatMember(
    authenticatedBot: VirtualBotProfile,
    { chatId, userId, onlyIfBanned }: UnbanChatMemberRequest,
  ): BotApiUnbanChatMemberResult {
    if (isUserId(chatId)) {
      return {
        unbanned: false,
        reason: this.#isPrivateChatKnown(authenticatedBot, chatId)
          ? 'method_unavailable_in_private_chats'
          : 'chat_not_found',
      };
    }
    const result = this.#chatMemberships.unbanChatMember({
      actorBotId: authenticatedBot.id,
      chatId,
      memberId: userId,
      onlyIfBanned,
    });
    return result.unbanned ? result : {
      unbanned: false,
      reason: excludeMissingBotFailure(authenticatedBot, result.reason),
    };
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

  /**
   * Answers an inline query that an account sent to the bot, with results whose files the bot
   * knows by `file_id`.
   *
   * Every result's file is resolved before the other checks, while TDLib checks the button and
   * the number of results first and resolves each result's file after its message content.
   */
  answerInlineQuery(
    authenticatedBot: VirtualBotProfile,
    { inlineQueryId, results, cacheTimeSeconds, isPersonal, nextOffset, button }:
      AnswerInlineQueryRequest,
  ): BotApiAnswerInlineQueryResult {
    const specifiedResults: SpecifiedInlineQueryResult[] = [];
    for (const result of results) {
      const resolution = this.#resolveInlineQueryResult(authenticatedBot, result);
      if (!resolution.resolved) {
        return { answered: false, ...resolution.failure };
      }
      specifiedResults.push(resolution.result);
    }
    const answering = this.#inlineQueries.answerInlineQuery({
      fromBotId: authenticatedBot.id,
      inlineQueryId,
      results: specifiedResults,
      cacheTimeSeconds,
      isPersonal,
      nextOffset,
      button,
    });
    return answering.answered ? { answered: true } : answering;
  }

  /** Replaces the text, entities, and inline keyboard of a text message sent through the bot. */
  editInlineMessageText(
    authenticatedBot: VirtualBotProfile,
    { inlineMessageId, text, entities, inlineKeyboard }: EditInlineMessageTextRequest,
  ): EditInlineMessageResult<EditInlineMessageTextFailureReason> {
    const message = this.#findOwnInlineMessage(authenticatedBot, inlineMessageId);
    if (message === undefined) {
      return { edited: false, reason: 'inline_message_not_found' };
    }
    const edit = {
      fromBotId: authenticatedBot.id,
      inlineMessageId,
      text,
      entities,
      inlineKeyboard,
    };
    const result = message.kind === 'private_message'
      ? this.#botMessages.editBotMessageText(edit)
      : this.#supergroupBotMessages.editBotMessageText(edit);
    if (result.edited) {
      return { edited: true };
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
          reason: toEditInlineMessageFailureReason(authenticatedBot, result.reason),
        };
    }
  }

  /**
   * Replaces the caption, its entities, and the inline keyboard of a photo or document sent
   * through the bot; empty caption text removes the caption.
   */
  editInlineMessageCaption(
    authenticatedBot: VirtualBotProfile,
    { inlineMessageId, caption, showsCaptionAboveMedia, inlineKeyboard }:
      EditInlineMessageCaptionRequest,
  ): EditInlineMessageResult<EditInlineMessageCaptionFailureReason> {
    const message = this.#findOwnInlineMessage(authenticatedBot, inlineMessageId);
    if (message === undefined) {
      return { edited: false, reason: 'inline_message_not_found' };
    }
    const edit = {
      fromBotId: authenticatedBot.id,
      inlineMessageId,
      caption: caption.text,
      captionEntities: caption.entities,
      showsCaptionAboveMedia,
      inlineKeyboard,
    };
    const result = message.kind === 'private_message'
      ? this.#botMessages.editBotMessageCaption(edit)
      : this.#supergroupBotMessages.editBotMessageCaption(edit);
    if (result.edited) {
      return { edited: true };
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
          reason: toEditInlineMessageFailureReason(authenticatedBot, result.reason),
        };
    }
  }

  /** Replaces the inline keyboard of a message sent through the bot. */
  editInlineMessageReplyMarkup(
    authenticatedBot: VirtualBotProfile,
    { inlineMessageId, inlineKeyboard }: EditInlineMessageReplyMarkupRequest,
  ): EditInlineMessageResult<EditInlineMessageReplyMarkupFailureReason> {
    const message = this.#findOwnInlineMessage(authenticatedBot, inlineMessageId);
    if (message === undefined) {
      return { edited: false, reason: 'inline_message_not_found' };
    }
    const edit = { fromBotId: authenticatedBot.id, inlineMessageId, inlineKeyboard };
    const result = message.kind === 'private_message'
      ? this.#botMessages.editBotMessageInlineKeyboard(edit)
      : this.#supergroupBotMessages.editBotMessageInlineKeyboard(edit);
    return result.edited ? { edited: true } : {
      edited: false,
      reason: toEditInlineMessageFailureReason(authenticatedBot, result.reason),
    };
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

  /**
   * Resolves the files of a result the bot specified and the message content it sends: the text
   * of its `input_message_content`, or else its own photo or document with its caption.
   */
  #resolveInlineQueryResult(
    authenticatedBot: VirtualBotProfile,
    result: InlineQueryResultRequest,
  ):
    | { readonly resolved: true; readonly result: SpecifiedInlineQueryResult }
    | {
      readonly resolved: false;
      readonly failure: { readonly reason: 'file_id_invalid' } | FileTypeMismatchFailure;
    } {
    const shared = {
      id: result.id,
      description: result.description,
      ...(result.inlineKeyboard === undefined ? {} : { inlineKeyboard: result.inlineKeyboard }),
    };
    const textContent = (text: SpecifiedFormattedText): OutgoingMessageContent => ({
      kind: 'text',
      text: text.text,
      entities: text.entities,
    });
    switch (result.kind) {
      case 'article':
        return {
          resolved: true,
          result: {
            ...shared,
            kind: 'article',
            title: result.title,
            url: result.url,
            messageContent: textContent(result.messageText),
          },
        };
      case 'photo': {
        const file = this.#mediaFiles.findObserverFile(authenticatedBot.id, result.photoFileId);
        if (file?.type !== 'photo') {
          return { resolved: false, failure: fileIdFailure(file, 'photo') };
        }
        return {
          resolved: true,
          result: {
            ...shared,
            kind: 'photo',
            photo: file,
            title: result.title,
            messageContent: result.messageText === undefined
              ? {
                kind: 'photo',
                photo: { kind: 'stored', file },
                caption: result.caption.text,
                captionEntities: result.caption.entities,
                hasSpoiler: false,
                showsCaptionAboveMedia: result.showsCaptionAboveMedia,
              }
              : textContent(result.messageText),
          },
        };
      }
      case 'document': {
        const file = this.#mediaFiles.findObserverFile(authenticatedBot.id, result.documentFileId);
        if (file?.type !== 'document') {
          return { resolved: false, failure: fileIdFailure(file, 'document') };
        }
        return {
          resolved: true,
          result: {
            ...shared,
            kind: 'document',
            document: file,
            title: result.title,
            messageContent: result.messageText === undefined
              ? {
                kind: 'document',
                document: { kind: 'stored', file },
                caption: result.caption.text,
                captionEntities: result.caption.entities,
              }
              : textContent(result.messageText),
          },
        };
      }
      default: {
        const unhandledResult: never = result;
        throw new Error(`Unhandled inline query result: ${JSON.stringify(unhandledResult)}`);
      }
    }
  }

  /**
   * Finds a message sent through the bot's inline mode, whose chat decides which messaging service
   * edits it. Another bot's inline message is not found.
   */
  #findOwnInlineMessage(
    authenticatedBot: VirtualBotProfile,
    inlineMessageId: InlineMessageId,
  ): ChatMessage | undefined {
    const message = this.#inlineMessages.getMessageByInlineMessageId(inlineMessageId);
    return message?.viaBot?.botId === authenticatedBot.id ? message : undefined;
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

  /** A bot knows a private chat once its account has written to it. */
  #isPrivateChatKnown(authenticatedBot: VirtualBotProfile, accountId: number): boolean {
    return this.#botMessages.isPrivateConversationStarted({
      accountId,
      botId: authenticatedBot.id,
    });
  }

  /** Shows a user of the session, which the caller found, in its standing in a chat. */
  #viewChatMember(userId: number, status: ChatMemberStatus): BotApiChatMember {
    const member = this.#botMessageViews.viewChatMember(userId, status);
    if (member === undefined) {
      throw new Error(`Chat member ${userId} does not exist`);
    }
    return member;
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

/** Shows a command as the Bot API does, with `is_ephemeral` only when set. */
function projectBotCommand({ command, description, isEphemeral }: BotCommand): BotApiBotCommand {
  return { command, description, ...(isEphemeral ? { is_ephemeral: true as const } : {}) };
}

/**
 * Narrows why a member query or moderation of the authenticated bot failed to the reasons it can
 * meet: the authenticated bot itself always exists.
 */
function excludeMissingBotFailure<Reason extends string>(
  authenticatedBot: VirtualBotProfile,
  reason: Reason | 'bot_not_found',
): Reason {
  if (reason === 'bot_not_found') {
    throw new Error(`Authenticated bot ${authenticatedBot.id} does not exist`);
  }
  return reason;
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

/**
 * Translates the failures shared by the edit methods for an inline message into Bot API failures.
 * The messaging services check an inline message only by its identifier, so failures about its
 * chat cannot occur.
 */
function toEditInlineMessageFailureReason(
  authenticatedBot: VirtualBotProfile,
  reason: BotMessageEditFailureReason | SupergroupBotMessageEditFailureReason,
): EditInlineMessageReplyMarkupFailureReason {
  switch (reason) {
    case 'callback_data_invalid':
    case 'message_not_modified':
      return reason;
    case 'message_not_found':
      return 'inline_message_not_found';
    case 'bot_not_found':
      throw new Error(`Authenticated bot ${authenticatedBot.id} does not exist`);
    case 'account_not_found':
    case 'conversation_not_started':
    case 'chat_not_found':
    case 'bot_not_a_member':
    case 'bot_kicked':
    case 'message_not_editable':
      throw new Error(`Inline message edit failed for its chat: ${reason}`);
    default: {
      const unhandledReason: never = reason;
      throw new Error(`Unhandled inline message edit failure: ${unhandledReason}`);
    }
  }
}

/** Media content without its caption, as a copy that removes captions sends it; text is kept. */
function withoutCaption(content: MessageContent): MessageContent {
  return content.kind === 'text' ? content : { ...content, caption: { text: '', entities: [] } };
}
