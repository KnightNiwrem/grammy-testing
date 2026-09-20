import { Hono } from 'hono';
import { basePath } from 'hono/route';
import { z } from 'zod';

import type { SessionRouteContextTypes } from '../session_route_context_types.ts';

const createAccountRequestSchema = z.strictObject({
  first_name: z.string().min(1),
  last_name: z.string().min(1).optional(),
  username: z.string().min(1).optional(),
  language_code: z.string().min(1).optional(),
});

export function createAccountRoutes(): Hono<SessionRouteContextTypes> {
  const accountRoutes = new Hono<SessionRouteContextTypes>();

  accountRoutes.post('/', async (context) => {
    let requestBody: unknown;
    try {
      requestBody = await context.req.json();
    } catch {
      return context.body(null, 400);
    }

    const parsedRequest = createAccountRequestSchema.safeParse(requestBody);
    if (!parsedRequest.success) {
      return context.body(null, 400);
    }

    const result = context.get('emulationSession').virtualUsers.createAccount(parsedRequest.data);
    if (!result.created) {
      return context.body(null, result.reason === 'username_taken' ? 409 : 507);
    }

    const accountPath = `${basePath(context)}/${result.account.profile.id}`;
    return context.json(
      { account: result.account.profile },
      201,
      { Location: accountPath },
    );
  });

  return accountRoutes;
}
