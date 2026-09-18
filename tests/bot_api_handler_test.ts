import { assert, assertEquals } from '@std/assert';
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
    options: { sessionId?: string; token?: string; signal?: AbortSignal } = {},
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
          signal: options.signal,
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

Deno.test('sendMessage answers chat not found for values that are not a chat id', async () => {
  const { chat, call } = setUp();
  const notAChatId: unknown[] = [
    [chat.chat.id],
    { toString: 'invalid' },
    true,
    1.5,
    `${chat.chat.id}.0`,
    ` ${chat.chat.id}`,
  ];
  for (const chat_id of notAChatId) {
    await expectTelegramError(
      await call('sendMessage', { chat_id, text: 'hello' }),
      400,
      'Bad Request: chat not found',
    );
  }
  await expectTelegramError(
    await call('sendMessage', { chat_id: null, text: 'hello' }),
    400,
    'Bad Request: chat_id is empty',
  );
  assertEquals(chat.messages, []);
});

Deno.test('malformed form bodies answer a client error', async () => {
  const { session, bot, chat, handler } = setUp();
  const url = `${ORIGIN}/bot-api/${session.id}/bot${bot.token}/sendMessage`;
  const malformed: [string, string][] = [
    ['multipart/form-data', 'garbage'],
    ['multipart/form-data; boundary=xyz', 'not a multipart body'],
  ];
  for (const [contentType, body] of malformed) {
    const response = await handler(
      new Request(url, { method: 'POST', headers: { 'content-type': contentType }, body }),
    );
    await expectTelegramError(response, 400, 'Bad Request: request body is not valid form data');
  }
  assertEquals(chat.messages, []);
});

Deno.test('deleteWebhook answers true', async () => {
  const { call } = setUp();
  const response = await call('deleteWebhook', { drop_pending_updates: true });
  assertEquals(response.status, 200);
  assertEquals(await response.json(), { ok: true, result: true });
});

Deno.test('getUpdates answers an empty batch at once without a timeout', async () => {
  const { call } = setUp();
  for (const payload of [{}, { timeout: 0 }, { offset: 5, limit: 1 }, { timeout: 'soon' }]) {
    const response = await call('getUpdates', payload);
    assertEquals(response.status, 200);
    assertEquals(await response.json(), { ok: true, result: [] });
  }
});

Deno.test('getUpdates holds a long poll until the client aborts it', async () => {
  const { call } = setUp();
  const controller = new AbortController();
  const startedAt = Date.now();
  const pending = call('getUpdates', { timeout: 30 }, { signal: controller.signal });
  setTimeout(() => controller.abort(), 50);
  const response = await pending;
  const elapsedMs = Date.now() - startedAt;
  assertEquals(response.status, 200);
  assertEquals(await response.json(), { ok: true, result: [] });
  assert(elapsedMs >= 50 && elapsedMs < 2000, `long poll ended after ${elapsedMs} ms`);
});

Deno.test('routing errors use Telegram error codes', async () => {
  const { call } = setUp();
  await expectTelegramError(await call('getMe', {}, { sessionId: 'missing' }), 404, 'Not Found');
  await expectTelegramError(await call('getMe', {}, { token: '1:wrong' }), 401, 'Unauthorized');
  await expectTelegramError(await call('sendPhoto', {}), 404, 'Not Found');
  await expectTelegramError(await call('toString', {}), 404, 'Not Found');
});

Deno.test('paths outside the admin and bot-api prefixes are rejected', async () => {
  const { handler } = setUp();
  const response = await handler(new Request(`${ORIGIN}/somewhere`));
  assertEquals(response.status, 404);
});
