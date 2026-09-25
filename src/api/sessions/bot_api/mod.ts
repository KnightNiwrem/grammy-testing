import { type Context, Hono } from 'hono';
import { z } from 'zod';

import {
  MAX_BOT_COMMAND_DESCRIPTION_LENGTH,
  MAX_BOT_COMMAND_LENGTH,
} from '../../../types/bot_command.ts';
import { MAX_CALLBACK_QUERY_ANSWER_TEXT_LENGTH } from '../../../types/callback_query.ts';
import type { EmulationSession } from '../../../types/emulation_session.ts';
import type { VirtualBotProfile } from '../../../types/virtual_bot.ts';
import type { ChatAction } from '../../../types/virtual_chat.ts';
import { fileDownloadResponse } from '../file_download.ts';
import type { SessionRouteContextTypes } from '../session_route_context_types.ts';
import {
  botCommandScopeParameter,
  botCommandsParameter,
  readBotCommandScopeParameter,
} from './bot_command_parameters.ts';
import {
  messageEntitiesParameter,
  readMessageEntitiesParameter,
} from './message_entities_parameter.ts';
import {
  type InlineQueryResultParameter,
  inlineQueryResultsButtonParameter,
  readInlineQueryResultsParameter,
  type UnreadFormattedText,
} from './inline_query_answer_parameters.ts';
import { readInputFileParameter } from './input_file_parameter.ts';
import { linkPreviewOptionsParameter } from './link_preview_options_parameter.ts';
import {
  replyParametersParameter,
  selectSpecifiedReplyTarget,
} from './reply_parameters_parameter.ts';
import {
  inlineKeyboardMarkupParameter,
  messageReplyMarkupParameter,
} from './reply_markup_parameter.ts';
import {
  botApiError,
  type BotApiMethodAnswer,
  type BotApiMethodContext,
  botApiResult,
} from './method_call.ts';
import {
  booleanParameter,
  type BotApiRequestParameters,
  type BotApiUploadedFiles,
  decodeBotApiRequestParameters,
  integerParameter,
  jsonParameter,
} from './request_parameters.ts';

const BOT_TOKEN_PATH_PARAMETER = 'botTokenPathSegment';
const BOT_TOKEN_PATH_PREFIX = 'bot';
const BOT_TOKEN_PATH = `/:${BOT_TOKEN_PATH_PARAMETER}{${BOT_TOKEN_PATH_PREFIX}[^/]+}` as const;
const BOT_API_SUBRESOURCE_PATH = `${BOT_TOKEN_PATH}/*` as const;
const BOT_API_METHOD_NAME_PARAMETER = 'methodName';
/** Everything after the token is the method name, as in the official Bot API server. */
const BOT_API_METHOD_PATH = `${BOT_TOKEN_PATH}/:${BOT_API_METHOD_NAME_PARAMETER}{.*}` as const;
const FILE_PATH_PARAMETER = 'filePath';
/** Where bots download files, as Telegram serves them: `/file/bot<token>/<file_path>`. */
const BOT_FILE_DOWNLOAD_PATH =
  `/file/:${BOT_TOKEN_PATH_PARAMETER}{${BOT_TOKEN_PATH_PREFIX}[^/]+}/:${FILE_PATH_PARAMETER}{.+}` as const;

/** Telegram's wording, from `abort_long_poll` in the official Bot API server. */
const TERMINATED_BY_OTHER_LONG_POLL_DESCRIPTION =
  'Conflict: terminated by other getUpdates request; make sure that only one bot instance is running';
const TERMINATED_BY_WEBHOOK_DESCRIPTION = 'Conflict: terminated by setWebhook request';
const WEBHOOK_ACTIVE_DESCRIPTION =
  "Conflict: can't use getUpdates method while webhook is active; use deleteWebhook to delete the webhook first";

/** Telegram's answers to setWebhook and deleteWebhook, by what the request did. */
const SET_WEBHOOK_OUTCOME_DESCRIPTIONS = {
  webhook_set: 'Webhook was set',
  webhook_already_set: 'Webhook is already set',
  webhook_deleted: 'Webhook was deleted',
  webhook_already_deleted: 'Webhook is already deleted',
} as const;

/** Telegram's descriptions for rejected setWebhook requests. */
const SET_WEBHOOK_REJECTION_DESCRIPTIONS = {
  url_invalid: 'Bad Request: invalid webhook URL specified',
  secret_token_too_long: 'Bad Request: secret token is too long',
  secret_token_invalid: 'Bad Request: secret token contains illegal characters',
} as const;

/**
 * The emulator's descriptions for webhook options it does not support: Telegram connects to a
 * webhook at a given IP address, or trusts its self-signed certificate.
 */
const WEBHOOK_IP_ADDRESS_UNSUPPORTED_DESCRIPTION =
  'Bad Request: webhook IP addresses are not supported';
const WEBHOOK_CERTIFICATE_UNSUPPORTED_DESCRIPTION =
  'Bad Request: custom webhook certificates are not supported';

/** Telegram's default and range for `max_connections`, to which it clamps other values. */
const DEFAULT_WEBHOOK_MAX_CONNECTIONS = 40;
const MIN_WEBHOOK_MAX_CONNECTIONS = 1;
const MAX_WEBHOOK_MAX_CONNECTIONS = 100;

/** Telegram's descriptions for rejected sendMessage requests. */
const MESSAGE_TEXT_EMPTY_DESCRIPTION = 'Bad Request: message text is empty';
const CHAT_ID_EMPTY_DESCRIPTION = 'Bad Request: chat_id is empty';
const CHAT_NOT_FOUND_DESCRIPTION = 'Bad Request: chat not found';
const REPLY_MESSAGE_NOT_FOUND_DESCRIPTION = 'Bad Request: message to be replied not found';
const MESSAGE_TEXT_TOO_LONG_DESCRIPTION = 'Bad Request: message is too long';
const BUTTON_DATA_INVALID_DESCRIPTION = 'Bad Request: BUTTON_DATA_INVALID';

/** TDLib's descriptions for message effects in chats or requests that cannot use them. */
const MESSAGE_EFFECT_NOT_ALLOWED_IN_CHAT_DESCRIPTION =
  "Bad Request: can't use message effects in the chat";
const MESSAGE_EFFECT_NOT_ALLOWED_IN_METHOD_DESCRIPTION =
  "Bad Request: can't use message effects in the method";

/** Telegram's description for a message or chat action to a user who blocked the bot. */
const BOT_BLOCKED_DESCRIPTION = 'Forbidden: bot was blocked by the user';

/** Telegram's descriptions for a request to a supergroup that the bot left or was removed from. */
const BOT_NOT_SUPERGROUP_MEMBER_DESCRIPTION =
  'Forbidden: bot is not a member of the supergroup chat';
const BOT_KICKED_FROM_SUPERGROUP_DESCRIPTION = 'Forbidden: bot was kicked from the supergroup chat';

/**
 * The emulator's description for a reply keyboard, keyboard removal, or forced reply sent to a
 * group, where Telegram shows them to chosen members; the emulator does not support that.
 */
const GROUP_REPLY_INTERFACE_UNSUPPORTED_DESCRIPTION =
  'Bad Request: reply keyboards, keyboard removals, and forced replies are not supported in groups';

/** Telegram's descriptions for files a message cannot send. */
const FILE_EMPTY_DESCRIPTION = 'Bad Request: file must be non-empty';
const IMAGE_INVALID_DESCRIPTION = 'Bad Request: IMAGE_PROCESS_FAILED';
const PHOTO_DIMENSIONS_INVALID_DESCRIPTION = 'Bad Request: PHOTO_INVALID_DIMENSIONS';
const FILE_ID_INVALID_DESCRIPTION = 'Bad Request: wrong file identifier/HTTP URL specified';
const CAPTION_TOO_LONG_DESCRIPTION = 'Bad Request: message caption is too long';

/** TDLib's names of file types in its errors about a file of the wrong type. */
const TDLIB_FILE_TYPE_NAMES = { photo: 'Photo', document: 'Document' } as const;

/** The emulator's description for a file sent by URL, which Telegram downloads itself. */
const FILE_URL_UNSUPPORTED_DESCRIPTION = 'Bad Request: sending files by URL is not supported';

/** Telegram's descriptions for rejected getFile requests. */
const FILE_ID_NOT_SPECIFIED_DESCRIPTION = 'Bad Request: file_id not specified';
const GET_FILE_ID_INVALID_DESCRIPTION = 'Bad Request: invalid file_id';
const FILE_TOO_BIG_DESCRIPTION = 'Bad Request: file is too big';

/** Telegram's descriptions for message text or formatting it cannot read. */
const FORMATTED_TEXT_TOO_LONG_DESCRIPTION = 'Bad Request: text is too long';
const PARSE_MODE_UNSUPPORTED_DESCRIPTION = 'Bad Request: unsupported parse_mode';
const TEXT_ENCODING_INVALID_DESCRIPTION = 'Bad Request: text must be encoded in UTF-8';

/** Telegram's descriptions for rejected message edits. */
const MESSAGE_IDENTIFIER_NOT_SPECIFIED_DESCRIPTION =
  'Bad Request: message identifier is not specified';
const MESSAGE_TO_EDIT_NOT_FOUND_DESCRIPTION = 'Bad Request: message to edit not found';
const MESSAGE_HAS_NO_TEXT_DESCRIPTION = 'Bad Request: there is no text in the message to edit';
const MESSAGE_HAS_NO_CAPTION_DESCRIPTION =
  'Bad Request: there is no caption in the message to edit';
const MESSAGE_NOT_EDITABLE_DESCRIPTION = "Bad Request: message can't be edited";
const MESSAGE_NOT_MODIFIED_DESCRIPTION =
  'Bad Request: message is not modified: specified new message content and reply markup are exactly the same as a current content and reply markup of the message';

/** Telegram's descriptions for rejected message deletions. */
const MESSAGE_TO_DELETE_NOT_FOUND_DESCRIPTION = 'Bad Request: message to delete not found';
const MESSAGE_NOT_DELETABLE_DESCRIPTION = "Bad Request: message can't be deleted";
const MESSAGE_IDENTIFIERS_NOT_SPECIFIED_DESCRIPTION =
  'Bad Request: message identifiers are not specified';
const TOO_MANY_MESSAGE_IDENTIFIERS_DESCRIPTION =
  'Bad Request: too many message identifiers specified';
const INVALID_MESSAGE_IDENTIFIER_DESCRIPTION = 'Bad Request: invalid message identifier specified';

/** Telegram's descriptions for rejected forwards and copies of messages. */
const FROM_CHAT_ID_REQUIRED_DESCRIPTION = 'Bad Request: parameter "from_chat_id" is required';
const MESSAGE_TO_FORWARD_NOT_FOUND_DESCRIPTION = 'Bad Request: message to forward not found';
const MESSAGE_TO_COPY_NOT_FOUND_DESCRIPTION = 'Bad Request: message to copy not found';
const MESSAGE_NOT_FORWARDABLE_DESCRIPTION = "Bad Request: the message can't be forwarded";
const MESSAGE_NOT_COPYABLE_DESCRIPTION = "Bad Request: the message can't be copied";
/** TDLib words these alike for forwardMessages and copyMessages, which both forward in TDLib. */
const NO_MESSAGES_TO_FORWARD_DESCRIPTION = 'Bad Request: there are no messages to forward';
const MESSAGE_IDS_NOT_INCREASING_DESCRIPTION =
  'Bad Request: message identifiers must be in a strictly increasing order';
const MESSAGES_NOT_FORWARDABLE_DESCRIPTION = "Bad Request: messages can't be forwarded";

/** Telegram forwards or copies at most 100 messages in one request. */
const MAX_REPEATED_MESSAGES_COUNT = 100;

/** Telegram deletes at most 100 messages in one deleteMessages request. */
const MAX_DELETE_MESSAGES_COUNT = 100;

/** Telegram reads a missing or non-positive `message_id` as 0, which identifies no message. */
const NO_MESSAGE_ID = 0;

/** Telegram's description for an unknown, expired, or already answered callback query. */
const QUERY_ID_INVALID_DESCRIPTION =
  'Bad Request: query is too old and response timeout expired or query ID is invalid';

/** Telegram's descriptions for rejected answerInlineQuery requests, by the failure's reason. */
const ANSWER_INLINE_QUERY_FAILURE_DESCRIPTIONS = {
  start_parameter_empty: "Bad Request: can't use empty start_parameter",
  start_parameter_too_long: 'Bad Request: too long start_parameter specified',
  start_parameter_invalid: 'Bad Request: unallowed characters in start_parameter are used',
  too_many_results: 'Bad Request: too many inline query results specified',
  query_id_invalid: QUERY_ID_INVALID_DESCRIPTION,
  next_offset_invalid: 'Bad Request: NEXT_OFFSET_INVALID',
  result_id_empty: 'Bad Request: RESULT_ID_EMPTY',
  result_id_invalid: 'Bad Request: RESULT_ID_INVALID',
  result_id_duplicate: 'Bad Request: RESULT_ID_DUPLICATE',
  article_title_empty: 'Bad Request: ARTICLE_TITLE_EMPTY',
  document_title_empty: 'Bad Request: FILE_TITLE_EMPTY',
  callback_data_invalid: BUTTON_DATA_INVALID_DESCRIPTION,
  message_text_too_long: 'Bad Request: MESSAGE_TOO_LONG',
  caption_too_long: 'Bad Request: MEDIA_CAPTION_TOO_LONG',
  file_id_invalid: "Bad Request: wrong remote file identifier specified: can't unserialize it",
} as const;

/** How the Bot API server reports that it cannot read an inline query result. */
const INLINE_QUERY_RESULT_ERROR_PREFIX = "can't parse InlineQueryResult: ";

/** Telegram's default and range for how long clients may cache an inline query's answer. */
const DEFAULT_INLINE_QUERY_CACHE_TIME_SECONDS = 300;
const MAX_INLINE_QUERY_CACHE_TIME_SECONDS = 24 * 60 * 60;

/** Telegram's description for an edit of an unknown, deleted, or other bot's inline message. */
const INLINE_MESSAGE_ID_INVALID_DESCRIPTION = 'Bad Request: MESSAGE_ID_INVALID';

/** The prefix of Telegram's descriptions of bad requests. */
const BAD_REQUEST_PREFIX = 'Bad Request: ';

/** Telegram's description for a missing or unknown chat action. */
const CHAT_ACTION_INVALID_DESCRIPTION = 'Bad Request: wrong parameter action in request';

/** Chat actions by the lowercase names Telegram reads, including its older aliases. */
const CHAT_ACTIONS_BY_NAME: ReadonlyMap<string, ChatAction> = new Map([
  ['cancel', 'cancel'],
  ['typing', 'typing'],
  ['record_video', 'record_video'],
  ['upload_video', 'upload_video'],
  ['record_voice', 'record_voice'],
  ['record_audio', 'record_voice'],
  ['upload_voice', 'upload_voice'],
  ['upload_audio', 'upload_voice'],
  ['upload_photo', 'upload_photo'],
  ['upload_document', 'upload_document'],
  ['choose_sticker', 'choose_sticker'],
  ['find_location', 'find_location'],
  ['pick_up_location', 'find_location'],
  ['record_video_note', 'record_video_note'],
  ['upload_video_note', 'upload_video_note'],
]);

/** Telegram's descriptions for rejected command list changes. */
const SCOPE_NOT_ALLOWED_IN_PRIVATE_CHATS_DESCRIPTION =
  "Bad Request: can't use specified scope in private chats";
const LANGUAGE_CODE_INVALID_DESCRIPTION = 'Bad Request: invalid language code specified';
const BOT_COMMAND_FAILURE_DESCRIPTIONS = {
  command_not_utf8: 'Bad Request: command must be encoded in UTF-8',
  command_description_not_utf8: 'Bad Request: command description must be encoded in UTF-8',
  command_empty: 'Bad Request: command must be non-empty',
  command_too_long: `Bad Request: command length must not exceed ${MAX_BOT_COMMAND_LENGTH}`,
  command_description_empty: 'Bad Request: command description must be non-empty',
  command_description_too_long:
    `Bad Request: command description length must not exceed ${MAX_BOT_COMMAND_DESCRIPTION_LENGTH}`,
  too_many_commands: 'Bad Request: BOT_COMMANDS_TOO_MUCH',
  command_invalid: 'Bad Request: BOT_COMMAND_INVALID',
} as const;

/** Telegram's descriptions for rejected requests about chat members. */
const USER_ID_INVALID_DESCRIPTION = 'Bad Request: invalid user_id specified';
const MEMBER_NOT_FOUND_DESCRIPTION = 'Bad Request: member not found';
const PRIVATE_CHAT_HAS_NO_ADMINISTRATORS_DESCRIPTION =
  'Bad Request: there are no administrators in the private chat';
const PRIVATE_CHAT_MEMBERS_NOT_BANNABLE_DESCRIPTION =
  "Bad Request: can't ban members in private chats";
const METHOD_UNAVAILABLE_IN_PRIVATE_CHATS_DESCRIPTION =
  'Bad Request: method is available only in supergroup and channel chats';
const CANNOT_RESTRICT_SELF_DESCRIPTION = "Bad Request: can't restrict self";
const MEMBER_IS_OWNER_DESCRIPTION = "Bad Request: can't remove chat owner";
const NOT_ENOUGH_RIGHTS_TO_RESTRICT_DESCRIPTION =
  'Bad Request: not enough rights to restrict/unrestrict chat member';
const MEMBER_IS_ADMINISTRATOR_DESCRIPTION = 'Bad Request: user is an administrator of the chat';

/** Telegram caps how long a client may cache a callback query answer at 30 days. */
const MAX_CALLBACK_QUERY_ANSWER_CACHE_TIME_SECONDS = 30 * 24 * 60 * 60;

const getMeParametersSchema = z.strictObject({});

const deleteWebhookParametersSchema = z.strictObject({
  drop_pending_updates: booleanParameter().default(false),
});

const setWebhookParametersSchema = z.strictObject({
  url: z.string().default(''),
  certificate: z.string().optional(),
  ip_address: z.string().default(''),
  max_connections: integerParameter(
    z.int().transform((maxConnections) =>
      Math.min(Math.max(maxConnections, MIN_WEBHOOK_MAX_CONNECTIONS), MAX_WEBHOOK_MAX_CONNECTIONS)
    ),
  ).default(DEFAULT_WEBHOOK_MAX_CONNECTIONS),
  // As for getUpdates, a malformed value is rejected rather than ignored.
  allowed_updates: jsonParameter(z.array(z.string())).optional(),
  drop_pending_updates: booleanParameter().default(false),
  secret_token: z.string().default(''),
});

const getWebhookInfoParametersSchema = z.strictObject({});

/** The range of Telegram's 64-bit message effect identifiers. */
const MIN_MESSAGE_EFFECT_ID = -(2n ** 63n);
const MAX_MESSAGE_EFFECT_ID = 2n ** 63n - 1n;

/**
 * A `message_effect_id`: the 64-bit identifier of a message effect, read as its decimal text, where
 * 0 chooses none, as Telegram reads it. Telegram reads any leading digits and ignores the rest;
 * rejecting other text instead surfaces the bot's mistake in tests.
 */
function messageEffectIdParameter() {
  return z.string().regex(/^-?\d+$/).transform(BigInt).refine((effectId) =>
    effectId >= MIN_MESSAGE_EFFECT_ID && effectId <= MAX_MESSAGE_EFFECT_ID
  ).transform((effectId) => effectId === 0n ? undefined : effectId.toString());
}

/**
 * Link preview parameters, which the emulator validates and ignores because it generates no link
 * previews. `disable_web_page_preview` is the older form that Telegram still accepts.
 */
const linkPreviewParametersShape = {
  link_preview_options: linkPreviewOptionsParameter().optional(),
  disable_web_page_preview: booleanParameter().optional(),
};

// Telegram also accepts an `@username` chat_id, which it resolves only for bots and public
// supergroups and channels; the emulator's supergroups have no usernames, so it accepts only
// numeric chat IDs. `reply_to_message_id` and `allow_sending_without_reply` are the older form of
// `reply_parameters`, which Telegram still accepts. The account's client does not model
// notifications, so `disable_notification` is validated and ignored.
const sendOptionsParametersShape = {
  chat_id: integerParameter(z.int()).optional(),
  disable_notification: booleanParameter().optional(),
  protect_content: booleanParameter().default(false),
  message_effect_id: messageEffectIdParameter().optional(),
  reply_parameters: replyParametersParameter().optional(),
  reply_to_message_id: integerParameter(z.int()).optional(),
  allow_sending_without_reply: booleanParameter().default(false),
  reply_markup: messageReplyMarkupParameter().default({}),
};

/** A caption and its formatting; Telegram treats a missing caption as none. */
const captionParametersShape = {
  caption: z.string().default(''),
  parse_mode: z.string().optional(),
  caption_entities: messageEntitiesParameter().optional(),
};

// Telegram treats a missing parameter as empty text.
const sendMessageParametersSchema = z.strictObject({
  ...sendOptionsParametersShape,
  text: z.string().default(''),
  parse_mode: z.string().optional(),
  entities: messageEntitiesParameter().optional(),
  ...linkPreviewParametersShape,
});

const sendPhotoParametersSchema = z.strictObject({
  ...sendOptionsParametersShape,
  photo: z.string().optional(),
  ...captionParametersShape,
  show_caption_above_media: booleanParameter().default(false),
  has_spoiler: booleanParameter().default(false),
});

// The emulator never detects other media types in documents, so `disable_content_type_detection`
// is validated and ignored. Document thumbnails are not supported.
const sendDocumentParametersSchema = z.strictObject({
  ...sendOptionsParametersShape,
  document: z.string().optional(),
  ...captionParametersShape,
  disable_content_type_detection: booleanParameter().optional(),
});

// As for sending, Telegram accepts only numeric chat IDs of the emulator's chats. Topics, paid
// broadcasts, suggested posts, and video start timestamps are not supported.
const forwardMessageParametersSchema = z.strictObject({
  chat_id: integerParameter(z.int()).optional(),
  from_chat_id: integerParameter(z.int()).optional(),
  message_id: integerParameter(z.int()).optional(),
  disable_notification: booleanParameter().optional(),
  protect_content: booleanParameter().default(false),
  message_effect_id: messageEffectIdParameter().optional(),
});

// A caption, even an empty one, replaces the caption of copied media; without one, its parse mode
// and entities are ignored, as on Telegram.
const copyMessageParametersSchema = z.strictObject({
  ...sendOptionsParametersShape,
  from_chat_id: integerParameter(z.int()).optional(),
  message_id: integerParameter(z.int()).optional(),
  caption: z.string().optional(),
  parse_mode: z.string().optional(),
  caption_entities: messageEntitiesParameter().optional(),
  show_caption_above_media: booleanParameter().default(false),
});

// As for forwardMessage, topics, paid broadcasts, and suggested posts are not supported. Telegram
// also accepts message identifiers written as strings, as for deleteMessages.
const repeatMessagesParametersShape = {
  chat_id: integerParameter(z.int()).optional(),
  from_chat_id: integerParameter(z.int()).optional(),
  message_ids: jsonParameter(z.array(z.int())).optional(),
  disable_notification: booleanParameter().optional(),
  protect_content: booleanParameter().default(false),
  message_effect_id: messageEffectIdParameter().optional(),
};

const forwardMessagesParametersSchema = z.strictObject(repeatMessagesParametersShape);

const copyMessagesParametersSchema = z.strictObject({
  ...repeatMessagesParametersShape,
  remove_caption: booleanParameter().default(false),
});

/** Where an edit method finds the message: in a chat, or sent through the bot's inline mode. */
const editedMessageParametersShape = {
  chat_id: integerParameter(z.int()).optional(),
  message_id: integerParameter(z.int()).optional(),
  inline_message_id: z.string().default(''),
};

const editMessageTextParametersSchema = z.strictObject({
  ...editedMessageParametersShape,
  text: z.string().default(''),
  parse_mode: z.string().optional(),
  entities: messageEntitiesParameter().optional(),
  ...linkPreviewParametersShape,
  reply_markup: inlineKeyboardMarkupParameter().optional(),
});

const editMessageCaptionParametersSchema = z.strictObject({
  ...editedMessageParametersShape,
  ...captionParametersShape,
  show_caption_above_media: booleanParameter().default(false),
  reply_markup: inlineKeyboardMarkupParameter().optional(),
});

const editMessageReplyMarkupParametersSchema = z.strictObject({
  ...editedMessageParametersShape,
  reply_markup: inlineKeyboardMarkupParameter().optional(),
});

const deleteMessageParametersSchema = z.strictObject({
  chat_id: integerParameter(z.int()).optional(),
  message_id: integerParameter(z.int()).optional(),
});

// Telegram also accepts message identifiers written as strings; rejecting them instead surfaces
// the bot's mistake in tests.
const deleteMessagesParametersSchema = z.strictObject({
  chat_id: integerParameter(z.int()).optional(),
  message_ids: jsonParameter(z.array(z.int())).optional(),
});

// Telegram answers with a URL only for game buttons and bot links, neither of which the emulator
// supports, so `url` is rejected as unsupported.
const answerCallbackQueryParametersSchema = z.strictObject({
  callback_query_id: z.string().default(''),
  text: z.string().max(MAX_CALLBACK_QUERY_ANSWER_TEXT_LENGTH).optional(),
  show_alert: booleanParameter().default(false),
  cache_time: integerParameter(z.int().min(0).max(MAX_CALLBACK_QUERY_ANSWER_CACHE_TIME_SECONDS))
    .default(0),
});

// `switch_pm_text` and `switch_pm_parameter` are the older form of a `button` that opens the bot's
// private chat, which Telegram still accepts.
const answerInlineQueryParametersSchema = z.strictObject({
  inline_query_id: z.string().default(''),
  results: jsonParameter(z.array(z.unknown())).optional(),
  cache_time: integerParameter(
    z.int().transform((cacheTimeSeconds) =>
      Math.min(Math.max(cacheTimeSeconds, 0), MAX_INLINE_QUERY_CACHE_TIME_SECONDS)
    ),
  ).default(DEFAULT_INLINE_QUERY_CACHE_TIME_SECONDS),
  is_personal: booleanParameter().default(false),
  next_offset: z.string().default(''),
  button: inlineQueryResultsButtonParameter().optional(),
  switch_pm_text: z.string().default(''),
  switch_pm_parameter: z.string().default(''),
});

const leaveChatParametersSchema = z.strictObject({
  chat_id: integerParameter(z.int()).optional(),
});

// Topics and business connections are not supported.
const sendChatActionParametersSchema = z.strictObject({
  chat_id: integerParameter(z.int()).optional(),
  action: z.string().default(''),
});

// Telegram treats a missing commands parameter as an empty list, which deletes the list.
const setMyCommandsParametersSchema = z.strictObject({
  commands: botCommandsParameter().default([]),
  scope: botCommandScopeParameter().optional(),
  language_code: z.string().default(''),
});

/** Parameters of getMyCommands and deleteMyCommands, which address one command list. */
const myCommandsTargetParametersSchema = z.strictObject({
  scope: botCommandScopeParameter().optional(),
  language_code: z.string().default(''),
});

const getChatMemberParametersSchema = z.strictObject({
  chat_id: integerParameter(z.int()).optional(),
  user_id: integerParameter(z.int()).optional(),
});

const getChatAdministratorsParametersSchema = z.strictObject({
  chat_id: integerParameter(z.int()).optional(),
  return_bots: booleanParameter().default(false),
});

const getChatMemberCountParametersSchema = z.strictObject({
  chat_id: integerParameter(z.int()).optional(),
});

// Telegram always revokes a removed member's access to a supergroup's messages, and the emulator
// shows no member a history it cannot read, so `revoke_messages` is validated and ignored.
const banChatMemberParametersSchema = z.strictObject({
  chat_id: integerParameter(z.int()).optional(),
  user_id: integerParameter(z.int()).optional(),
  until_date: integerParameter(z.int()).optional(),
  revoke_messages: booleanParameter().optional(),
});

const unbanChatMemberParametersSchema = z.strictObject({
  chat_id: integerParameter(z.int()).optional(),
  user_id: integerParameter(z.int()).optional(),
  only_if_banned: booleanParameter().default(false),
});

const getFileParametersSchema = z.strictObject({
  file_id: z.string().default(''),
});

const getUpdatesParametersSchema = z.strictObject({
  offset: integerParameter(z.int()).optional(),
  limit: integerParameter(z.int().min(1).max(100)).default(100),
  timeout: integerParameter(z.int().min(0).max(50)).default(0),
  // Telegram ignores a malformed value and keeps the current subscription; rejecting it instead
  // surfaces the bot's mistake in tests.
  allowed_updates: jsonParameter(z.array(z.string())).optional(),
});

type BotApiRouteVariables = SessionRouteContextTypes['Variables'] & {
  /** The bot whose token authenticated the request; set before any Bot API method runs. */
  readonly authenticatedBot: VirtualBotProfile;
};

interface BotApiRouteContextTypes {
  readonly Variables: BotApiRouteVariables;
}

/** The outcome of any edit method; each fails for a subset of the reasons. */
type MessageEditResult =
  | ReturnType<EmulationSession['botApi']['editMessageText']>
  | ReturnType<EmulationSession['botApi']['editMessageCaption']>;

type SendResult = ReturnType<EmulationSession['botApi']['sendMessage']>;

type SendFailure = Extract<SendResult, { readonly sent: false }>;

/** The messages that `forwardMessages` or `copyMessages` repeats, and the chat they go to. */
type RepeatMessagesRequest = Parameters<EmulationSession['botApi']['forwardMessages']>[1];

type RepeatMessagesResult =
  | ReturnType<EmulationSession['botApi']['forwardMessages']>
  | ReturnType<EmulationSession['botApi']['copyMessages']>;

/** The outcome of any edit method for an inline message; each fails for a subset of the reasons. */
type InlineMessageEditResult =
  | ReturnType<EmulationSession['botApi']['editInlineMessageText']>
  | ReturnType<EmulationSession['botApi']['editInlineMessageCaption']>;

type InlineQueryResultRequest = Parameters<
  EmulationSession['botApi']['answerInlineQuery']
>[1]['results'][number];

/** Formatted text as a bot specified it, the result of reading its parse mode or entities. */
type SpecifiedFormattedText = Extract<
  FormattedTextReadingResult,
  { readonly read: true }
>['formattedText'];

/** Removes properties from each member of a union, which keeps the union's alternatives apart. */
type OmitFromEach<Type, Key extends PropertyKey> = Type extends unknown ? Omit<Type, Key> : never;

/** Where and how a send method sends its message, which every send method takes alike. */
type SendRequestOptions = OmitFromEach<
  Parameters<EmulationSession['botApi']['sendMessage']>[1],
  'text' | 'entities'
>;

type SendOptionsParameters = z.infer<z.ZodObject<typeof sendOptionsParametersShape>>;

type MyCommandsTarget = Parameters<EmulationSession['botApi']['getMyCommands']>[1];

/** Why a request about a chat's members, or a moderation of them, can fail. */
type ChatMemberFailureReason =
  | Extract<
    ReturnType<EmulationSession['botApi']['getChatMember']>,
    { readonly found: false }
  >['reason']
  | Extract<
    ReturnType<EmulationSession['botApi']['getChatAdministrators']>,
    { readonly found: false }
  >['reason']
  | Extract<
    ReturnType<EmulationSession['botApi']['banChatMember']>,
    { readonly banned: false }
  >['reason']
  | Extract<
    ReturnType<EmulationSession['botApi']['unbanChatMember']>,
    { readonly unbanned: false }
  >['reason'];

type MyCommandsTargetFailureReason = Extract<
  ReturnType<EmulationSession['botApi']['getMyCommands']>,
  { readonly found: false }
>['reason'];

type FormattedTextReadingResult = ReturnType<EmulationSession['botApi']['readFormattedText']>;

/** Message text with the entities its bot specified, or the error answer for reading it. */
type SpecifiedFormattedTextReading =
  | Extract<FormattedTextReadingResult, { readonly read: true }>
  | { readonly read: false; readonly errorAnswer: BotApiMethodAnswer };

/** Text with the entities its bot specified, or Telegram's description of why it is unreadable. */
type FormattedTextParametersReading =
  | Extract<FormattedTextReadingResult, { readonly read: true }>
  | { readonly read: false; readonly description: string };

/** Where an edit method finds the message it edits, or the error answer for its parameters. */
type EditedMessageTargetReading =
  | {
    readonly read: true;
    readonly target:
      | { readonly kind: 'chat_message'; readonly chatId: number; readonly messageId: number }
      | { readonly kind: 'inline_message'; readonly inlineMessageId: string };
  }
  | { readonly read: false; readonly errorAnswer: BotApiMethodAnswer };

export type BotApiMethodHandler = (
  context: BotApiMethodContext,
  parameters: BotApiRequestParameters,
  uploadedFiles: BotApiUploadedFiles,
) => BotApiMethodAnswer | Promise<BotApiMethodAnswer>;

/** Keyed by lowercase name, because Telegram matches method names case-insensitively. */
const BOT_API_METHOD_HANDLERS_BY_LOWERCASE_NAME = new Map<string, BotApiMethodHandler>([
  ['answercallbackquery', handleAnswerCallbackQuery],
  ['answerinlinequery', handleAnswerInlineQuery],
  ['banchatmember', handleBanChatMember],
  ['copymessage', handleCopyMessage],
  ['copymessages', handleCopyMessages],
  ['deletemessage', handleDeleteMessage],
  ['deletemessages', handleDeleteMessages],
  ['deletemycommands', handleDeleteMyCommands],
  ['deletewebhook', handleDeleteWebhook],
  ['editmessagecaption', handleEditMessageCaption],
  ['editmessagereplymarkup', handleEditMessageReplyMarkup],
  ['editmessagetext', handleEditMessageText],
  ['forwardmessage', handleForwardMessage],
  ['forwardmessages', handleForwardMessages],
  ['getchatadministrators', handleGetChatAdministrators],
  ['getchatmember', handleGetChatMember],
  ['getchatmembercount', handleGetChatMemberCount],
  // Telegram's older name for getChatMemberCount.
  ['getchatmemberscount', handleGetChatMemberCount],
  ['getfile', handleGetFile],
  ['getme', handleGetMe],
  ['getmycommands', handleGetMyCommands],
  ['getupdates', handleGetUpdates],
  ['getwebhookinfo', handleGetWebhookInfo],
  // Telegram's older name for banChatMember.
  ['kickchatmember', handleBanChatMember],
  ['leavechat', handleLeaveChat],
  ['sendchataction', handleSendChatAction],
  ['senddocument', handleSendDocument],
  ['sendmessage', handleSendMessage],
  ['sendphoto', handleSendPhoto],
  ['setmycommands', handleSetMyCommands],
  ['setwebhook', handleSetWebhook],
  ['unbanchatmember', handleUnbanChatMember],
]);

/** Finds a Bot API method by name, which Telegram matches case-insensitively. */
export function findBotApiMethodHandler(methodName: string): BotApiMethodHandler | undefined {
  return BOT_API_METHOD_HANDLERS_BY_LOWERCASE_NAME.get(methodName.toLowerCase());
}

export function createBotApiRoutes(): Hono<BotApiRouteContextTypes> {
  const botApiRoutes = new Hono<BotApiRouteContextTypes>();

  // Telegram answers a download with an unknown token or path as not found.
  botApiRoutes.get(BOT_FILE_DOWNLOAD_PATH, (context) => {
    const botTokenPathSegment = context.req.param(BOT_TOKEN_PATH_PARAMETER);
    const { botApi } = context.get('emulationSession');
    const authenticatedBot = botApi.authenticate(
      botTokenPathSegment.slice(BOT_TOKEN_PATH_PREFIX.length),
    );
    const file = authenticatedBot === undefined
      ? undefined
      : botApi.downloadFile(authenticatedBot, context.req.param(FILE_PATH_PARAMETER));
    return file === undefined
      ? botApiResponse(context, botApiError(404, 'Not Found'))
      : fileDownloadResponse(context, file);
  });

  // Telegram rejects a path without a method segment before it checks the token.
  botApiRoutes.all(
    BOT_TOKEN_PATH,
    (context) => botApiResponse(context, botApiError(404, 'Not Found')),
  );

  // Telegram rejects an invalid token before it resolves the method or validates parameters.
  botApiRoutes.use(BOT_API_SUBRESOURCE_PATH, async (context, next) => {
    const botTokenPathSegment = context.req.param(BOT_TOKEN_PATH_PARAMETER);
    const token = botTokenPathSegment.slice(BOT_TOKEN_PATH_PREFIX.length);
    const authenticatedBot = context.get('emulationSession').botApi.authenticate(token);
    if (authenticatedBot === undefined) {
      return botApiResponse(context, botApiError(401, 'Unauthorized'));
    }

    context.set('authenticatedBot', authenticatedBot);
    await next();
  });

  // Telegram accepts both HTTP methods for every Bot API method.
  botApiRoutes.on(['GET', 'POST'], BOT_API_METHOD_PATH, async (context) => {
    const methodHandler = findBotApiMethodHandler(
      context.req.param(BOT_API_METHOD_NAME_PARAMETER),
    );
    if (methodHandler === undefined) {
      return botApiResponse(context, botApiError(404, 'Not Found: method not found'));
    }

    const parametersDecoding = await decodeBotApiRequestParameters(context.req.raw);
    if (!parametersDecoding.decoded) {
      return botApiResponse(context, botApiError(400, parametersDecoding.description));
    }
    const methodContext: BotApiMethodContext = {
      session: context.get('emulationSession'),
      bot: context.get('authenticatedBot'),
      signal: context.req.raw.signal,
    };
    return botApiResponse(
      context,
      await methodHandler(
        methodContext,
        parametersDecoding.parameters,
        parametersDecoding.uploadedFiles,
      ),
    );
  });

  // Telegram answers every other path in its Bot API namespace with a Bot API error.
  botApiRoutes.all('*', (context) => botApiResponse(context, botApiError(404, 'Not Found')));

  return botApiRoutes;
}

function handleGetMe(
  context: BotApiMethodContext,
  parameters: BotApiRequestParameters,
): BotApiMethodAnswer {
  if (!getMeParametersSchema.safeParse(parameters).success) {
    return botApiError(400, 'Bad Request: invalid getMe parameters');
  }
  return botApiResult(context.bot);
}

async function handleGetUpdates(
  context: BotApiMethodContext,
  parameters: BotApiRequestParameters,
): Promise<BotApiMethodAnswer> {
  const parsedParameters = getUpdatesParametersSchema.safeParse(parameters);
  if (!parsedParameters.success) {
    return botApiError(400, 'Bad Request: invalid getUpdates parameters');
  }

  const result = await context.session.botApi.getUpdates(
    context.bot,
    {
      offset: parsedParameters.data.offset,
      limit: parsedParameters.data.limit,
      timeoutSeconds: parsedParameters.data.timeout,
      allowedUpdates: parsedParameters.data.allowed_updates,
      signal: context.signal,
    },
  );
  if (!result.retrieved) {
    // Telegram delays a conflict by 3 seconds when another occurred within the previous 3
    // seconds; the emulator answers immediately to keep tests fast.
    const { reason } = result;
    switch (reason) {
      case 'terminated_by_other_long_poll':
        return botApiError(409, TERMINATED_BY_OTHER_LONG_POLL_DESCRIPTION);
      case 'terminated_by_webhook':
        return botApiError(409, TERMINATED_BY_WEBHOOK_DESCRIPTION);
      case 'webhook_active':
        return botApiError(409, WEBHOOK_ACTIVE_DESCRIPTION);
      default: {
        const unhandledReason: never = reason;
        throw new Error(`Unhandled getUpdates failure: ${unhandledReason}`);
      }
    }
  }
  return botApiResult(result.updates);
}

function handleSetWebhook(
  context: BotApiMethodContext,
  parameters: BotApiRequestParameters,
  uploadedFiles: BotApiUploadedFiles,
): BotApiMethodAnswer {
  const parsedParameters = setWebhookParametersSchema.safeParse(parameters);
  if (!parsedParameters.success) {
    return botApiError(400, 'Bad Request: invalid setWebhook parameters');
  }
  const { data } = parsedParameters;
  if (data.ip_address.length > 0) {
    return botApiError(400, WEBHOOK_IP_ADDRESS_UNSUPPORTED_DESCRIPTION);
  }
  // Telegram reads the certificate from a part of that name or through `attach://`.
  const specifiesCertificate = (data.certificate !== undefined && data.certificate.length > 0) ||
    uploadedFiles.has('certificate');
  if (specifiesCertificate) {
    return botApiError(400, WEBHOOK_CERTIFICATE_UNSUPPORTED_DESCRIPTION);
  }

  const result = context.session.botApi.setWebhook(
    context.bot,
    {
      url: data.url,
      secretToken: data.secret_token,
      maxConnections: data.max_connections,
      allowedUpdates: data.allowed_updates,
      dropPendingUpdates: data.drop_pending_updates,
    },
  );
  if (!result.accepted) {
    return botApiError(400, SET_WEBHOOK_REJECTION_DESCRIPTIONS[result.reason]);
  }
  return botApiResult(true, SET_WEBHOOK_OUTCOME_DESCRIPTIONS[result.outcome]);
}

function handleGetWebhookInfo(
  context: BotApiMethodContext,
  parameters: BotApiRequestParameters,
): BotApiMethodAnswer {
  if (!getWebhookInfoParametersSchema.safeParse(parameters).success) {
    return botApiError(400, 'Bad Request: invalid getWebhookInfo parameters');
  }
  return botApiResult(context.session.botApi.getWebhookInfo(context.bot));
}

function handleDeleteWebhook(
  context: BotApiMethodContext,
  parameters: BotApiRequestParameters,
): BotApiMethodAnswer {
  const parsedParameters = deleteWebhookParametersSchema.safeParse(parameters);
  if (!parsedParameters.success) {
    return botApiError(400, 'Bad Request: invalid deleteWebhook parameters');
  }

  const outcome = context.session.botApi.deleteWebhook(
    context.bot,
    { dropPendingUpdates: parsedParameters.data.drop_pending_updates },
  );
  return botApiResult(true, SET_WEBHOOK_OUTCOME_DESCRIPTIONS[outcome]);
}

function handleSendMessage(
  context: BotApiMethodContext,
  parameters: BotApiRequestParameters,
): BotApiMethodAnswer {
  const invalidParametersDescription = 'Bad Request: invalid sendMessage parameters';
  const parsedParameters = sendMessageParametersSchema.safeParse(parameters);
  if (!parsedParameters.success) {
    return botApiError(400, invalidParametersDescription);
  }
  const { text, parse_mode: parseMode, entities } = parsedParameters.data;
  // Telegram reads the text and its formatting before it looks at the chat.
  const formattedTextReading = readSpecifiedFormattedText(
    context,
    { text, parseMode, entities },
    invalidParametersDescription,
  );
  if (!formattedTextReading.read) {
    return formattedTextReading.errorAnswer;
  }
  const optionsReading = readSendOptions(parsedParameters.data);
  if (!optionsReading.read) {
    return optionsReading.errorAnswer;
  }

  return sendMethodAnswer(context.session.botApi.sendMessage(context.bot, {
    ...optionsReading.options,
    ...formattedTextReading.formattedText,
  }));
}

function handleSendPhoto(
  context: BotApiMethodContext,
  parameters: BotApiRequestParameters,
  uploadedFiles: BotApiUploadedFiles,
): BotApiMethodAnswer {
  const invalidParametersDescription = 'Bad Request: invalid sendPhoto parameters';
  const parsedParameters = sendPhotoParametersSchema.safeParse(parameters);
  if (!parsedParameters.success) {
    return botApiError(400, invalidParametersDescription);
  }
  const { data } = parsedParameters;
  // Telegram reads the file, then the caption and its formatting, before it looks at the chat.
  const photoReading = readInputFileParameter('photo', data.photo, uploadedFiles);
  if (!photoReading.read) {
    return inputFileError(photoReading.reason, 'photo');
  }
  const captionReading = readSpecifiedCaption(context, data, invalidParametersDescription);
  if (!captionReading.read) {
    return captionReading.errorAnswer;
  }
  const optionsReading = readSendOptions(data);
  if (!optionsReading.read) {
    return optionsReading.errorAnswer;
  }

  return sendMethodAnswer(context.session.botApi.sendPhoto(context.bot, {
    ...optionsReading.options,
    photo: photoReading.inputFile,
    caption: captionReading.formattedText,
    hasSpoiler: data.has_spoiler,
    showsCaptionAboveMedia: data.show_caption_above_media,
  }));
}

function handleSendDocument(
  context: BotApiMethodContext,
  parameters: BotApiRequestParameters,
  uploadedFiles: BotApiUploadedFiles,
): BotApiMethodAnswer {
  const invalidParametersDescription = 'Bad Request: invalid sendDocument parameters';
  const parsedParameters = sendDocumentParametersSchema.safeParse(parameters);
  if (!parsedParameters.success) {
    return botApiError(400, invalidParametersDescription);
  }
  const { data } = parsedParameters;
  // Telegram reads the file, then the caption and its formatting, before it looks at the chat.
  const documentReading = readInputFileParameter('document', data.document, uploadedFiles);
  if (!documentReading.read) {
    return inputFileError(documentReading.reason, 'document');
  }
  const captionReading = readSpecifiedCaption(context, data, invalidParametersDescription);
  if (!captionReading.read) {
    return captionReading.errorAnswer;
  }
  const optionsReading = readSendOptions(data);
  if (!optionsReading.read) {
    return optionsReading.errorAnswer;
  }

  return sendMethodAnswer(context.session.botApi.sendDocument(context.bot, {
    ...optionsReading.options,
    document: documentReading.inputFile,
    caption: captionReading.formattedText,
  }));
}

function handleForwardMessage(
  context: BotApiMethodContext,
  parameters: BotApiRequestParameters,
): BotApiMethodAnswer {
  const parsedParameters = forwardMessageParametersSchema.safeParse(parameters);
  if (!parsedParameters.success) {
    return botApiError(400, 'Bad Request: invalid forwardMessage parameters');
  }
  const {
    chat_id: chatId,
    from_chat_id: fromChatId,
    message_id: messageId,
    protect_content: isContentProtected,
    message_effect_id: messageEffectId,
  } = parsedParameters.data;
  if (fromChatId === undefined) {
    return botApiError(400, FROM_CHAT_ID_REQUIRED_DESCRIPTION);
  }
  // Telegram looks for the forwarded message before it looks at chat_id; the emulator reports a
  // missing chat_id first.
  if (chatId === undefined) {
    return botApiError(400, CHAT_ID_EMPTY_DESCRIPTION);
  }

  const result = context.session.botApi.forwardMessage(
    context.bot,
    {
      chatId,
      forwardedMessage: { chatId: fromChatId, messageId: messageIdOrNone(messageId) },
      isContentProtected,
      messageEffectId,
    },
  );
  if (result.sent) {
    return sendMethodAnswer(result);
  }
  switch (result.reason) {
    case 'repeated_message_not_found':
      return botApiError(400, MESSAGE_TO_FORWARD_NOT_FOUND_DESCRIPTION);
    case 'message_not_forwardable':
      return botApiError(400, MESSAGE_NOT_FORWARDABLE_DESCRIPTION);
    default:
      return sendMethodAnswer(result);
  }
}

function handleCopyMessage(
  context: BotApiMethodContext,
  parameters: BotApiRequestParameters,
): BotApiMethodAnswer {
  const invalidParametersDescription = 'Bad Request: invalid copyMessage parameters';
  const parsedParameters = copyMessageParametersSchema.safeParse(parameters);
  if (!parsedParameters.success) {
    return botApiError(400, invalidParametersDescription);
  }
  const { data } = parsedParameters;
  if (data.from_chat_id === undefined) {
    return botApiError(400, FROM_CHAT_ID_REQUIRED_DESCRIPTION);
  }
  // Telegram reads a new caption and its formatting before it looks at either chat.
  const { caption } = data;
  const captionReading = caption === undefined
    ? undefined
    : readSpecifiedCaption(context, { ...data, caption }, invalidParametersDescription);
  if (captionReading?.read === false) {
    return captionReading.errorAnswer;
  }
  // As for forwardMessage, the emulator reports a missing chat_id before the copied message.
  const optionsReading = readSendOptions(data);
  if (!optionsReading.read) {
    return optionsReading.errorAnswer;
  }

  const result = context.session.botApi.copyMessage(
    context.bot,
    {
      ...optionsReading.options,
      copiedMessage: { chatId: data.from_chat_id, messageId: messageIdOrNone(data.message_id) },
      caption: captionReading?.formattedText,
      showsCaptionAboveMedia: data.show_caption_above_media,
    },
  );
  if (result.sent) {
    return botApiResult({ message_id: result.messageId });
  }
  switch (result.reason) {
    case 'repeated_message_not_found':
      return botApiError(400, MESSAGE_TO_COPY_NOT_FOUND_DESCRIPTION);
    case 'message_not_copyable':
      return botApiError(400, MESSAGE_NOT_COPYABLE_DESCRIPTION);
    default:
      return sendMethodAnswer(result);
  }
}

function handleForwardMessages(
  context: BotApiMethodContext,
  parameters: BotApiRequestParameters,
): BotApiMethodAnswer {
  const parsedParameters = forwardMessagesParametersSchema.safeParse(parameters);
  if (!parsedParameters.success) {
    return botApiError(400, 'Bad Request: invalid forwardMessages parameters');
  }
  const reading = readRepeatMessagesRequest(parsedParameters.data);
  if (!reading.read) {
    return reading.errorAnswer;
  }
  return repeatMessagesAnswer(context.session.botApi.forwardMessages(context.bot, reading.request));
}

function handleCopyMessages(
  context: BotApiMethodContext,
  parameters: BotApiRequestParameters,
): BotApiMethodAnswer {
  const parsedParameters = copyMessagesParametersSchema.safeParse(parameters);
  if (!parsedParameters.success) {
    return botApiError(400, 'Bad Request: invalid copyMessages parameters');
  }
  const reading = readRepeatMessagesRequest(parsedParameters.data);
  if (!reading.read) {
    return reading.errorAnswer;
  }
  return repeatMessagesAnswer(
    context.session.botApi.copyMessages(context.bot, {
      ...reading.request,
      removesCaptions: parsedParameters.data.remove_caption,
    }),
  );
}

/**
 * Reads the messages that `forwardMessages` or `copyMessages` repeats and where to, checking them
 * in the order the official Bot API server does.
 */
function readRepeatMessagesRequest(
  parameters: z.output<z.ZodObject<typeof repeatMessagesParametersShape>>,
):
  | { readonly read: true; readonly request: RepeatMessagesRequest }
  | { readonly read: false; readonly errorAnswer: BotApiMethodAnswer } {
  const {
    chat_id: chatId,
    from_chat_id: fromChatId,
    message_ids: messageIds,
    protect_content: isContentProtected,
    message_effect_id: messageEffectId,
  } = parameters;
  if (fromChatId === undefined) {
    return { read: false, errorAnswer: botApiError(400, FROM_CHAT_ID_REQUIRED_DESCRIPTION) };
  }
  if (messageIds === undefined || messageIds.length === 0) {
    return {
      read: false,
      errorAnswer: botApiError(400, MESSAGE_IDENTIFIERS_NOT_SPECIFIED_DESCRIPTION),
    };
  }
  if (messageIds.length > MAX_REPEATED_MESSAGES_COUNT) {
    return { read: false, errorAnswer: botApiError(400, TOO_MANY_MESSAGE_IDENTIFIERS_DESCRIPTION) };
  }
  if (messageIds.some((messageId) => messageId <= 0)) {
    return { read: false, errorAnswer: botApiError(400, INVALID_MESSAGE_IDENTIFIER_DESCRIPTION) };
  }
  if (chatId === undefined) {
    return { read: false, errorAnswer: botApiError(400, CHAT_ID_EMPTY_DESCRIPTION) };
  }
  return {
    read: true,
    request: { chatId, fromChatId, messageIds, isContentProtected, messageEffectId },
  };
}

function repeatMessagesAnswer(result: RepeatMessagesResult): BotApiMethodAnswer {
  if (result.sent) {
    return botApiResult(result.messageIds.map((messageId) => ({ message_id: messageId })));
  }
  switch (result.reason) {
    case 'repeated_messages_not_found':
      return botApiError(400, NO_MESSAGES_TO_FORWARD_DESCRIPTION);
    case 'message_effect_not_allowed_for_several_messages':
      return botApiError(400, MESSAGE_EFFECT_NOT_ALLOWED_IN_METHOD_DESCRIPTION);
    case 'repeated_message_ids_not_increasing':
      return botApiError(400, MESSAGE_IDS_NOT_INCREASING_DESCRIPTION);
    case 'messages_not_repeatable':
      return botApiError(400, MESSAGES_NOT_FORWARDABLE_DESCRIPTION);
    default:
      return sendMethodAnswer(result);
  }
}

/**
 * Reads where and how a send method sends its message. As the official Bot API server's
 * `check_reply_parameters` does, a reply naming the chat the message is sent to replies in that
 * chat.
 */
function readSendOptions(parameters: SendOptionsParameters):
  | { readonly read: true; readonly options: SendRequestOptions }
  | { readonly read: false; readonly errorAnswer: BotApiMethodAnswer } {
  const {
    chat_id: chatId,
    protect_content: isContentProtected,
    message_effect_id: messageEffectId,
    reply_markup: replyMarkup,
  } = parameters;
  if (chatId === undefined) {
    return { read: false, errorAnswer: botApiError(400, CHAT_ID_EMPTY_DESCRIPTION) };
  }
  const replyTarget = selectSpecifiedReplyTarget(parameters);
  return {
    read: true,
    options: {
      ...replyMarkup,
      chatId,
      replyTo: replyTarget === undefined ? undefined : {
        messageId: replyTarget.messageId,
        ...(replyTarget.chatId === undefined || replyTarget.chatId === chatId
          ? {}
          : { chatId: replyTarget.chatId }),
        allowSendingWithoutReply: replyTarget.allowSendingWithoutReply,
      },
      isContentProtected,
      messageEffectId,
    },
  };
}

/** The error for a file parameter that names no uploaded file or holds a URL. */
function inputFileError(
  reason: 'file_missing' | 'url_unsupported',
  parameterName: 'photo' | 'document',
): BotApiMethodAnswer {
  return reason === 'file_missing'
    ? botApiError(400, `Bad Request: there is no ${parameterName} in the request`)
    : botApiError(400, FILE_URL_UNSUPPORTED_DESCRIPTION);
}

function sendMethodAnswer(result: SendResult | SendFailure): BotApiMethodAnswer {
  if (result.sent) {
    return botApiResult(result.message);
  }
  switch (result.reason) {
    case 'message_text_empty':
      return botApiError(400, MESSAGE_TEXT_EMPTY_DESCRIPTION);
    case 'text_invalid':
      return botApiError(400, badRequestDescription(result.textError));
    case 'chat_not_found':
      return botApiError(400, CHAT_NOT_FOUND_DESCRIPTION);
    case 'bot_not_a_member':
      return botApiError(403, BOT_NOT_SUPERGROUP_MEMBER_DESCRIPTION);
    case 'bot_kicked':
      return botApiError(403, BOT_KICKED_FROM_SUPERGROUP_DESCRIPTION);
    case 'reply_message_not_found':
      return botApiError(400, REPLY_MESSAGE_NOT_FOUND_DESCRIPTION);
    case 'message_effect_not_allowed_in_chat':
      return botApiError(400, MESSAGE_EFFECT_NOT_ALLOWED_IN_CHAT_DESCRIPTION);
    case 'message_text_too_long':
      return botApiError(400, MESSAGE_TEXT_TOO_LONG_DESCRIPTION);
    case 'caption_too_long':
      return botApiError(400, CAPTION_TOO_LONG_DESCRIPTION);
    case 'callback_data_invalid':
      return botApiError(400, BUTTON_DATA_INVALID_DESCRIPTION);
    case 'bot_blocked':
      return botApiError(403, BOT_BLOCKED_DESCRIPTION);
    case 'reply_interface_unsupported_in_groups':
      return botApiError(400, GROUP_REPLY_INTERFACE_UNSUPPORTED_DESCRIPTION);
    case 'file_empty':
      return botApiError(400, FILE_EMPTY_DESCRIPTION);
    case 'image_invalid':
      return botApiError(400, IMAGE_INVALID_DESCRIPTION);
    case 'photo_dimensions_invalid':
      return botApiError(400, PHOTO_DIMENSIONS_INVALID_DESCRIPTION);
    case 'file_id_invalid':
      return botApiError(400, FILE_ID_INVALID_DESCRIPTION);
    case 'file_type_mismatch':
      return botApiError(
        400,
        `Bad Request: can't use file of type ${TDLIB_FILE_TYPE_NAMES[result.actualFileType]} as ${
          TDLIB_FILE_TYPE_NAMES[result.expectedFileType]
        }`,
      );
    default: {
      const unhandledFailure: never = result;
      throw new Error(`Unhandled send failure: ${JSON.stringify(unhandledFailure)}`);
    }
  }
}

function handleEditMessageText(
  context: BotApiMethodContext,
  parameters: BotApiRequestParameters,
): BotApiMethodAnswer {
  const invalidParametersDescription = 'Bad Request: invalid editMessageText parameters';
  const parsedParameters = editMessageTextParametersSchema.safeParse(parameters);
  if (!parsedParameters.success) {
    return botApiError(400, invalidParametersDescription);
  }
  const { text, parse_mode: parseMode, entities, reply_markup: inlineKeyboard } =
    parsedParameters.data;
  // Telegram reads the text and its formatting before it looks for the message.
  const formattedTextReading = readSpecifiedFormattedText(
    context,
    { text, parseMode, entities },
    invalidParametersDescription,
  );
  if (!formattedTextReading.read) {
    return formattedTextReading.errorAnswer;
  }
  const targetReading = readEditedMessageTarget(parsedParameters.data);
  if (!targetReading.read) {
    return targetReading.errorAnswer;
  }

  const { target } = targetReading;
  const { botApi } = context.session;
  const edit = { ...formattedTextReading.formattedText, inlineKeyboard };
  return target.kind === 'inline_message'
    ? inlineMessageEditAnswer(botApi.editInlineMessageText(context.bot, { ...target, ...edit }))
    : editMessageAnswer(botApi.editMessageText(context.bot, { ...target, ...edit }));
}

function handleEditMessageCaption(
  context: BotApiMethodContext,
  parameters: BotApiRequestParameters,
): BotApiMethodAnswer {
  const invalidParametersDescription = 'Bad Request: invalid editMessageCaption parameters';
  const parsedParameters = editMessageCaptionParametersSchema.safeParse(parameters);
  if (!parsedParameters.success) {
    return botApiError(400, invalidParametersDescription);
  }
  const { data } = parsedParameters;
  // Telegram reads the caption and its formatting before it looks for the message.
  const captionReading = readSpecifiedCaption(context, data, invalidParametersDescription);
  if (!captionReading.read) {
    return captionReading.errorAnswer;
  }
  const targetReading = readEditedMessageTarget(data);
  if (!targetReading.read) {
    return targetReading.errorAnswer;
  }

  const { target } = targetReading;
  const { botApi } = context.session;
  const edit = {
    caption: captionReading.formattedText,
    showsCaptionAboveMedia: data.show_caption_above_media,
    inlineKeyboard: data.reply_markup,
  };
  return target.kind === 'inline_message'
    ? inlineMessageEditAnswer(
      botApi.editInlineMessageCaption(context.bot, { ...target, ...edit }),
    )
    : editMessageAnswer(botApi.editMessageCaption(context.bot, { ...target, ...edit }));
}

function handleEditMessageReplyMarkup(
  context: BotApiMethodContext,
  parameters: BotApiRequestParameters,
): BotApiMethodAnswer {
  const parsedParameters = editMessageReplyMarkupParametersSchema.safeParse(parameters);
  if (!parsedParameters.success) {
    return botApiError(400, 'Bad Request: invalid editMessageReplyMarkup parameters');
  }
  const targetReading = readEditedMessageTarget(parsedParameters.data);
  if (!targetReading.read) {
    return targetReading.errorAnswer;
  }

  const { target } = targetReading;
  const { botApi } = context.session;
  const inlineKeyboard = parsedParameters.data.reply_markup;
  return target.kind === 'inline_message'
    ? inlineMessageEditAnswer(botApi.editInlineMessageReplyMarkup(context.bot, {
      ...target,
      inlineKeyboard,
    }))
    : editMessageAnswer(
      botApi.editMessageReplyMarkup(context.bot, { ...target, inlineKeyboard }),
    );
}

/**
 * Reads nonempty message text with its `parse_mode` or `entities`, answering Telegram's error for
 * text or formatting it cannot read.
 */
function readSpecifiedFormattedText(
  context: BotApiMethodContext,
  specifiedText: {
    readonly text: string;
    readonly parseMode: string | undefined;
    readonly entities: readonly unknown[] | undefined;
  },
  invalidParametersDescription: string,
): SpecifiedFormattedTextReading {
  if (specifiedText.text.length === 0) {
    return { read: false, errorAnswer: botApiError(400, MESSAGE_TEXT_EMPTY_DESCRIPTION) };
  }
  return withErrorAnswer(
    readFormattedTextParameters(context, specifiedText, invalidParametersDescription),
  );
}

/**
 * Reads a caption with its `parse_mode` or `caption_entities`, as message text is read; an empty
 * caption is none.
 */
function readSpecifiedCaption(
  context: BotApiMethodContext,
  { caption, parse_mode: parseMode, caption_entities: captionEntities }: {
    readonly caption: string;
    readonly parse_mode?: string;
    readonly caption_entities?: readonly unknown[];
  },
  invalidParametersDescription: string,
): SpecifiedFormattedTextReading {
  return withErrorAnswer(readFormattedTextParameters(
    context,
    { text: caption, parseMode, entities: captionEntities },
    invalidParametersDescription,
  ));
}

function withErrorAnswer(reading: FormattedTextParametersReading): SpecifiedFormattedTextReading {
  return reading.read
    ? reading
    : { read: false, errorAnswer: botApiError(400, reading.description) };
}

/**
 * Reads text with the parse mode or entities that format it, answering Telegram's error for text
 * or formatting it cannot read.
 *
 * Entities are decoded even alongside a parse mode, which makes Telegram ignore them, so malformed
 * entities are rejected in either case to surface the bot's mistake in tests.
 */
function readFormattedTextParameters(
  context: BotApiMethodContext,
  { text, parseMode, entities }: {
    readonly text: string;
    readonly parseMode: string | undefined;
    readonly entities: readonly unknown[] | undefined;
  },
  invalidParametersDescription: string,
): FormattedTextParametersReading {
  const failure = (description: string): FormattedTextParametersReading => ({
    read: false,
    description,
  });
  const entitiesReading = readMessageEntitiesParameter(
    entities ?? [],
    invalidParametersDescription,
  );
  if (!entitiesReading.read) {
    return failure(entitiesReading.description);
  }

  const result = context.session.botApi.readFormattedText({
    text,
    parseMode,
    entities: entitiesReading.entities,
  });
  if (result.read) {
    return result;
  }
  switch (result.reason) {
    case 'text_too_long':
      return failure(FORMATTED_TEXT_TOO_LONG_DESCRIPTION);
    case 'parse_mode_unsupported':
      return failure(PARSE_MODE_UNSUPPORTED_DESCRIPTION);
    case 'text_encoding_invalid':
      return failure(TEXT_ENCODING_INVALID_DESCRIPTION);
    case 'markup_invalid':
      return failure(`Bad Request: can't parse entities: ${result.markupError}`);
    default: {
      const unhandledFailure: never = result;
      throw new Error(`Unhandled text reading failure: ${JSON.stringify(unhandledFailure)}`);
    }
  }
}

/**
 * Reads where an edit method finds the message, as the official Bot API server does: an edit
 * without `chat_id` and without a positive `message_id` addresses an inline message by its
 * `inline_message_id`, which it reports missing as an unspecified message identifier.
 */
function readEditedMessageTarget(
  { chat_id: chatId, message_id: messageId, inline_message_id: inlineMessageId }: {
    readonly chat_id?: number;
    readonly message_id?: number;
    readonly inline_message_id: string;
  },
): EditedMessageTargetReading {
  if (chatId === undefined && messageIdOrNone(messageId) === NO_MESSAGE_ID) {
    return inlineMessageId.length === 0
      ? {
        read: false,
        errorAnswer: botApiError(400, MESSAGE_IDENTIFIER_NOT_SPECIFIED_DESCRIPTION),
      }
      : { read: true, target: { kind: 'inline_message', inlineMessageId } };
  }
  if (chatId === undefined) {
    return { read: false, errorAnswer: botApiError(400, CHAT_ID_EMPTY_DESCRIPTION) };
  }
  return {
    read: true,
    target: { kind: 'chat_message', chatId, messageId: messageIdOrNone(messageId) },
  };
}

function messageIdOrNone(messageId: number | undefined): number {
  return messageId === undefined || messageId <= 0 ? NO_MESSAGE_ID : messageId;
}

function editMessageAnswer(result: MessageEditResult): BotApiMethodAnswer {
  if (result.edited) {
    return botApiResult(result.message);
  }
  switch (result.reason) {
    case 'message_text_empty':
      return botApiError(400, MESSAGE_TEXT_EMPTY_DESCRIPTION);
    case 'text_invalid':
      return botApiError(400, badRequestDescription(result.textError));
    case 'chat_not_found':
      return botApiError(400, CHAT_NOT_FOUND_DESCRIPTION);
    case 'bot_not_a_member':
      return botApiError(403, BOT_NOT_SUPERGROUP_MEMBER_DESCRIPTION);
    case 'bot_kicked':
      return botApiError(403, BOT_KICKED_FROM_SUPERGROUP_DESCRIPTION);
    case 'message_not_found':
      return botApiError(400, MESSAGE_TO_EDIT_NOT_FOUND_DESCRIPTION);
    case 'message_not_editable':
      return botApiError(400, MESSAGE_NOT_EDITABLE_DESCRIPTION);
    case 'message_has_no_text':
      return botApiError(400, MESSAGE_HAS_NO_TEXT_DESCRIPTION);
    case 'message_has_no_caption':
      return botApiError(400, MESSAGE_HAS_NO_CAPTION_DESCRIPTION);
    case 'message_text_too_long':
      return botApiError(400, MESSAGE_TEXT_TOO_LONG_DESCRIPTION);
    case 'caption_too_long':
      return botApiError(400, CAPTION_TOO_LONG_DESCRIPTION);
    case 'callback_data_invalid':
      return botApiError(400, BUTTON_DATA_INVALID_DESCRIPTION);
    case 'message_not_modified':
      return botApiError(400, MESSAGE_NOT_MODIFIED_DESCRIPTION);
    default: {
      const unhandledFailure: never = result;
      throw new Error(`Unhandled message edit failure: ${JSON.stringify(unhandledFailure)}`);
    }
  }
}

/** Answers a successful edit of an inline message with `true`, as Telegram does. */
function inlineMessageEditAnswer(result: InlineMessageEditResult): BotApiMethodAnswer {
  if (result.edited) {
    return botApiResult(true);
  }
  switch (result.reason) {
    case 'inline_message_not_found':
      return botApiError(400, INLINE_MESSAGE_ID_INVALID_DESCRIPTION);
    case 'message_text_empty':
      return botApiError(400, MESSAGE_TEXT_EMPTY_DESCRIPTION);
    case 'text_invalid':
      return botApiError(400, badRequestDescription(result.textError));
    case 'message_has_no_text':
      return botApiError(400, MESSAGE_HAS_NO_TEXT_DESCRIPTION);
    case 'message_has_no_caption':
      return botApiError(400, MESSAGE_HAS_NO_CAPTION_DESCRIPTION);
    case 'message_text_too_long':
      return botApiError(400, MESSAGE_TEXT_TOO_LONG_DESCRIPTION);
    case 'caption_too_long':
      return botApiError(400, CAPTION_TOO_LONG_DESCRIPTION);
    case 'callback_data_invalid':
      return botApiError(400, BUTTON_DATA_INVALID_DESCRIPTION);
    case 'message_not_modified':
      return botApiError(400, MESSAGE_NOT_MODIFIED_DESCRIPTION);
    default: {
      const unhandledFailure: never = result;
      throw new Error(`Unhandled inline message edit failure: ${JSON.stringify(unhandledFailure)}`);
    }
  }
}

function handleDeleteMessage(
  context: BotApiMethodContext,
  parameters: BotApiRequestParameters,
): BotApiMethodAnswer {
  const parsedParameters = deleteMessageParametersSchema.safeParse(parameters);
  if (!parsedParameters.success) {
    return botApiError(400, 'Bad Request: invalid deleteMessage parameters');
  }
  const { chat_id: chatId, message_id: messageId } = parsedParameters.data;
  // Telegram looks at the chat before the message.
  if (chatId === undefined) {
    return botApiError(400, CHAT_ID_EMPTY_DESCRIPTION);
  }

  const result = context.session.botApi.deleteMessage(
    context.bot,
    { chatId, messageId: messageIdOrNone(messageId) },
  );
  if (result.deleted) {
    return botApiResult(true);
  }
  switch (result.reason) {
    case 'chat_not_found':
      return botApiError(400, CHAT_NOT_FOUND_DESCRIPTION);
    case 'bot_not_a_member':
      return botApiError(403, BOT_NOT_SUPERGROUP_MEMBER_DESCRIPTION);
    case 'bot_kicked':
      return botApiError(403, BOT_KICKED_FROM_SUPERGROUP_DESCRIPTION);
    case 'message_not_found':
      return botApiError(400, MESSAGE_TO_DELETE_NOT_FOUND_DESCRIPTION);
    case 'message_not_deletable':
      return botApiError(400, MESSAGE_NOT_DELETABLE_DESCRIPTION);
    default: {
      const unhandledReason: never = result.reason;
      throw new Error(`Unhandled deleteMessage failure: ${unhandledReason}`);
    }
  }
}

function handleDeleteMessages(
  context: BotApiMethodContext,
  parameters: BotApiRequestParameters,
): BotApiMethodAnswer {
  const parsedParameters = deleteMessagesParametersSchema.safeParse(parameters);
  if (!parsedParameters.success) {
    return botApiError(400, 'Bad Request: invalid deleteMessages parameters');
  }
  const { chat_id: chatId, message_ids: messageIds } = parsedParameters.data;
  // Telegram checks the message identifiers before it looks at the chat.
  if (messageIds === undefined) {
    return botApiError(400, MESSAGE_IDENTIFIERS_NOT_SPECIFIED_DESCRIPTION);
  }
  if (messageIds.length > MAX_DELETE_MESSAGES_COUNT) {
    return botApiError(400, TOO_MANY_MESSAGE_IDENTIFIERS_DESCRIPTION);
  }
  if (messageIds.some((messageId) => messageId <= 0)) {
    return botApiError(400, INVALID_MESSAGE_IDENTIFIER_DESCRIPTION);
  }
  if (chatId === undefined) {
    return botApiError(400, CHAT_ID_EMPTY_DESCRIPTION);
  }

  const result = context.session.botApi.deleteMessages(
    context.bot,
    { chatId, messageIds },
  );
  if (result.deleted) {
    return botApiResult(true);
  }
  switch (result.reason) {
    case 'chat_not_found':
      return botApiError(400, CHAT_NOT_FOUND_DESCRIPTION);
    case 'bot_not_a_member':
      return botApiError(403, BOT_NOT_SUPERGROUP_MEMBER_DESCRIPTION);
    case 'bot_kicked':
      return botApiError(403, BOT_KICKED_FROM_SUPERGROUP_DESCRIPTION);
    case 'message_not_deletable':
      return botApiError(400, MESSAGE_NOT_DELETABLE_DESCRIPTION);
    default: {
      const unhandledReason: never = result.reason;
      throw new Error(`Unhandled deleteMessages failure: ${unhandledReason}`);
    }
  }
}

function handleGetFile(
  context: BotApiMethodContext,
  parameters: BotApiRequestParameters,
): BotApiMethodAnswer {
  const parsedParameters = getFileParametersSchema.safeParse(parameters);
  if (!parsedParameters.success) {
    return botApiError(400, 'Bad Request: invalid getFile parameters');
  }
  const { file_id: fileId } = parsedParameters.data;
  if (fileId.length === 0) {
    return botApiError(400, FILE_ID_NOT_SPECIFIED_DESCRIPTION);
  }

  const result = context.session.botApi.getFile(
    context.bot,
    fileId,
  );
  if (result.found) {
    return botApiResult(result.file);
  }
  switch (result.reason) {
    case 'file_id_invalid':
      return botApiError(400, GET_FILE_ID_INVALID_DESCRIPTION);
    case 'file_too_big':
      return botApiError(400, FILE_TOO_BIG_DESCRIPTION);
    default: {
      const unhandledReason: never = result.reason;
      throw new Error(`Unhandled getFile failure: ${unhandledReason}`);
    }
  }
}

function handleAnswerCallbackQuery(
  context: BotApiMethodContext,
  parameters: BotApiRequestParameters,
): BotApiMethodAnswer {
  const parsedParameters = answerCallbackQueryParametersSchema.safeParse(parameters);
  if (!parsedParameters.success) {
    return botApiError(400, 'Bad Request: invalid answerCallbackQuery parameters');
  }

  const result = context.session.botApi.answerCallbackQuery(
    context.bot,
    {
      callbackQueryId: parsedParameters.data.callback_query_id,
      text: parsedParameters.data.text,
      showAlert: parsedParameters.data.show_alert,
      cacheTimeSeconds: parsedParameters.data.cache_time,
    },
  );
  if (!result.answered) {
    return botApiError(400, QUERY_ID_INVALID_DESCRIPTION);
  }
  return botApiResult(true);
}

function handleSendChatAction(
  context: BotApiMethodContext,
  parameters: BotApiRequestParameters,
): BotApiMethodAnswer {
  const parsedParameters = sendChatActionParametersSchema.safeParse(parameters);
  if (!parsedParameters.success) {
    return botApiError(400, 'Bad Request: invalid sendChatAction parameters');
  }
  const { chat_id: chatId, action: actionName } = parsedParameters.data;
  // Telegram reads the action before it looks at the chat.
  const action = CHAT_ACTIONS_BY_NAME.get(actionName.toLowerCase());
  if (action === undefined) {
    return botApiError(400, CHAT_ACTION_INVALID_DESCRIPTION);
  }
  if (chatId === undefined) {
    return botApiError(400, CHAT_ID_EMPTY_DESCRIPTION);
  }

  const result = context.session.botApi.sendChatAction(
    context.bot,
    { chatId, action },
  );
  if (result.sent) {
    return botApiResult(true);
  }
  switch (result.reason) {
    case 'chat_not_found':
      return botApiError(400, CHAT_NOT_FOUND_DESCRIPTION);
    case 'bot_not_a_member':
      return botApiError(403, BOT_NOT_SUPERGROUP_MEMBER_DESCRIPTION);
    case 'bot_kicked':
      return botApiError(403, BOT_KICKED_FROM_SUPERGROUP_DESCRIPTION);
    case 'bot_blocked':
      return botApiError(403, BOT_BLOCKED_DESCRIPTION);
    default: {
      const unhandledReason: never = result.reason;
      throw new Error(`Unhandled sendChatAction failure: ${unhandledReason}`);
    }
  }
}

function handleLeaveChat(
  context: BotApiMethodContext,
  parameters: BotApiRequestParameters,
): BotApiMethodAnswer {
  const parsedParameters = leaveChatParametersSchema.safeParse(parameters);
  if (!parsedParameters.success) {
    return botApiError(400, 'Bad Request: invalid leaveChat parameters');
  }
  const { chat_id: chatId } = parsedParameters.data;
  if (chatId === undefined) {
    return botApiError(400, CHAT_ID_EMPTY_DESCRIPTION);
  }

  const result = context.session.botApi.leaveChat(
    context.bot,
    { chatId },
  );
  if (result.left) {
    return botApiResult(true);
  }
  switch (result.reason) {
    case 'chat_not_found':
      return botApiError(400, CHAT_NOT_FOUND_DESCRIPTION);
    case 'bot_not_a_member':
      return botApiError(403, BOT_NOT_SUPERGROUP_MEMBER_DESCRIPTION);
    case 'bot_kicked':
      return botApiError(403, BOT_KICKED_FROM_SUPERGROUP_DESCRIPTION);
    case 'private_chat_not_leavable':
      return botApiError(400, badRequestDescription("Can't leave private chats"));
    default: {
      const unhandledReason: never = result.reason;
      throw new Error(`Unhandled leaveChat failure: ${unhandledReason}`);
    }
  }
}

function handleGetChatMember(
  context: BotApiMethodContext,
  parameters: BotApiRequestParameters,
): BotApiMethodAnswer {
  const parsedParameters = getChatMemberParametersSchema.safeParse(parameters);
  if (!parsedParameters.success) {
    return botApiError(400, 'Bad Request: invalid getChatMember parameters');
  }
  const targetReading = readChatMemberTarget(parsedParameters.data);
  if (!targetReading.read) {
    return targetReading.errorAnswer;
  }

  const result = context.session.botApi.getChatMember(
    context.bot,
    targetReading.target,
  );
  return result.found ? botApiResult(result.member) : chatMemberFailureAnswer(result.reason);
}

function handleGetChatAdministrators(
  context: BotApiMethodContext,
  parameters: BotApiRequestParameters,
): BotApiMethodAnswer {
  const parsedParameters = getChatAdministratorsParametersSchema.safeParse(parameters);
  if (!parsedParameters.success) {
    return botApiError(400, 'Bad Request: invalid getChatAdministrators parameters');
  }
  const { chat_id: chatId, return_bots: includesOtherBots } = parsedParameters.data;
  if (chatId === undefined) {
    return botApiError(400, CHAT_ID_EMPTY_DESCRIPTION);
  }

  const result = context.session.botApi.getChatAdministrators(
    context.bot,
    { chatId, includesOtherBots },
  );
  return result.found
    ? botApiResult(result.administrators)
    : chatMemberFailureAnswer(result.reason);
}

function handleGetChatMemberCount(
  context: BotApiMethodContext,
  parameters: BotApiRequestParameters,
): BotApiMethodAnswer {
  const parsedParameters = getChatMemberCountParametersSchema.safeParse(parameters);
  if (!parsedParameters.success) {
    return botApiError(400, 'Bad Request: invalid getChatMemberCount parameters');
  }
  const { chat_id: chatId } = parsedParameters.data;
  if (chatId === undefined) {
    return botApiError(400, CHAT_ID_EMPTY_DESCRIPTION);
  }

  const result = context.session.botApi.getChatMemberCount(
    context.bot,
    { chatId },
  );
  return result.found ? botApiResult(result.memberCount) : chatMemberFailureAnswer(result.reason);
}

function handleBanChatMember(
  context: BotApiMethodContext,
  parameters: BotApiRequestParameters,
): BotApiMethodAnswer {
  const parsedParameters = banChatMemberParametersSchema.safeParse(parameters);
  if (!parsedParameters.success) {
    return botApiError(400, 'Bad Request: invalid banChatMember parameters');
  }
  const targetReading = readChatMemberTarget(parsedParameters.data);
  if (!targetReading.read) {
    return targetReading.errorAnswer;
  }

  const result = context.session.botApi.banChatMember(
    context.bot,
    { ...targetReading.target, untilUnixSeconds: parsedParameters.data.until_date },
  );
  return result.banned ? botApiResult(true) : chatMemberFailureAnswer(result.reason);
}

function handleUnbanChatMember(
  context: BotApiMethodContext,
  parameters: BotApiRequestParameters,
): BotApiMethodAnswer {
  const parsedParameters = unbanChatMemberParametersSchema.safeParse(parameters);
  if (!parsedParameters.success) {
    return botApiError(400, 'Bad Request: invalid unbanChatMember parameters');
  }
  const targetReading = readChatMemberTarget(parsedParameters.data);
  if (!targetReading.read) {
    return targetReading.errorAnswer;
  }

  const result = context.session.botApi.unbanChatMember(
    context.bot,
    { ...targetReading.target, onlyIfBanned: parsedParameters.data.only_if_banned },
  );
  return result.unbanned ? botApiResult(true) : chatMemberFailureAnswer(result.reason);
}

/**
 * Reads the chat and the user a member method addresses. Telegram reads the user first, and reads
 * a missing or non-positive `user_id` as 0, which identifies no user.
 */
function readChatMemberTarget(
  { chat_id: chatId, user_id: userId }: { readonly chat_id?: number; readonly user_id?: number },
):
  | { readonly read: true; readonly target: { readonly chatId: number; readonly userId: number } }
  | { readonly read: false; readonly errorAnswer: BotApiMethodAnswer } {
  if (userId === undefined || userId <= 0) {
    return { read: false, errorAnswer: botApiError(400, USER_ID_INVALID_DESCRIPTION) };
  }
  if (chatId === undefined) {
    return { read: false, errorAnswer: botApiError(400, CHAT_ID_EMPTY_DESCRIPTION) };
  }
  return { read: true, target: { chatId, userId } };
}

function chatMemberFailureAnswer(reason: ChatMemberFailureReason): BotApiMethodAnswer {
  switch (reason) {
    case 'chat_not_found':
      return botApiError(400, CHAT_NOT_FOUND_DESCRIPTION);
    case 'bot_not_a_member':
      return botApiError(403, BOT_NOT_SUPERGROUP_MEMBER_DESCRIPTION);
    case 'bot_kicked':
      return botApiError(403, BOT_KICKED_FROM_SUPERGROUP_DESCRIPTION);
    case 'member_not_found':
      return botApiError(400, MEMBER_NOT_FOUND_DESCRIPTION);
    case 'private_chat_has_no_administrators':
      return botApiError(400, PRIVATE_CHAT_HAS_NO_ADMINISTRATORS_DESCRIPTION);
    case 'private_chat_members_not_bannable':
      return botApiError(400, PRIVATE_CHAT_MEMBERS_NOT_BANNABLE_DESCRIPTION);
    case 'method_unavailable_in_private_chats':
      return botApiError(400, METHOD_UNAVAILABLE_IN_PRIVATE_CHATS_DESCRIPTION);
    case 'cannot_restrict_self':
      return botApiError(400, CANNOT_RESTRICT_SELF_DESCRIPTION);
    case 'member_is_owner':
      return botApiError(400, MEMBER_IS_OWNER_DESCRIPTION);
    case 'not_enough_rights':
      return botApiError(400, NOT_ENOUGH_RIGHTS_TO_RESTRICT_DESCRIPTION);
    case 'member_is_administrator':
      return botApiError(400, MEMBER_IS_ADMINISTRATOR_DESCRIPTION);
    default: {
      const unhandledReason: never = reason;
      throw new Error(`Unhandled chat member failure: ${unhandledReason}`);
    }
  }
}

function handleSetMyCommands(
  context: BotApiMethodContext,
  parameters: BotApiRequestParameters,
): BotApiMethodAnswer {
  const invalidParametersDescription = 'Bad Request: invalid setMyCommands parameters';
  const parsedParameters = setMyCommandsParametersSchema.safeParse(parameters);
  if (!parsedParameters.success) {
    return botApiError(400, invalidParametersDescription);
  }
  const { commands, scope, language_code: languageCode } = parsedParameters.data;
  const targetReading = readMyCommandsTarget({ scope, languageCode }, invalidParametersDescription);
  if (!targetReading.read) {
    return targetReading.errorAnswer;
  }

  const result = context.session.botApi.setMyCommands(
    context.bot,
    { commands, ...targetReading.target },
  );
  if (result.set) {
    return botApiResult(true);
  }
  switch (result.reason) {
    case 'chat_not_found':
    case 'bot_not_a_member':
    case 'bot_kicked':
    case 'scope_not_allowed_in_private_chats':
    case 'language_code_invalid':
      return myCommandsTargetError(result.reason);
    default:
      return botApiError(400, BOT_COMMAND_FAILURE_DESCRIPTIONS[result.reason]);
  }
}

function handleGetMyCommands(
  context: BotApiMethodContext,
  parameters: BotApiRequestParameters,
): BotApiMethodAnswer {
  const invalidParametersDescription = 'Bad Request: invalid getMyCommands parameters';
  const parsedParameters = myCommandsTargetParametersSchema.safeParse(parameters);
  if (!parsedParameters.success) {
    return botApiError(400, invalidParametersDescription);
  }
  const targetReading = readMyCommandsTarget({
    scope: parsedParameters.data.scope,
    languageCode: parsedParameters.data.language_code,
  }, invalidParametersDescription);
  if (!targetReading.read) {
    return targetReading.errorAnswer;
  }

  const result = context.session.botApi.getMyCommands(
    context.bot,
    targetReading.target,
  );
  return result.found ? botApiResult(result.commands) : myCommandsTargetError(result.reason);
}

function handleDeleteMyCommands(
  context: BotApiMethodContext,
  parameters: BotApiRequestParameters,
): BotApiMethodAnswer {
  const invalidParametersDescription = 'Bad Request: invalid deleteMyCommands parameters';
  const parsedParameters = myCommandsTargetParametersSchema.safeParse(parameters);
  if (!parsedParameters.success) {
    return botApiError(400, invalidParametersDescription);
  }
  const targetReading = readMyCommandsTarget({
    scope: parsedParameters.data.scope,
    languageCode: parsedParameters.data.language_code,
  }, invalidParametersDescription);
  if (!targetReading.read) {
    return targetReading.errorAnswer;
  }

  const result = context.session.botApi.deleteMyCommands(
    context.bot,
    targetReading.target,
  );
  return result.deleted ? botApiResult(true) : myCommandsTargetError(result.reason);
}

/** Reads the scope and language that address one of the bot's command lists. */
function readMyCommandsTarget(
  { scope, languageCode }: { readonly scope: unknown; readonly languageCode: string },
  invalidParametersDescription: string,
):
  | { readonly read: true; readonly target: MyCommandsTarget }
  | { readonly read: false; readonly errorAnswer: BotApiMethodAnswer } {
  const scopeReading = readBotCommandScopeParameter(scope, invalidParametersDescription);
  if (!scopeReading.read) {
    return { read: false, errorAnswer: botApiError(400, scopeReading.description) };
  }
  return { read: true, target: { scope: scopeReading.scope, languageCode } };
}

function myCommandsTargetError(reason: MyCommandsTargetFailureReason): BotApiMethodAnswer {
  switch (reason) {
    case 'chat_not_found':
      return botApiError(400, CHAT_NOT_FOUND_DESCRIPTION);
    case 'bot_not_a_member':
      return botApiError(403, BOT_NOT_SUPERGROUP_MEMBER_DESCRIPTION);
    case 'bot_kicked':
      return botApiError(403, BOT_KICKED_FROM_SUPERGROUP_DESCRIPTION);
    case 'scope_not_allowed_in_private_chats':
      return botApiError(400, SCOPE_NOT_ALLOWED_IN_PRIVATE_CHATS_DESCRIPTION);
    case 'language_code_invalid':
      return botApiError(400, LANGUAGE_CODE_INVALID_DESCRIPTION);
    default: {
      const unhandledReason: never = reason;
      throw new Error(`Unhandled command list failure: ${unhandledReason}`);
    }
  }
}

function handleAnswerInlineQuery(
  context: BotApiMethodContext,
  parameters: BotApiRequestParameters,
): BotApiMethodAnswer {
  const invalidParametersDescription = 'Bad Request: invalid answerInlineQuery parameters';
  const parsedParameters = answerInlineQueryParametersSchema.safeParse(parameters);
  if (!parsedParameters.success) {
    return botApiError(400, invalidParametersDescription);
  }
  const { data } = parsedParameters;
  const resultsReading = readInlineQueryResultsParameter(
    data.results ?? [],
    invalidParametersDescription,
  );
  if (!resultsReading.read) {
    return botApiError(400, resultsReading.description);
  }
  const results: InlineQueryResultRequest[] = [];
  for (const result of resultsReading.results) {
    const resultReading = readInlineQueryResultText(context, result, invalidParametersDescription);
    if (!resultReading.read) {
      return botApiError(400, resultReading.description);
    }
    results.push(resultReading.result);
  }
  const button = data.button ?? (data.switch_pm_text.length === 0 ? undefined : {
    kind: 'start_bot' as const,
    text: data.switch_pm_text,
    startParameter: data.switch_pm_parameter,
  });

  const result = context.session.botApi.answerInlineQuery(
    context.bot,
    {
      inlineQueryId: data.inline_query_id,
      results,
      cacheTimeSeconds: data.cache_time,
      isPersonal: data.is_personal,
      nextOffset: data.next_offset,
      button,
    },
  );
  if (result.answered) {
    return botApiResult(true);
  }
  switch (result.reason) {
    case 'text_invalid':
      return botApiError(400, badRequestDescription(result.textError));
    case 'file_type_mismatch':
      return botApiError(
        400,
        `Bad Request: can't use file of type ${TDLIB_FILE_TYPE_NAMES[result.actualFileType]} as ${
          TDLIB_FILE_TYPE_NAMES[result.expectedFileType]
        }`,
      );
    default:
      return botApiError(400, ANSWER_INLINE_QUERY_FAILURE_DESCRIPTIONS[result.reason]);
  }
}

/**
 * Reads the text of an inline query result, the text of its `input_message_content` and its
 * caption, with their parse mode or entities.
 */
function readInlineQueryResultText(
  context: BotApiMethodContext,
  result: InlineQueryResultParameter,
  invalidParametersDescription: string,
):
  | { readonly read: true; readonly result: InlineQueryResultRequest }
  | { readonly read: false; readonly description: string } {
  const read = (text: UnreadFormattedText) =>
    readInlineQueryResultFormattedText(context, text, invalidParametersDescription);
  const shared = {
    id: result.id,
    description: result.description,
    ...(result.inlineKeyboard === undefined ? {} : { inlineKeyboard: result.inlineKeyboard }),
  };
  if (result.kind === 'article') {
    const messageTextReading = read(result.messageText);
    return messageTextReading.read
      ? {
        read: true,
        result: {
          ...shared,
          kind: 'article',
          title: result.title,
          url: result.url,
          messageText: messageTextReading.formattedText,
        },
      }
      : messageTextReading;
  }

  const messageTextReading = result.messageText === undefined
    ? undefined
    : read(result.messageText);
  if (messageTextReading?.read === false) {
    return messageTextReading;
  }
  const captionReading = read(result.caption);
  if (!captionReading.read) {
    return captionReading;
  }
  const media = {
    ...shared,
    title: result.title,
    caption: captionReading.formattedText,
    ...(messageTextReading === undefined ? {} : { messageText: messageTextReading.formattedText }),
  };
  return {
    read: true,
    result: result.kind === 'photo'
      ? {
        ...media,
        kind: 'photo',
        photoFileId: result.photoFileId,
        showsCaptionAboveMedia: result.showsCaptionAboveMedia,
      }
      : { ...media, kind: 'document', documentFileId: result.documentFileId },
  };
}

/**
 * Reads text of an inline query result as `readFormattedTextParameters` does. The Bot API server
 * reports text it cannot read as a result it cannot read, prefixing Telegram's own description.
 */
function readInlineQueryResultFormattedText(
  context: BotApiMethodContext,
  { text, parseMode, entities }: UnreadFormattedText,
  invalidParametersDescription: string,
): { readonly read: true; readonly formattedText: SpecifiedFormattedText } | {
  readonly read: false;
  readonly description: string;
} {
  const reading = readFormattedTextParameters(
    context,
    { text, parseMode, entities },
    invalidParametersDescription,
  );
  if (reading.read || reading.description === invalidParametersDescription) {
    return reading;
  }
  // Telegram's descriptions begin with a capital letter, which `badRequestDescription` lowered.
  const telegramError = reading.description.slice(BAD_REQUEST_PREFIX.length);
  return {
    read: false,
    description: `${BAD_REQUEST_PREFIX}${INLINE_QUERY_RESULT_ERROR_PREFIX}${
      telegramError.charAt(0).toUpperCase()
    }${telegramError.slice(1)}`,
  };
}

/**
 * Words a TDLib error message as the Bot API server's `fail_query_with_error` does for a bad
 * request: prefixed, with its first letter lowercased unless it begins an error code or acronym.
 */
function badRequestDescription(tdlibErrorMessage: string): string {
  const secondCharacter = tdlibErrorMessage[1] ?? '';
  const keepsCase = secondCharacter === '_' || /[A-Z]/.test(secondCharacter);
  const message = keepsCase
    ? tdlibErrorMessage
    : tdlibErrorMessage.charAt(0).toLowerCase() + tdlibErrorMessage.slice(1);
  return `${BAD_REQUEST_PREFIX}${message}`;
}

/** Telegram's error body, whose `error_code` repeats the HTTP status. */

/** Sends a Bot API method's answer as the JSON body of an HTTP response. */
function botApiResponse(context: Context, { status, body }: BotApiMethodAnswer): Response {
  return context.json(body, status);
}
