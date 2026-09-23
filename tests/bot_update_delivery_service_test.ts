import { AccountRepository } from '../src/repositories/account.ts';
import { BotRepository } from '../src/repositories/bot.ts';
import { BotUpdateRepository } from '../src/repositories/bot_update.ts';
import { MessageRepository } from '../src/repositories/message.ts';
import { TelegramIdentityRepository } from '../src/repositories/telegram_identity.ts';
import { UserMessageBoxRepository } from '../src/repositories/user_message_box.ts';
import { BotUpdateDeliveryService } from '../src/services/bot_update_delivery.ts';
import { VirtualUserService } from '../src/services/virtual_user.ts';

Deno.test('BotUpdateDeliveryService delivers a private message to its conversation bot', async () => {
  const { virtualUsers, messages, userMessageBoxes, botUpdates, botUpdateDelivery } =
    createDeliveryFixture();
  const account = createAccount(virtualUsers);
  const targetBot = createBot(virtualUsers, 'target_bot');
  const otherBot = createBot(virtualUsers, 'other_bot');
  const message = messages.addPrivateTextMessage({
    conversation: { accountId: account.profile.id, botId: targetBot.profile.id },
    authorAccountId: account.profile.id,
    sentAtUnixSeconds: 1_700_000_000,
    text: '/start',
    entities: [{ type: 'bot_command', offset: 0, length: 6 }],
  });
  userMessageBoxes.assignMessageId(targetBot.profile.id, 'unrelated-message');
  userMessageBoxes.assignMessageId(targetBot.profile.id, message.id);

  botUpdateDelivery.publish({ type: 'message_created', message });

  const targetBotUpdates = await botUpdates.getUpdates(targetBot.profile.id, {
    limit: 100,
    timeoutSeconds: 0,
  });
  if (
    targetBotUpdates.length !== 1 ||
    targetBotUpdates[0].message.message_id !== 2 ||
    targetBotUpdates[0].message.chat.id !== account.profile.id ||
    targetBotUpdates[0].message.from.id !== account.profile.id ||
    targetBotUpdates[0].message.date !== 1_700_000_000 ||
    targetBotUpdates[0].message.text !== '/start' ||
    JSON.stringify(targetBotUpdates[0].message.entities) !==
      JSON.stringify([{ type: 'bot_command', offset: 0, length: 6 }])
  ) {
    throw new Error("Expected one update projected with the bot's own message ID");
  }
  const otherBotUpdates = await botUpdates.getUpdates(otherBot.profile.id, {
    limit: 100,
    timeoutSeconds: 0,
  });
  if (otherBotUpdates.length !== 0) {
    throw new Error('Expected a private message not to reach other bots');
  }
});

Deno.test('BotUpdateDeliveryService rejects a message missing from the bot message box', () => {
  const { virtualUsers, messages, botUpdateDelivery } = createDeliveryFixture();
  const account = createAccount(virtualUsers);
  const bot = createBot(virtualUsers, 'test_bot');
  const message = messages.addPrivateTextMessage({
    conversation: { accountId: account.profile.id, botId: bot.profile.id },
    authorAccountId: account.profile.id,
    sentAtUnixSeconds: 1_700_000_000,
    text: 'Hello',
    entities: [],
  });

  let deliveryError: unknown;
  try {
    botUpdateDelivery.publish({ type: 'message_created', message });
  } catch (error) {
    deliveryError = error;
  }
  if (!(deliveryError instanceof Error)) {
    throw new Error('Expected delivery of an unnumbered message to throw');
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
  const botUpdateDelivery = new BotUpdateDeliveryService({
    accounts,
    userMessageBoxes,
    botUpdates,
  });
  return { virtualUsers, messages, userMessageBoxes, botUpdates, botUpdateDelivery };
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
