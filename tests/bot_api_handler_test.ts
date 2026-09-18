import { assertEquals } from '@std/assert';
import type { Message } from 'grammy/types';
import { createEmulationServerHandler } from '../src/server/handler.ts';
import { SessionStore } from '../src/server/session_store.ts';

const ORIGIN = 'http://emulator.test';

function setUp() {
  const store = new SessionStore();
  const session = store.create();
  const user = session.createUser({ first_name: 'Alice' });
  const bot = session.createBot({ username: 'test_bot', first_name: 'Test' });
  const chat = session.createPrivateChat({ userId: user.id, memberIds: [user.id, bot.user.id] });
  const handler = createEmulationServerHandler(store);
  const call = (
    method: string,
    payload: Record<string, unknown>,
    options: { sessionId?: string; token?: string } = {},
  ) =>
    handler(
      new Request(
        `${ORIGIN}/bot-api/${options.sessionId ?? session.id}/bot${
          options.token ?? bot.token
        }/${method}`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(payload),
        },
      ),
    );
  return { store, session, user, bot, chat, handler, call };
}

async function expectTelegramError(response: Response, errorCode: number, description: string) {
  assertEquals(response.status, errorCode);
  assertEquals(await response.json(), { ok: false, error_code: errorCode, description });
}

Deno.test('getMe returns the bot user in a success envelope', async () => {
  const { bot, call } = setUp();
  const response = await call('getMe', {});
  assertEquals(response.status, 200);
  assertEquals(await response.json(), { ok: true, result: bot.user });
});

Deno.test('sendMessage stores and returns the message', async () => {
  const { session, bot, chat, call } = setUp();
  const response = await call('sendMessage', { chat_id: chat.chat.id, text: 'hello' });
  assertEquals(response.status, 200);
  const body = await response.json() as { ok: true; result: Message };
  assertEquals(body.ok, true);
  assertEquals(body.result.message_id, 1);
  assertEquals(body.result.text, 'hello');
  assertEquals(body.result.chat, chat.chat);
  assertEquals(body.result.from, bot.user);
  assertEquals(session.chats.get(chat.chat.id)?.messages, [body.result]);
});

Deno.test('sendMessage accepts chat_id as a numeric string, form data, and query parameters', async () => {
  const { session, bot, chat, handler } = setUp();
  const url = `${ORIGIN}/bot-api/${session.id}/bot${bot.token}/sendMessage`;
  const form = new URLSearchParams({ chat_id: String(chat.chat.id), text: 'from form' });
  const formResponse = await handler(new Request(url, { method: 'POST', body: form }));
  assertEquals(formResponse.status, 200);
  const queryResponse = await handler(
    new Request(`${url}?chat_id=${chat.chat.id}&text=from+query`, { method: 'GET' }),
  );
  assertEquals(queryResponse.status, 200);
  assertEquals(chat.messages.map((message) => message.text), ['from form', 'from query']);
});

Deno.test('sendMessage rejects chats the bot is not a member of', async () => {
  const { session, user, call } = setUp();
  const withoutBot = session.createPrivateChat({ userId: user.id, memberIds: [user.id] });
  const response = await call('sendMessage', { chat_id: withoutBot.chat.id, text: 'hello' });
  await expectTelegramError(
    response,
    403,
    "Forbidden: bot can't initiate conversation with a user",
  );
  assertEquals(withoutBot.messages, []);
});

Deno.test('sendMessage validates its payload with Telegram-style errors', async () => {
  const { chat, call } = setUp();
  await expectTelegramError(
    await call('sendMessage', { text: 'hello' }),
    400,
    'Bad Request: chat_id is empty',
  );
  await expectTelegramError(
    await call('sendMessage', { chat_id: 1, text: 'hello' }),
    400,
    'Bad Request: chat not found',
  );
  await expectTelegramError(
    await call('sendMessage', { chat_id: chat.chat.id }),
    400,
    'Bad Request: message text is empty',
  );
  await expectTelegramError(
    await call('sendMessage', { chat_id: chat.chat.id, text: '' }),
    400,
    'Bad Request: message text is empty',
  );
});

Deno.test('routing errors use Telegram error codes', async () => {
  const { call } = setUp();
  await expectTelegramError(await call('getMe', {}, { sessionId: 'missing' }), 404, 'Not Found');
  await expectTelegramError(await call('getMe', {}, { token: '1:wrong' }), 401, 'Unauthorized');
  await expectTelegramError(await call('getUpdates', {}), 404, 'Not Found');
  await expectTelegramError(await call('toString', {}), 404, 'Not Found');
});

Deno.test('paths outside the admin and bot-api prefixes are rejected', async () => {
  const { handler } = setUp();
  const response = await handler(new Request(`${ORIGIN}/somewhere`));
  assertEquals(response.status, 404);
});
