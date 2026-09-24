import { AccountRepository } from '../src/repositories/account.ts';
import { BotRepository } from '../src/repositories/bot.ts';
import { BotUpdateRepository } from '../src/repositories/bot_update.ts';
import { BotUpdateSubscriptionRepository } from '../src/repositories/bot_update_subscription.ts';
import { CallbackQueryRepository } from '../src/repositories/callback_query.ts';
import { MessageRepository } from '../src/repositories/message.ts';
import { PrivateConversationRepository } from '../src/repositories/private_conversation.ts';
import { TelegramIdentityRepository } from '../src/repositories/telegram_identity.ts';
import { UserMessageBoxRepository } from '../src/repositories/user_message_box.ts';
import { BotApiService, type SendMessageResult } from '../src/services/bot_api.ts';
import { BotMessageViewService } from '../src/services/bot_message_view.ts';
import { BotUpdateDeliveryService } from '../src/services/bot_update_delivery.ts';
import {
  BotUpdatePollingService,
  type GetUpdatesResult,
} from '../src/services/bot_update_polling.ts';
import { CallbackQueryService } from '../src/services/callback_query.ts';
import { PrivateMessagingService } from '../src/services/private_messaging.ts';
import { VirtualUserService } from '../src/services/virtual_user.ts';
import type { BotApiPrivateTextMessage, BotApiUpdate } from '../src/types/bot_api.ts';
import { MAX_TEXT_MESSAGE_LENGTH } from '../src/types/virtual_message.ts';

Deno.test('BotApiService authenticates a bot by its token', () => {
  const { virtualUsers, botApi } = createBotApiFixture();
  const bot = createBot(virtualUsers, 'test_bot');

  if (botApi.authenticate(bot.token) !== bot.profile) {
    throw new Error('Expected a known token to authenticate its bot');
  }
  if (botApi.authenticate(`${bot.profile.id}:unknown`) !== undefined) {
    throw new Error('Expected an unknown token not to authenticate');
  }
});

Deno.test('BotApiService polls only the authenticated bot mailbox', async () => {
  const { virtualUsers, botUpdates, botApi } = createBotApiFixture();
  const targetBot = createBot(virtualUsers, 'target_bot');
  const otherBot = createBot(virtualUsers, 'other_bot');
  botUpdates.enqueueMessageUpdate(otherBot.profile.id, createPrivateTextMessage(1));
  botUpdates.enqueueMessageUpdate(targetBot.profile.id, createPrivateTextMessage(2));

  const authenticatedBot = botApi.authenticate(targetBot.token);
  if (authenticatedBot === undefined) {
    throw new Error('Expected the target bot to authenticate');
  }
  const updates = expectRetrievedUpdates(
    await botApi.getUpdates(authenticatedBot, { limit: 100, timeoutSeconds: 0 }),
  );

  if (updates.length !== 1 || messageFromUpdate(updates[0])?.message_id !== 2) {
    throw new Error("Expected getUpdates to return only the authenticated bot's updates");
  }
});

Deno.test('BotApiService deleteWebhook discards pending updates only when asked', async () => {
  const { virtualUsers, botUpdates, botApi } = createBotApiFixture();
  const bot = createBot(virtualUsers, 'test_bot');
  botUpdates.enqueueMessageUpdate(bot.profile.id, createPrivateTextMessage(1));

  botApi.deleteWebhook(bot.profile, { dropPendingUpdates: false });
  if (botUpdates.confirmAndReadPendingUpdates(bot.profile.id, { limit: 100 }).length !== 1) {
    throw new Error('Expected deleteWebhook to keep pending updates by default');
  }

  botApi.deleteWebhook(bot.profile, { dropPendingUpdates: true });
  botUpdates.enqueueMessageUpdate(bot.profile.id, createPrivateTextMessage(2));
  const updates = expectRetrievedUpdates(
    await botApi.getUpdates(bot.profile, { limit: 100, timeoutSeconds: 0 }),
  );
  if (updates.map((update) => update.update_id).join() !== '2') {
    throw new Error('Expected dropped updates to be discarded without restarting update IDs');
  }
});

Deno.test('BotApiService sends a message to an account that has written to the bot', () => {
  const { virtualUsers, botUpdates, privateMessaging, botApi } = createBotApiFixture();
  const bot = createBot(virtualUsers, 'test_bot');
  const account = createAccount(virtualUsers);
  privateMessaging.sendAccountMessage({
    fromAccountId: account.profile.id,
    to: { type: 'private', botId: bot.profile.id },
    text: '/start',
  });

  const reply = expectSentMessage(
    botApi.sendMessage(bot.profile, { chatId: account.profile.id, text: 'Welcome!' }),
  );
  if (
    reply.message_id !== 2 ||
    reply.chat.id !== account.profile.id ||
    reply.from.id !== bot.profile.id ||
    !reply.from.is_bot ||
    reply.text !== 'Welcome!'
  ) {
    throw new Error(
      "Expected the reply to be projected in the bot's private chat with the account",
    );
  }
  const pendingUpdates = botUpdates.confirmAndReadPendingUpdates(bot.profile.id, { limit: 100 });
  if (pendingUpdates.length !== 1 || messageFromUpdate(pendingUpdates[0])?.text !== '/start') {
    throw new Error('Expected the bot not to receive an update for its own message');
  }
});

Deno.test('BotApiService reports unreachable chats as not found', () => {
  const { virtualUsers, privateMessaging, botApi } = createBotApiFixture();
  const bot = createBot(virtualUsers, 'test_bot');
  const otherBot = createBot(virtualUsers, 'other_bot');
  const account = createAccount(virtualUsers);
  const cases: { chatId: number; text: string; expectedReason: string }[] = [
    { chatId: 999, text: '', expectedReason: 'message_text_empty' },
    { chatId: 999, text: 'Hello', expectedReason: 'chat_not_found' },
    { chatId: account.profile.id, text: 'Hello', expectedReason: 'chat_not_found' },
    { chatId: otherBot.profile.id, text: 'Hello', expectedReason: 'chat_not_found' },
    { chatId: -1, text: 'Hello', expectedReason: 'chat_not_found' },
  ];
  for (const { chatId, text, expectedReason } of cases) {
    assertSendMessageFailure(botApi.sendMessage(bot.profile, { chatId, text }), expectedReason);
  }

  privateMessaging.sendAccountMessage({
    fromAccountId: account.profile.id,
    to: { type: 'private', botId: bot.profile.id },
    text: 'Hello',
  });
  assertSendMessageFailure(
    botApi.sendMessage(bot.profile, {
      chatId: account.profile.id,
      text: 'x'.repeat(MAX_TEXT_MESSAGE_LENGTH + 1),
    }),
    'message_text_too_long',
  );
});

Deno.test('BotApiService edits its messages and reports unreachable chats as not found', () => {
  const { virtualUsers, privateMessaging, botApi, advanceClockSeconds } = createBotApiFixture();
  const bot = createBot(virtualUsers, 'test_bot');
  const strangerAccount = createAccount(virtualUsers);
  const account = createAccount(virtualUsers);
  privateMessaging.sendAccountMessage({
    fromAccountId: account.profile.id,
    to: { type: 'private', botId: bot.profile.id },
    text: '/start',
  });
  const sentMessage = expectSentMessage(
    botApi.sendMessage(bot.profile, {
      chatId: account.profile.id,
      text: 'Continue?',
      inlineKeyboard: [[{ kind: 'callback', text: 'Yes', callbackData: 'yes' }]],
    }),
  );
  advanceClockSeconds(5);

  const textEdit = botApi.editMessageText(bot.profile, {
    chatId: account.profile.id,
    messageId: sentMessage.message_id,
    text: 'Done',
  });
  if (
    !textEdit.edited ||
    textEdit.message.message_id !== sentMessage.message_id ||
    textEdit.message.edit_date !== 1_700_000_005 ||
    textEdit.message.text !== 'Done' ||
    'reply_markup' in textEdit.message
  ) {
    throw new Error("Expected the edited message in the bot's view, without its keyboard");
  }
  const keyboardEdit = botApi.editMessageReplyMarkup(bot.profile, {
    chatId: account.profile.id,
    messageId: sentMessage.message_id,
    inlineKeyboard: [[{ kind: 'url', text: 'Docs', url: 'https://grammy.dev' }]],
  });
  if (
    !keyboardEdit.edited ||
    JSON.stringify(keyboardEdit.message.reply_markup) !==
      JSON.stringify({ inline_keyboard: [[{ text: 'Docs', url: 'https://grammy.dev' }]] })
  ) {
    throw new Error('Expected the keyboard edit in the bot view');
  }

  for (const chatId of [999, strangerAccount.profile.id]) {
    const unreachableEdit = botApi.editMessageReplyMarkup(bot.profile, {
      chatId,
      messageId: sentMessage.message_id,
    });
    if (unreachableEdit.edited || unreachableEdit.reason !== 'chat_not_found') {
      throw new Error(`Expected an edit in chat ${chatId} to report the chat as not found`);
    }
  }
});

Deno.test('BotApiService answers callback queries once, as the bot that received them', () => {
  const { virtualUsers, privateMessaging, callbackQueries, botApi } = createBotApiFixture();
  const bot = createBot(virtualUsers, 'test_bot');
  const otherBot = createBot(virtualUsers, 'other_bot');
  const account = createAccount(virtualUsers);
  privateMessaging.sendAccountMessage({
    fromAccountId: account.profile.id,
    to: { type: 'private', botId: bot.profile.id },
    text: '/start',
  });
  const sentMessage = expectSentMessage(
    botApi.sendMessage(bot.profile, {
      chatId: account.profile.id,
      text: 'Continue?',
      inlineKeyboard: [[{ kind: 'callback', text: 'Yes', callbackData: 'yes' }]],
    }),
  );
  const pressResult = callbackQueries.pressCallbackButton({
    fromAccountId: account.profile.id,
    chat: { type: 'private', botId: bot.profile.id },
    botMessageId: sentMessage.message_id,
    callbackData: 'yes',
  });
  if (!pressResult.pressed) {
    throw new Error(`Expected the button press to succeed, received ${pressResult.reason}`);
  }
  const answer = {
    callbackQueryId: pressResult.callbackQuery.id,
    showAlert: false,
    cacheTimeSeconds: 0,
  };

  const results = [
    botApi.answerCallbackQuery(otherBot.profile, answer),
    botApi.answerCallbackQuery(bot.profile, answer),
    botApi.answerCallbackQuery(bot.profile, answer),
  ];
  if (
    JSON.stringify(results) !==
      JSON.stringify([
        { answered: false, reason: 'query_id_invalid' },
        { answered: true },
        { answered: false, reason: 'query_id_invalid' },
      ])
  ) {
    throw new Error(`Expected only the first answer by the receiving bot to succeed`);
  }
});

function expectSentMessage(result: SendMessageResult): BotApiPrivateTextMessage {
  if (!result.sent) {
    throw new Error(`Expected sendMessage to succeed, received ${result.reason}`);
  }
  return result.message;
}

function assertSendMessageFailure(result: SendMessageResult, expectedReason: string): void {
  if (result.sent || result.reason !== expectedReason) {
    throw new Error(
      `Expected sendMessage to fail with ${expectedReason}, received ${
        result.sent ? 'success' : result.reason
      }`,
    );
  }
}

function expectRetrievedUpdates(result: GetUpdatesResult): readonly BotApiUpdate[] {
  if (!result.retrieved) {
    throw new Error(`Expected getUpdates to retrieve updates, received ${result.reason}`);
  }
  return result.updates;
}

function createBotApiFixture() {
  const identities = new TelegramIdentityRepository();
  const accounts = new AccountRepository();
  const bots = new BotRepository();
  const virtualUsers = new VirtualUserService({ identities, accounts, bots });
  const userMessageBoxes = new UserMessageBoxRepository();
  const botUpdates = new BotUpdateRepository();
  const updateSubscriptions = new BotUpdateSubscriptionRepository();
  const botMessageViews = new BotMessageViewService({ accounts, bots, userMessageBoxes });
  const events = new BotUpdateDeliveryService({ botMessageViews, botUpdates, updateSubscriptions });
  const privateConversations = new PrivateConversationRepository();
  let currentUnixTimeSeconds = 1_700_000_000;
  const privateMessaging = new PrivateMessagingService({
    accounts,
    bots,
    privateConversations,
    messages: new MessageRepository(),
    userMessageBoxes,
    events,
    currentUnixTimeSeconds: () => currentUnixTimeSeconds,
  });
  const callbackQueries = new CallbackQueryService({
    accounts,
    bots,
    privateConversations,
    privateMessages: privateMessaging,
    callbackQueries: new CallbackQueryRepository(),
    events,
  });
  const botApi = new BotApiService({
    bots,
    updatePolling: new BotUpdatePollingService({ botUpdates, updateSubscriptions }),
    pendingUpdates: botUpdates,
    botMessages: privateMessaging,
    botMessageViews,
    callbackQueries,
  });
  const advanceClockSeconds = (seconds: number) => {
    currentUnixTimeSeconds += seconds;
  };
  return {
    virtualUsers,
    botUpdates,
    privateMessaging,
    callbackQueries,
    botApi,
    advanceClockSeconds,
  };
}

function createBot(virtualUsers: VirtualUserService, username: string) {
  const result = virtualUsers.createBot({ first_name: 'Test Bot', username });
  if (!result.created) {
    throw new Error(`Expected bot creation to succeed, received ${result.reason}`);
  }
  return result.bot;
}

function createAccount(virtualUsers: VirtualUserService) {
  const result = virtualUsers.createAccount({ first_name: 'Ada' });
  if (!result.created) {
    throw new Error(`Expected account creation to succeed, received ${result.reason}`);
  }
  return result.account;
}

function createPrivateTextMessage(messageId: number): BotApiPrivateTextMessage {
  const author = { id: 1, is_bot: false as const, first_name: 'Ada' };
  return {
    message_id: messageId,
    from: author,
    chat: { id: author.id, type: 'private', first_name: author.first_name },
    date: 1_700_000_000,
    text: 'Hello',
  };
}

function messageFromUpdate(update: BotApiUpdate | undefined): BotApiPrivateTextMessage | undefined {
  return update !== undefined && 'message' in update ? update.message : undefined;
}
