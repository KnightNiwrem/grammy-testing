/**
 * End-to-end flow with a real grammY bot: declare a bot, a user, and their private chat, point
 * the bot at the session, and send a message through the emulated Bot API.
 */
import { assert, assertEquals, assertNotEquals } from '@std/assert';
import { Bot } from 'grammy';
import { EmulationClient, type EmulationClientOptions } from '../src/client/mod.ts';
import { createEmulationServerHandler } from '../src/server/handler.ts';
import { SessionStore } from '../src/server/session_store.ts';

const STANDALONE_SERVER_URL = Deno.env.get('BOT_API_EMULATOR_URL') || undefined;

/** Server-side visibility, available when the server runs in this process. */
interface ServerProbe {
  pendingLongPolls(sessionId: string): number;
}

async function runPrivateChatFlow(clientOptions: EmulationClientOptions, probe?: ServerProbe) {
  const client = new EmulationClient(clientOptions);
  const session = await client.createSession();
  try {
    const testBot = await session.createBot({ username: 'test_bot', first_name: 'Test' });
    const user = await session.createUser({ first_name: 'Alice' });
    const chat = await session.createPrivateChat({ user, bot: testBot });

    // Observe getUpdates requests so the test can stop the bot while a long poll is pending.
    const longPollIssued = Promise.withResolvers<void>();
    let getUpdatesCalls = 0;
    const observedFetch: typeof fetch = (input, init) => {
      if (new Request(input, init).url.endsWith('/getUpdates')) {
        getUpdatesCalls += 1;
        longPollIssued.resolve();
      }
      return (clientOptions.fetch ?? fetch)(input, init);
    };
    const bot = new Bot(testBot.token, {
      client: { apiRoot: session.apiRoot, fetch: observedFetch },
    });
    await bot.init();
    assertEquals(bot.botInfo, testBot.user);

    // Polling is served by the deleteWebhook and getUpdates stubs: stopping while the long poll is
    // pending aborts it, then grammY acknowledges the offset with one final getUpdates call. With
    // the server in-process, wait until it has actually armed the poll before stopping, so that
    // the abort cancels an active wait rather than arriving before the wait begins.
    const polling = bot.start();
    await longPollIssued.promise;
    if (probe) await until(() => probe.pendingLongPolls(session.id) === 1, 'poll never armed');
    const stoppingAt = Date.now();
    await bot.stop();
    await polling;
    const stopMs = Date.now() - stoppingAt;
    assert(stopMs < 5000, `stopping the bot took ${stopMs} ms, the long poll was not released`);
    assertEquals(getUpdatesCalls, 2);
    if (probe) assertEquals(probe.pendingLongPolls(session.id), 0);

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

/** Polls a condition every millisecond and fails if it does not hold within a few seconds. */
async function until(condition: () => boolean, failure: string) {
  const deadline = Date.now() + 5000;
  while (!condition()) {
    if (Date.now() > deadline) throw new Error(failure);
    await new Promise((resolve) => setTimeout(resolve, 1));
  }
}

Deno.test('grammY bot sends a private message through the in-process handler', async () => {
  const store = new SessionStore();
  const handler = createEmulationServerHandler(store);
  const fetchIntoHandler: typeof fetch = (input, init) => handler(new Request(input, init));
  await runPrivateChatFlow({ serverUrl: 'http://emulator.test', fetch: fetchIntoHandler }, {
    pendingLongPolls: (sessionId) => store.get(sessionId)?.pendingLongPolls.size ?? 0,
  });
});

Deno.test({
  name: 'grammY bot sends a private message through the standalone server',
  ignore: STANDALONE_SERVER_URL === undefined,
  fn: async () => {
    await runPrivateChatFlow({ serverUrl: STANDALONE_SERVER_URL ?? '' });
  },
});
