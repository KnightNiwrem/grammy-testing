import { DEFAULT_PORT, TelegramEmulationServer } from './server.ts';

if (import.meta.main) {
  const configuredPort = Deno.env.get('PORT');
  const port = configuredPort === undefined ? DEFAULT_PORT : Number(configuredPort);

  const server = new TelegramEmulationServer({ port }).start();
  await server.finished;
}
