import { Hono } from 'hono';

import type { SessionRouteContextTypes } from '../session_route_context_types.ts';

const BOT_TOKEN_PATH_PARAMETER = 'botTokenPathSegment';
const BOT_TOKEN_PATH_PREFIX = 'bot';
const GET_ME_PATH = `/:${BOT_TOKEN_PATH_PARAMETER}{${BOT_TOKEN_PATH_PREFIX}.+}/getMe` as const;

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

  return botApiRoutes;
}
