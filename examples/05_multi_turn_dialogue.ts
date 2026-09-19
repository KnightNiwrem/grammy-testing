/**
 * Example 5 — a stateful multi-turn dialogue, with two users talking to the bot at once.
 *
 * What this example establishes about the library:
 *
 * - Real bots are conversation state machines (here: grammY's session middleware). Testing them
 *   needs nothing new from the library — only that the primitives from example 1 stay correct
 *   across many turns: each `sendText` returns an anchor, each reply is awaited `after` it.
 * - Update order is a contract. Within one chat, updates must reach the bot in the order the
 *   actions happened, and replies must land in the history in the order the bot sent them;
 *   otherwise anchored waits would pair questions with the wrong answers.
 * - Conversations are independent. Alice's and Bob's dialogues run concurrently through the same
 *   bot and must not bleed state into each other. The emulator may interleave updates *across*
 *   chats arbitrarily — the test only fixes the order *within* each chat, which is exactly the
 *   guarantee Telegram gives.
 */
import { assertEquals } from '@std/assert';
import { Bot, session } from 'grammy';
import type { Context, SessionFlavor } from 'grammy';
import { connect, startBot } from './grammy_testing.ts';
import type { TestBotAccount, TestUser } from './grammy_testing.ts';

interface SignupState {
  step: 'idle' | 'name' | 'quest';
  name?: string;
}
type SignupContext = Context & SessionFlavor<SignupState>;

async function runSignup(account: TestBotAccount, user: TestUser, name: string) {
  const chat = await user.openPrivateChat(account);
  let sent = await user.sendText(chat, '/signup');
  let reply = await chat.waitForMessage({ from: account, after: sent });
  assertEquals(reply.text, 'What is your name?');

  sent = await user.sendText(chat, name);
  reply = await chat.waitForMessage({ from: account, after: sent });
  assertEquals(reply.text, `Hi ${name}! What is your quest?`);

  sent = await user.sendText(chat, 'To seek the Grail');
  reply = await chat.waitForMessage({ from: account, after: sent });
  assertEquals(reply.text, `Welcome aboard, ${name}.`);

  // The full transcript is inspectable afterwards: three questions, three answers, one command.
  assertEquals((await chat.messages()).length, 6);
}

Deno.test('signup dialogue holds per-conversation state for concurrent users', async () => {
  const emulator = connect({ serverUrl: 'http://localhost:8081' });
  await using world = await emulator.createSession();

  const account = await world.createBot({ username: 'signup_bot' });
  const bot = new Bot<SignupContext>(account.token, { client: { apiRoot: world.apiRoot } });
  bot.use(session({ initial: (): SignupState => ({ step: 'idle' }) }));
  bot.command('signup', async (ctx) => {
    ctx.session.step = 'name';
    await ctx.reply('What is your name?');
  });
  bot.on('message:text', async (ctx) => {
    if (ctx.session.step === 'name') {
      ctx.session.name = ctx.message.text;
      ctx.session.step = 'quest';
      await ctx.reply(`Hi ${ctx.session.name}! What is your quest?`);
    } else if (ctx.session.step === 'quest') {
      ctx.session.step = 'idle';
      await ctx.reply(`Welcome aboard, ${ctx.session.name}.`);
    }
  });
  await using _running = await startBot(bot);

  const alice = await world.createUser({ firstName: 'Alice' });
  const bob = await world.createUser({ firstName: 'Bob' });

  await Promise.all([
    runSignup(account, alice, 'Alice'),
    runSignup(account, bob, 'Bob'),
  ]);
});
