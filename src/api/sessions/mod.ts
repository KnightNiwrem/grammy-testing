import { Hono } from 'hono';
import { basePath } from 'hono/route';

import type { SessionRegistry } from '../../session_registry.ts';

interface SessionRouteDependencies {
  readonly sessions: SessionRegistry;
  readonly publicOrigin: string;
}

export function createSessionRoutes(
  { sessions, publicOrigin }: SessionRouteDependencies,
): Hono {
  const sessionRoutes = new Hono();

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

  return sessionRoutes;
}
