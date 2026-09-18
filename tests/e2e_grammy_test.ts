/**
 * End-to-end flow with a real grammY bot: declare a bot, a user, and their private chat, point
 * the bot at the session, and send a message through the emulated Bot API.
 */
import { assertEquals, assertNotEquals } from '@std/assert';
import { Bot } from 'grammy';
import { EmulationClient, type EmulationClientOptions } from '../src/client/mod.ts';
import { createEmulationServerHandler } from '../src/server/handler.ts';

const STANDALONE_SERVER_URL = Deno.env.get('BOT_API_EMULATOR_URL') || undefined;

async function runPrivateChatFlow(clientOptions: EmulationClientOptions) {
  const client = new EmulationClient(clientOptions);
  const session = await client.createSession();
  try {
    const testBot = await session.createBot({ username: 'test_bot', first_name: 'Test' });
    const user = await session.createUser({ first_name: 'Alice' });
    const chat = await session.createPrivateChat({ user, bot: testBot });

    const bot = new Bot(testBot.token, {
      client: { apiRoot: session.apiRoot, fetch: clientOptions.fetch },
    });
    await bot.init();
    assertEquals(bot.botInfo, testBot.user);

    // Polling is served by the deleteWebhook and getUpdates stubs: start, then stop while the
    // long poll is pending, which aborts it and issues the final offset acknowledgement.
    const started = Promise.withResolvers<void>();
    const polling = bot.start({ onStart: () => started.resolve() });
    await started.promise;
    await new Promise((resolve) => setTimeout(resolve, 20)); // let the long poll be issued
    await bot.stop();
    await polling;

    const sent = await bot.api.sendMessage(chat.id, 'hello from grammY');
    assertEquals(sent.text, 'hello from grammY');
    assertEquals(sent.chat, chat.chat);
    assertEquals(sent.from, testBot.user);
    assertEquals(sent.message_id, 1);
    assertNotEquals(sent.chat.id, user.id);
    assertEquals(await chat.listMessages(), [sent]);
  } finally {
    await session.destroy();
  }
}

Deno.test('grammY bot sends a private message through the in-process handler', async () => {
  const handler = createEmulationServerHandler();
  const fetchIntoHandler: typeof fetch = (input, init) => handler(new Request(input, init));
  await runPrivateChatFlow({ serverUrl: 'http://emulator.test', fetch: fetchIntoHandler });
});

Deno.test({
  name: 'grammY bot sends a private message through the standalone server',
  ignore: STANDALONE_SERVER_URL === undefined,
  fn: async () => {
    await runPrivateChatFlow({ serverUrl: STANDALONE_SERVER_URL ?? '' });
  },
});
