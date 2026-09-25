import { createEmulationApi } from '../../src/api/mod.ts';
import { createSessionLifecycleService } from '../../src/composition/session_lifecycle.ts';
import {
  BotActivityTimeoutError,
  EmulationClientError,
  latest,
  TelegramEmulationClient,
  UnexpectedBotActivityError,
} from './mod.ts';
import type { BotActivityCriteria } from './mod.ts';

Deno.test('BotActivityLog waits for entries after the same position in either order', async () => {
  for (const order of [['B', 'C'], ['C', 'B']]) {
    const { session, bot, callBot } = await createFixture();
    const activity = session.botActivity({ bot_id: bot.id });
    const start = await activity.position();

    await callBot('sendMessage', { text: 'A' });
    for (const text of order) {
      await callBot('sendMessage', { text });
    }

    const a = await activity.waitFor({ parameters: { text: 'A' } }, { after: start });
    const [b, c] = await Promise.all([
      activity.waitFor({ parameters: { text: 'B' } }, { after: a }),
      activity.waitFor({ parameters: { text: 'C' } }, { after: a }),
    ]);
    if (b.position <= a.position || c.position <= a.position || b.position === c.position) {
      throw new Error(`Expected B and C to follow A when sent in the order ${order.join()}`);
    }
    await session.end();
  }
});

Deno.test('BotActivityLog waits for an entry that is recorded later', async () => {
  const { session, callBot } = await createFixture();
  const activity = session.botActivity();
  const start = await activity.position();

  const reply = activity.waitFor({ method: 'sendMessage' }, { after: start });
  await callBot('sendChatAction', { action: 'typing' });
  await callBot('sendMessage', { text: 'Hello' });

  const entry = await reply;
  if (entry.parameters.text !== 'Hello' || !entry.answer.ok) {
    throw new Error('Expected the wait to find the successful sendMessage call');
  }
  await session.end();
});

Deno.test('BotActivityLog keeps waiting past entries its where predicate rejects', async () => {
  const { session, callBot } = await createFixture();
  const activity = session.botActivity();
  const start = await activity.position();
  await callBot('sendMessage', { text: 'first' });

  const reply = activity.waitFor(
    {
      method: 'sendMessage',
      where: (entry) => entry.parameters.text === 'second',
    },
    { after: start },
  );
  await callBot('sendMessage', { text: 'second' });

  const entry = await reply;
  if (entry.parameters.text !== 'second' || entry.position !== 2) {
    throw new Error('Expected the wait to skip the rejected entry and find the later one');
  }
  await session.end();
});

Deno.test('BotActivityLog gives a view where predicate the entries its criteria can match', async () => {
  const { session, callBot } = await createFixture();
  const activity = session.botActivity({
    kind: 'bot_api_call',
    where: (entry) => entry.method !== 'sendChatAction',
  });
  await callBot('sendChatAction', { action: 'typing' });
  await callBot('sendMessage', { text: 'Hello' });

  const call = await activity.waitFor({ ok: true }, { after: 0 });
  if (call.method !== 'sendMessage' || call.position !== 2) {
    throw new Error('Expected the view where predicate to skip the chat action');
  }
  await session.end();
});

Deno.test('BotActivityLog finds the confirmation of a delivered update by its ID', async () => {
  const { session, bot, account, getUpdates } = await createFixture();
  await account.sendMessage({ to: { type: 'private', botId: bot.id }, text: 'Second' });
  await getUpdates({});
  await getUpdates({ offset: 3 });
  const activity = session.botActivity({ bot_id: bot.id });

  const delivered = await activity.waitFor(
    {
      kind: 'update_delivered',
      where: (entry) =>
        (entry.update.message as { readonly text?: string } | undefined)?.text === 'Second',
    },
    { after: 0 },
  );
  const confirmed = await activity.waitFor(
    { kind: 'update_confirmed', update_id: delivered.update.update_id },
    { after: delivered },
  );
  const firstOfUpdate = await activity.waitFor({ update_id: 2 }, { after: 0 });

  if (confirmed.update_id !== 2 || confirmed.position !== 4) {
    throw new Error('Expected to skip the confirmation of the first update and find the second');
  }
  if (firstOfUpdate.position !== delivered.position || firstOfUpdate.via !== 'polling') {
    throw new Error('Expected the update ID alone to find the delivery first');
  }
  await session.end();
});

Deno.test('BotActivityLog cursors move independently of each other', async () => {
  const { session, callBot } = await createFixture();
  const activity = session.botActivity();
  await callBot('sendMessage', { text: 'A' });
  await callBot('sendMessage', { text: 'C' });
  await callBot('sendMessage', { text: 'B' });

  const a = await activity.waitFor({ parameters: { text: 'A' } }, { after: 0 });
  const throughB = activity.cursor({ after: a });
  const throughC = activity.cursor({ after: a });
  const c = await throughC.next({ parameters: { text: 'C' } });
  const b = await throughB.next({ parameters: { text: 'B' } });

  if (throughC.position !== c.position || throughB.position !== b.position) {
    throw new Error('Expected each cursor to move to the entry it found');
  }
  if (latest(b, c) !== b.position || latest(a) !== a.position || latest(0, c) !== c.position) {
    throw new Error('Expected latest to pick the latest position');
  }
  await session.end();
});

Deno.test('BotActivityLog fails a wait that finds no entry in time', async () => {
  const { session, bot, callBot } = await createFixture();
  const activity = session.botActivity({ bot_id: bot.id }, { timeoutMs: 20 });
  await callBot('sendMessage', { text: 'Before' });
  const start = await activity.position();

  try {
    await activity.waitFor({ method: 'sendMessage' }, { after: start });
  } catch (error) {
    if (
      error instanceof BotActivityTimeoutError && error.after === start &&
      error.timeoutMs === 20 && error.filter.bot_id === bot.id &&
      error.filter.method === 'sendMessage'
    ) {
      await session.end();
      return;
    }
    throw error;
  }
  throw new Error('Expected the wait to fail with a timeout');
});

Deno.test('BotActivityLog asserts that a range holds no matching entry', async () => {
  const { session, callBot } = await createFixture();
  const activity = session.botActivity();
  const start = await activity.position();
  await callBot('sendMessage', { text: 'One' });
  await callBot('deleteMessage', { message_id: 1 });
  const fence = await callBot('sendMessage', { text: 'Two' }).then(() =>
    activity.waitFor({ parameters: { text: 'Two' } }, { after: start })
  );

  await activity.assertNone({ method: 'editMessageText' }, { after: start, before: fence });
  try {
    await activity.assertNone({ method: 'deleteMessage' }, { after: start, before: fence });
  } catch (error) {
    if (
      error instanceof UnexpectedBotActivityError && error.entries.length === 1 &&
      error.entries[0].kind === 'bot_api_call' && error.entries[0].method === 'deleteMessage'
    ) {
      await session.end();
      return;
    }
    throw error;
  }
  throw new Error('Expected the range with a deleteMessage call to fail the assertion');
});

Deno.test('BotActivityLog rejects a read whose filter conflicts with the log filter', async () => {
  const { session, bot } = await createFixture();
  const activity = session.botActivity({ bot_id: bot.id, method: 'sendMessage' });

  await activity.assertNone({ method: 'SENDMESSAGE' }, { after: 0, before: 1 });
  const conflictingFilters: BotActivityCriteria[] = [
    { bot_id: bot.id + 1 },
    { method: 'deleteMessage' },
  ];
  for (const filter of conflictingFilters) {
    try {
      await activity.assertNone(filter, { after: 0, before: 1 });
    } catch (error) {
      if (error instanceof TypeError) {
        continue;
      }
      throw error;
    }
    throw new Error(`Expected ${JSON.stringify(filter)} to conflict with the log filter`);
  }
  await session.end();
});

Deno.test('BotActivityLog reports positions the server rejects', async () => {
  const { session } = await createFixture();
  try {
    await session.botActivity().waitFor({}, { after: 5 });
  } catch (error) {
    if (error instanceof EmulationClientError && error.status === 400) {
      await session.end();
      return;
    }
    throw error;
  }
  throw new Error('Expected a position beyond the head to be rejected');
});

async function createFixture() {
  const publicOrigin = 'http://emulator.example:9000';
  const api = createEmulationApi({
    sessionLifecycle: createSessionLifecycleService(),
    publicOrigin,
  });
  const fetch = createInProcessFetch(api.fetch);
  const client = new TelegramEmulationClient(publicOrigin, { fetch });
  const session = await client.createSession();
  const { token, bot } = await session.createBot({ first_name: 'Test Bot', username: 'test_bot' });
  const { account } = await session.createAccount({ first_name: 'Ada' });
  await account.sendMessage({ to: { type: 'private', botId: bot.id }, text: '/start' });

  /** Calls a Bot API method as the bot, in the account's private chat. */
  const callBot = async (method: string, parameters: Record<string, unknown>) => {
    await fetch(`${session.botApiRoot}/bot${token}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: account.id, ...parameters }),
    });
  };
  /** Polls the bot's updates, which delivers them and confirms those before `offset`. */
  const getUpdates = async (parameters: { readonly offset?: number }) => {
    await fetch(`${session.botApiRoot}/bot${token}/getUpdates`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(parameters),
    });
  };
  return { session, bot, account, callBot, getUpdates };
}

function createInProcessFetch(
  handler: (request: Request) => Response | Promise<Response>,
): typeof globalThis.fetch {
  return async (input, init) => await handler(new Request(input, init));
}
