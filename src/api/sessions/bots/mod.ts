import { Hono } from 'hono';
import { basePath } from 'hono/route';
import { z } from 'zod';

import type { SessionRouteContextTypes } from '../session_route_context_types.ts';

const createBotRequestSchema = z.strictObject({
  first_name: z.string().min(1),
  username: z.string().min(1),
  /** Turns off privacy mode, so that the bot receives every message of its groups. */
  can_read_all_group_messages: z.boolean().optional(),
  /** Turns on inline mode, so that accounts send the bot inline queries. */
  supports_inline_queries: z.boolean().optional(),
  /** Turns on inline feedback, so that the bot learns which inline query results are sent. */
  receives_chosen_inline_results: z.boolean().optional(),
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

    const result = context.get('emulationSession').virtualUsers.createBot(parsedRequest.data);
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
