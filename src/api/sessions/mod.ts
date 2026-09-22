import { Hono } from 'hono';
import { basePath } from 'hono/route';

import type { SessionRepository } from '../../repositories/session.ts';
import { createAccountRoutes } from './accounts/mod.ts';
import { createBotApiRoutes } from './bot_api/mod.ts';
import { createBotRoutes } from './bots/mod.ts';
import type { SessionRouteContextTypes } from './session_route_context_types.ts';

const SESSION_ID_PARAMETER = 'sessionId';
const SESSION_PATH = `/:${SESSION_ID_PARAMETER}` as const;
const SESSION_SUBRESOURCE_PATH = `${SESSION_PATH}/*` as const;
const ACCOUNT_COLLECTION_PATH = `${SESSION_PATH}/accounts` as const;
const BOT_COLLECTION_PATH = `${SESSION_PATH}/bots` as const;
const BOT_API_PATH = `${SESSION_PATH}/bot-api` as const;

interface SessionRouteDependencies {
  readonly sessions: SessionRepository;
  readonly publicOrigin: string;
}

export function createSessionRoutes(
  { sessions, publicOrigin }: SessionRouteDependencies,
): Hono<SessionRouteContextTypes> {
  const sessionRoutes = new Hono<SessionRouteContextTypes>();

  sessionRoutes.post('/', (context) => {
    const session = sessions.create();
    const sessionPath = `${basePath(context)}/${session.id}`;

    return context.json(
      {
        id: session.id,
        botApiRoot: new URL(`${sessionPath}/bot-api`, publicOrigin).href,
      },
      201,
      { Location: sessionPath },
    );
  });

  sessionRoutes.delete(SESSION_PATH, (context) => {
    const sessionWasDeleted = sessions.delete(context.req.param(SESSION_ID_PARAMETER));
    return context.body(null, sessionWasDeleted ? 204 : 404);
  });

  sessionRoutes.use(SESSION_SUBRESOURCE_PATH, async (context, next) => {
    const session = sessions.get(context.req.param(SESSION_ID_PARAMETER));
    if (session === undefined) {
      return context.body(null, 404);
    }

    context.set('emulationSession', session);
    await next();
  });

  sessionRoutes.route(ACCOUNT_COLLECTION_PATH, createAccountRoutes());
  sessionRoutes.route(BOT_COLLECTION_PATH, createBotRoutes());
  sessionRoutes.route(BOT_API_PATH, createBotApiRoutes());

  return sessionRoutes;
}
