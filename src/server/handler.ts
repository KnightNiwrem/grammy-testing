/**
 * The emulation server's single request handler. It owns no network concerns, so it can be
 * served with `Deno.serve` or invoked directly with a `Request` in tests.
 */
import { ADMIN_PATH_PREFIX, BOT_API_PATH_PREFIX } from '../shared/admin_protocol.ts';
import { handleAdminRequest } from './admin_routes.ts';
import { handleBotApiRequest } from './bot_api_routes.ts';
import { SessionStore } from './session_store.ts';

export type EmulationServerHandler = (request: Request) => Promise<Response>;

export function createEmulationServerHandler(
  store: SessionStore = new SessionStore(),
): EmulationServerHandler {
  return (request) => {
    const { pathname } = new URL(request.url);
    if (isUnderPrefix(pathname, ADMIN_PATH_PREFIX)) return handleAdminRequest(store, request);
    if (isUnderPrefix(pathname, BOT_API_PATH_PREFIX)) return handleBotApiRequest(store, request);
    return Promise.resolve(
      Response.json(
        { error: `unknown path ${pathname}; use ${ADMIN_PATH_PREFIX} or ${BOT_API_PATH_PREFIX}` },
        { status: 404 },
      ),
    );
  };
}

function isUnderPrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}
