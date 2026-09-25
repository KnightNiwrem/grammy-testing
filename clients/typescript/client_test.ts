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
        reply_parameters: { message_id: sentCommand.message_id },
        protect_content: true,
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
  const accountReply = await createdAccount.account.sendMessage({
    to: { type: 'private', botId: createdBot.bot.id },
    text: 'Thanks',
    reply_to_message_id: history[2].message_id,
  });
  const { reply_to_message: _, ...repliedBotMessage } = history[2];
  if (
    history[2].reply_to_message?.message_id !== sentCommand.message_id ||
    history[2].has_protected_content !== true ||
    JSON.stringify(accountReply.reply_to_message) !== JSON.stringify(repliedBotMessage)
  ) {
    throw new Error('Expected the client to send and return replies and protected messages');
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
  const menu = (await createdAccount.account.getMessages({
    chat: { type: 'private', botId: createdBot.bot.id },
  })).at(-1);
  if (
    menu === undefined ||
    JSON.stringify(menu.reply_markup) !==
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

  const setCommandsResponse = await api.request(`${botApiPath}/setMyCommands`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ commands: [{ command: 'start', description: 'Start over' }] }),
  });
  if (setCommandsResponse.status !== 200) {
    throw new Error(`Expected the commands to be set, received ${setCommandsResponse.status}`);
  }
  const commands = await createdAccount.account.getBotCommands({
    chat: { type: 'private', botId: createdBot.bot.id },
  });
  if (
    JSON.stringify(commands) !==
      JSON.stringify([{ command: 'start', description: 'Start over', is_ephemeral: false }])
  ) {
    throw new Error(
      `Expected the client to return the bot's commands, received ${JSON.stringify(commands)}`,
    );
  }

  const chat = { type: 'private', botId: createdBot.bot.id } as const;
  if (await createdAccount.account.getReplyInterface({ chat }) !== null) {
    throw new Error('Expected no reply interface before the bot sends one');
  }
  const keyboardResponse = await api.request(`${botApiPath}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: createdAccount.account.id,
      text: 'Pick a color',
      reply_markup: { keyboard: [['Red', 'Green']], is_persistent: true },
    }),
  });
  const keyboardMessageId = (await keyboardResponse.json()).result.message_id;
  const replyInterface = await createdAccount.account.getReplyInterface({ chat });
  const pressedButtonMessage = await createdAccount.account.pressReplyKeyboardButton({
    chat,
    text: 'Green',
  });
  if (
    JSON.stringify(replyInterface) !== JSON.stringify({
        type: 'keyboard',
        message_id: keyboardMessageId,
        keyboard: [[{ text: 'Red' }, { text: 'Green' }]],
        is_persistent: true,
        resize_keyboard: false,
        one_time_keyboard: false,
      }) ||
    pressedButtonMessage.text !== 'Green' ||
    pressedButtonMessage.from.id !== createdAccount.account.id
  ) {
    throw new Error('Expected the client to read and press the reply keyboard');
  }

  const editedMessage = await createdAccount.account.editMessage({
    chat,
    message_id: pressedButtonMessage.message_id,
    text: 'Blue',
  });
  if (
    editedMessage.message_id !== pressedButtonMessage.message_id ||
    editedMessage.text !== 'Blue' || editedMessage.edit_date === undefined
  ) {
    throw new Error('Expected the client to edit an account message');
  }

  await createdAccount.account.blockBot({ botId: createdBot.bot.id });
  const blockedReplyResponse = await api.request(`${botApiPath}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: createdAccount.account.id, text: 'Hello?' }),
  });
  await createdAccount.account.unblockBot({ botId: createdBot.bot.id });
  const unblockedReplyResponse = await api.request(`${botApiPath}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: createdAccount.account.id, text: 'Hello again' }),
  });
  if (blockedReplyResponse.status !== 403 || unblockedReplyResponse.status !== 200) {
    throw new Error('Expected the client to block and unblock the bot');
  }

  await session.end();
});

Deno.test('TypeScript client runs supergroups with members, messages, and buttons', async () => {
  const publicOrigin = 'http://emulator.example:9000';
  const api = createEmulationApi({
    sessionLifecycle: createSessionLifecycleService(),
    publicOrigin,
  });
  const client = new TelegramEmulationClient(publicOrigin, {
    fetch: createInProcessFetch(api.fetch),
  });
  const session = await client.createSession();
  const { token, bot } = await session.createBot({
    first_name: 'Test Bot',
    username: 'test_bot',
    can_read_all_group_messages: true,
  });
  const { account: owner } = await session.createAccount({ first_name: 'Ada' });
  const { account: member } = await session.createAccount({
    first_name: 'Grace',
    has_private_forwards: true,
  });

  const supergroup = await owner.createSupergroup({ title: 'Team', description: 'Our team' });
  const chat = { type: 'supergroup', chatId: supergroup.id } as const;
  await owner.addChatMember({ chat, userId: member.id });
  await owner.addChatMember({ chat, userId: bot.id });
  await owner.addChatMember({ chat, userId: bot.id });
  if (
    !bot.can_read_all_group_messages || supergroup.type !== 'supergroup' ||
    supergroup.title !== 'Team' || supergroup.description !== 'Our team'
  ) {
    throw new Error('Expected the client to create a reading bot and a supergroup');
  }

  const greeting = await member.sendMessage({ to: chat, text: 'Hello team' });
  const botApiPath = `/sessions/${session.id}/bot-api/bot${token}`;
  const menuResponse = await api.request(`${botApiPath}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: supergroup.id,
      text: 'Continue?',
      reply_parameters: { message_id: greeting.message_id },
      reply_markup: { inline_keyboard: [[{ text: 'Yes', callback_data: 'yes' }]] },
    }),
  });
  if (menuResponse.status !== 200) {
    throw new Error(`Expected the bot to write to the supergroup, received ${menuResponse.status}`);
  }
  const edited = await member.editMessage({
    chat,
    message_id: greeting.message_id,
    text: 'Hello everyone',
  });
  const history = await owner.getMessages({ chat });
  const menu = history[3];
  const callbackQuery = await owner.pressCallbackButton({
    chat,
    message_id: menu.message_id,
    callback_data: 'yes',
  });
  if (
    greeting.chat.title !== 'Team' || edited.edit_date === undefined ||
    JSON.stringify(history.map(({ message_id, text, new_chat_members }) => [
        message_id,
        text ?? new_chat_members?.map(({ id }) => id),
      ]
      )) !==
      JSON.stringify([[1, [member.id]], [2, [bot.id]], [3, 'Hello everyone'], [4, 'Continue?']]) ||
    menu.reply_to_message?.text !== 'Hello everyone' ||
    callbackQuery.status !== 'awaiting_answer'
  ) {
    throw new Error('Expected the client to exchange messages and press buttons in the supergroup');
  }

  const chatActionResponse = await api.request(`${botApiPath}/sendChatAction`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: supergroup.id, action: 'typing' }),
  });
  const chatActions = await member.getChatActions({ chat });
  const notifications = await member.getNotifications({ chat });
  if (
    chatActionResponse.status !== 200 ||
    JSON.stringify(chatActions) !== JSON.stringify([{ bot_id: bot.id, action: 'typing' }]) ||
    JSON.stringify(notifications.at(-1)) !== JSON.stringify({ message_id: 4, is_silent: false })
  ) {
    throw new Error(`Expected the client to see the bot typing, received ${chatActions}`);
  }

  const groupCommandsResponse = await api.request(`${botApiPath}/setMyCommands`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      commands: [{ command: 'poll', description: 'Start a poll' }],
      scope: { type: 'chat', chat_id: supergroup.id },
    }),
  });
  const groupCommands = await member.getSupergroupBotCommands({ chat });
  if (
    groupCommandsResponse.status !== 200 ||
    JSON.stringify(groupCommands) !== JSON.stringify([{
        bot_id: bot.id,
        commands: [{ command: 'poll', description: 'Start a poll', is_ephemeral: false }],
      }])
  ) {
    throw new Error(
      `Expected the client to return the supergroup's commands, received ${
        JSON.stringify(groupCommands)
      }`,
    );
  }

  const forward = await owner.forwardMessage({
    from: chat,
    message_id: greeting.message_id,
    to: { type: 'private', botId: bot.id },
  });
  if (
    forward.chat.id !== owner.id || forward.text !== 'Hello everyone' ||
    JSON.stringify(forward.forward_origin) !==
      JSON.stringify({ type: 'hidden_user', sender_user_name: 'Grace', date: greeting.date }) ||
    forward.forward_sender_name !== 'Grace'
  ) {
    throw new Error(
      `Expected the client to forward a message, received ${JSON.stringify(forward)}`,
    );
  }

  const externalReplyResponse = await api.request(`${botApiPath}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: owner.id,
      text: 'Seen in the team',
      reply_parameters: { chat_id: supergroup.id, message_id: greeting.message_id },
    }),
  });
  const [externalReply] = (await owner.getMessages({ chat: { type: 'private', botId: bot.id } }))
    .slice(-1);
  if (
    externalReplyResponse.status !== 200 ||
    externalReply.external_reply?.chat?.id !== supergroup.id ||
    externalReply.external_reply.message_id !== greeting.message_id ||
    externalReply.quote?.text !== 'Hello everyone'
  ) {
    throw new Error(
      `Expected the client to read an external reply, received ${JSON.stringify(externalReply)}`,
    );
  }

  const privateChat = { type: 'private', botId: bot.id } as const;
  await owner.deleteMessage({ chat: privateChat, message_id: externalReply.message_id });
  const privateHistory = await owner.getMessages({ chat: privateChat });
  if (privateHistory.some(({ message_id }) => message_id === externalReply.message_id)) {
    throw new Error(
      `Expected the client to delete the bot's message, received ${JSON.stringify(privateHistory)}`,
    );
  }

  // Only an administrator with the right deletes another member's message.
  const deleteGreeting = () =>
    api.request(`${botApiPath}/deleteMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: supergroup.id, message_id: greeting.message_id }),
    });
  const deletionBeforePromotion = await deleteGreeting();
  await owner.promoteChatMember({ chat, userId: bot.id, rights: { can_delete_messages: true } });
  const deletionAfterPromotion = await deleteGreeting();
  await owner.demoteChatMember({ chat, userId: bot.id });
  await owner.demoteChatMember({ chat, userId: bot.id });
  if (deletionBeforePromotion.status !== 400 || deletionAfterPromotion.status !== 200) {
    throw new Error(
      `Expected the promoted bot to delete the greeting, received ${
        [deletionBeforePromotion.status, deletionAfterPromotion.status].join()
      }`,
    );
  }

  await owner.removeChatMember({ chat, userId: bot.id });
  await owner.removeChatMember({ chat, userId: bot.id });
  await member.leaveChat({ chat });
  const departures = (await owner.getMessages({ chat })).slice(3);
  if (
    JSON.stringify(
      departures.map(({ from, left_chat_member }) => [from.id, left_chat_member?.id]),
    ) !==
      JSON.stringify([[owner.id, bot.id], [member.id, member.id]])
  ) {
    throw new Error(
      `Expected the client to remove the bot and leave, received ${JSON.stringify(departures)}`,
    );
  }

  const { account: stranger } = await session.createAccount({ first_name: 'Linus' });
  try {
    await stranger.getMessages({ chat });
  } catch (error) {
    if (error instanceof EmulationClientError && error.status === 403) {
      await session.end();
      return;
    }
    throw error;
  }
  throw new Error('Expected a non-member to be refused the supergroup history');
});

Deno.test('TypeScript client sends, edits, and downloads photos and documents', async () => {
  const publicOrigin = 'http://emulator.example:9000';
  const api = createEmulationApi({
    sessionLifecycle: createSessionLifecycleService(),
    publicOrigin,
  });
  const client = new TelegramEmulationClient(publicOrigin, {
    fetch: createInProcessFetch(api.fetch),
  });
  const session = await client.createSession();
  const { token, bot } = await session.createBot({ first_name: 'Test Bot', username: 'test_bot' });
  const { account } = await session.createAccount({ first_name: 'Ada' });
  const to = { type: 'private', botId: bot.id } as const;
  const image = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 2, 0, 1, 0, 0, 0, 0]);

  const photo = await account.sendPhoto({ to, photo: image, caption: 'Receipt' });
  const document = await account.sendDocument({
    to,
    document: new TextEncoder().encode('notes'),
    file_name: 'notes.txt',
    reply_to_message_id: photo.message_id,
  });
  const editedDocument = await account.editMessageCaption({
    chat: to,
    message_id: document.message_id,
    caption: 'My notes',
  });
  const downloadedPhoto = await session.downloadFile(photo.photo?.[0].file_unique_id ?? '');
  if (
    photo.caption !== 'Receipt' || photo.photo?.[0].width !== 2 ||
    document.document?.mime_type !== 'text/plain' ||
    document.reply_to_message?.photo?.[0].height !== 1 ||
    editedDocument.caption !== 'My notes' || editedDocument.edit_date === undefined ||
    downloadedPhoto.toBase64() !== image.toBase64()
  ) {
    throw new Error('Expected the client to send, edit, and download media');
  }

  const botReply = await api.request(`/sessions/${session.id}/bot-api/bot${token}/sendDocument`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: account.id,
      document: document.document?.file_id,
      caption: 'Back to you',
    }),
  });
  const history = await account.getMessages({ chat: to });
  if (
    botReply.status !== 200 ||
    history.at(-1)?.document?.file_unique_id !== document.document?.file_unique_id ||
    history.at(-1)?.caption !== 'Back to you'
  ) {
    throw new Error('Expected the bot to resend the document by its file ID');
  }

  try {
    await account.sendPhoto({ to, photo: new TextEncoder().encode('not an image') });
  } catch (error) {
    if (error instanceof EmulationClientError && error.status === 400) {
      await session.end();
      return;
    }
    throw error;
  }
  throw new Error('Expected content that is not an image to be refused as a photo');
});

Deno.test('TypeScript client sends inline queries and results through an inline bot', async () => {
  const publicOrigin = 'http://emulator.example:9000';
  const api = createEmulationApi({
    sessionLifecycle: createSessionLifecycleService(),
    publicOrigin,
  });
  const client = new TelegramEmulationClient(publicOrigin, {
    fetch: createInProcessFetch(api.fetch),
  });
  const session = await client.createSession();
  const { token, bot } = await session.createBot({
    first_name: 'Cats Bot',
    username: 'cats_bot',
    supports_inline_queries: true,
    receives_chosen_inline_results: true,
  });
  const { account } = await session.createAccount({ first_name: 'Ada' });
  const supergroup = await account.createSupergroup({ title: 'Team' });

  const inlineQuery = await account.sendInlineQuery({
    bot_id: bot.id,
    chat: { type: 'supergroup', chatId: supergroup.id },
    query: 'cats',
  });
  const answerResponse = await api.request(
    `/sessions/${session.id}/bot-api/bot${token}/answerInlineQuery`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        inline_query_id: inlineQuery.id,
        results: [{
          type: 'article',
          id: 'fact',
          title: 'Cat fact',
          input_message_content: { message_text: 'Cats sleep a lot' },
        }],
        button: { text: 'Open', web_app: { url: 'https://grammy.dev' } },
      }),
    },
  );
  const answeredQuery = await account.getInlineQuery(inlineQuery.id);
  const message = await account.chooseInlineQueryResult({
    inline_query_id: inlineQuery.id,
    result_id: 'fact',
  });
  if (
    bot.supports_inline_queries !== true || inlineQuery.status !== 'awaiting_answer' ||
    answerResponse.status !== 200 || answeredQuery.answer?.results[0]?.title !== 'Cat fact' ||
    answeredQuery.answer.button === undefined || !('web_app' in answeredQuery.answer.button) ||
    message.text !== 'Cats sleep a lot' || message.via_bot?.username !== 'cats_bot' ||
    message.chat.type !== 'supergroup'
  ) {
    throw new Error('Expected the client to send an inline query and its chosen result');
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
