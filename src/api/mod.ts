import { Hono } from 'hono';

import { createSessionRoutes, type SessionLifecycle } from './sessions/mod.ts';

export interface EmulationApiDependencies {
  readonly sessionLifecycle: SessionLifecycle;
  readonly publicOrigin: string;
}

/** Composes the HTTP interface for controlling and interacting with emulation sessions. */
export function createEmulationApi(
  { sessionLifecycle, publicOrigin }: EmulationApiDependencies,
): Hono {
  const api = new Hono();

  api.route('/sessions', createSessionRoutes({ sessionLifecycle, publicOrigin }));
  api.notFound((context) => context.body(null, 404));

  return api;
}
