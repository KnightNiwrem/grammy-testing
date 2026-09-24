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
  const sentCommand = await createdAccount.account.sendMessage({
    to: { type: 'private', botId: createdBot.bot.id },
    text: '/start',
  });
  if (
    sentMessage.entities !== undefined ||
    JSON.stringify(sentCommand.entities) !==
      JSON.stringify([{ type: 'bot_command', offset: 0, length: 6 }])
  ) {
    throw new Error('Expected the client to return bot command entities only where present');
  }

  const replyResponse = await api.request(
    `/sessions/${session.id}/bot-api/bot${createdBot.token}/sendMessage`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: createdAccount.account.id,
        text: `<b>Hello</b> from the <a href="tg://user?id=${createdBot.bot.id}">bot</a>`,
        parse_mode: 'HTML',
      }),
    },
  );
  if (replyResponse.status !== 200) {
    throw new Error(`Expected the bot reply to be accepted, received ${replyResponse.status}`);
  }

  const history = await createdAccount.account.getMessages({
    chat: { type: 'private', botId: createdBot.bot.id },
  });
  if (
    history.length !== 3 ||
    history[0].message_id !== sentMessage.message_id ||
    history[1].message_id !== sentCommand.message_id ||
    history[2].from.id !== createdBot.bot.id ||
    !history[2].from.is_bot ||
    history[2].text !== 'Hello from the bot'
  ) {
    throw new Error("Expected the account-bound client to retrieve both participants' messages");
  }
  const mentionedBot = {
    id: createdBot.bot.id,
    is_bot: true,
    first_name: 'Test Bot',
    username: 'test_bot',
  };
  if (
    JSON.stringify(history[2].entities) !== JSON.stringify([
      { type: 'bold', offset: 0, length: 5 },
      { type: 'text_mention', offset: 15, length: 3, user: mentionedBot },
    ])
  ) {
    throw new Error('Expected the client to return the formatting of a bot message');
  }

  const botApiPath = `/sessions/${session.id}/bot-api/bot${createdBot.token}`;
  const menuResponse = await api.request(`${botApiPath}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: createdAccount.account.id,
      text: 'Continue?',
      reply_markup: { inline_keyboard: [[{ text: 'Yes', callback_data: 'yes' }]] },
    }),
  });
  if (menuResponse.status !== 200) {
    throw new Error(`Expected the bot menu to be accepted, received ${menuResponse.status}`);
  }
  const [, , , menu] = await createdAccount.account.getMessages({
    chat: { type: 'private', botId: createdBot.bot.id },
  });
  if (
    JSON.stringify(menu?.reply_markup) !==
      JSON.stringify({ inline_keyboard: [[{ text: 'Yes', callback_data: 'yes' }]] })
  ) {
    throw new Error('Expected the client to return the inline keyboard of a bot message');
  }

  const callbackQuery = await createdAccount.account.pressCallbackButton({
    chat: { type: 'private', botId: createdBot.bot.id },
    message_id: menu.message_id,
    callback_data: 'yes',
  });
  if (
    callbackQuery.callback_data !== 'yes' || callbackQuery.status !== 'awaiting_answer' ||
    callbackQuery.answer !== null
  ) {
    throw new Error('Expected the client to return the unanswered callback query');
  }
  const answerResponse = await api.request(`${botApiPath}/answerCallbackQuery`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ callback_query_id: callbackQuery.id, text: 'Saved' }),
  });
  if (answerResponse.status !== 200) {
    throw new Error(`Expected the answer to be accepted, received ${answerResponse.status}`);
  }
  const answeredCallbackQuery = await createdAccount.account.getCallbackQuery(callbackQuery.id);
  if (
    answeredCallbackQuery.status !== 'answered' ||
    JSON.stringify(answeredCallbackQuery.answer) !==
      JSON.stringify({ text: 'Saved', show_alert: false, cache_time: 0 })
  ) {
    throw new Error("Expected the client to return the bot's answer");
  }

  const expiredOnCreation = await createdAccount.account.pressCallbackButton({
    chat: { type: 'private', botId: createdBot.bot.id },
    message_id: menu.message_id,
    callback_data: 'yes',
    expired: true,
  });
  if (expiredOnCreation.status !== 'expired') {
    throw new Error('Expected the client to create an expired callback query');
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
