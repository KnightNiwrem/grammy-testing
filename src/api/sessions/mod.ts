import { Hono } from 'hono';
import { basePath } from 'hono/route';

import type { EmulationSession } from '../../types/emulation_session.ts';
import { createAccountRoutes } from './accounts/mod.ts';
import { createBotActivityRoutes } from './bot_activity/mod.ts';
import { createBotApiRoutes } from './bot_api/mod.ts';
import { createBotRoutes } from './bots/mod.ts';
import { createFileRoutes } from './files/mod.ts';
import type { SessionRouteContextTypes } from './session_route_context_types.ts';

const SESSION_ID_PARAMETER = 'sessionId';
const SESSION_PATH = `/:${SESSION_ID_PARAMETER}` as const;
const SESSION_SUBRESOURCE_PATH = `${SESSION_PATH}/*` as const;
const ACCOUNT_COLLECTION_PATH = `${SESSION_PATH}/accounts` as const;
const BOT_COLLECTION_PATH = `${SESSION_PATH}/bots` as const;
const BOT_API_PATH = `${SESSION_PATH}/bot-api` as const;
const BOT_ACTIVITY_PATH = `${SESSION_PATH}/bot-activity` as const;
const FILE_COLLECTION_PATH = `${SESSION_PATH}/files` as const;

export interface SessionLifecycle {
  createSession(): EmulationSession;
  endSession(sessionId: string): boolean;
  getSessionById(sessionId: string): EmulationSession | undefined;
}

interface SessionRouteDependencies {
  readonly sessionLifecycle: SessionLifecycle;
  readonly publicOrigin: string;
}

export function createSessionRoutes(
  { sessionLifecycle, publicOrigin }: SessionRouteDependencies,
): Hono<SessionRouteContextTypes> {
  const sessionRoutes = new Hono<SessionRouteContextTypes>();

  sessionRoutes.post('/', (context) => {
    const session = sessionLifecycle.createSession();
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
    const sessionWasDeleted = sessionLifecycle.endSession(
      context.req.param(SESSION_ID_PARAMETER),
    );
    return context.body(null, sessionWasDeleted ? 204 : 404);
  });

  sessionRoutes.use(SESSION_SUBRESOURCE_PATH, async (context, next) => {
    const session = sessionLifecycle.getSessionById(
      context.req.param(SESSION_ID_PARAMETER),
    );
    if (session === undefined) {
      return context.body(null, 404);
    }

    context.set('emulationSession', session);
    await next();
  });

  sessionRoutes.route(ACCOUNT_COLLECTION_PATH, createAccountRoutes());
  sessionRoutes.route(BOT_COLLECTION_PATH, createBotRoutes());
  sessionRoutes.route(BOT_API_PATH, createBotApiRoutes());
  sessionRoutes.route(BOT_ACTIVITY_PATH, createBotActivityRoutes());
  sessionRoutes.route(FILE_COLLECTION_PATH, createFileRoutes());

  return sessionRoutes;
}
