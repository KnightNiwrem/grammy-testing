/**
 * Example 2 — inline keyboards: a command answered with buttons, a button press, an edit.
 *
 * What this example establishes about the library:
 *
 * - Users interact with *messages the bot produced*, not with raw update payloads. Tapping a
 *   button takes the received message plus a selector (visible label or `callback_data`); the
 *   library resolves it against the message's stored `reply_markup` and synthesizes the
 *   `callback_query` update. A test never hand-writes a callback query.
 * - A button tap has its own observable consequence besides messages: the bot's
 *   `answerCallbackQuery` call. The tap returns a handle whose `answered()` resolves with what
 *   the user would see (toast text, alert flag), so tests can assert the bot acknowledged the
 *   press — a behavior invisible in the message history.
 * - Message edits are first-class: `waitForEdit` anchors on the message snapshot the test already
 *   holds, so the emulator must keep enough edit state to tell "already edited past this
 *   snapshot" from "not yet edited".
 */
import { assertEquals } from '@std/assert';
import { Bot, InlineKeyboard } from 'grammy';
import { connect, startBot } from './grammy_testing.ts';

Deno.test('bot answers a button press and edits its menu message', async () => {
  const emulator = connect({ serverUrl: 'http://localhost:8081' });
  await using session = await emulator.createSession();

  const account = await session.createBot({ username: 'color_bot' });
  const bot = new Bot(account.token, { client: { apiRoot: session.apiRoot } });
  bot.command('start', (ctx) =>
    ctx.reply('Pick a color', {
      reply_markup: new InlineKeyboard()
        .text('Red', 'color:red')
        .text('Blue', 'color:blue'),
    }));
  bot.callbackQuery(/^color:(\w+)$/, async (ctx) => {
    await ctx.answerCallbackQuery({ text: 'Saved!' });
    await ctx.editMessageText(`You picked ${ctx.match[1]}`);
  });
  await using _running = await startBot(bot);

  const alice = await session.createUser({ firstName: 'Alice' });
  const chat = alice.chatWith(account);

  const sent = await alice.sendText(chat, '/start');
  const menu = await chat.waitForMessage({ from: account, after: sent });

  const tap = await alice.tapInlineButton(menu, { label: 'Blue' });
  const answer = await tap.answered();
  assertEquals(answer.text, 'Saved!');
  assertEquals(answer.showAlert, false);

  const edited = await chat.waitForEdit({ of: menu });
  assertEquals(edited.text, 'You picked blue');
});
