/**
 * Example 3 — the rules of a private conversation: first contact, identity, blocking.
 *
 * This example is the direct answer to the open question from the first implementation attempt
 * (findings 5, 9, and 10 of that review): what *is* a private chat in the simulated world?
 *
 * What this example establishes about the library:
 *
 * - A private conversation is owned by its (user, bot) pair and comes into existence with the
 *   user's first message to it — "there is a conversation" and "there is a history" are the same
 *   fact, as on Telegram, where pressing Start just sends `/start`. There is no user-side "open
 *   a chat" event: Telegram delivers a bot nothing when a user merely views its chat screen, so
 *   the library has no such action either. `chatWith` is only an address.
 * - Until that first message, the bot's send fails with Telegram's exact error, because real
 *   bots contain code that handles precisely this failure.
 * - The private chat id equals the user id. Real-world bot code addresses users as
 *   `bot.api.sendMessage(userId, ...)` — Telegram guarantees this equivalence, and an emulator
 *   that allocates unrelated ids would break every bot that relies on it. (The first attempt
 *   deliberately deviated here; usage says the deviation is untenable.) This is also what lets
 *   `chatWith` be synchronous: the address is derivable without touching the server.
 * - Blocking is a permission state on the pair, not a membership change: the history stays, the
 *   chat id stays, only sending flips to `403: bot was blocked by the user` — and back.
 * - None of this needs a running bot: `bot.api` alone must work against the emulator, so tests
 *   can probe outbound behavior without a polling loop.
 */
import { assertEquals } from '@std/assert';
import { assertRejects } from '@std/assert';
import { Bot, GrammyError } from 'grammy';
import { connect } from './grammy_testing.ts';

Deno.test('the conversation begins with the user’s first message, never the bot’s', async () => {
  const emulator = connect({ serverUrl: 'http://localhost:8081' });
  await using session = await emulator.createSession();

  const account = await session.createBot({ username: 'greeter_bot' });
  const bot = new Bot(account.token, { client: { apiRoot: session.apiRoot } });
  const alice = await session.createUser({ firstName: 'Alice' });

  // An address exists for every (user, bot) pair — like the empty chat screen a user sees
  // before pressing Start — and on Telegram it is the user's own id.
  const chat = alice.chatWith(account);
  assertEquals(chat.id, alice.id);

  // But an address is not a conversation: no history yet, so the bot cannot speak first —
  // Telegram's exact wording.
  await assertRejects(
    () => bot.api.sendMessage(alice.id, 'hello?'),
    GrammyError,
    "bot can't initiate conversation with a user",
  );

  // The user's first message creates the conversation; from then on the bot may address her
  // by her user id.
  await alice.sendText(chat, '/start');
  const delivered = await bot.api.sendMessage(alice.id, 'welcome!');
  assertEquals(delivered.chat.id, alice.id);

  // The pair has one conversation: another handle addresses the same history.
  const sameChat = alice.chatWith(account);
  assertEquals(sameChat.id, chat.id);
  assertEquals((await sameChat.messages()).length, (await chat.messages()).length);
});

Deno.test('blocking the bot flips sending permission, not membership', async () => {
  const emulator = connect({ serverUrl: 'http://localhost:8081' });
  await using session = await emulator.createSession();

  const account = await session.createBot({ username: 'greeter_bot' });
  const bot = new Bot(account.token, { client: { apiRoot: session.apiRoot } });
  const alice = await session.createUser({ firstName: 'Alice' });
  const chat = alice.chatWith(account);
  await alice.sendText(chat, '/start');
  await bot.api.sendMessage(alice.id, 'welcome!');

  await alice.block(account);
  await assertRejects(
    () => bot.api.sendMessage(alice.id, 'are you still there?'),
    GrammyError,
    'bot was blocked by the user',
  );

  // The conversation and its history survive the block, and unblocking restores sending.
  assertEquals((await chat.messages()).length, 2);
  await alice.unblock(account);
  const resumed = await bot.api.sendMessage(alice.id, 'welcome back!');
  assertEquals(resumed.chat.id, chat.id);
});
