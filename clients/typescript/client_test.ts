import { createEmulationApi } from '../../src/api/mod.ts';
import { SessionRegistry } from '../../src/session_registry.ts';
import { EmulationClientError, TelegramEmulationClient } from './mod.ts';

Deno.test('TypeScript client manages all currently implemented session resources', async () => {
  const publicOrigin = 'http://emulator.example:9000';
  const api = createEmulationApi({
    sessions: new SessionRegistry(),
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

  await session.end();
});

Deno.test('TypeScript client reports HTTP failures with request details', async () => {
  const publicOrigin = 'http://emulator.example:9000';
  const api = createEmulationApi({
    sessions: new SessionRegistry(),
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
