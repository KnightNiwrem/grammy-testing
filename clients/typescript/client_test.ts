import { createEmulationApi } from '../../src/api/mod.ts';
import { createSessionLifecycleService } from '../../src/composition/session_lifecycle.ts';
import { MAX_TELEGRAM_USER_ID } from './constants.ts';
import { EmulationClientError, TelegramEmulationClient } from './mod.ts';
import { virtualAccountProfileSchema } from './schemas.ts';

Deno.test('TypeScript client validates the official Telegram user ID range', () => {
  const accountProfile = {
    id: MAX_TELEGRAM_USER_ID,
    is_bot: false as const,
    first_name: 'Ada',
  };

  if (!virtualAccountProfileSchema.safeParse(accountProfile).success) {
    throw new Error('Expected the maximum Telegram user ID to be valid');
  }
  if (
    virtualAccountProfileSchema.safeParse({
      ...accountProfile,
      id: MAX_TELEGRAM_USER_ID + 1,
    }).success
  ) {
    throw new Error('Expected IDs above the Telegram user range to be invalid');
  }
});

Deno.test('TypeScript client manages all currently implemented session resources', async () => {
  const publicOrigin = 'http://emulator.example:9000';
  const api = createEmulationApi({
    sessionLifecycle: createSessionLifecycleService(),
    publicOrigin,
  });
  const client = new TelegramEmulationClient(publicOrigin, {
    fetch: createInProcessFetch(api.fetch),
  });

  const session = await client.createSession();
  if (session.botApiRoot !== `${publicOrigin}/sessions/${session.id}/bot-api`) {
    throw new Error('Expected the session client to expose its Bot API root');
  }

  const createdBot = await session.createBot({
    first_name: 'Test Bot',
    username: 'test_bot',
  });
  if (createdBot.bot.first_name !== 'Test Bot' || createdBot.bot.username !== 'test_bot') {
    throw new Error('Expected the client to return the created bot');
  }

  const createdAccount = await session.createAccount({
    first_name: 'Ada',
    last_name: 'Lovelace',
    username: 'ada',
    language_code: 'en',
  });
  if (
    createdAccount.account.first_name !== 'Ada' ||
    createdAccount.account.last_name !== 'Lovelace'
  ) {
    throw new Error('Expected the client to return the created account');
  }

  const authenticatedBot = await session.getMe(createdBot.token);
  if (JSON.stringify(authenticatedBot) !== JSON.stringify(createdBot.bot)) {
    throw new Error('Expected getMe to return the created bot profile');
  }

  const sentMessage = await createdAccount.account.sendMessage({
    to: { type: 'private', botId: createdBot.bot.id },
    text: 'Hello from the client',
  });
  if (
    sentMessage.from.id !== createdAccount.account.id ||
    sentMessage.chat.id !== createdAccount.account.id ||
    sentMessage.text !== 'Hello from the client'
  ) {
    throw new Error('Expected the account-bound client to send a private message');
  }

  const history = await createdAccount.account.getMessages({
    chat: { type: 'private', botId: createdBot.bot.id },
  });
  if (history.length !== 1 || history[0].message_id !== sentMessage.message_id) {
    throw new Error('Expected the account-bound client to retrieve conversation history');
  }

  await session.end();
});

Deno.test('TypeScript client reports HTTP failures with request details', async () => {
  const publicOrigin = 'http://emulator.example:9000';
  const api = createEmulationApi({
    sessionLifecycle: createSessionLifecycleService(),
    publicOrigin,
  });
  const client = new TelegramEmulationClient(publicOrigin, {
    fetch: createInProcessFetch(api.fetch),
  });
  const session = await client.createSession();
  await session.end();

  try {
    await session.createAccount({ first_name: 'Ada' });
  } catch (error) {
    if (
      error instanceof EmulationClientError &&
      error.method === 'POST' &&
      error.status === 404 &&
      error.url.endsWith(`/sessions/${session.id}/accounts`)
    ) {
      return;
    }
    throw error;
  }

  throw new Error('Expected a request for an ended session to fail');
});

Deno.test('TypeScript client rejects a successful response that violates the contract', async () => {
  const client = new TelegramEmulationClient('http://emulator.example:9000', {
    fetch: () => Promise.resolve(Response.json({ id: 1, botApiRoot: false }, { status: 201 })),
  });

  try {
    await client.createSession();
  } catch (error) {
    if (
      error instanceof EmulationClientError &&
      error.status === 201 &&
      error.message.includes('does not match its contract')
    ) {
      return;
    }
    throw error;
  }

  throw new Error('Expected the client to reject an invalid session response');
});

function createInProcessFetch(
  handler: (request: Request) => Response | Promise<Response>,
): typeof globalThis.fetch {
  return async (input, init) => await handler(new Request(input, init));
}
