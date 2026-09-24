import { AccountRepository } from '../src/repositories/account.ts';
import { BotRepository } from '../src/repositories/bot.ts';
import { BotUpdateRepository } from '../src/repositories/bot_update.ts';
import { BotUpdateSubscriptionRepository } from '../src/repositories/bot_update_subscription.ts';
import { MessageRepository } from '../src/repositories/message.ts';
import { TelegramIdentityRepository } from '../src/repositories/telegram_identity.ts';
import { UserMessageBoxRepository } from '../src/repositories/user_message_box.ts';
import { BotMessageViewService } from '../src/services/bot_message_view.ts';
import { BotUpdateDeliveryService } from '../src/services/bot_update_delivery.ts';
import { VirtualUserService } from '../src/services/virtual_user.ts';
import type { BotApiPrivateTextMessage, BotApiUpdate } from '../src/types/bot_api.ts';

Deno.test('BotUpdateDeliveryService delivers a private message to its conversation bot', () => {
  const { virtualUsers, messages, userMessageBoxes, botUpdates, botUpdateDelivery } =
    createDeliveryFixture();
  const account = createAccount(virtualUsers);
  const targetBot = createBot(virtualUsers, 'target_bot');
  const otherBot = createBot(virtualUsers, 'other_bot');
  const message = messages.addPrivateTextMessage({
    conversation: { accountId: account.profile.id, botId: targetBot.profile.id },
    authorRole: 'account',
    sentAtUnixSeconds: 1_700_000_000,
    text: '/start',
    entities: [{ type: 'bot_command', offset: 0, length: 6 }],
  });
  userMessageBoxes.assignMessageId(targetBot.profile.id, 'unrelated-message');
  userMessageBoxes.assignMessageId(targetBot.profile.id, message.id);

  botUpdateDelivery.publish({ type: 'message_created', message });

  const targetBotUpdates = botUpdates.confirmAndReadPendingUpdates(targetBot.profile.id, {
    limit: 100,
  });
  if (
    targetBotUpdates.length !== 1 ||
    messageFromUpdate(targetBotUpdates[0])?.message_id !== 2 ||
    messageFromUpdate(targetBotUpdates[0])?.chat.id !== account.profile.id ||
    messageFromUpdate(targetBotUpdates[0])?.from.id !== account.profile.id ||
    messageFromUpdate(targetBotUpdates[0])?.date !== 1_700_000_000 ||
    messageFromUpdate(targetBotUpdates[0])?.text !== '/start' ||
    JSON.stringify(messageFromUpdate(targetBotUpdates[0])?.entities) !==
      JSON.stringify([{ type: 'bot_command', offset: 0, length: 6 }])
  ) {
    throw new Error("Expected one update projected with the bot's own message ID");
  }
  const otherBotUpdates = botUpdates.confirmAndReadPendingUpdates(otherBot.profile.id, {
    limit: 100,
  });
  if (otherBotUpdates.length !== 0) {
    throw new Error('Expected a private message not to reach other bots');
  }
});

Deno.test('BotUpdateDeliveryService does not deliver a bot its own message', () => {
  const { virtualUsers, messages, userMessageBoxes, botUpdates, botUpdateDelivery } =
    createDeliveryFixture();
  const account = createAccount(virtualUsers);
  const bot = createBot(virtualUsers, 'test_bot');
  const message = messages.addPrivateTextMessage({
    conversation: { accountId: account.profile.id, botId: bot.profile.id },
    authorRole: 'bot',
    sentAtUnixSeconds: 1_700_000_000,
    text: 'Welcome!',
    entities: [],
  });
  userMessageBoxes.assignMessageId(bot.profile.id, message.id);

  botUpdateDelivery.publish({ type: 'message_created', message });

  if (botUpdates.confirmAndReadPendingUpdates(bot.profile.id, { limit: 100 }).length !== 0) {
    throw new Error('Expected a bot-authored message not to become an update for its bot');
  }
});

Deno.test('BotUpdateDeliveryService delivers a callback query to the bot whose button was pressed', () => {
  const { virtualUsers, messages, userMessageBoxes, botUpdates, botUpdateDelivery } =
    createDeliveryFixture();
  const account = createAccount(virtualUsers);
  const bot = createBot(virtualUsers, 'test_bot');
  const message = messages.addPrivateTextMessage({
    conversation: { accountId: account.profile.id, botId: bot.profile.id },
    authorRole: 'bot',
    sentAtUnixSeconds: 1_700_000_000,
    text: 'Continue?',
    entities: [],
    inlineKeyboard: [[{ kind: 'callback', text: 'Yes', callbackData: 'yes' }]],
  });
  userMessageBoxes.assignMessageId(bot.profile.id, message.id);

  botUpdateDelivery.publish({
    type: 'callback_query_created',
    callbackQuery: {
      id: '7',
      conversation: message.conversation,
      messageId: message.id,
      chatInstance: '-42',
      callbackData: 'yes',
      state: { status: 'awaiting_answer' },
    },
    message,
  });

  const updates = botUpdates.confirmAndReadPendingUpdates(bot.profile.id, { limit: 100 });
  const update = updates[0];
  if (updates.length !== 1 || update === undefined || !('callback_query' in update)) {
    throw new Error('Expected one callback query update for the bot');
  }
  const { callback_query: callbackQuery } = update;
  if (
    callbackQuery.id !== '7' ||
    callbackQuery.from !== account.profile ||
    callbackQuery.chat_instance !== '-42' ||
    callbackQuery.data !== 'yes' ||
    callbackQuery.message.message_id !== 1 ||
    callbackQuery.message.from.id !== bot.profile.id ||
    JSON.stringify(callbackQuery.message.reply_markup) !==
      JSON.stringify({ inline_keyboard: [[{ text: 'Yes', callback_data: 'yes' }]] })
  ) {
    throw new Error('Expected the callback query projected with its message as the bot sees it');
  }
});

Deno.test('BotUpdateDeliveryService skips update types excluded by the bot subscription', () => {
  const {
    virtualUsers,
    messages,
    userMessageBoxes,
    botUpdates,
    updateSubscriptions,
    botUpdateDelivery,
  } = createDeliveryFixture();
  const account = createAccount(virtualUsers);
  const bot = createBot(virtualUsers, 'test_bot');
  const botMessage = messages.addPrivateTextMessage({
    conversation: { accountId: account.profile.id, botId: bot.profile.id },
    authorRole: 'bot',
    sentAtUnixSeconds: 1_700_000_000,
    text: 'Continue?',
    entities: [],
    inlineKeyboard: [[{ kind: 'callback', text: 'Yes', callbackData: 'yes' }]],
  });
  const accountMessage = messages.addPrivateTextMessage({
    conversation: botMessage.conversation,
    authorRole: 'account',
    sentAtUnixSeconds: 1_700_000_001,
    text: 'Hello',
    entities: [],
  });
  userMessageBoxes.assignMessageId(bot.profile.id, botMessage.id);
  userMessageBoxes.assignMessageId(bot.profile.id, accountMessage.id);

  updateSubscriptions.setAllowedUpdateTypes(bot.profile.id, new Set(['callback_query']));
  botUpdateDelivery.publish({ type: 'message_created', message: accountMessage });
  updateSubscriptions.setAllowedUpdateTypes(bot.profile.id, new Set(['message']));
  botUpdateDelivery.publish({
    type: 'callback_query_created',
    callbackQuery: {
      id: '7',
      conversation: botMessage.conversation,
      messageId: botMessage.id,
      chatInstance: '-42',
      callbackData: 'yes',
      state: { status: 'awaiting_answer' },
    },
    message: botMessage,
  });

  if (botUpdates.confirmAndReadPendingUpdates(bot.profile.id, { limit: 100 }).length !== 0) {
    throw new Error('Expected no update of a type the bot excluded');
  }
});

function createDeliveryFixture() {
  const identities = new TelegramIdentityRepository();
  const accounts = new AccountRepository();
  const bots = new BotRepository();
  const virtualUsers = new VirtualUserService({ identities, accounts, bots });
  const messages = new MessageRepository();
  const userMessageBoxes = new UserMessageBoxRepository();
  const botUpdates = new BotUpdateRepository();
  const updateSubscriptions = new BotUpdateSubscriptionRepository();
  const botUpdateDelivery = new BotUpdateDeliveryService({
    botMessageViews: new BotMessageViewService({ accounts, bots, userMessageBoxes }),
    botUpdates,
    updateSubscriptions,
  });
  return {
    virtualUsers,
    messages,
    userMessageBoxes,
    botUpdates,
    updateSubscriptions,
    botUpdateDelivery,
  };
}

function createAccount(virtualUsers: VirtualUserService) {
  const result = virtualUsers.createAccount({ first_name: 'Ada' });
  if (!result.created) {
    throw new Error(`Expected account creation to succeed, received ${result.reason}`);
  }
  return result.account;
}

function createBot(virtualUsers: VirtualUserService, username: string) {
  const result = virtualUsers.createBot({ first_name: 'Test Bot', username });
  if (!result.created) {
    throw new Error(`Expected bot creation to succeed, received ${result.reason}`);
  }
  return result.bot;
}

function messageFromUpdate(update: BotApiUpdate | undefined): BotApiPrivateTextMessage | undefined {
  return update !== undefined && 'message' in update ? update.message : undefined;
}
