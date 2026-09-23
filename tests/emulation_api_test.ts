import { Bot } from 'https://cdn.jsdelivr.net/gh/grammyjs/grammY@^1.46.0/src/bot.ts';
import { GrammyError } from 'https://cdn.jsdelivr.net/gh/grammyjs/grammY@^1.46.0/src/core/error.ts';

import { createEmulationApi } from '../src/api/mod.ts';
import { createSessionLifecycleService } from '../src/composition/session_lifecycle.ts';
import { MAX_TELEGRAM_USER_ID } from '../src/types/telegram_identity.ts';

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

Deno.test('Bot API rejects unknown tokens before resolving methods or parameters', async () => {
  const api = createEmulationApi({
    sessionLifecycle: createSessionLifecycleService(),
    publicOrigin: 'http://emulator.example:9000',
  });
  const createSessionResponse = await api.request('/sessions', { method: 'POST' });
  const sessionPath = createSessionResponse.headers.get('Location');
  if (sessionPath === null) {
    throw new Error('Expected the created session to have a Location');
  }
  const botApiPath = `${sessionPath}/bot-api/bot123:unknown`;

  const responses = [
    await api.request(`${botApiPath}/getMe`, { method: 'POST' }),
    await api.request(`${botApiPath}/getUpdates`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{not json',
    }),
    await api.request(`${botApiPath}/unsupportedMethod`, { method: 'POST' }),
  ];

  for (const response of responses) {
    const body: unknown = await response.json();
    if (response.status !== 401 || !isUnauthorizedResponse(body)) {
      throw new Error(`Expected an unknown token to be unauthorized, received ${response.status}`);
    }
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

Deno.test('getUpdates allowed_updates filters only updates created afterward', async () => {
  const { api, sessionPath, botApiPath, createdBot, createdAccount, sendText } =
    await createPrivateConversationFixture();
  const getUpdatedTexts = async (parameters: Record<string, unknown>) => {
    const response = await api.request(`${botApiPath}/getUpdates`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(parameters),
    });
    const body: unknown = await response.json();
    if (response.status !== 200 || !isGetUpdatesResponse(body)) {
      throw new Error(`Expected a successful getUpdates response, received ${response.status}`);
    }
    return body.result.map((update) => update.message.text);
  };

  await sendText('queued before unsubscribing');
  const updatesQueuedBeforeChange = await getUpdatedTexts({ allowed_updates: ['callback_query'] });
  if (
    JSON.stringify(updatesQueuedBeforeChange) !== JSON.stringify(['queued before unsubscribing'])
  ) {
    throw new Error('Expected a subscription change not to remove an already queued update');
  }

  await sendText('sent while unsubscribed');
  if ((await getUpdatedTexts({ offset: 2 })).length !== 0) {
    throw new Error('Expected an omitted allowed_updates to keep excluding message updates');
  }
  const historyResponse = await api.request(
    `${sessionPath}/accounts/${createdAccount.account.id}/conversations/private/${createdBot.bot.id}/messages`,
  );
  const historyBody: unknown = await historyResponse.json();
  if (
    !isMessageHistoryResponse(historyBody) ||
    historyBody.messages.at(-1)?.text !== 'sent while unsubscribed'
  ) {
    throw new Error('Expected an undelivered message to remain in conversation history');
  }

  await getUpdatedTexts({ allowed_updates: [] });
  await sendText('sent after restoring the default');
  const updatesAfterRestore = await getUpdatedTexts({});
  if (
    JSON.stringify(updatesAfterRestore) !== JSON.stringify(['sent after restoring the default'])
  ) {
    throw new Error('Expected an empty allowed_updates to restore message updates');
  }
});

Deno.test('getUpdates answers a displaced long poll with a Telegram conflict', async () => {
  const { api, botApiPath, sendText } = await createPrivateConversationFixture();
  const holdLongPoll = () =>
    api.request(`${botApiPath}/getUpdates`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ timeout: 50 }),
    });

  // Whichever request is held second displaces the other, so the first to finish is the conflict.
  const pendingPolls = [holdLongPoll(), holdLongPoll()].map((pendingResponse, pollIndex) =>
    Promise.resolve(pendingResponse).then((response) => ({ pollIndex, response }))
  );
  const displacedPoll = await Promise.race(pendingPolls);
  const displacedBody: unknown = await displacedPoll.response.json();
  if (
    displacedPoll.response.status !== 409 || !isTerminatedByOtherLongPollResponse(displacedBody)
  ) {
    throw new Error(
      `Expected a displaced long poll conflict, received ${displacedPoll.response.status}`,
    );
  }

  await sendText('Hello');
  const replacementPoll = await pendingPolls[1 - displacedPoll.pollIndex];
  const replacementBody: unknown = await replacementPoll.response.json();
  if (
    replacementPoll.response.status !== 200 ||
    !isGetUpdatesResponse(replacementBody) ||
    replacementBody.result.map((update) => update.message.text).join() !== 'Hello'
  ) {
    throw new Error('Expected the replacement long poll to receive the account message');
  }
});

Deno.test('Bot API resolves method names case-insensitively over GET and POST', async () => {
  const { api, botApiPath, createdBot } = await createPrivateConversationFixture();

  const responses = [
    await api.request(`${botApiPath}/getMe`),
    await api.request(`${botApiPath}/GETME`, { method: 'POST' }),
    await api.request(`${botApiPath}/getme`),
  ];

  for (const response of responses) {
    const body: unknown = await response.json();
    if (
      response.status !== 200 || !isGetMeResponse(body) ||
      JSON.stringify(body.result) !== JSON.stringify(createdBot.bot)
    ) {
      throw new Error(`Expected ${response.url} to return the bot profile`);
    }
  }
});

Deno.test('getUpdates applies parameters from every supported request encoding', async () => {
  const { api, botApiPath, sendText } = await createPrivateConversationFixture();
  const multipartBody = (parameters: Record<string, string>) => {
    const formData = new FormData();
    for (const [name, value] of Object.entries(parameters)) {
      formData.set(name, value);
    }
    return formData;
  };
  const requestsByEncoding: Record<string, (offset: number) => Response | Promise<Response>> = {
    'query string without a body': (offset) =>
      api.request(`${botApiPath}/getUpdates?offset=${offset}&allowed_updates=["message"]`, {
        method: 'POST',
      }),
    'GET query string': (offset) =>
      api.request(`${botApiPath}/getUpdates?offset=${offset}&allowed_updates=["message"]`),
    'URL-encoded form': (offset) =>
      api.request(`${botApiPath}/getUpdates`, {
        method: 'POST',
        body: new URLSearchParams({ offset: `${offset}`, allowed_updates: '["message"]' }),
      }),
    'multipart form': (offset) =>
      api.request(`${botApiPath}/getUpdates`, {
        method: 'POST',
        body: multipartBody({ offset: `${offset}`, allowed_updates: '["message"]' }),
      }),
    'JSON with textual values': (offset) =>
      api.request(`${botApiPath}/getUpdates`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ offset: `${offset}`, allowed_updates: '["message"]' }),
      }),
  };

  await sendText('first');
  let expectedUpdateId = 1;
  for (const [encoding, requestUpdates] of Object.entries(requestsByEncoding)) {
    expectedUpdateId += 1;
    await sendText(`received through ${encoding}`);

    // The offset confirms the update still pending from the previous iteration.
    const response = await requestUpdates(expectedUpdateId);
    const body: unknown = await response.json();
    if (
      response.status !== 200 || !isGetUpdatesResponse(body) ||
      JSON.stringify(body.result.map((update) => update.update_id)) !==
        JSON.stringify([expectedUpdateId])
    ) {
      throw new Error(`Expected the ${encoding} offset to confirm earlier updates`);
    }
  }

  const remainingResponse = await api.request(`${botApiPath}/getUpdates`, { method: 'POST' });
  const remainingBody: unknown = await remainingResponse.json();
  if (
    !isGetUpdatesResponse(remainingBody) ||
    JSON.stringify(remainingBody.result.map((update) => update.update_id)) !==
      JSON.stringify([expectedUpdateId])
  ) {
    throw new Error('Expected only the last update to remain unconfirmed');
  }
});

Deno.test('getUpdates rejects malformed parameters with a Bot API error', async () => {
  const { api, botApiPath } = await createPrivateConversationFixture();

  const responses = [
    await api.request(`${botApiPath}/getUpdates?offset=two`),
    await api.request(`${botApiPath}/getUpdates?allowed_updates=message`),
    await api.request(`${botApiPath}/getUpdates`, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: '{"offset":2}',
    }),
    await api.request(`${botApiPath}/getUpdates`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '[2]',
    }),
  ];

  for (const response of responses) {
    const body: unknown = await response.json();
    if (response.status !== 400 || !isBadRequestResponse(body)) {
      throw new Error(`Expected a Bot API bad request, received ${response.status}`);
    }
  }
});

Deno.test("Bot API answers unknown methods with Telegram's not-found error", async () => {
  const { api, botApiPath } = await createPrivateConversationFixture();

  const responses = [
    await api.request(`${botApiPath}/unknownMethod`, { method: 'POST' }),
    await api.request(`${botApiPath}/getMe/extra`),
    await api.request(`${botApiPath}/`),
    // The method is resolved before the body is decoded.
    await api.request(`${botApiPath}/unknownMethod`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{not json',
    }),
  ];

  for (const response of responses) {
    const body: unknown = await response.json();
    if (
      response.status !== 404 || !isNotFoundResponse(body, 'Not Found: method not found')
    ) {
      throw new Error(
        `Expected ${response.url} to be a method not found, received ${response.status}`,
      );
    }
  }
});

Deno.test('Bot API answers paths without a method before checking the token', async () => {
  const { api, sessionPath, botApiPath } = await createPrivateConversationFixture();
  const botApiRootPath = `${sessionPath}/bot-api`;

  const responses = [
    await api.request(botApiPath),
    await api.request(`${botApiRootPath}/bot123:unknown`),
    await api.request(`${botApiRootPath}/getMe`),
    await api.request(botApiRootPath),
  ];

  for (const response of responses) {
    const body: unknown = await response.json();
    if (response.status !== 404 || !isNotFoundResponse(body, 'Not Found')) {
      throw new Error(`Expected ${response.url} to be not found, received ${response.status}`);
    }
  }
});

Deno.test('grammY reports an unimplemented method as a Telegram API error', async () => {
  const { api, sessionPath, createdBot } = await createPrivateConversationFixture();
  const publicOrigin = 'http://emulator.example:9000';
  const grammyBot = new Bot(createdBot.token, {
    client: {
      apiRoot: `${publicOrigin}${sessionPath}/bot-api`,
      fetch: createInProcessFetch(api.fetch),
    },
  });

  let callError: unknown;
  try {
    await grammyBot.api.raw.logOut();
  } catch (error) {
    callError = error;
  }

  if (
    !(callError instanceof GrammyError) || callError.error_code !== 404 ||
    callError.description !== 'Not Found: method not found'
  ) {
    throw new Error(
      `Expected a grammY API error for an unimplemented method, received ${callError}`,
    );
  }
});

Deno.test('grammY command handlers match account-sent bot commands', async () => {
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
    body: JSON.stringify({ first_name: 'Ada' }),
  });
  const createdAccount: unknown = await createAccountResponse.json();
  if (!isCreatedAccountResponse(createdAccount)) {
    throw new Error('Expected a created account response');
  }

  for (const text of ['/start', '/start@test_bot payload', 'hello /start']) {
    const sendResponse = await api.request(
      `${sessionPath}/accounts/${createdAccount.account.id}/messages`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: { type: 'private', botId: createdBot.bot.id }, text }),
      },
    );
    if (sendResponse.status !== 201) {
      throw new Error(
        `Expected the account message to be accepted, received ${sendResponse.status}`,
      );
    }
  }

  const grammyBot = new Bot(createdBot.token, {
    client: {
      apiRoot: `${publicOrigin}${sessionPath}/bot-api`,
      fetch: createInProcessFetch(api.fetch),
    },
  });
  const startCommandPayloads: string[] = [];
  grammyBot.command('start', (context) => {
    startCommandPayloads.push(context.match);
  });
  await grammyBot.init();
  for (const update of await grammyBot.api.getUpdates()) {
    await grammyBot.handleUpdate(update);
  }

  // A command that does not start the message is marked, but grammY only handles leading commands.
  if (JSON.stringify(startCommandPayloads) !== JSON.stringify(['', 'payload'])) {
    throw new Error(
      `Expected the start handler to run for leading commands, received ${
        JSON.stringify(startCommandPayloads)
      }`,
    );
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
  const highestValidAccountIdResponse = await api.request(
    `${sessionPath}/accounts/${MAX_TELEGRAM_USER_ID}/messages`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: { type: 'private', botId: MAX_TELEGRAM_USER_ID },
        text: 'Hello',
      }),
    },
  );
  const excessiveAccountIdResponse = await api.request(
    `${sessionPath}/accounts/${MAX_TELEGRAM_USER_ID + 1}/messages`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to: { type: 'private', botId: 999 }, text: 'Hello' }),
    },
  );
  const excessiveBotIdResponse = await api.request(
    `${sessionPath}/accounts/${createdAccount.account.id}/messages`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: { type: 'private', botId: MAX_TELEGRAM_USER_ID + 1 },
        text: 'Hello',
      }),
    },
  );

  if (
    missingBotResponse.status !== 404 ||
    emptyTextResponse.status !== 400 ||
    highestValidAccountIdResponse.status !== 404 ||
    excessiveAccountIdResponse.status !== 400 ||
    excessiveBotIdResponse.status !== 400
  ) {
    throw new Error('Expected message routes to distinguish missing participants from bad input');
  }
});

/** Creates a session holding a bot and an account that can message it. */
async function createPrivateConversationFixture() {
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
  const createAccountResponse = await api.request(`${sessionPath}/accounts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ first_name: 'Ada' }),
  });
  const createdAccount: unknown = await createAccountResponse.json();
  if (!isCreatedAccountResponse(createdAccount)) {
    throw new Error('Expected a created account response');
  }

  const sendText = async (text: string) => {
    const response = await api.request(
      `${sessionPath}/accounts/${createdAccount.account.id}/messages`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: { type: 'private', botId: createdBot.bot.id }, text }),
      },
    );
    if (response.status !== 201) {
      throw new Error(`Expected "${text}" to be accepted, received ${response.status}`);
    }
  };

  return {
    api,
    sessionPath,
    botApiPath: `${sessionPath}/bot-api/bot${createdBot.token}`,
    createdBot,
    createdAccount,
    sendText,
  };
}

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

function isBadRequestResponse(value: unknown): value is {
  ok: false;
  error_code: 400;
  description: string;
} {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const { ok, error_code, description } = value as Record<string, unknown>;
  return ok === false && error_code === 400 && typeof description === 'string' &&
    description.startsWith('Bad Request: ');
}

function isUnauthorizedResponse(value: unknown): value is {
  ok: false;
  error_code: 401;
  description: 'Unauthorized';
} {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const { ok, error_code, description } = value as Record<string, unknown>;
  return ok === false && error_code === 401 && description === 'Unauthorized';
}

function isNotFoundResponse<Description extends string>(
  value: unknown,
  expectedDescription: Description,
): value is { ok: false; error_code: 404; description: Description } {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const { ok, error_code, description } = value as Record<string, unknown>;
  return ok === false && error_code === 404 && description === expectedDescription;
}

const TERMINATED_BY_OTHER_LONG_POLL_DESCRIPTION =
  'Conflict: terminated by other getUpdates request; make sure that only one bot instance is running';

function isTerminatedByOtherLongPollResponse(value: unknown): value is {
  ok: false;
  error_code: 409;
  description: typeof TERMINATED_BY_OTHER_LONG_POLL_DESCRIPTION;
} {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const { ok, error_code, description } = value as Record<string, unknown>;
  return ok === false && error_code === 409 &&
    description === TERMINATED_BY_OTHER_LONG_POLL_DESCRIPTION;
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
