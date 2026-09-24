import { type Context, Hono } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { z } from 'zod';

import { MAX_CALLBACK_QUERY_ANSWER_TEXT_LENGTH } from '../../../types/callback_query.ts';
import type { EmulationSession } from '../../../types/emulation_session.ts';
import type { VirtualBotProfile } from '../../../types/virtual_bot.ts';
import type { SessionRouteContextTypes } from '../session_route_context_types.ts';
import { inlineKeyboardMarkupParameter } from './reply_markup_parameter.ts';
import {
  booleanParameter,
  type BotApiRequestParameters,
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

/** Telegram's wording, from `abort_long_poll` in the official Bot API server. */
const TERMINATED_BY_OTHER_LONG_POLL_DESCRIPTION =
  'Conflict: terminated by other getUpdates request; make sure that only one bot instance is running';

/** Telegram's answer to deleteWebhook when no webhook is set, which is always so here. */
const WEBHOOK_ALREADY_DELETED_DESCRIPTION = 'Webhook is already deleted';

/** Telegram's descriptions for rejected sendMessage requests. */
const MESSAGE_TEXT_EMPTY_DESCRIPTION = 'Bad Request: message text is empty';
const CHAT_ID_EMPTY_DESCRIPTION = 'Bad Request: chat_id is empty';
const CHAT_NOT_FOUND_DESCRIPTION = 'Bad Request: chat not found';
const MESSAGE_TEXT_TOO_LONG_DESCRIPTION = 'Bad Request: message is too long';
const BUTTON_DATA_INVALID_DESCRIPTION = 'Bad Request: BUTTON_DATA_INVALID';

/** Telegram's descriptions for rejected message edits. */
const MESSAGE_IDENTIFIER_NOT_SPECIFIED_DESCRIPTION =
  'Bad Request: message identifier is not specified';
const MESSAGE_TO_EDIT_NOT_FOUND_DESCRIPTION = 'Bad Request: message to edit not found';
const MESSAGE_NOT_EDITABLE_DESCRIPTION = "Bad Request: message can't be edited";
const MESSAGE_NOT_MODIFIED_DESCRIPTION =
  'Bad Request: message is not modified: specified new message content and reply markup are exactly the same as a current content and reply markup of the message';

/** Telegram's descriptions for rejected message deletions. */
const MESSAGE_TO_DELETE_NOT_FOUND_DESCRIPTION = 'Bad Request: message to delete not found';
const MESSAGE_IDENTIFIERS_NOT_SPECIFIED_DESCRIPTION =
  'Bad Request: message identifiers are not specified';
const TOO_MANY_MESSAGE_IDENTIFIERS_DESCRIPTION =
  'Bad Request: too many message identifiers specified';
const INVALID_MESSAGE_IDENTIFIER_DESCRIPTION = 'Bad Request: invalid message identifier specified';

/** Telegram deletes at most 100 messages in one deleteMessages request. */
const MAX_DELETE_MESSAGES_COUNT = 100;

/** Telegram reads a missing or non-positive `message_id` as 0, which identifies no message. */
const NO_MESSAGE_ID = 0;

/** Telegram's description for an unknown, expired, or already answered callback query. */
const QUERY_ID_INVALID_DESCRIPTION =
  'Bad Request: query is too old and response timeout expired or query ID is invalid';

/** Telegram caps how long a client may cache a callback query answer at 30 days. */
const MAX_CALLBACK_QUERY_ANSWER_CACHE_TIME_SECONDS = 30 * 24 * 60 * 60;

const getMeParametersSchema = z.strictObject({});

const deleteWebhookParametersSchema = z.strictObject({
  drop_pending_updates: booleanParameter().default(false),
});

// Telegram treats a missing parameter as empty text. It also accepts an `@username` chat_id,
// which it resolves only for bots, supergroups, and channels; the emulator supports only private
// chats, so it accepts only numeric chat IDs.
const sendMessageParametersSchema = z.strictObject({
  chat_id: integerParameter(z.int()).optional(),
  text: z.string().default(''),
  reply_markup: inlineKeyboardMarkupParameter().optional(),
});

// Editing messages sent through inline mode, which `inline_message_id` identifies, is not
// supported.
const editMessageTextParametersSchema = z.strictObject({
  chat_id: integerParameter(z.int()).optional(),
  message_id: integerParameter(z.int()).optional(),
  text: z.string().default(''),
  reply_markup: inlineKeyboardMarkupParameter().optional(),
});

const editMessageReplyMarkupParametersSchema = z.strictObject({
  chat_id: integerParameter(z.int()).optional(),
  message_id: integerParameter(z.int()).optional(),
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

type BotApiRouteContext = Context<BotApiRouteContextTypes>;

/** The outcome of either edit method; editMessageReplyMarkup fails for a subset of the reasons. */
type MessageEditResult = ReturnType<EmulationSession['botApi']['editMessageText']>;

type BotApiMethodHandler = (
  context: BotApiRouteContext,
  parameters: BotApiRequestParameters,
) => Response | Promise<Response>;

/** Keyed by lowercase name, because Telegram matches method names case-insensitively. */
const BOT_API_METHOD_HANDLERS_BY_LOWERCASE_NAME = new Map<string, BotApiMethodHandler>([
  ['answercallbackquery', handleAnswerCallbackQuery],
  ['deletemessage', handleDeleteMessage],
  ['deletemessages', handleDeleteMessages],
  ['deletewebhook', handleDeleteWebhook],
  ['editmessagereplymarkup', handleEditMessageReplyMarkup],
  ['editmessagetext', handleEditMessageText],
  ['getme', handleGetMe],
  ['getupdates', handleGetUpdates],
  ['sendmessage', handleSendMessage],
]);

export function createBotApiRoutes(): Hono<BotApiRouteContextTypes> {
  const botApiRoutes = new Hono<BotApiRouteContextTypes>();

  // Telegram rejects a path without a method segment before it checks the token.
  botApiRoutes.all(BOT_TOKEN_PATH, (context) => botApiError(context, 404, 'Not Found'));

  // Telegram rejects an invalid token before it resolves the method or validates parameters.
  botApiRoutes.use(BOT_API_SUBRESOURCE_PATH, async (context, next) => {
    const botTokenPathSegment = context.req.param(BOT_TOKEN_PATH_PARAMETER);
    const token = botTokenPathSegment.slice(BOT_TOKEN_PATH_PREFIX.length);
    const authenticatedBot = context.get('emulationSession').botApi.authenticate(token);
    if (authenticatedBot === undefined) {
      return botApiError(context, 401, 'Unauthorized');
    }

    context.set('authenticatedBot', authenticatedBot);
    await next();
  });

  // Telegram accepts both HTTP methods for every Bot API method.
  botApiRoutes.on(['GET', 'POST'], BOT_API_METHOD_PATH, async (context) => {
    const methodHandler = BOT_API_METHOD_HANDLERS_BY_LOWERCASE_NAME.get(
      context.req.param(BOT_API_METHOD_NAME_PARAMETER).toLowerCase(),
    );
    if (methodHandler === undefined) {
      return botApiError(context, 404, 'Not Found: method not found');
    }

    const parametersDecoding = await decodeBotApiRequestParameters(context.req.raw);
    if (!parametersDecoding.decoded) {
      return botApiError(context, 400, parametersDecoding.description);
    }
    return methodHandler(context, parametersDecoding.parameters);
  });

  // Telegram answers every other path in its Bot API namespace with a Bot API error.
  botApiRoutes.all('*', (context) => botApiError(context, 404, 'Not Found'));

  return botApiRoutes;
}

function handleGetMe(context: BotApiRouteContext, parameters: BotApiRequestParameters): Response {
  if (!getMeParametersSchema.safeParse(parameters).success) {
    return botApiError(context, 400, 'Bad Request: invalid getMe parameters');
  }
  return context.json({ ok: true as const, result: context.get('authenticatedBot') });
}

async function handleGetUpdates(
  context: BotApiRouteContext,
  parameters: BotApiRequestParameters,
): Promise<Response> {
  const parsedParameters = getUpdatesParametersSchema.safeParse(parameters);
  if (!parsedParameters.success) {
    return botApiError(context, 400, 'Bad Request: invalid getUpdates parameters');
  }

  const result = await context.get('emulationSession').botApi.getUpdates(
    context.get('authenticatedBot'),
    {
      offset: parsedParameters.data.offset,
      limit: parsedParameters.data.limit,
      timeoutSeconds: parsedParameters.data.timeout,
      allowedUpdates: parsedParameters.data.allowed_updates,
      signal: context.req.raw.signal,
    },
  );
  if (!result.retrieved) {
    // Telegram delays a conflict by 3 seconds when another occurred within the previous 3
    // seconds; the emulator answers immediately to keep tests fast.
    return botApiError(context, 409, TERMINATED_BY_OTHER_LONG_POLL_DESCRIPTION);
  }
  return context.json({ ok: true as const, result: result.updates });
}

function handleDeleteWebhook(
  context: BotApiRouteContext,
  parameters: BotApiRequestParameters,
): Response {
  const parsedParameters = deleteWebhookParametersSchema.safeParse(parameters);
  if (!parsedParameters.success) {
    return botApiError(context, 400, 'Bad Request: invalid deleteWebhook parameters');
  }

  context.get('emulationSession').botApi.deleteWebhook(context.get('authenticatedBot'), {
    dropPendingUpdates: parsedParameters.data.drop_pending_updates,
  });
  return context.json({
    ok: true as const,
    result: true as const,
    description: WEBHOOK_ALREADY_DELETED_DESCRIPTION,
  });
}

function handleSendMessage(
  context: BotApiRouteContext,
  parameters: BotApiRequestParameters,
): Response {
  const parsedParameters = sendMessageParametersSchema.safeParse(parameters);
  if (!parsedParameters.success) {
    return botApiError(context, 400, 'Bad Request: invalid sendMessage parameters');
  }
  const { chat_id: chatId, text, reply_markup: inlineKeyboard } = parsedParameters.data;
  if (chatId === undefined) {
    // Telegram checks the text before it looks at the chat.
    return botApiError(
      context,
      400,
      text.length === 0 ? MESSAGE_TEXT_EMPTY_DESCRIPTION : CHAT_ID_EMPTY_DESCRIPTION,
    );
  }

  const result = context.get('emulationSession').botApi.sendMessage(
    context.get('authenticatedBot'),
    { chatId, text, inlineKeyboard },
  );
  if (result.sent) {
    return context.json({ ok: true as const, result: result.message });
  }
  switch (result.reason) {
    case 'message_text_empty':
      return botApiError(context, 400, MESSAGE_TEXT_EMPTY_DESCRIPTION);
    case 'chat_not_found':
      return botApiError(context, 400, CHAT_NOT_FOUND_DESCRIPTION);
    case 'message_text_too_long':
      return botApiError(context, 400, MESSAGE_TEXT_TOO_LONG_DESCRIPTION);
    case 'callback_data_invalid':
      return botApiError(context, 400, BUTTON_DATA_INVALID_DESCRIPTION);
    default: {
      const unhandledReason: never = result.reason;
      throw new Error(`Unhandled sendMessage failure: ${unhandledReason}`);
    }
  }
}

function handleEditMessageText(
  context: BotApiRouteContext,
  parameters: BotApiRequestParameters,
): Response {
  const parsedParameters = editMessageTextParametersSchema.safeParse(parameters);
  if (!parsedParameters.success) {
    return botApiError(context, 400, 'Bad Request: invalid editMessageText parameters');
  }
  const { chat_id: chatId, message_id: messageId, text, reply_markup: inlineKeyboard } =
    parsedParameters.data;
  if (chatId === undefined) {
    // Telegram checks the text before it looks for the message.
    return botApiError(
      context,
      400,
      text.length === 0 ? MESSAGE_TEXT_EMPTY_DESCRIPTION : missingChatIdDescription(messageId),
    );
  }

  return editMessageResponse(
    context,
    context.get('emulationSession').botApi.editMessageText(context.get('authenticatedBot'), {
      chatId,
      messageId: messageIdOrNone(messageId),
      text,
      inlineKeyboard,
    }),
  );
}

function handleEditMessageReplyMarkup(
  context: BotApiRouteContext,
  parameters: BotApiRequestParameters,
): Response {
  const parsedParameters = editMessageReplyMarkupParametersSchema.safeParse(parameters);
  if (!parsedParameters.success) {
    return botApiError(context, 400, 'Bad Request: invalid editMessageReplyMarkup parameters');
  }
  const { chat_id: chatId, message_id: messageId, reply_markup: inlineKeyboard } =
    parsedParameters.data;
  if (chatId === undefined) {
    return botApiError(context, 400, missingChatIdDescription(messageId));
  }

  return editMessageResponse(
    context,
    context.get('emulationSession').botApi.editMessageReplyMarkup(
      context.get('authenticatedBot'),
      { chatId, messageId: messageIdOrNone(messageId), inlineKeyboard },
    ),
  );
}

/**
 * Without `chat_id`, Telegram takes an edit without a positive `message_id` to address an inline
 * message, whose missing `inline_message_id` it reports as an unspecified message identifier.
 */
function missingChatIdDescription(messageId: number | undefined): string {
  return messageIdOrNone(messageId) === NO_MESSAGE_ID
    ? MESSAGE_IDENTIFIER_NOT_SPECIFIED_DESCRIPTION
    : CHAT_ID_EMPTY_DESCRIPTION;
}

function messageIdOrNone(messageId: number | undefined): number {
  return messageId === undefined || messageId <= 0 ? NO_MESSAGE_ID : messageId;
}

function editMessageResponse(context: BotApiRouteContext, result: MessageEditResult): Response {
  if (result.edited) {
    return context.json({ ok: true as const, result: result.message });
  }
  switch (result.reason) {
    case 'message_text_empty':
      return botApiError(context, 400, MESSAGE_TEXT_EMPTY_DESCRIPTION);
    case 'chat_not_found':
      return botApiError(context, 400, CHAT_NOT_FOUND_DESCRIPTION);
    case 'message_not_found':
      return botApiError(context, 400, MESSAGE_TO_EDIT_NOT_FOUND_DESCRIPTION);
    case 'message_not_editable':
      return botApiError(context, 400, MESSAGE_NOT_EDITABLE_DESCRIPTION);
    case 'message_text_too_long':
      return botApiError(context, 400, MESSAGE_TEXT_TOO_LONG_DESCRIPTION);
    case 'callback_data_invalid':
      return botApiError(context, 400, BUTTON_DATA_INVALID_DESCRIPTION);
    case 'message_not_modified':
      return botApiError(context, 400, MESSAGE_NOT_MODIFIED_DESCRIPTION);
    default: {
      const unhandledReason: never = result.reason;
      throw new Error(`Unhandled message edit failure: ${unhandledReason}`);
    }
  }
}

function handleDeleteMessage(
  context: BotApiRouteContext,
  parameters: BotApiRequestParameters,
): Response {
  const parsedParameters = deleteMessageParametersSchema.safeParse(parameters);
  if (!parsedParameters.success) {
    return botApiError(context, 400, 'Bad Request: invalid deleteMessage parameters');
  }
  const { chat_id: chatId, message_id: messageId } = parsedParameters.data;
  // Telegram looks at the chat before the message.
  if (chatId === undefined) {
    return botApiError(context, 400, CHAT_ID_EMPTY_DESCRIPTION);
  }

  const result = context.get('emulationSession').botApi.deleteMessage(
    context.get('authenticatedBot'),
    { chatId, messageId: messageIdOrNone(messageId) },
  );
  if (result.deleted) {
    return context.json({ ok: true as const, result: true as const });
  }
  switch (result.reason) {
    case 'chat_not_found':
      return botApiError(context, 400, CHAT_NOT_FOUND_DESCRIPTION);
    case 'message_not_found':
      return botApiError(context, 400, MESSAGE_TO_DELETE_NOT_FOUND_DESCRIPTION);
    default: {
      const unhandledReason: never = result.reason;
      throw new Error(`Unhandled deleteMessage failure: ${unhandledReason}`);
    }
  }
}

function handleDeleteMessages(
  context: BotApiRouteContext,
  parameters: BotApiRequestParameters,
): Response {
  const parsedParameters = deleteMessagesParametersSchema.safeParse(parameters);
  if (!parsedParameters.success) {
    return botApiError(context, 400, 'Bad Request: invalid deleteMessages parameters');
  }
  const { chat_id: chatId, message_ids: messageIds } = parsedParameters.data;
  // Telegram checks the message identifiers before it looks at the chat.
  if (messageIds === undefined) {
    return botApiError(context, 400, MESSAGE_IDENTIFIERS_NOT_SPECIFIED_DESCRIPTION);
  }
  if (messageIds.length > MAX_DELETE_MESSAGES_COUNT) {
    return botApiError(context, 400, TOO_MANY_MESSAGE_IDENTIFIERS_DESCRIPTION);
  }
  if (messageIds.some((messageId) => messageId <= 0)) {
    return botApiError(context, 400, INVALID_MESSAGE_IDENTIFIER_DESCRIPTION);
  }
  if (chatId === undefined) {
    return botApiError(context, 400, CHAT_ID_EMPTY_DESCRIPTION);
  }

  const result = context.get('emulationSession').botApi.deleteMessages(
    context.get('authenticatedBot'),
    { chatId, messageIds },
  );
  if (!result.deleted) {
    return botApiError(context, 400, CHAT_NOT_FOUND_DESCRIPTION);
  }
  return context.json({ ok: true as const, result: true as const });
}

function handleAnswerCallbackQuery(
  context: BotApiRouteContext,
  parameters: BotApiRequestParameters,
): Response {
  const parsedParameters = answerCallbackQueryParametersSchema.safeParse(parameters);
  if (!parsedParameters.success) {
    return botApiError(context, 400, 'Bad Request: invalid answerCallbackQuery parameters');
  }

  const result = context.get('emulationSession').botApi.answerCallbackQuery(
    context.get('authenticatedBot'),
    {
      callbackQueryId: parsedParameters.data.callback_query_id,
      text: parsedParameters.data.text,
      showAlert: parsedParameters.data.show_alert,
      cacheTimeSeconds: parsedParameters.data.cache_time,
    },
  );
  if (!result.answered) {
    return botApiError(context, 400, QUERY_ID_INVALID_DESCRIPTION);
  }
  return context.json({ ok: true as const, result: true as const });
}

/** Telegram's error body, whose `error_code` repeats the HTTP status. */
function botApiError(
  context: Context,
  errorCode: ContentfulStatusCode,
  description: string,
): Response {
  return context.json({ ok: false as const, error_code: errorCode, description }, errorCode);
}
