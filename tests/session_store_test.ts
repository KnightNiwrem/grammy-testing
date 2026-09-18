import { assert, assertEquals, assertMatch, assertNotEquals, assertThrows } from '@std/assert';
import { Session, SessionValidationError } from '../src/server/session_store.ts';

const MAX_TELEGRAM_ID = 2 ** 52 - 1;

Deno.test('createBot issues a Telegram-shaped token whose prefix is the bot id', () => {
  const session = new Session('s');
  const bot = session.createBot({ username: 'test_bot', first_name: 'Test' });
  assertMatch(bot.token, /^\d+:[A-Za-z0-9_-]{35}$/);
  assertEquals(bot.token.split(':')[0], String(bot.user.id));
  assertEquals(bot.user.is_bot, true);
  assertEquals(session.findBotByToken(bot.token), bot);
  assertEquals(session.users.get(bot.user.id), bot.user);
});

Deno.test('createUser draws an id inside the 52-bit range and stores the given names', () => {
  const session = new Session('s');
  const user = session.createUser({ first_name: 'Bob', last_name: 'B', username: 'bob' });
  assert(user.id >= 1 && user.id <= MAX_TELEGRAM_ID);
  assertEquals(user, {
    id: user.id,
    is_bot: false,
    first_name: 'Bob',
    last_name: 'B',
    username: 'bob',
  });
  assertEquals(session.users.get(user.id), user);
});

Deno.test('createPrivateChat copies the user names but not the user id', () => {
  const session = new Session('s');
  const user = session.createUser({ first_name: 'Alice', last_name: 'A', username: 'alice' });
  const bot = session.createBot({ username: 'test_bot', first_name: 'Test' });
  const chat = session.createPrivateChat({ userId: user.id, memberIds: [user.id, bot.user.id] });
  assertEquals(chat.chat, {
    id: chat.chat.id,
    type: 'private',
    first_name: 'Alice',
    last_name: 'A',
    username: 'alice',
  });
  assertNotEquals(chat.chat.id, user.id);
  assertEquals([...chat.memberIds], [user.id, bot.user.id]);
  assertEquals(session.chats.get(chat.chat.id), chat);
});

Deno.test('createPrivateChat rejects inconsistent definitions', () => {
  const session = new Session('s');
  const user = session.createUser({ first_name: 'Alice' });
  const bot = session.createBot({ username: 'test_bot', first_name: 'Test' });
  assertThrows(
    () => session.createPrivateChat({ userId: 999, memberIds: [999] }),
    SessionValidationError,
    'does not exist',
  );
  assertThrows(
    () => session.createPrivateChat({ userId: bot.user.id, memberIds: [bot.user.id] }),
    SessionValidationError,
    'is a bot',
  );
  assertThrows(
    () => session.createPrivateChat({ userId: user.id, memberIds: [bot.user.id] }),
    SessionValidationError,
    'must include',
  );
  assertThrows(
    () => session.createPrivateChat({ userId: user.id, memberIds: [user.id, 12345] }),
    SessionValidationError,
    'member 12345 does not exist',
  );
});

Deno.test('appendTextMessage numbers messages sequentially per chat', () => {
  const session = new Session('s');
  const user = session.createUser({ first_name: 'Alice' });
  const bot = session.createBot({ username: 'test_bot', first_name: 'Test' });
  const chat = session.createPrivateChat({ userId: user.id, memberIds: [user.id, bot.user.id] });
  const before = Math.floor(Date.now() / 1000);
  const first = session.appendTextMessage(chat, bot.user, 'one');
  const second = session.appendTextMessage(chat, bot.user, 'two');
  assertEquals(first.message_id, 1);
  assertEquals(second.message_id, 2);
  assertEquals(first.from, bot.user);
  assertEquals(first.chat, chat.chat);
  assertEquals(first.text, 'one');
  assert(first.date >= before);
  assertEquals(chat.messages, [first, second]);
});
