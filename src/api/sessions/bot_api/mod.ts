import { type Context, Hono } from 'hono';
import { z } from 'zod';

import type { SessionRouteContextTypes } from '../session_route_context_types.ts';

const BOT_TOKEN_PATH_PARAMETER = 'botTokenPathSegment';
const BOT_TOKEN_PATH_PREFIX = 'bot';
const GET_ME_PATH = `/:${BOT_TOKEN_PATH_PARAMETER}{${BOT_TOKEN_PATH_PREFIX}.+}/getMe` as const;
const GET_UPDATES_PATH =
  `/:${BOT_TOKEN_PATH_PARAMETER}{${BOT_TOKEN_PATH_PREFIX}.+}/getUpdates` as const;

const getUpdatesRequestSchema = z.strictObject({
  offset: z.number().int().optional(),
  limit: z.number().int().min(1).max(100).default(100),
  timeout: z.number().int().min(0).max(50).default(0),
  allowed_updates: z.array(z.string()).optional(),
});

export function createBotApiRoutes(): Hono<SessionRouteContextTypes> {
  const botApiRoutes = new Hono<SessionRouteContextTypes>();

  botApiRoutes.post(GET_ME_PATH, (context) => {
    const botTokenPathSegment = context.req.param(BOT_TOKEN_PATH_PARAMETER);
    const token = botTokenPathSegment.slice(BOT_TOKEN_PATH_PREFIX.length);
    const bot = context.get('emulationSession').bots.getByToken(token);

    if (bot === undefined) {
      return context.json(
        {
          ok: false as const,
          error_code: 401,
          description: 'Unauthorized',
        },
        401,
      );
    }

    return context.json({ ok: true as const, result: bot.profile });
  });

  botApiRoutes.post(GET_UPDATES_PATH, async (context) => {
    const botTokenPathSegment = context.req.param(BOT_TOKEN_PATH_PARAMETER);
    const token = botTokenPathSegment.slice(BOT_TOKEN_PATH_PREFIX.length);
    const bot = context.get('emulationSession').bots.getByToken(token);

    if (bot === undefined) {
      return context.json(
        {
          ok: false as const,
          error_code: 401,
          description: 'Unauthorized',
        },
        401,
      );
    }

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

    const updates = await context.get('emulationSession').botUpdates.getUpdates(bot.profile.id, {
      offset: parsedRequest.data.offset,
      limit: parsedRequest.data.limit,
      timeoutSeconds: parsedRequest.data.timeout,
      signal: context.req.raw.signal,
    });
    return context.json({ ok: true as const, result: updates });
  });

  return botApiRoutes;
}

function badRequest(
  context: Context<SessionRouteContextTypes>,
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
