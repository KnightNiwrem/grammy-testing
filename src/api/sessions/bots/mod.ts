import { Hono } from 'hono';
import { basePath } from 'hono/route';
import { z } from 'zod';

import type { SessionRouteContextTypes } from '../session_route_context_types.ts';

const createBotRequestSchema = z.strictObject({
  first_name: z.string().min(1),
  username: z.string().min(1),
});

export function createBotRoutes(): Hono<SessionRouteContextTypes> {
  const botRoutes = new Hono<SessionRouteContextTypes>();

  botRoutes.post('/', async (context) => {
    let requestBody: unknown;
    try {
      requestBody = await context.req.json();
    } catch {
      return context.body(null, 400);
    }

    const parsedRequest = createBotRequestSchema.safeParse(requestBody);
    if (!parsedRequest.success) {
      return context.body(null, 400);
    }

    const result = context.get('emulationSession').bots.create(parsedRequest.data);
    if (!result.created) {
      return context.body(null, result.reason === 'username_taken' ? 409 : 507);
    }

    const botPath = `${basePath(context)}/${result.bot.profile.id}`;
    return context.json(
      {
        token: result.bot.token,
        bot: result.bot.profile,
      },
      201,
      { Location: botPath },
    );
  });

  return botRoutes;
}
