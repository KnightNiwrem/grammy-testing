import { type Context, Hono } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { z } from 'zod';

import type { VirtualBotProfile } from '../../../types/virtual_bot.ts';
import type { SessionRouteContextTypes } from '../session_route_context_types.ts';
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

type BotApiMethodHandler = (
  context: BotApiRouteContext,
  parameters: BotApiRequestParameters,
) => Response | Promise<Response>;

/** Keyed by lowercase name, because Telegram matches method names case-insensitively. */
const BOT_API_METHOD_HANDLERS_BY_LOWERCASE_NAME = new Map<string, BotApiMethodHandler>([
  ['deletewebhook', handleDeleteWebhook],
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
  const { chat_id: chatId, text } = parsedParameters.data;
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
    { chatId, text },
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
    default: {
      const unhandledReason: never = result.reason;
      throw new Error(`Unhandled sendMessage failure: ${unhandledReason}`);
    }
  }
}

/** Telegram's error body, whose `error_code` repeats the HTTP status. */
function botApiError(
  context: Context,
  errorCode: ContentfulStatusCode,
  description: string,
): Response {
  return context.json({ ok: false as const, error_code: errorCode, description }, errorCode);
}
