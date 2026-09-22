import { Hono } from 'hono';

import type { SessionRepository } from '../repositories/session.ts';
import { createSessionRoutes } from './sessions/mod.ts';

export interface EmulationApiDependencies {
  readonly sessions: SessionRepository;
  readonly publicOrigin: string;
}

/** Composes the HTTP interface for controlling and interacting with emulation sessions. */
export function createEmulationApi({ sessions, publicOrigin }: EmulationApiDependencies): Hono {
  const api = new Hono();

  api.route('/sessions', createSessionRoutes({ sessions, publicOrigin }));
  api.notFound((context) => context.body(null, 404));

  return api;
}
