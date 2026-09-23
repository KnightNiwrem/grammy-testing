import { type Context, Hono } from 'hono';
import { z } from 'zod';

import type { VirtualBotProfile } from '../../../types/virtual_bot.ts';
import type { SessionRouteContextTypes } from '../session_route_context_types.ts';
import {
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
const BOT_API_METHOD_PATH = `${BOT_TOKEN_PATH}/:${BOT_API_METHOD_NAME_PARAMETER}` as const;

/** Telegram's wording, from `abort_long_poll` in the official Bot API server. */
const TERMINATED_BY_OTHER_LONG_POLL_DESCRIPTION =
  'Conflict: terminated by other getUpdates request; make sure that only one bot instance is running';

const getMeParametersSchema = z.strictObject({});

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
  ['getme', handleGetMe],
  ['getupdates', handleGetUpdates],
]);

export function createBotApiRoutes(): Hono<BotApiRouteContextTypes> {
  const botApiRoutes = new Hono<BotApiRouteContextTypes>();

  // Telegram rejects an invalid token before it resolves the method or validates parameters.
  botApiRoutes.use(BOT_API_SUBRESOURCE_PATH, async (context, next) => {
    const botTokenPathSegment = context.req.param(BOT_TOKEN_PATH_PARAMETER);
    const token = botTokenPathSegment.slice(BOT_TOKEN_PATH_PREFIX.length);
    const authenticatedBot = context.get('emulationSession').botApi.authenticate(token);
    if (authenticatedBot === undefined) {
      return context.json(
        {
          ok: false as const,
          error_code: 401,
          description: 'Unauthorized',
        },
        401,
      );
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
      return context.notFound();
    }

    const parametersDecoding = await decodeBotApiRequestParameters(context.req.raw);
    if (!parametersDecoding.decoded) {
      return badRequest(context, parametersDecoding.description);
    }
    return methodHandler(context, parametersDecoding.parameters);
  });

  return botApiRoutes;
}

function handleGetMe(context: BotApiRouteContext, parameters: BotApiRequestParameters): Response {
  if (!getMeParametersSchema.safeParse(parameters).success) {
    return badRequest(context, 'Bad Request: invalid getMe parameters');
  }
  return context.json({ ok: true as const, result: context.get('authenticatedBot') });
}

async function handleGetUpdates(
  context: BotApiRouteContext,
  parameters: BotApiRequestParameters,
): Promise<Response> {
  const parsedParameters = getUpdatesParametersSchema.safeParse(parameters);
  if (!parsedParameters.success) {
    return badRequest(context, 'Bad Request: invalid getUpdates parameters');
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
    return context.json(
      {
        ok: false as const,
        error_code: 409,
        description: TERMINATED_BY_OTHER_LONG_POLL_DESCRIPTION,
      },
      409,
    );
  }
  return context.json({ ok: true as const, result: result.updates });
}

function badRequest(context: BotApiRouteContext, description: string) {
  return context.json(
    {
      ok: false as const,
      error_code: 400,
      description,
    },
    400,
  );
}
