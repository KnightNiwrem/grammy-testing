import { assertEquals, assertRejects } from '@std/assert';
import { EmulationClient, EmulationServerError } from '../src/client/mod.ts';
import { createEmulationServerHandler } from '../src/server/handler.ts';

const SERVER_URL = 'http://emulator.test';

function createInProcessClient() {
  const handler = createEmulationServerHandler();
  const fetchIntoHandler: typeof fetch = (input, init) => handler(new Request(input, init));
  return {
    handler,
    client: new EmulationClient({ serverUrl: SERVER_URL, fetch: fetchIntoHandler }),
  };
}

Deno.test('a session exposes an api root under the server origin', async () => {
  const { client } = createInProcessClient();
  const session = await client.createSession();
  assertEquals(session.apiRoot, `${SERVER_URL}/bot-api/${session.id}`);
  await session.destroy();
});

Deno.test('declared entities round-trip through the admin api', async () => {
  const { client, handler } = createInProcessClient();
  const session = await client.createSession();
  const bot = await session.createBot({ username: 'test_bot', first_name: 'Test' });
  const user = await session.createUser({ first_name: 'Alice', username: 'alice' });
  const chat = await session.createPrivateChat({ user, bot });

  assertEquals(bot.id, bot.user.id);
  assertEquals(bot.user.username, 'test_bot');
  assertEquals(user.user.first_name, 'Alice');
  assertEquals(chat.chat.type, 'private');
  assertEquals(chat.chat.username, 'alice');
  assertEquals(chat.memberIds, [user.id, bot.id]);
  assertEquals(await chat.listMessages(), []);

  const sent = await handler(
    new Request(`${session.apiRoot}/bot${bot.token}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat_id: chat.id, text: 'hello' }),
    }),
  ).then((response) => response.json());
  assertEquals(await chat.listMessages(), [sent.result]);
  assertEquals(await chat.listMessages({ fromId: bot.id }), [sent.result]);
  assertEquals(await chat.listMessages({ fromId: user.id }), []);
});

Deno.test('server-side rejections surface as EmulationServerError', async () => {
  const { client } = createInProcessClient();
  const session = await client.createSession();
  const user = await session.createUser({ first_name: 'Alice' });
  const foreignSession = await client.createSession();
  const foreignBot = await foreignSession.createBot({ username: 'other_bot', first_name: 'Other' });
  const error = await assertRejects(
    () => session.createPrivateChat({ user, bot: foreignBot }),
    EmulationServerError,
    'does not exist',
  );
  assertEquals(error.status, 400);
});

Deno.test('destroy removes the session', async () => {
  const { client } = createInProcessClient();
  const session = await client.createSession();
  await session.destroy();
  const error = await assertRejects(
    () => session.createUser({ first_name: 'Alice' }),
    EmulationServerError,
  );
  assertEquals(error.status, 404);
});
