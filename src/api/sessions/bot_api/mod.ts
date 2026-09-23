import { type Context, Hono } from 'hono';
import { z } from 'zod';

import type { VirtualBotProfile } from '../../../types/virtual_bot.ts';
import type { SessionRouteContextTypes } from '../session_route_context_types.ts';

const BOT_TOKEN_PATH_PARAMETER = 'botTokenPathSegment';
const BOT_TOKEN_PATH_PREFIX = 'bot';
const BOT_TOKEN_PATH = `/:${BOT_TOKEN_PATH_PARAMETER}{${BOT_TOKEN_PATH_PREFIX}[^/]+}` as const;
const BOT_API_METHOD_PATH = `${BOT_TOKEN_PATH}/*` as const;
const GET_ME_PATH = `${BOT_TOKEN_PATH}/getMe` as const;
const GET_UPDATES_PATH = `${BOT_TOKEN_PATH}/getUpdates` as const;

/** Telegram's wording, from `abort_long_poll` in the official Bot API server. */
const TERMINATED_BY_OTHER_LONG_POLL_DESCRIPTION =
  'Conflict: terminated by other getUpdates request; make sure that only one bot instance is running';

const getUpdatesRequestSchema = z.strictObject({
  offset: z.number().int().optional(),
  limit: z.number().int().min(1).max(100).default(100),
  timeout: z.number().int().min(0).max(50).default(0),
  // Telegram ignores a malformed value and keeps the current subscription; rejecting it instead
  // surfaces the bot's mistake in tests.
  allowed_updates: z.array(z.string()).optional(),
});

type BotApiRouteVariables = SessionRouteContextTypes['Variables'] & {
  /** The bot whose token authenticated the request; set before any Bot API method runs. */
  readonly authenticatedBot: VirtualBotProfile;
};

interface BotApiRouteContextTypes {
  readonly Variables: BotApiRouteVariables;
}

export function createBotApiRoutes(): Hono<BotApiRouteContextTypes> {
  const botApiRoutes = new Hono<BotApiRouteContextTypes>();

  // Telegram rejects an invalid token before it resolves the method or validates parameters.
  botApiRoutes.use(BOT_API_METHOD_PATH, async (context, next) => {
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

  botApiRoutes.post(GET_ME_PATH, (context) => {
    return context.json({ ok: true as const, result: context.get('authenticatedBot') });
  });

  botApiRoutes.post(GET_UPDATES_PATH, async (context) => {
    let requestBody: unknown = {};
    const rawRequestBody = await context.req.text();
    if (rawRequestBody.length > 0) {
      try {
        requestBody = JSON.parse(rawRequestBody);
      } catch {
        return badRequest(context, 'Bad Request: invalid JSON body');
      }
    }
    const parsedRequest = getUpdatesRequestSchema.safeParse(requestBody);
    if (!parsedRequest.success) {
      return badRequest(context, 'Bad Request: invalid getUpdates parameters');
    }

    const result = await context.get('emulationSession').botApi.getUpdates(
      context.get('authenticatedBot'),
      {
        offset: parsedRequest.data.offset,
        limit: parsedRequest.data.limit,
        timeoutSeconds: parsedRequest.data.timeout,
        allowedUpdates: parsedRequest.data.allowed_updates,
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
  });

  return botApiRoutes;
}

function badRequest(
  context: Context<BotApiRouteContextTypes>,
  description: string,
) {
  return context.json(
    {
      ok: false as const,
      error_code: 400,
      description,
    },
    400,
  );
}
