/**
 * Example 6 — looking behind the curtain: the API call log, and session isolation.
 *
 * This example is why the library cannot be "just the Bot API re-implemented": tests need an
 * admin surface that Telegram itself never offers.
 *
 * What this example establishes about the library:
 *
 * - The session records every Bot API call it serves, with payload and outcome. Message history
 *   answers *what the user saw*; the call log answers *how the bot behaved on the wire* —
 *   `parse_mode`, `reply_markup`, and calls that produced no message at all because they failed.
 *   Failed calls are data, not just client-side exceptions.
 * - Sessions are hermetic worlds. The same bot username can exist in two sessions, and an id
 *   from one session means nothing in another: addressing it fails exactly like any unknown
 *   chat, with no cross-session leak to detect or prevent in test code.
 * - Cleanup is part of the contract. Disposing a session destroys its entities and completes any
 *   long poll the server still holds for it (the first attempt leaked those for up to 24.8
 *   days); `await using` disposes the bot before the session, and neither step may hang.
 */
import { assert, assertEquals, assertRejects } from '@std/assert';
import { Bot, GrammyError } from 'grammy';
import { connect, startBot } from './grammy_testing.ts';

Deno.test('the call log exposes payloads and failures of the bot under test', async () => {
  const emulator = connect({ serverUrl: 'http://localhost:8081' });
  await using session = await emulator.createSession();

  const account = await session.createBot({ username: 'shop_bot' });
  const bot = new Bot(account.token, { client: { apiRoot: session.apiRoot } });
  bot.command('deals', (ctx) => ctx.reply('*Today only!*', { parse_mode: 'MarkdownV2' }));
  await using _running = await startBot(bot);

  const alice = await session.createUser({ firstName: 'Alice' });
  const chat = alice.chatWith(account);
  const sent = await alice.sendText(chat, '/deals');
  await chat.waitForMessage({ from: account, after: sent });

  // The delivered message proves *that* the bot replied; the call log proves *how*.
  const sends = await session.apiCalls({ method: 'sendMessage' });
  assertEquals(sends.length, 1);
  assertEquals(sends[0].payload['parse_mode'], 'MarkdownV2');
  assertEquals(sends[0].outcome, { ok: true });

  // A failing call is recorded with Telegram's error, not merely thrown at the client.
  const nobody = await session.createUser({ firstName: 'Nobody' });
  await assertRejects(() => bot.api.sendMessage(nobody.id, 'hi'), GrammyError);
  const failures = (await session.apiCalls({ method: 'sendMessage' }))
    .filter((call) => !call.outcome.ok);
  assertEquals(failures.length, 1);
  const failure = failures[0].outcome;
  assert(!failure.ok && failure.errorCode === 403);
});

Deno.test('two sessions are hermetic worlds', async () => {
  const emulator = connect({ serverUrl: 'http://localhost:8081' });
  await using sessionA = await emulator.createSession();
  await using sessionB = await emulator.createSession();

  // Usernames are per-session namespaces; parallel test files never contend for them.
  const accountA = await sessionA.createBot({ username: 'shop_bot' });
  const accountB = await sessionB.createBot({ username: 'shop_bot' });
  assert(accountA.token !== accountB.token);

  // A live conversation in session B is invisible to session A's bot: same failure as any
  // unknown chat, because the id simply does not exist in A's world.
  const bea = await sessionB.createUser({ firstName: 'Bea' });
  await bea.sendText(bea.chatWith(accountB), 'hi');
  const botA = new Bot(accountA.token, { client: { apiRoot: sessionA.apiRoot } });
  await assertRejects(() => botA.api.sendMessage(bea.id, 'hello?'), GrammyError, 'chat not found');
});
