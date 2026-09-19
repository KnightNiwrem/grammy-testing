/**
 * Example 1 — the smallest complete flow: a user texts a bot, the bot replies.
 *
 * What this example establishes about the library:
 *
 * - A test builds a world in four lines: session, bot account, user, private chat. Everything
 *   else is the real grammY bot under test, configured only through `token` and `apiRoot`.
 * - The private conversation is opened *by the user*; the test never assembles a chat out of a
 *   member list. This mirrors Telegram, where a human always speaks first.
 * - `alice.sendText(...)` is not just storage: it must synthesize a `message` update and deliver
 *   it to the bot's long poll, or the handler below never runs.
 * - Sending returns the stored message, and the reply is awaited with `after: sent`, so the test
 *   has no sleep and no race: the wait is anchored to a message id, not to wall-clock time.
 * - `await using` on the session and the running bot means cleanup is structural. Disposal has to
 *   stop polling and release server-held long polls, or every test file would hang at exit.
 */
import { assertEquals } from '@std/assert';
import { Bot } from 'grammy';
import { connect, startBot } from './grammy_testing.ts';

Deno.test('echo bot replies to a text message in a private chat', async () => {
  const emulator = connect({ serverUrl: 'http://localhost:8081' });
  await using session = await emulator.createSession();

  const account = await session.createBot({ username: 'echo_bot' });
  const bot = new Bot(account.token, { client: { apiRoot: session.apiRoot } });
  bot.on('message:text', (ctx) => ctx.reply(`You said: ${ctx.message.text}`));
  await using _running = await startBot(bot);

  const alice = await session.createUser({ firstName: 'Alice' });
  const chat = await alice.openPrivateChat(account);

  const sent = await alice.sendText(chat, 'hello');
  const reply = await chat.waitForMessage({ from: account, after: sent });

  assertEquals(reply.text, 'You said: hello');
});
