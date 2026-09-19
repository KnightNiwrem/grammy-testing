import { Hono } from 'hono';
import { basePath } from 'hono/route';

import type { EmulationSession, SessionRegistry } from '../../session_registry.ts';

const SESSION_ID_PARAMETER = 'sessionId';
const SESSION_PATH = `/:${SESSION_ID_PARAMETER}` as const;
const SESSION_SUBRESOURCE_PATH = `${SESSION_PATH}/*` as const;

interface SessionRouteEnvironment {
  readonly Variables: {
    readonly emulationSession: EmulationSession;
  };
}

interface SessionRouteDependencies {
  readonly sessions: SessionRegistry;
  readonly publicOrigin: string;
}

export function createSessionRoutes(
  { sessions, publicOrigin }: SessionRouteDependencies,
): Hono<SessionRouteEnvironment> {
  const sessionRoutes = new Hono<SessionRouteEnvironment>();

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

  return sessionRoutes;
}
