import { Bot } from 'https://cdn.jsdelivr.net/gh/grammyjs/grammY@^1.46.0/src/bot.ts';
import { InlineKeyboard } from 'https://cdn.jsdelivr.net/gh/grammyjs/grammY@^1.46.0/src/convenience/keyboard.ts';
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

Deno.test('DELETE /sessions/:sessionId answers the long polls its bots hold', async () => {
  const { api, sessionPath, botApiPath } = await createPrivateConversationFixture();
  const heldPoll = api.request(`${botApiPath}/getUpdates`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ timeout: 50 }),
  });

  const deleteResponse = await api.request(sessionPath, { method: 'DELETE' });
  if (deleteResponse.status !== 204) {
    throw new Error(`Expected status 204, received ${deleteResponse.status}`);
  }
  const heldPollResponse = await expectSettlementWithin(
    Promise.resolve(heldPoll),
    1_000,
    'Expected ending the session to answer its held long poll at once',
  );
  const heldPollBody: unknown = await heldPollResponse.json();
  if (
    heldPollResponse.status !== 200 || !isGetUpdatesResponse(heldPollBody) ||
    heldPollBody.result.length !== 0
  ) {
    throw new Error(
      `Expected the held long poll to end without updates, received ${heldPollResponse.status}`,
    );
  }

  const laterPollResponse = await api.request(`${botApiPath}/getUpdates`);
  if (laterPollResponse.status !== 404) {
    throw new Error(`Expected the ended session to be gone, received ${laterPollResponse.status}`);
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

Deno.test('deleteWebhook answers as Telegram does for a bot without a webhook', async () => {
  const { api, botApiPath, sendText } = await createPrivateConversationFixture();
  const deleteWebhook = async (parameters: Record<string, unknown>) => {
    const response = await api.request(`${botApiPath}/deleteWebhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(parameters),
    });
    return { status: response.status, body: await response.json() };
  };
  const getPendingTexts = async () => {
    const response = await api.request(`${botApiPath}/getUpdates`);
    const body: unknown = await response.json();
    if (!isGetUpdatesResponse(body)) {
      throw new Error('Expected a getUpdates response');
    }
    return body.result.map((update) => update.message.text);
  };
  const expectedAnswer = { ok: true, result: true, description: 'Webhook is already deleted' };

  await sendText('kept');
  const keepingAnswer = await deleteWebhook({});
  if (
    keepingAnswer.status !== 200 ||
    JSON.stringify(keepingAnswer.body) !== JSON.stringify(expectedAnswer) ||
    JSON.stringify(await getPendingTexts()) !== JSON.stringify(['kept'])
  ) {
    throw new Error('Expected deleteWebhook to succeed without discarding pending updates');
  }

  const droppingAnswer = await deleteWebhook({ drop_pending_updates: true });
  if (
    droppingAnswer.status !== 200 ||
    JSON.stringify(droppingAnswer.body) !== JSON.stringify(expectedAnswer) ||
    (await getPendingTexts()).length !== 0
  ) {
    throw new Error('Expected drop_pending_updates to discard pending updates');
  }

  const malformedAnswer = await deleteWebhook({ drop_pending_updates: 'maybe' });
  if (malformedAnswer.status !== 400 || !isBadRequestResponse(malformedAnswer.body)) {
    throw new Error('Expected a malformed drop_pending_updates to be rejected');
  }
});

Deno.test('sendMessage replies only in private chats the account has started', async () => {
  const { api, botApiPath, createdBot, createdAccount, sendText } =
    await createPrivateConversationFixture();
  const sendMessage = async (parameters: Record<string, unknown>) => {
    const response = await api.request(`${botApiPath}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(parameters),
    });
    return { status: response.status, body: (await response.json()) as unknown };
  };
  const expectBadRequest = async (
    parameters: Record<string, unknown>,
    expectedDescription?: string,
  ) => {
    const { status, body } = await sendMessage(parameters);
    if (
      status !== 400 || !isBadRequestResponse(body) ||
      (expectedDescription !== undefined && body.description !== expectedDescription)
    ) {
      throw new Error(
        `Expected ${JSON.stringify(parameters)} to be rejected with ${
          expectedDescription ?? 'a bad request'
        }, received ${status} ${JSON.stringify(body)}`,
      );
    }
  };
  const accountId = createdAccount.account.id;

  await expectBadRequest({ chat_id: accountId, text: 'Hello' }, 'Bad Request: chat not found');
  await sendText('Hi');

  const { status, body } = await sendMessage({ chat_id: accountId, text: 'Try /help' });
  if (
    status !== 200 ||
    typeof body !== 'object' || body === null ||
    !('ok' in body) || body.ok !== true ||
    !('result' in body) || !isPrivateTextMessage(body.result)
  ) {
    throw new Error(`Expected sendMessage to succeed, received ${status}`);
  }
  const reply = body.result;
  if (
    reply.message_id !== 2 ||
    reply.chat.id !== accountId ||
    JSON.stringify(reply.from) !==
      JSON.stringify({
        id: createdBot.bot.id,
        is_bot: true,
        first_name: 'Test Bot',
        username: 'test_bot',
      }) ||
    reply.text !== 'Try /help'
  ) {
    throw new Error("Expected the sent message in the bot's private chat with the account");
  }

  await expectBadRequest({ text: '' }, 'Bad Request: message text is empty');
  await expectBadRequest({ text: 'Hello' }, 'Bad Request: chat_id is empty');
  await expectBadRequest({ chat_id: accountId }, 'Bad Request: message text is empty');
  await expectBadRequest({ chat_id: 999, text: 'Hello' }, 'Bad Request: chat not found');
  await expectBadRequest(
    { chat_id: createdBot.bot.id, text: 'Hello' },
    'Bad Request: chat not found',
  );
  await expectBadRequest(
    { chat_id: accountId, text: 'x'.repeat(4_097) },
    'Bad Request: message is too long',
  );
  await expectBadRequest({ chat_id: '@ada', text: 'Hello' });
  await expectBadRequest({ chat_id: accountId, text: 'Hello', message_effect_id: '1' });

  const updatesResponse = await api.request(`${botApiPath}/getUpdates`);
  const updatesBody: unknown = await updatesResponse.json();
  if (
    !isGetUpdatesResponse(updatesBody) ||
    JSON.stringify(updatesBody.result.map((update) => update.message.text)) !==
      JSON.stringify(['Hi'])
  ) {
    throw new Error('Expected the bot to receive no update for its own message');
  }
});

Deno.test('a grammY bot starts polling, replies to a command, and resumes after a restart', async () => {
  const { api, sessionPath, createdBot, createdAccount, sendText } =
    await createPrivateConversationFixture();
  const startGrammyBot = () => {
    const grammyBot = new Bot(createdBot.token, {
      client: {
        apiRoot: `http://emulator.example:9000${sessionPath}/bot-api`,
        fetch: createInProcessFetch(api.fetch),
      },
    });
    const handledCommandTexts: string[] = [];
    const firstReply = Promise.withResolvers<void>();
    grammyBot.command('start', async (context) => {
      handledCommandTexts.push(context.msg.text ?? '');
      await context.reply(`Hello, ${context.from?.first_name}!`);
      firstReply.resolve();
    });
    const polling = grammyBot.start();
    const stopAfterFirstReply = async () => {
      // Polling ends only when stopped, so settling first means startup failed.
      await Promise.race([firstReply.promise, polling]);
      await grammyBot.stop();
      await polling;
    };
    return { handledCommandTexts, stopAfterFirstReply };
  };

  await sendText('/start');
  const firstRun = startGrammyBot();
  await firstRun.stopAfterFirstReply();

  const historyPath =
    `${sessionPath}/accounts/${createdAccount.account.id}/conversations/private/${createdBot.bot.id}/messages`;
  const historyBody: unknown = await (await api.request(historyPath)).json();
  if (
    !isMessageHistoryResponse(historyBody) ||
    JSON.stringify(
        historyBody.messages.map(({ from, chat, text }) => [from.id, chat.id, text]),
      ) !==
      JSON.stringify([
        [createdAccount.account.id, createdAccount.account.id, '/start'],
        [createdBot.bot.id, createdAccount.account.id, 'Hello, Ada!'],
      ])
  ) {
    throw new Error('Expected history to hold the command and the bot reply');
  }

  const secondRun = startGrammyBot();
  await sendText('/start again');
  await secondRun.stopAfterFirstReply();
  if (
    JSON.stringify(firstRun.handledCommandTexts) !== JSON.stringify(['/start']) ||
    JSON.stringify(secondRun.handledCommandTexts) !== JSON.stringify(['/start again'])
  ) {
    throw new Error(
      `Expected a restarted bot to handle only new updates, received ${
        JSON.stringify([firstRun.handledCommandTexts, secondRun.handledCommandTexts])
      }`,
    );
  }
});

Deno.test('sendMessage attaches an inline keyboard from every request encoding', async () => {
  const { api, sessionPath, botApiPath, createdBot, createdAccount, sendText } =
    await createPrivateConversationFixture();
  await sendText('/start');
  const accountId = createdAccount.account.id;
  const inlineKeyboard = [
    [{ text: 'Yes', callback_data: 'yes' }, { text: 'No', callback_data: 'no' }],
    [{ text: 'Docs', url: 'https://grammy.dev' }],
  ];

  const jsonReply = await callBotApi(api, `${botApiPath}/sendMessage`, {
    chat_id: accountId,
    text: 'Continue?',
    reply_markup: { inline_keyboard: inlineKeyboard },
  });
  const formReply = await api.request(`${botApiPath}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      chat_id: String(accountId),
      text: 'Again?',
      reply_markup: JSON.stringify({ inline_keyboard: inlineKeyboard }),
    }),
  });
  const emptyKeyboardReply = await callBotApi(api, `${botApiPath}/sendMessage`, {
    chat_id: accountId,
    text: 'No buttons',
    reply_markup: { inline_keyboard: [] },
  });
  const expectedMarkup = JSON.stringify({ inline_keyboard: inlineKeyboard });
  if (
    jsonReply.status !== 200 ||
    JSON.stringify(botApiResult(jsonReply.body)?.reply_markup) !== expectedMarkup ||
    formReply.status !== 200 ||
    JSON.stringify(botApiResult(await formReply.json())?.reply_markup) !== expectedMarkup ||
    emptyKeyboardReply.status !== 200 ||
    botApiResult(emptyKeyboardReply.body)?.reply_markup !== undefined
  ) {
    throw new Error('Expected the keyboard in replies, and no keyboard for an empty one');
  }
  const historyBody: unknown = await (await api.request(
    `${sessionPath}/accounts/${accountId}/conversations/private/${createdBot.bot.id}/messages`,
  )).json();
  if (
    !isMessageHistoryResponse(historyBody) ||
    JSON.stringify(historyBody.messages[1].reply_markup) !==
      expectedMarkup
  ) {
    throw new Error('Expected history to show the inline keyboard');
  }

  const invalidMarkups: unknown[] = [
    { inline_keyboard: [[{ text: 'Plain' }]] },
    { inline_keyboard: [[{ text: 'Empty', callback_data: '' }]] },
    { inline_keyboard: [[{ text: 'Both', callback_data: 'yes', url: 'https://grammy.dev' }]] },
    { inline_keyboard: [[{ text: 'Relative', url: 'grammy.dev' }]] },
    { inline_keyboard: [[{ text: 'App', web_app: { url: 'https://grammy.dev' } }]] },
    { inline_keyboard: [[]] },
    { keyboard: [[{ text: 'Reply keyboard' }]] },
    { remove_keyboard: true },
    'not JSON',
  ];
  for (const replyMarkup of invalidMarkups) {
    const { status, body } = await callBotApi(api, `${botApiPath}/sendMessage`, {
      chat_id: accountId,
      text: 'Hello',
      reply_markup: replyMarkup,
    });
    if (
      status !== 400 || !isBadRequestResponse(body) ||
      body.description !== 'Bad Request: invalid sendMessage parameters'
    ) {
      throw new Error(`Expected ${JSON.stringify(replyMarkup)} to be rejected`);
    }
  }
  const oversizedCallbackData = await callBotApi(api, `${botApiPath}/sendMessage`, {
    chat_id: accountId,
    text: 'Hello',
    reply_markup: { inline_keyboard: [[{ text: 'Big', callback_data: 'x'.repeat(65) }]] },
  });
  if (
    !isBadRequestResponse(oversizedCallbackData.body) ||
    oversizedCallbackData.body.description !== 'Bad Request: BUTTON_DATA_INVALID'
  ) {
    throw new Error('Expected callback data over 64 bytes to be rejected as Telegram does');
  }
});

Deno.test('an account presses a callback button and reads the bot answer', async () => {
  const { api, sessionPath, botApiPath, createdBot, createdAccount, sendText } =
    await createPrivateConversationFixture();
  await sendText('/start');
  const accountId = createdAccount.account.id;
  const reply = await callBotApi(api, `${botApiPath}/sendMessage`, {
    chat_id: accountId,
    text: 'Continue?',
    reply_markup: { inline_keyboard: [[{ text: 'Yes', callback_data: 'yes' }]] },
  });
  const replyMessageId = botApiResult(reply.body)?.message_id;
  const callbackQueriesPath = `${sessionPath}/accounts/${accountId}/callback-queries`;
  const pressButton = (body: unknown) =>
    api.request(callbackQueriesPath, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

  const pressResponse = await pressButton({
    chat: { type: 'private', botId: createdBot.bot.id },
    message_id: replyMessageId,
    callback_data: 'yes',
  });
  const pressBody: unknown = await pressResponse.json();
  if (
    pressResponse.status !== 201 || !isCallbackQueryResponse(pressBody) ||
    pressBody.callback_query.callback_data !== 'yes' ||
    pressBody.callback_query.status !== 'awaiting_answer' ||
    pressBody.callback_query.answer !== null ||
    pressResponse.headers.get('Location') !==
      `${callbackQueriesPath}/${pressBody.callback_query.id}`
  ) {
    throw new Error(`Expected the press to create an unanswered callback query`);
  }
  const callbackQueryId = pressBody.callback_query.id;

  const updatesBody: unknown = await (await api.request(`${botApiPath}/getUpdates`)).json();
  const updates = (updatesBody as { result?: unknown }).result;
  const callbackQuery = Array.isArray(updates)
    ? updates.at(-1)?.callback_query as Record<string, unknown> | undefined
    : undefined;
  const callbackMessage = callbackQuery?.message as Record<string, unknown> | undefined;
  if (
    callbackQuery?.id !== callbackQueryId ||
    JSON.stringify(callbackQuery.from) !== JSON.stringify(createdAccount.account) ||
    typeof callbackQuery.chat_instance !== 'string' ||
    callbackQuery.data !== 'yes' ||
    callbackMessage?.message_id !== replyMessageId ||
    callbackMessage?.text !== 'Continue?'
  ) {
    throw new Error(`Expected a callback_query update, received ${JSON.stringify(updatesBody)}`);
  }

  const answerResponse = await callBotApi(api, `${botApiPath}/answerCallbackQuery`, {
    callback_query_id: callbackQueryId,
    text: 'Saved',
    show_alert: true,
  });
  if (JSON.stringify(answerResponse.body) !== JSON.stringify({ ok: true, result: true })) {
    throw new Error(`Expected the answer to be accepted, received ${answerResponse.status}`);
  }
  const answeredBody: unknown = await (await api.request(
    `${callbackQueriesPath}/${callbackQueryId}`,
  )).json();
  if (
    !isCallbackQueryResponse(answeredBody) ||
    JSON.stringify(answeredBody.callback_query.answer) !==
      JSON.stringify({ text: 'Saved', show_alert: true, cache_time: 0 })
  ) {
    throw new Error(
      `Expected the account to see the answer, received ${JSON.stringify(answeredBody)}`,
    );
  }

  const queryIdInvalid =
    'Bad Request: query is too old and response timeout expired or query ID is invalid';
  for (
    const parameters of [{ callback_query_id: callbackQueryId }, { callback_query_id: '999' }, {}]
  ) {
    const { body } = await callBotApi(api, `${botApiPath}/answerCallbackQuery`, parameters);
    if (!isBadRequestResponse(body) || body.description !== queryIdInvalid) {
      throw new Error(`Expected ${JSON.stringify(parameters)} to be an invalid query ID`);
    }
  }
  const unsupportedAnswer = await callBotApi(api, `${botApiPath}/answerCallbackQuery`, {
    callback_query_id: callbackQueryId,
    url: 'https://grammy.dev',
  });
  if (unsupportedAnswer.status !== 400) {
    throw new Error('Expected an answer URL to be rejected as unsupported');
  }

  const pressFailures = await Promise.all([
    pressButton({
      chat: { type: 'private', botId: 999 },
      message_id: replyMessageId,
      callback_data: 'yes',
    }),
    pressButton({
      chat: { type: 'private', botId: createdBot.bot.id },
      message_id: 999,
      callback_data: 'yes',
    }),
    pressButton({
      chat: { type: 'private', botId: createdBot.bot.id },
      message_id: replyMessageId,
      callback_data: 'no',
    }),
    pressButton({
      chat: { type: 'private', botId: createdBot.bot.id },
      message_id: replyMessageId,
    }),
    api.request(`${sessionPath}/accounts/${createdBot.bot.id}/callback-queries/${callbackQueryId}`),
    api.request(`${callbackQueriesPath}/999`),
  ]);
  if (
    JSON.stringify(pressFailures.map((response) => response.status)) !==
      JSON.stringify([404, 404, 400, 400, 404, 404])
  ) {
    throw new Error(
      `Expected missing resources and bad presses to be rejected, received ${
        pressFailures.map((response) => response.status).join()
      }`,
    );
  }
});

Deno.test('a callback query created expired reaches the bot but refuses its answer', async () => {
  const { api, sessionPath, botApiPath, createdBot, createdAccount, sendText } =
    await createPrivateConversationFixture();
  await sendText('/start');
  const accountId = createdAccount.account.id;
  const reply = await callBotApi(api, `${botApiPath}/sendMessage`, {
    chat_id: accountId,
    text: 'Continue?',
    reply_markup: { inline_keyboard: [[{ text: 'Yes', callback_data: 'yes' }]] },
  });
  const callbackQueriesPath = `${sessionPath}/accounts/${accountId}/callback-queries`;
  const pressButton = (expired: unknown) =>
    api.request(callbackQueriesPath, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat: { type: 'private', botId: createdBot.bot.id },
        message_id: botApiResult(reply.body)?.message_id,
        callback_data: 'yes',
        expired,
      }),
    });

  const pressResponse = await pressButton(true);
  const pressBody: unknown = await pressResponse.json();
  if (
    pressResponse.status !== 201 || !isCallbackQueryResponse(pressBody) ||
    pressBody.callback_query.status !== 'expired' || pressBody.callback_query.answer !== null
  ) {
    throw new Error('Expected the press to create an expired callback query');
  }
  const callbackQueryId = pressBody.callback_query.id;
  const updatesBody = (await (await api.request(`${botApiPath}/getUpdates`)).json()) as {
    result?: Array<{ callback_query?: { id?: string } }>;
  };
  if (updatesBody.result?.at(-1)?.callback_query?.id !== callbackQueryId) {
    throw new Error('Expected the bot to receive the expired callback query');
  }

  const { status, body } = await callBotApi(api, `${botApiPath}/answerCallbackQuery`, {
    callback_query_id: callbackQueryId,
    text: 'Saved',
  });
  if (
    status !== 400 || !isBadRequestResponse(body) ||
    body.description !==
      'Bad Request: query is too old and response timeout expired or query ID is invalid'
  ) {
    throw new Error('Expected the answer to the expired query to be rejected');
  }
  const queryBody: unknown = await (await api.request(`${callbackQueriesPath}/${callbackQueryId}`))
    .json();
  if (!isCallbackQueryResponse(queryBody) || queryBody.callback_query.status !== 'expired') {
    throw new Error('Expected the rejected answer to leave the query expired');
  }

  if ((await pressButton('yes')).status !== 400) {
    throw new Error('Expected a non-boolean expired flag to be rejected');
  }
});

Deno.test('a grammY bot catching up after downtime cannot answer an expired callback query', async () => {
  const { api, sessionPath, botApiPath, createdBot, createdAccount, sendText } =
    await createPrivateConversationFixture();
  const accountId = createdAccount.account.id;
  await sendText('/start');
  const menu = await callBotApi(api, `${botApiPath}/sendMessage`, {
    chat_id: accountId,
    text: 'Continue?',
    reply_markup: { inline_keyboard: [[{ text: 'Yes', callback_data: 'yes' }]] },
  });
  // The bot is offline when the account presses the button, so the query has expired by the time
  // the bot polls for it.
  const pressResponse = await api.request(`${sessionPath}/accounts/${accountId}/callback-queries`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat: { type: 'private', botId: createdBot.bot.id },
      message_id: botApiResult(menu.body)?.message_id,
      callback_data: 'yes',
      expired: true,
    }),
  });
  if (pressResponse.status !== 201) {
    throw new Error(`Expected the button press to be accepted, received ${pressResponse.status}`);
  }

  const grammyBot = new Bot(createdBot.token, {
    client: {
      apiRoot: `http://emulator.example:9000${sessionPath}/bot-api`,
      fetch: createInProcessFetch(api.fetch),
    },
  });
  const answerErrors: unknown[] = [];
  const queryHandled = Promise.withResolvers<void>();
  grammyBot.callbackQuery('yes', async (context) => {
    try {
      await context.answerCallbackQuery({ text: 'Saved' });
    } catch (error) {
      answerErrors.push(error);
      await context.reply('That button has expired; please try again.');
    }
    queryHandled.resolve();
  });
  // Skip the pending /start message so that only the callback query is handled.
  grammyBot.on('message', () => {});
  const polling = grammyBot.start();

  try {
    await expectSettlementWithin(
      Promise.race([queryHandled.promise, polling]),
      5_000,
      'Expected the bot to handle the expired callback query',
    );
  } finally {
    await grammyBot.stop();
    await polling;
  }

  const [answerError] = answerErrors;
  if (
    answerErrors.length !== 1 || !(answerError instanceof GrammyError) ||
    answerError.error_code !== 400 ||
    answerError.description !==
      'Bad Request: query is too old and response timeout expired or query ID is invalid'
  ) {
    throw new Error(`Expected answering to fail as Telegram does, received ${answerErrors}`);
  }
  const historyBody: unknown = await (await api.request(
    `${sessionPath}/accounts/${accountId}/conversations/private/${createdBot.bot.id}/messages`,
  )).json();
  if (
    !isMessageHistoryResponse(historyBody) ||
    historyBody.messages.at(-1)?.text !== 'That button has expired; please try again.'
  ) {
    throw new Error("Expected the bot's fallback reply in history");
  }
});

Deno.test('editMessageText and editMessageReplyMarkup follow Telegram checks', async () => {
  const { api, botApiPath, createdAccount, sendText } = await createPrivateConversationFixture();
  await sendText('/start');
  const accountId = createdAccount.account.id;
  const keyboard = { inline_keyboard: [[{ text: 'Yes', callback_data: 'yes' }]] };
  const reply = await callBotApi(api, `${botApiPath}/sendMessage`, {
    chat_id: accountId,
    text: 'Continue?',
    reply_markup: keyboard,
  });
  const messageId = botApiResult(reply.body)?.message_id;
  const expectEditFailure = async (
    method: string,
    parameters: Record<string, unknown>,
    expectedDescription: string,
  ) => {
    const { status, body } = await callBotApi(api, `${botApiPath}/${method}`, parameters);
    if (status !== 400 || !isBadRequestResponse(body) || body.description !== expectedDescription) {
      throw new Error(
        `Expected ${method} ${JSON.stringify(parameters)} to fail with ${expectedDescription}, ` +
          `received ${status} ${JSON.stringify(body)}`,
      );
    }
  };

  await expectEditFailure('editMessageText', {}, 'Bad Request: message text is empty');
  await expectEditFailure(
    'editMessageText',
    { text: 'Done' },
    'Bad Request: message identifier is not specified',
  );
  await expectEditFailure(
    'editMessageText',
    { message_id: messageId, text: 'Done' },
    'Bad Request: chat_id is empty',
  );
  await expectEditFailure(
    'editMessageText',
    { chat_id: 999, message_id: messageId, text: 'Done' },
    'Bad Request: chat not found',
  );
  await expectEditFailure(
    'editMessageText',
    { chat_id: accountId, text: 'Done' },
    'Bad Request: message to edit not found',
  );
  await expectEditFailure(
    'editMessageText',
    { chat_id: accountId, message_id: 1, text: 'Done' },
    "Bad Request: message can't be edited",
  );
  await expectEditFailure(
    'editMessageText',
    { chat_id: accountId, message_id: messageId, text: 'Continue?', reply_markup: keyboard },
    'Bad Request: message is not modified: specified new message content and reply markup are exactly the same as a current content and reply markup of the message',
  );
  await expectEditFailure(
    'editMessageText',
    { inline_message_id: 'inline', text: 'Done' },
    'Bad Request: invalid editMessageText parameters',
  );
  await expectEditFailure(
    'editMessageReplyMarkup',
    {},
    'Bad Request: message identifier is not specified',
  );
  await expectEditFailure(
    'editMessageReplyMarkup',
    { chat_id: accountId, message_id: messageId, reply_markup: keyboard },
    'Bad Request: message is not modified: specified new message content and reply markup are exactly the same as a current content and reply markup of the message',
  );

  const keyboardEdit = await callBotApi(api, `${botApiPath}/editMessageReplyMarkup`, {
    chat_id: accountId,
    message_id: messageId,
  });
  const keyboardEditResult = botApiResult(keyboardEdit.body);
  if (
    keyboardEdit.status !== 200 || keyboardEditResult === undefined ||
    keyboardEditResult.message_id !== messageId || 'reply_markup' in keyboardEditResult ||
    'edit_date' in keyboardEditResult
  ) {
    throw new Error('Expected editMessageReplyMarkup without markup to remove the keyboard');
  }
  const textEdit = await callBotApi(api, `${botApiPath}/editMessageText`, {
    chat_id: accountId,
    message_id: messageId,
    text: 'Done',
    reply_markup: keyboard,
  });
  const textEditResult = botApiResult(textEdit.body);
  if (
    textEdit.status !== 200 || textEditResult?.text !== 'Done' ||
    typeof textEditResult.edit_date !== 'number' ||
    JSON.stringify(textEditResult.reply_markup) !== JSON.stringify(keyboard)
  ) {
    throw new Error('Expected editMessageText to replace the text and keyboard with an edit date');
  }
});

Deno.test('a grammY bot answers an inline keyboard press and edits its message', async () => {
  const { api, sessionPath, createdBot, createdAccount, sendText } =
    await createPrivateConversationFixture();
  const accountId = createdAccount.account.id;
  const grammyBot = new Bot(createdBot.token, {
    client: {
      apiRoot: `http://emulator.example:9000${sessionPath}/bot-api`,
      fetch: createInProcessFetch(api.fetch),
    },
  });
  const menuSent = Promise.withResolvers<number>();
  const choiceHandled = Promise.withResolvers<void>();
  grammyBot.command('start', async (context) => {
    const menu = await context.reply('Continue?', {
      reply_markup: new InlineKeyboard().text('Yes', 'choice:yes').text('No', 'choice:no'),
    });
    menuSent.resolve(menu.message_id);
  });
  grammyBot.callbackQuery(/^choice:(.+)$/, async (context) => {
    await context.answerCallbackQuery({ text: `You chose ${context.match[1]}` });
    await context.editMessageText(`Chosen: ${context.match[1]}`);
    choiceHandled.resolve();
  });
  const polling = grammyBot.start();

  try {
    await sendText('/start');
    // Polling ends only when stopped, so settling first means startup failed.
    const menuMessageId = await Promise.race([menuSent.promise, polling.then(() => undefined)]);
    const pressResponse = await api.request(
      `${sessionPath}/accounts/${accountId}/callback-queries`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat: { type: 'private', botId: createdBot.bot.id },
          message_id: menuMessageId,
          callback_data: 'choice:no',
        }),
      },
    );
    const callbackQueryPath = pressResponse.headers.get('Location');
    if (pressResponse.status !== 201 || callbackQueryPath === null) {
      throw new Error(`Expected the button press to be accepted, received ${pressResponse.status}`);
    }
    await expectSettlementWithin(
      choiceHandled.promise,
      5_000,
      'Expected the bot to handle the button press',
    );

    const answeredBody: unknown = await (await api.request(callbackQueryPath)).json();
    if (
      !isCallbackQueryResponse(answeredBody) ||
      answeredBody.callback_query.answer?.text !== 'You chose no'
    ) {
      throw new Error(`Expected the bot's answer, received ${JSON.stringify(answeredBody)}`);
    }
    const historyBody: unknown = await (await api.request(
      `${sessionPath}/accounts/${accountId}/conversations/private/${createdBot.bot.id}/messages`,
    )).json();
    const menuMessage = isMessageHistoryResponse(historyBody)
      ? historyBody.messages.find((message) => message.message_id === menuMessageId)
      : undefined;
    if (
      menuMessage?.text !== 'Chosen: no' ||
      menuMessage.reply_markup !== undefined
    ) {
      throw new Error(
        `Expected the edited menu without buttons, received ${JSON.stringify(menuMessage)}`,
      );
    }
  } finally {
    await grammyBot.stop();
    await polling;
  }
});

Deno.test('deleteMessage and deleteMessages follow Telegram checks', async () => {
  const { api, sessionPath, botApiPath, createdBot, createdAccount, sendText } =
    await createPrivateConversationFixture();
  await sendText('/start');
  const accountId = createdAccount.account.id;
  const sendReply = async (text: string) => {
    const reply = await callBotApi(api, `${botApiPath}/sendMessage`, { chat_id: accountId, text });
    const messageId = botApiResult(reply.body)?.message_id;
    if (typeof messageId !== 'number') {
      throw new Error(`Expected "${text}" to be sent, received ${JSON.stringify(reply.body)}`);
    }
    return messageId;
  };
  const firstReplyId = await sendReply('First');
  const secondReplyId = await sendReply('Second');
  const expectDeletionFailure = async (
    method: string,
    parameters: Record<string, unknown>,
    expectedDescription: string,
  ) => {
    const { status, body } = await callBotApi(api, `${botApiPath}/${method}`, parameters);
    if (status !== 400 || !isBadRequestResponse(body) || body.description !== expectedDescription) {
      throw new Error(
        `Expected ${method} ${JSON.stringify(parameters)} to fail with ${expectedDescription}, ` +
          `received ${status} ${JSON.stringify(body)}`,
      );
    }
  };
  const expectDeletion = async (method: string, parameters: Record<string, unknown>) => {
    const { status, body } = await callBotApi(api, `${botApiPath}/${method}`, parameters);
    if (status !== 200 || JSON.stringify(body) !== JSON.stringify({ ok: true, result: true })) {
      throw new Error(
        `Expected ${method} ${JSON.stringify(parameters)} to succeed, ` +
          `received ${status} ${JSON.stringify(body)}`,
      );
    }
  };
  const expectHistoryTexts = async (expectedTexts: readonly string[]) => {
    const historyBody: unknown = await (await api.request(
      `${sessionPath}/accounts/${accountId}/conversations/private/${createdBot.bot.id}/messages`,
    )).json();
    const texts = isMessageHistoryResponse(historyBody)
      ? historyBody.messages.map((message) => message.text)
      : [];
    if (JSON.stringify(texts) !== JSON.stringify(expectedTexts)) {
      throw new Error(`Expected history ${JSON.stringify(expectedTexts)}, received ${texts}`);
    }
  };

  await expectDeletionFailure(
    'deleteMessage',
    { message_id: firstReplyId },
    'Bad Request: chat_id is empty',
  );
  await expectDeletionFailure('deleteMessage', { chat_id: 999 }, 'Bad Request: chat not found');
  await expectDeletionFailure(
    'deleteMessage',
    { chat_id: accountId },
    'Bad Request: message to delete not found',
  );
  await expectDeletionFailure(
    'deleteMessage',
    { chat_id: accountId, message_id: 999 },
    'Bad Request: message to delete not found',
  );
  await expectDeletionFailure(
    'deleteMessage',
    { chat_id: accountId, message_id: 'first' },
    'Bad Request: invalid deleteMessage parameters',
  );
  await expectDeletionFailure(
    'deleteMessages',
    { chat_id: 999 },
    'Bad Request: message identifiers are not specified',
  );
  await expectDeletionFailure(
    'deleteMessages',
    { chat_id: 999, message_ids: Array.from({ length: 101 }, (_, index) => index + 1) },
    'Bad Request: too many message identifiers specified',
  );
  await expectDeletionFailure(
    'deleteMessages',
    { chat_id: 999, message_ids: [firstReplyId, 0] },
    'Bad Request: invalid message identifier specified',
  );
  await expectDeletionFailure(
    'deleteMessages',
    { message_ids: [firstReplyId] },
    'Bad Request: chat_id is empty',
  );
  await expectDeletionFailure(
    'deleteMessages',
    { chat_id: 999, message_ids: [firstReplyId] },
    'Bad Request: chat not found',
  );
  await expectDeletionFailure(
    'deleteMessages',
    { chat_id: accountId, message_ids: ['1'] },
    'Bad Request: invalid deleteMessages parameters',
  );
  await expectHistoryTexts(['/start', 'First', 'Second']);

  // A bot can delete the account's messages in their private chat, not only its own.
  await expectDeletion('deleteMessage', { chat_id: accountId, message_id: 1 });
  await expectHistoryTexts(['First', 'Second']);
  await expectDeletion('deleteMessages', {
    chat_id: accountId,
    message_ids: [1, firstReplyId, 999],
  });
  await expectHistoryTexts(['Second']);
  await expectDeletionFailure(
    'deleteMessage',
    { chat_id: accountId, message_id: firstReplyId },
    'Bad Request: message to delete not found',
  );
  await expectDeletionFailure(
    'editMessageText',
    { chat_id: accountId, message_id: firstReplyId, text: 'Edited' },
    'Bad Request: message to edit not found',
  );

  const formEncodedDeletion = await api.request(`${botApiPath}/deleteMessages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      chat_id: String(accountId),
      message_ids: JSON.stringify([secondReplyId]),
    }),
  });
  if (formEncodedDeletion.status !== 200) {
    throw new Error(
      `Expected a form-encoded deleteMessages to succeed, received ${formEncodedDeletion.status}`,
    );
  }
  await expectHistoryTexts([]);
});

Deno.test('a grammY bot deletes an incoming secret and its menu after a button press', async () => {
  const { api, sessionPath, createdBot, createdAccount, sendText } =
    await createPrivateConversationFixture();
  const accountId = createdAccount.account.id;
  const historyPath =
    `${sessionPath}/accounts/${accountId}/conversations/private/${createdBot.bot.id}/messages`;
  const grammyBot = new Bot(createdBot.token, {
    client: {
      apiRoot: `http://emulator.example:9000${sessionPath}/bot-api`,
      fetch: createInProcessFetch(api.fetch),
    },
  });
  const menuSent = Promise.withResolvers<number>();
  const choiceHandled = Promise.withResolvers<void>();
  grammyBot.command('password', async (context) => {
    await context.deleteMessage();
    const menu = await context.reply('Password stored. Keep it?', {
      reply_markup: new InlineKeyboard().text('Keep', 'keep').text('Forget', 'forget'),
    });
    menuSent.resolve(menu.message_id);
  });
  grammyBot.callbackQuery('forget', async (context) => {
    await context.answerCallbackQuery({ text: 'Forgotten' });
    await context.deleteMessage();
    await context.reply('Password forgotten.');
    choiceHandled.resolve();
  });
  const polling = grammyBot.start();

  try {
    await sendText('/password hunter2');
    // Polling ends only when stopped, so settling first means startup failed.
    const menuMessageId = await Promise.race([menuSent.promise, polling.then(() => undefined)]);
    const pressForget = () =>
      api.request(`${sessionPath}/accounts/${accountId}/callback-queries`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat: { type: 'private', botId: createdBot.bot.id },
          message_id: menuMessageId,
          callback_data: 'forget',
        }),
      });
    const pressResponse = await pressForget();
    if (pressResponse.status !== 201) {
      throw new Error(`Expected the button press to be accepted, received ${pressResponse.status}`);
    }
    await expectSettlementWithin(
      choiceHandled.promise,
      5_000,
      'Expected the bot to handle the button press',
    );

    const historyBody: unknown = await (await api.request(historyPath)).json();
    const texts = isMessageHistoryResponse(historyBody)
      ? historyBody.messages.map((message) => message.text)
      : undefined;
    if (JSON.stringify(texts) !== JSON.stringify(['Password forgotten.'])) {
      throw new Error(
        `Expected only the final reply to remain, received ${JSON.stringify(historyBody)}`,
      );
    }
    const pressOnDeletedMenu = await pressForget();
    if (pressOnDeletedMenu.status !== 404) {
      throw new Error(
        `Expected a press on the deleted menu to find no message, received ${pressOnDeletedMenu.status}`,
      );
    }
  } finally {
    await grammyBot.stop();
    await polling;
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
/** Returns what `pending` settles to, failing if it is still pending after `milliseconds`. */
Deno.test('sendMessage and editMessageText format text from parse_mode or entities', async () => {
  const { api, sessionPath, botApiPath, createdBot, createdAccount, sendText } =
    await createPrivateConversationFixture();
  const accountId = createdAccount.account.id;
  await sendText('Hi');
  const expectBadRequest = async (
    methodName: string,
    parameters: Record<string, unknown>,
    expectedDescription: string,
  ) => {
    const { status, body } = await callBotApi(api, `${botApiPath}/${methodName}`, parameters);
    if (status !== 400 || !isBadRequestResponse(body) || body.description !== expectedDescription) {
      throw new Error(
        `Expected ${methodName} ${
          JSON.stringify(parameters)
        } to fail with ${expectedDescription}, received ${status} ${JSON.stringify(body)}`,
      );
    }
  };

  const htmlResponse = await callBotApi(api, `${botApiPath}/sendMessage`, {
    chat_id: accountId,
    text:
      `<b>Hello</b>, <a href="tg://user?id=${accountId}">Ada</a>! <a href="grammy.dev">Docs</a>\n<pre><code class="language-ts">bot.start();</code></pre>`,
    parse_mode: 'HTML',
  });
  const htmlMessage = botApiResult(htmlResponse.body);
  const expectedHtmlEntities = [
    { type: 'bold', offset: 0, length: 5 },
    { type: 'text_mention', offset: 7, length: 3, user: createdAccount.account },
    { type: 'text_link', offset: 12, length: 4, url: 'http://grammy.dev/' },
    { type: 'pre', offset: 17, length: 12, language: 'ts' },
  ];
  if (
    htmlMessage?.text !== 'Hello, Ada! Docs\nbot.start();' ||
    JSON.stringify(htmlMessage.entities) !== JSON.stringify(expectedHtmlEntities)
  ) {
    throw new Error(
      `Expected the HTML to be parsed, received ${JSON.stringify(htmlResponse.body)}`,
    );
  }

  // A form-encoded request sends entities as JSON text; types Telegram detects itself are ignored.
  const entitiesResponse = await api.request(`${botApiPath}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      chat_id: String(accountId),
      text: 'Tap /start now',
      entities: JSON.stringify([
        { type: 'italic', offset: 9, length: 3 },
        { type: 'bot_command', offset: 0, length: 3 },
      ]),
    }),
  });
  const entitiesMessage = botApiResult(await entitiesResponse.json());
  if (
    JSON.stringify(entitiesMessage?.entities) !== JSON.stringify([
      { type: 'bot_command', offset: 4, length: 6 },
      { type: 'italic', offset: 9, length: 1 },
      { type: 'italic', offset: 10, length: 2 },
    ])
  ) {
    throw new Error(
      `Expected specified and detected entities, received ${JSON.stringify(entitiesMessage)}`,
    );
  }

  const markdownV2Error =
    "Bad Request: can't parse entities: Character '.' is reserved and must be escaped with the preceding '\\'";
  // Telegram parses markup before it looks at the chat, but validates entities after it.
  await expectBadRequest('sendMessage', {
    chat_id: 999,
    text: 'Version 1.0',
    parse_mode: 'MarkdownV2',
  }, markdownV2Error);
  await expectBadRequest('sendMessage', {
    chat_id: 999,
    text: 'x',
    entities: [{ type: 'text_link', offset: 0, length: 1, url: 'localhost' }],
  }, 'Bad Request: chat not found');
  await expectBadRequest('sendMessage', {
    chat_id: accountId,
    text: 'x',
    entities: [{ type: 'text_link', offset: 0, length: 1, url: 'localhost' }],
  }, "Bad Request: entity URL 'localhost' is invalid: Wrong HTTP URL");
  await expectBadRequest('sendMessage', {
    chat_id: accountId,
    text: '*unclosed',
    parse_mode: 'markdown',
  }, "Bad Request: can't parse entities: Can't find end of the entity starting at byte offset 0");
  await expectBadRequest('sendMessage', {
    chat_id: accountId,
    text: 'Hi',
    parse_mode: 'XML',
  }, 'Bad Request: unsupported parse_mode');
  await expectBadRequest('sendMessage', {
    chat_id: accountId,
    text: 'Hi',
    entities: [{ type: 'shiny', offset: 0, length: 2 }],
  }, "Bad Request: can't parse MessageEntity: Unsupported type specified");
  await expectBadRequest('sendMessage', {
    chat_id: accountId,
    text: 'Hi',
    entities: [{ type: 'bold', offset: '0', length: 2 }],
  }, 'Bad Request: invalid sendMessage parameters');
  await expectBadRequest('sendMessage', {
    chat_id: accountId,
    text: 'Hi',
    entities: [{ type: 'text_mention', offset: 0, length: 2, user: { id: 999 } }],
  }, 'Bad Request: user not found');
  await expectBadRequest('sendMessage', {
    chat_id: accountId,
    text: '<tg-time unix="1700000000">now</tg-time>',
    parse_mode: 'HTML',
  }, 'Bad Request: date_time entities are not supported');
  await expectBadRequest(
    'sendMessage',
    { chat_id: accountId, text: ' \n ' },
    'Bad Request: text must be non-empty',
  );

  const plainResponse = await callBotApi(api, `${botApiPath}/sendMessage`, {
    chat_id: accountId,
    text: 'Plain *text*',
    parse_mode: 'none',
  });
  const plainMessage = botApiResult(plainResponse.body);
  if (plainMessage?.text !== 'Plain *text*' || typeof plainMessage.message_id !== 'number') {
    throw new Error(
      `Expected parse_mode none to keep the text, received ${JSON.stringify(plainResponse.body)}`,
    );
  }
  const editParameters = {
    chat_id: accountId,
    message_id: plainMessage.message_id,
    text: 'Plain *text*',
    parse_mode: 'MarkdownV2',
  };
  const editResponse = await callBotApi(api, `${botApiPath}/editMessageText`, editParameters);
  const editedMessage = botApiResult(editResponse.body);
  if (
    editedMessage?.text !== 'Plain text' ||
    JSON.stringify(editedMessage.entities) !==
      JSON.stringify([{ type: 'bold', offset: 6, length: 4 }]) ||
    typeof editedMessage.edit_date !== 'number'
  ) {
    throw new Error(
      `Expected the edit to apply formatting, received ${JSON.stringify(editResponse.body)}`,
    );
  }
  await expectBadRequest(
    'editMessageText',
    editParameters,
    'Bad Request: message is not modified: specified new message content and reply markup are exactly the same as a current content and reply markup of the message',
  );

  const historyBody: unknown = await (await api.request(
    `${sessionPath}/accounts/${accountId}/conversations/private/${createdBot.bot.id}/messages`,
  )).json();
  const storedEdit = isMessageHistoryResponse(historyBody)
    ? historyBody.messages.find((message) => message.message_id === plainMessage.message_id)
    : undefined;
  if (JSON.stringify(storedEdit?.entities) !== JSON.stringify(editedMessage.entities)) {
    throw new Error(
      `Expected history to show the formatted edit, received ${JSON.stringify(historyBody)}`,
    );
  }
});

Deno.test('a grammY bot replies with HTML and receives Telegram errors for bad MarkdownV2', async () => {
  const { api, sessionPath, createdBot, createdAccount, sendText } =
    await createPrivateConversationFixture();
  const grammyBot = new Bot(createdBot.token, {
    client: {
      apiRoot: `http://emulator.example:9000${sessionPath}/bot-api`,
      fetch: createInProcessFetch(api.fetch),
    },
  });
  const markdownV2Failure = Promise.withResolvers<unknown>();
  grammyBot.command('start', async (context) => {
    await context.reply(`<b>Welcome</b>, ${context.from?.first_name}!`, { parse_mode: 'HTML' });
    try {
      await context.reply('Version 2.0 is out!', { parse_mode: 'MarkdownV2' });
      markdownV2Failure.resolve(undefined);
    } catch (error) {
      markdownV2Failure.resolve(error);
    }
  });
  const polling = grammyBot.start();

  try {
    await sendText('/start');
    // Polling ends only when stopped, so settling first means startup failed.
    const failure = await Promise.race([markdownV2Failure.promise, polling.then(() => undefined)]);
    if (
      !(failure instanceof GrammyError) || failure.error_code !== 400 ||
      failure.description !==
        "Bad Request: can't parse entities: Character '.' is reserved and must be escaped with the preceding '\\'"
    ) {
      throw new Error(`Expected grammY to report the MarkdownV2 error, received ${failure}`);
    }

    const historyBody: unknown = await (await api.request(
      `${sessionPath}/accounts/${createdAccount.account.id}/conversations/private/${createdBot.bot.id}/messages`,
    )).json();
    const reply = isMessageHistoryResponse(historyBody) ? historyBody.messages.at(-1) : undefined;
    if (
      reply?.text !== 'Welcome, Ada!' ||
      JSON.stringify(reply.entities) !== JSON.stringify([{ type: 'bold', offset: 0, length: 7 }])
    ) {
      throw new Error(
        `Expected the formatted welcome as the last message, received ${JSON.stringify(reply)}`,
      );
    }
  } finally {
    await grammyBot.stop();
    await polling;
  }
});

Deno.test('setMyCommands, getMyCommands, and deleteMyCommands follow Telegram checks', async () => {
  const { api, sessionPath, botApiPath, createdBot, createdAccount, sendText } =
    await createPrivateConversationFixture();
  const accountId = createdAccount.account.id;
  const expectBadRequest = async (
    methodName: string,
    parameters: Record<string, unknown>,
    expectedDescription: string,
  ) => {
    const { status, body } = await callBotApi(api, `${botApiPath}/${methodName}`, parameters);
    if (status !== 400 || !isBadRequestResponse(body) || body.description !== expectedDescription) {
      throw new Error(
        `Expected ${methodName} ${
          JSON.stringify(parameters)
        } to fail with ${expectedDescription}, received ${status} ${JSON.stringify(body)}`,
      );
    }
  };
  const getCommands = async (parameters: Record<string, unknown>) => {
    const { status, body } = await callBotApi(api, `${botApiPath}/getMyCommands`, parameters);
    if (status !== 200 || typeof body !== 'object' || body === null || !('result' in body)) {
      throw new Error(
        `Expected getMyCommands to succeed, received ${status} ${JSON.stringify(body)}`,
      );
    }
    return body.result;
  };

  const setResponse = await api.request(`${botApiPath}/setMyCommands`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      commands: JSON.stringify([
        { command: '/start', description: 'Start over' },
        { command: 'help', description: 'Show help', is_ephemeral: true },
      ]),
      language_code: 'en',
    }),
  });
  const setBody: unknown = await setResponse.json();
  if (
    setResponse.status !== 200 ||
    JSON.stringify(setBody) !== JSON.stringify({ ok: true, result: true })
  ) {
    throw new Error(`Expected setMyCommands to succeed, received ${JSON.stringify(setBody)}`);
  }
  const englishCommands = [
    { command: 'start', description: 'Start over' },
    { command: 'help', description: 'Show help', is_ephemeral: true },
  ];
  if (
    JSON.stringify(await getCommands({ language_code: 'en' })) !==
      JSON.stringify(englishCommands) ||
    JSON.stringify(await getCommands({})) !== JSON.stringify([])
  ) {
    throw new Error('Expected getMyCommands to return exactly the list of its scope and language');
  }

  await expectBadRequest('setMyCommands', {
    commands: [{ command: 'Start', description: 'Go' }],
  }, 'Bad Request: BOT_COMMAND_INVALID');
  await expectBadRequest('setMyCommands', {
    commands: [{ command: 'start', description: ' ' }],
  }, 'Bad Request: command description must be non-empty');
  await expectBadRequest('setMyCommands', {
    commands: [{ command: 'c'.repeat(33), description: 'Go' }],
  }, 'Bad Request: command length must not exceed 32');
  await expectBadRequest(
    'setMyCommands',
    { commands: [], language_code: 'english' },
    'Bad Request: invalid language code specified',
  );
  await expectBadRequest(
    'getMyCommands',
    { scope: { type: 'chat', chat_id: accountId } },
    'Bad Request: chat not found',
  );
  await expectBadRequest(
    'deleteMyCommands',
    { scope: { type: 'everyone' } },
    "Bad Request: can't parse BotCommandScope: Unsupported type specified",
  );
  await expectBadRequest(
    'getMyCommands',
    { scope: { type: 'chat_member', chat_id: accountId, user_id: 0 } },
    "Bad Request: can't parse BotCommandScope: Invalid user_id specified",
  );
  await expectBadRequest(
    'setMyCommands',
    { commands: [{ command: 'start' }] },
    'Bad Request: invalid setMyCommands parameters',
  );

  await sendText('Hi');
  await expectBadRequest(
    'getMyCommands',
    { scope: { type: 'chat_administrators', chat_id: accountId } },
    "Bad Request: can't use specified scope in private chats",
  );
  const chatScope = { type: 'chat', chat_id: accountId };
  const chatSetResult = await callBotApi(api, `${botApiPath}/setMyCommands`, {
    commands: [{ command: 'order', description: 'Order again' }],
    scope: chatScope,
  });
  if (chatSetResult.status !== 200) {
    throw new Error(
      `Expected chat commands to be set, received ${JSON.stringify(chatSetResult.body)}`,
    );
  }
  const commandsPath =
    `${sessionPath}/accounts/${accountId}/conversations/private/${createdBot.bot.id}/commands`;
  const chatCommandsBody: unknown = await (await api.request(commandsPath)).json();
  if (
    JSON.stringify(chatCommandsBody) !== JSON.stringify({
      commands: [{ command: 'order', description: 'Order again', is_ephemeral: false }],
    })
  ) {
    throw new Error(
      `Expected the account to see its chat's commands, received ${
        JSON.stringify(chatCommandsBody)
      }`,
    );
  }

  const deleteResult = await callBotApi(api, `${botApiPath}/deleteMyCommands`, {
    scope: chatScope,
  });
  const fallbackBody: unknown = await (await api.request(commandsPath)).json();
  if (
    deleteResult.status !== 200 ||
    JSON.stringify(fallbackBody) !== JSON.stringify({ commands: [] }) ||
    JSON.stringify(await getCommands({ scope: chatScope })) !== JSON.stringify([])
  ) {
    throw new Error(
      `Expected the chat's commands to be deleted, received ${JSON.stringify(fallbackBody)}`,
    );
  }
  const unknownBotResponse = await api.request(
    `${sessionPath}/accounts/${accountId}/conversations/private/999/commands`,
  );
  if (unknownBotResponse.status !== 404) {
    throw new Error(
      `Expected an unknown bot to be reported, received ${unknownBotResponse.status}`,
    );
  }
});

Deno.test('a grammY bot registers its command menu at startup and for a chat', async () => {
  const { api, sessionPath, createdBot, createdAccount, sendText } =
    await createPrivateConversationFixture();
  const grammyBot = new Bot(createdBot.token, {
    client: {
      apiRoot: `http://emulator.example:9000${sessionPath}/bot-api`,
      fetch: createInProcessFetch(api.fetch),
    },
  });
  const chatMenuSet = Promise.withResolvers<void>();
  grammyBot.command('start', async (context) => {
    await context.api.setMyCommands(
      [{ command: 'order', description: 'Place an order' }, {
        command: 'help',
        description: 'Help',
      }],
      { scope: { type: 'chat', chat_id: context.chat.id } },
    );
    chatMenuSet.resolve();
  });
  await grammyBot.api.setMyCommands([{ command: 'start', description: 'Start the bot' }]);
  const commandsPath =
    `${sessionPath}/accounts/${createdAccount.account.id}/conversations/private/${createdBot.bot.id}/commands`;
  const menuCommands = async () => {
    const body: unknown = await (await api.request(commandsPath)).json();
    const commands = typeof body === 'object' && body !== null && 'commands' in body &&
        Array.isArray(body.commands)
      ? body.commands
      : [];
    return commands.map((command: { command?: unknown }) => command.command).join();
  };
  if (await menuCommands() !== 'start') {
    throw new Error('Expected the account to see the default commands');
  }
  const polling = grammyBot.start();

  try {
    await sendText('/start');
    // Polling ends only when stopped, so settling first means startup failed.
    await Promise.race([chatMenuSet.promise, polling]);
    if (await menuCommands() !== 'order,help') {
      throw new Error(`Expected the chat's own commands, received ${await menuCommands()}`);
    }
  } finally {
    await grammyBot.stop();
    await polling;
  }
});

Deno.test('sendChatAction accepts Telegram actions in started private chats', async () => {
  const { api, botApiPath, createdAccount, sendText } = await createPrivateConversationFixture();
  const accountId = createdAccount.account.id;
  const sendChatAction = (parameters: Record<string, unknown>) =>
    callBotApi(api, `${botApiPath}/sendChatAction`, parameters);
  const expectDescription = async (parameters: Record<string, unknown>, expected: string) => {
    const { status, body } = await sendChatAction(parameters);
    if (status !== 400 || !isBadRequestResponse(body) || body.description !== expected) {
      throw new Error(
        `Expected ${JSON.stringify(parameters)} to fail with ${expected}, received ${
          JSON.stringify(body)
        }`,
      );
    }
  };

  await expectDescription({ chat_id: accountId, action: 'typing' }, 'Bad Request: chat not found');
  await sendText('Hi');
  for (const action of ['typing', 'UPLOAD_PHOTO', 'record_audio', 'cancel']) {
    const { status, body } = await sendChatAction({ chat_id: accountId, action });
    if (status !== 200 || JSON.stringify(body) !== JSON.stringify({ ok: true, result: true })) {
      throw new Error(
        `Expected ${action} to be accepted, received ${status} ${JSON.stringify(body)}`,
      );
    }
  }
  // Telegram reads the action before the chat.
  await expectDescription({ action: 'dancing' }, 'Bad Request: wrong parameter action in request');
  await expectDescription({ chat_id: accountId }, 'Bad Request: wrong parameter action in request');
  await expectDescription({ action: 'typing' }, 'Bad Request: chat_id is empty');
  await expectDescription(
    { chat_id: accountId, action: 'typing', message_thread_id: 1 },
    'Bad Request: invalid sendChatAction parameters',
  );
});

Deno.test('a grammY bot shows typing before it replies', async () => {
  const { api, sessionPath, createdBot, createdAccount, sendText } =
    await createPrivateConversationFixture();
  const grammyBot = new Bot(createdBot.token, {
    client: {
      apiRoot: `http://emulator.example:9000${sessionPath}/bot-api`,
      fetch: createInProcessFetch(api.fetch),
    },
  });
  const replied = Promise.withResolvers<void>();
  grammyBot.on('message:text', async (context) => {
    await context.replyWithChatAction('typing');
    await context.reply(`You said: ${context.message.text}`);
    replied.resolve();
  });
  const polling = grammyBot.start();

  try {
    await sendText('hello');
    // Polling ends only when stopped, so settling first means startup failed.
    await Promise.race([replied.promise, polling]);
    const historyBody: unknown = await (await api.request(
      `${sessionPath}/accounts/${createdAccount.account.id}/conversations/private/${createdBot.bot.id}/messages`,
    )).json();
    const reply = isMessageHistoryResponse(historyBody) ? historyBody.messages.at(-1) : undefined;
    if (reply?.text !== 'You said: hello') {
      throw new Error(
        `Expected the reply after the chat action, received ${JSON.stringify(historyBody)}`,
      );
    }
  } finally {
    await grammyBot.stop();
    await polling;
  }
});

async function expectSettlementWithin<T>(
  pending: Promise<T>,
  milliseconds: number,
  failureMessage: string,
): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timeoutId = setTimeout(() => reject(new Error(failureMessage)), milliseconds);
  });
  try {
    return await Promise.race([pending, timeout]);
  } finally {
    clearTimeout(timeoutId);
  }
}

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

/** Calls a Bot API method with JSON parameters and returns the status and decoded body. */
async function callBotApi(
  api: ReturnType<typeof createEmulationApi>,
  methodPath: string,
  parameters: Record<string, unknown>,
): Promise<{ status: number; body: unknown }> {
  const response = await api.request(methodPath, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(parameters),
  });
  return { status: response.status, body: await response.json() };
}

/** Returns the message a successful Bot API message method returned, if it did. */
function botApiResult(body: unknown): Record<string, unknown> | undefined {
  if (typeof body !== 'object' || body === null) {
    return undefined;
  }
  const { ok, result } = body as Record<string, unknown>;
  return ok === true && typeof result === 'object' && result !== null
    ? result as Record<string, unknown>
    : undefined;
}

function isCallbackQueryResponse(value: unknown): value is {
  callback_query: {
    id: string;
    callback_data: string;
    status: 'awaiting_answer' | 'answered' | 'expired';
    answer: { text?: string; show_alert: boolean; cache_time: number } | null;
  };
} {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const callbackQuery = (value as Record<string, unknown>).callback_query;
  if (typeof callbackQuery !== 'object' || callbackQuery === null) {
    return false;
  }
  const { id, callback_data, status, answer } = callbackQuery as Record<string, unknown>;
  return typeof id === 'string' && typeof callback_data === 'string' &&
    ['awaiting_answer', 'answered', 'expired'].includes(String(status)) &&
    (answer === null || typeof answer === 'object');
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
  message: TestPrivateTextMessage;
} {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const { message } = value as Record<string, unknown>;
  return isPrivateTextMessage(message);
}

function isMessageHistoryResponse(value: unknown): value is {
  messages: Array<TestPrivateTextMessage>;
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
    message: TestPrivateTextMessage;
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

/** The parts of a Bot API message these tests check. */
interface TestPrivateTextMessage {
  message_id: number;
  from: { id: number };
  chat: { id: number; type: string };
  date: number;
  text: string;
  /** Left unchecked; tests compare it as a whole. */
  entities?: unknown;
  /** Left unchecked; tests compare it as a whole. */
  reply_markup?: unknown;
}

function isPrivateTextMessage(value: unknown): value is TestPrivateTextMessage {
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
