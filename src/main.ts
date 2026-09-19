import { parseServerConfiguration } from './config.ts';
import { TelegramEmulationServer } from './server.ts';

if (import.meta.main) {
  const configuration = parseServerConfiguration({
    DOMAIN: Deno.env.get('DOMAIN'),
    PORT: Deno.env.get('PORT'),
  });

  const server = new TelegramEmulationServer({ port: configuration.port }).start();
  await server.finished;
}
