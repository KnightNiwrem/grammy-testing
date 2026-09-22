import { parseServerConfiguration } from './config.ts';
import { createEmulationApi } from './api/mod.ts';
import { TelegramEmulationServer } from './server.ts';
import { SessionRepository } from './repositories/session.ts';

if (import.meta.main) {
  const configuration = parseServerConfiguration({
    DOMAIN: Deno.env.get('DOMAIN'),
    PORT: Deno.env.get('PORT'),
  });

  const api = createEmulationApi({
    sessions: new SessionRepository(),
    publicOrigin: configuration.publicOrigin,
  });
  const server = new TelegramEmulationServer({ port: configuration.port }).start(api.fetch);
  await server.finished;
}
