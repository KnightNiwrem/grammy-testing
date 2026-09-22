import { Bot } from 'https://cdn.jsdelivr.net/gh/grammyjs/grammY@^1.46.0/src/bot.ts';

import { createEmulationApi } from '../src/api/mod.ts';
import { createSessionLifecycleService } from '../src/composition/session_lifecycle.ts';

Deno.test('POST /sessions creates a session and returns its API locations', async () => {
  const publicOrigin = 'http://emulator.example:9000';
  const api = createEmulationApi({
    sessionLifecycle: createSessionLifecycleService(),
    publicOrigin,
  });

  const response = await api.request('/sessions', { method: 'POST' });
  const body: unknown = await response.json();

  if (response.status !== 201) {
    throw new Error(`Expected status 201, received ${response.status}`);
  }
  if (!isSessionResponse(body)) {
    throw new Error('Expected a session response with an ID and Bot API root');
  }

  const sessionPath = `/sessions/${body.id}`;
  if (response.headers.get('Location') !== sessionPath) {
    throw new Error('Expected Location to identify the created session');
  }
  if (body.botApiRoot !== `${publicOrigin}${sessionPath}/bot-api`) {
    throw new Error('Expected botApiRoot to identify the session Bot API');
  }
});

Deno.test('DELETE /sessions/:sessionId ends an active session', async () => {
  const api = createEmulationApi({
    sessionLifecycle: createSessionLifecycleService(),
    publicOrigin: 'http://emulator.example:9000',
  });
  const createResponse = await api.request('/sessions', { method: 'POST' });
  const sessionPath = createResponse.headers.get('Location');
  if (sessionPath === null) {
    throw new Error('Expected the created session to have a Location');
  }

  const deleteResponse = await api.request(sessionPath, { method: 'DELETE' });
  if (deleteResponse.status !== 204) {
    throw new Error(`Expected status 204, received ${deleteResponse.status}`);
  }
});

Deno.test('POST /sessions/:sessionId/bots creates a virtual bot', async () => {
  const api = createEmulationApi({
    sessionLifecycle: createSessionLifecycleService(),
    publicOrigin: 'http://emulator.example:9000',
  });
  const createSessionResponse = await api.request('/sessions', { method: 'POST' });
  const sessionPath = createSessionResponse.headers.get('Location');
  if (sessionPath === null) {
    throw new Error('Expected the created session to have a Location');
  }

  const response = await api.request(`${sessionPath}/bots`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ first_name: 'Test Bot', username: 'test_bot' }),
  });
  const body: unknown = await response.json();

  if (response.status !== 201) {
    throw new Error(`Expected status 201, received ${response.status}`);
  }
  if (!isCreatedBotResponse(body)) {
    throw new Error('Expected a created bot response');
  }

  const botPath = `${sessionPath}/bots/${body.bot.id}`;
  if (response.headers.get('Location') !== botPath) {
    throw new Error('Expected Location to identify the created bot');
  }
  if (!body.token.startsWith(`${body.bot.id}:`)) {
    throw new Error('Expected the bot token to be prefixed with its user ID');
  }
  if (
    body.bot.is_bot !== true ||
    body.bot.first_name !== 'Test Bot' ||
    body.bot.username !== 'test_bot'
  ) {
    throw new Error('Expected the response to contain the virtual bot profile');
  }
});

Deno.test('POST /sessions/:sessionId/accounts creates an account in the shared ID namespace', async () => {
  const api = createEmulationApi({
    sessionLifecycle: createSessionLifecycleService(),
    publicOrigin: 'http://emulator.example:9000',
  });
  const createSessionResponse = await api.request('/sessions', { method: 'POST' });
  const sessionPath = createSessionResponse.headers.get('Location');
  if (sessionPath === null) {
    throw new Error('Expected the created session to have a Location');
  }

  await api.request(`${sessionPath}/bots`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ first_name: 'Test Bot', username: 'test_bot' }),
  });
  const response = await api.request(`${sessionPath}/accounts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      first_name: 'Ada',
      last_name: 'Lovelace',
      username: 'ada',
      language_code: 'en',
    }),
  });
  const body: unknown = await response.json();

  if (response.status !== 201) {
    throw new Error(`Expected status 201, received ${response.status}`);
  }
  if (!isCreatedAccountResponse(body)) {
    throw new Error('Expected a created account response');
  }
  if (response.headers.get('Location') !== `${sessionPath}/accounts/${body.account.id}`) {
    throw new Error('Expected Location to identify the created account');
  }
  if (
    body.account.id !== 2 ||
    body.account.is_bot !== false ||
    body.account.first_name !== 'Ada' ||
    body.account.last_name !== 'Lovelace' ||
    body.account.username !== 'ada' ||
    body.account.language_code !== 'en'
  ) {
    throw new Error('Expected the response to contain the virtual account profile');
  }
});

Deno.test('POST /sessions/:sessionId/bot-api/bot:token/getMe returns the bot profile', async () => {
  const api = createEmulationApi({
    sessionLifecycle: createSessionLifecycleService(),
    publicOrigin: 'http://emulator.example:9000',
  });
  const createSessionResponse = await api.request('/sessions', { method: 'POST' });
  const sessionPath = createSessionResponse.headers.get('Location');
  if (sessionPath === null) {
    throw new Error('Expected the created session to have a Location');
  }

  const createBotResponse = await api.request(`${sessionPath}/bots`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ first_name: 'Test Bot', username: 'test_bot' }),
  });
  const createdBot: unknown = await createBotResponse.json();
  if (!isCreatedBotResponse(createdBot)) {
    throw new Error('Expected a created bot response');
  }

  const response = await api.request(
    `${sessionPath}/bot-api/bot${createdBot.token}/getMe`,
    { method: 'POST' },
  );
  const body: unknown = await response.json();

  if (response.status !== 200) {
    throw new Error(`Expected status 200, received ${response.status}`);
  }
  if (!isGetMeResponse(body)) {
    throw new Error('Expected a successful getMe response');
  }
  if (JSON.stringify(body.result) !== JSON.stringify(createdBot.bot)) {
    throw new Error('Expected getMe to return the stored virtual bot profile');
  }
});

Deno.test('private account messages are stored and delivered through getUpdates', async () => {
  const publicOrigin = 'http://emulator.example:9000';
  const api = createEmulationApi({
    sessionLifecycle: createSessionLifecycleService(),
    publicOrigin,
  });
  const createSessionResponse = await api.request('/sessions', { method: 'POST' });
  const sessionPath = createSessionResponse.headers.get('Location');
  if (sessionPath === null) {
    throw new Error('Expected the created session to have a Location');
  }

  const createBotResponse = await api.request(`${sessionPath}/bots`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ first_name: 'Test Bot', username: 'test_bot' }),
  });
  const createdBot: unknown = await createBotResponse.json();
  if (!isCreatedBotResponse(createdBot)) {
    throw new Error('Expected a created bot response');
  }
  const createAccountResponse = await api.request(`${sessionPath}/accounts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      first_name: 'Ada',
      last_name: 'Lovelace',
      username: 'ada',
      language_code: 'en',
    }),
  });
  const createdAccount: unknown = await createAccountResponse.json();
  if (!isCreatedAccountResponse(createdAccount)) {
    throw new Error('Expected a created account response');
  }

  const sendResponse = await api.request(
    `${sessionPath}/accounts/${createdAccount.account.id}/messages`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: { type: 'private', botId: createdBot.bot.id },
        text: 'Hello from Ada',
      }),
    },
  );
  const sentBody: unknown = await sendResponse.json();
  if (sendResponse.status !== 201 || !isSentMessageResponse(sentBody)) {
    throw new Error('Expected the account message to be accepted');
  }
  if (
    sentBody.message.text !== 'Hello from Ada' ||
    sentBody.message.from.id !== createdAccount.account.id ||
    sentBody.message.chat.id !== createdAccount.account.id ||
    sentBody.message.chat.type !== 'private'
  ) {
    throw new Error('Expected a Telegram-shaped private message response');
  }

  const historyResponse = await api.request(
    `${sessionPath}/accounts/${createdAccount.account.id}/conversations/private/${createdBot.bot.id}/messages`,
  );
  const historyBody: unknown = await historyResponse.json();
  if (
    historyResponse.status !== 200 ||
    !isMessageHistoryResponse(historyBody) ||
    historyBody.messages.length !== 1 ||
    historyBody.messages[0].message_id !== sentBody.message.message_id
  ) {
    throw new Error('Expected the sent message to be directly available in conversation history');
  }

  const getUpdatesPath = `${sessionPath}/bot-api/bot${createdBot.token}/getUpdates`;
  const grammyBot = new Bot(createdBot.token, {
    client: {
      apiRoot: `${publicOrigin}${sessionPath}/bot-api`,
      fetch: createInProcessFetch(api.fetch),
    },
  });
  const grammyUpdates = await grammyBot.api.getUpdates();
  if (
    grammyUpdates.length !== 1 ||
    grammyUpdates[0].message?.message_id !== sentBody.message.message_id
  ) {
    throw new Error('Expected grammY to receive the emulated message update');
  }

  const updatesResponse = await api.request(getUpdatesPath, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ limit: 100, timeout: 0 }),
  });
  const updatesBody: unknown = await updatesResponse.json();
  if (
    updatesResponse.status !== 200 ||
    !isGetUpdatesResponse(updatesBody) ||
    updatesBody.result.length !== 1 ||
    updatesBody.result[0].update_id !== 1 ||
    updatesBody.result[0].message.message_id !== sentBody.message.message_id
  ) {
    throw new Error('Expected getUpdates to deliver the account message update');
  }

  const confirmationResponse = await api.request(getUpdatesPath, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ offset: 2 }),
  });
  const confirmationBody: unknown = await confirmationResponse.json();
  if (
    !isGetUpdatesResponse(confirmationBody) ||
    confirmationBody.result.length !== 0
  ) {
    throw new Error('Expected a higher offset to confirm the delivered update');
  }
});

Deno.test('private message routes validate participants and request bodies', async () => {
  const api = createEmulationApi({
    sessionLifecycle: createSessionLifecycleService(),
    publicOrigin: 'http://emulator.example:9000',
  });
  const createSessionResponse = await api.request('/sessions', { method: 'POST' });
  const sessionPath = createSessionResponse.headers.get('Location');
  if (sessionPath === null) {
    throw new Error('Expected the created session to have a Location');
  }
  const createAccountResponse = await api.request(`${sessionPath}/accounts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ first_name: 'Ada' }),
  });
  const createdAccount: unknown = await createAccountResponse.json();
  if (!isCreatedAccountResponse(createdAccount)) {
    throw new Error('Expected a created account response');
  }

  const missingBotResponse = await api.request(
    `${sessionPath}/accounts/${createdAccount.account.id}/messages`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to: { type: 'private', botId: 999 }, text: 'Hello' }),
    },
  );
  const emptyTextResponse = await api.request(
    `${sessionPath}/accounts/${createdAccount.account.id}/messages`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to: { type: 'private', botId: 999 }, text: '' }),
    },
  );

  if (missingBotResponse.status !== 404 || emptyTextResponse.status !== 400) {
    throw new Error('Expected message routes to distinguish missing participants from bad input');
  }
});

function isSessionResponse(value: unknown): value is { id: string; botApiRoot: string } {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const { id, botApiRoot } = value as Record<string, unknown>;
  return typeof id === 'string' && id.length > 0 && typeof botApiRoot === 'string';
}

function isCreatedBotResponse(value: unknown): value is {
  token: string;
  bot: { id: number; is_bot: boolean; first_name: string; username: string };
} {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const { token, bot } = value as Record<string, unknown>;
  return (
    typeof token === 'string' &&
    isUserProfile(bot) &&
    typeof bot.username === 'string'
  );
}

function isGetMeResponse(value: unknown): value is {
  ok: true;
  result: { id: number; is_bot: boolean; first_name: string; username: string };
} {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const { ok, result } = value as Record<string, unknown>;
  return ok === true && isUserProfile(result) && typeof result.username === 'string';
}

function isSentMessageResponse(value: unknown): value is {
  message: {
    message_id: number;
    from: { id: number };
    chat: { id: number; type: string };
    date: number;
    text: string;
  };
} {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const { message } = value as Record<string, unknown>;
  return isPrivateTextMessage(message);
}

function isMessageHistoryResponse(value: unknown): value is {
  messages: Array<{
    message_id: number;
    from: { id: number };
    chat: { id: number; type: string };
    date: number;
    text: string;
  }>;
} {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const { messages } = value as Record<string, unknown>;
  return Array.isArray(messages) && messages.every(isPrivateTextMessage);
}

function isGetUpdatesResponse(value: unknown): value is {
  ok: true;
  result: Array<{
    update_id: number;
    message: {
      message_id: number;
      from: { id: number };
      chat: { id: number; type: string };
      date: number;
      text: string;
    };
  }>;
} {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const { ok, result } = value as Record<string, unknown>;
  return ok === true && Array.isArray(result) && result.every((update) => {
    if (typeof update !== 'object' || update === null) {
      return false;
    }
    const candidate = update as Record<string, unknown>;
    return typeof candidate.update_id === 'number' && isPrivateTextMessage(candidate.message);
  });
}

function isPrivateTextMessage(value: unknown): value is {
  message_id: number;
  from: { id: number };
  chat: { id: number; type: string };
  date: number;
  text: string;
} {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const message = value as Record<string, unknown>;
  return (
    typeof message.message_id === 'number' &&
    typeof message.date === 'number' &&
    typeof message.text === 'string' &&
    typeof message.from === 'object' &&
    message.from !== null &&
    typeof (message.from as Record<string, unknown>).id === 'number' &&
    typeof message.chat === 'object' &&
    message.chat !== null &&
    typeof (message.chat as Record<string, unknown>).id === 'number' &&
    typeof (message.chat as Record<string, unknown>).type === 'string'
  );
}

function isCreatedAccountResponse(value: unknown): value is {
  account: {
    id: number;
    is_bot: boolean;
    first_name: string;
    last_name?: string;
    username?: string;
    language_code?: string;
  };
} {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const { account } = value as Record<string, unknown>;
  return isUserProfile(account);
}

function isUserProfile(value: unknown): value is {
  id: number;
  is_bot: boolean;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
} {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const profile = value as Record<string, unknown>;
  return (
    typeof profile.id === 'number' &&
    typeof profile.is_bot === 'boolean' &&
    typeof profile.first_name === 'string' &&
    (profile.last_name === undefined || typeof profile.last_name === 'string') &&
    (profile.username === undefined || typeof profile.username === 'string') &&
    (profile.language_code === undefined || typeof profile.language_code === 'string')
  );
}

function createInProcessFetch(
  handler: (request: Request) => Response | Promise<Response>,
): typeof globalThis.fetch {
  return async (input, init) => await handler(new Request(input, init));
}
