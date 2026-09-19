/**
 * Example 3 — the rules of a private conversation: initiation, identity, blocking.
 *
 * This example is the direct answer to the open question from the first implementation attempt
 * (findings 5, 9, and 10 of that review): what *is* a private chat in the simulated world?
 *
 * What this example establishes about the library:
 *
 * - A private conversation is owned by its (user, bot) pair. It cannot be declared with an
 *   arbitrary member list, so "a private chat with two humans" is unrepresentable rather than
 *   merely rejected. `openPrivateChat` is idempotent: the pair has one history.
 * - The conversation starts on the user's side only. Until the user opens it, the bot's send
 *   fails with Telegram's exact error, because real bots contain code that handles precisely
 *   this failure.
 * - The private chat id equals the user id. Real-world bot code addresses users as
 *   `bot.api.sendMessage(userId, ...)` — Telegram guarantees this equivalence, and an emulator
 *   that allocates unrelated ids would break every bot that relies on it. (The first attempt
 *   deliberately deviated here; usage says the deviation is untenable.)
 * - Blocking is a permission state on the pair, not a membership change: the history stays, the
 *   chat id stays, only sending flips to `403: bot was blocked by the user` — and back.
 * - None of this needs a running bot: `bot.api` alone must work against the emulator, so tests
 *   can probe outbound behavior without a polling loop.
 */
import { assertEquals } from '@std/assert';
import { assertRejects } from '@std/assert';
import { Bot, GrammyError } from 'grammy';
import { connect } from './grammy_testing.ts';

Deno.test('bot cannot initiate; the user opens the conversation', async () => {
  const emulator = connect({ serverUrl: 'http://localhost:8081' });
  await using session = await emulator.createSession();

  const account = await session.createBot({ username: 'greeter_bot' });
  const bot = new Bot(account.token, { client: { apiRoot: session.apiRoot } });
  const alice = await session.createUser({ firstName: 'Alice' });

  // No conversation exists yet, so the bot cannot speak first — Telegram's exact wording.
  await assertRejects(
    () => bot.api.sendMessage(alice.id, 'hello?'),
    GrammyError,
    "bot can't initiate conversation with a user",
  );

  // The user opens the conversation; from then on the bot may address her by her user id,
  // because on Telegram a private chat's id is the peer's user id.
  const chat = await alice.openPrivateChat(account);
  assertEquals(chat.id, alice.id);

  const delivered = await bot.api.sendMessage(alice.id, 'welcome!');
  assertEquals(delivered.chat.id, alice.id);

  // Opening again returns the same conversation, not a second history.
  const reopened = await alice.openPrivateChat(account);
  assertEquals(reopened.id, chat.id);
  assertEquals((await chat.messages()).length, (await reopened.messages()).length);
});

Deno.test('blocking the bot flips sending permission, not membership', async () => {
  const emulator = connect({ serverUrl: 'http://localhost:8081' });
  await using session = await emulator.createSession();

  const account = await session.createBot({ username: 'greeter_bot' });
  const bot = new Bot(account.token, { client: { apiRoot: session.apiRoot } });
  const alice = await session.createUser({ firstName: 'Alice' });
  const chat = await alice.openPrivateChat(account);
  await bot.api.sendMessage(alice.id, 'welcome!');

  await alice.block(account);
  await assertRejects(
    () => bot.api.sendMessage(alice.id, 'are you still there?'),
    GrammyError,
    'bot was blocked by the user',
  );

  // The conversation and its history survive the block, and unblocking restores sending.
  assertEquals((await chat.messages()).length, 1);
  await alice.unblock(account);
  const resumed = await bot.api.sendMessage(alice.id, 'welcome back!');
  assertEquals(resumed.chat.id, chat.id);
});
