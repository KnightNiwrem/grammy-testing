import { TelegramEmulationServer } from '../src/server.ts';

Deno.test('TelegramEmulationServer listens for HTTP requests', async () => {
  const server = new TelegramEmulationServer({ hostname: '127.0.0.1', port: 0 }).start();

  try {
    const { hostname, port } = server.addr;
    const response = await fetch(`http://${hostname}:${port}/not-yet-routed`);

    if (response.status !== 404) {
      throw new Error(`Expected status 404, received ${response.status}`);
    }
    if (await response.text() !== '') {
      throw new Error('Expected an empty response body');
    }
  } finally {
    await server.shutdown();
  }
});
