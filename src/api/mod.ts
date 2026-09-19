import { Hono } from 'hono';

import type { SessionRegistry } from '../session_registry.ts';
import { createSessionRoutes } from './sessions/mod.ts';

export interface EmulationApiDependencies {
  readonly sessions: SessionRegistry;
  readonly publicOrigin: string;
}

/** Composes the HTTP interface for controlling and interacting with emulation sessions. */
export function createEmulationApi({ sessions, publicOrigin }: EmulationApiDependencies): Hono {
  const api = new Hono();

  api.route('/sessions', createSessionRoutes({ sessions, publicOrigin }));
  api.notFound((context) => context.body(null, 404));

  return api;
}
