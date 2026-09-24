import { AccountRepository } from '../src/repositories/account.ts';
import { BotRepository } from '../src/repositories/bot.ts';
import { BotUpdateRepository } from '../src/repositories/bot_update.ts';
import { BotUpdateSubscriptionRepository } from '../src/repositories/bot_update_subscription.ts';
import { MessageRepository } from '../src/repositories/message.ts';
import { PrivateConversationRepository } from '../src/repositories/private_conversation.ts';
import { TelegramIdentityRepository } from '../src/repositories/telegram_identity.ts';
import { UserMessageBoxRepository } from '../src/repositories/user_message_box.ts';
import { BotUpdateDeliveryService } from '../src/services/bot_update_delivery.ts';
import {
  PrivateMessagingService,
  type SendBotMessageFailureReason,
} from '../src/services/private_messaging.ts';
import { VirtualUserService } from '../src/services/virtual_user.ts';
import type { BotApiPrivateTextMessage } from '../src/types/bot_api.ts';
import type { ChatDomainEvent } from '../src/types/chat_domain_event.ts';
import { MAX_TEXT_MESSAGE_LENGTH } from '../src/types/virtual_message.ts';
import type { VirtualBot } from '../src/types/virtual_bot.ts';

Deno.test('PrivateMessagingService activates a private conversation for known participants', () => {
  const { virtualUsers, privateConversations, privateMessaging } = createPrivateMessagingFixture();
  const account = createAccount(virtualUsers, 'Ada');
  const bot = createBot(virtualUsers, 'First Bot', 'first_bot');

  const activation = privateMessaging.activatePrivateConversation({
    accountId: account.profile.id,
    botId: bot.profile.id,
  });
  if (!activation.activated) {
    throw new Error(`Expected activation to succeed, received ${activation.reason}`);
  }
  if (
    privateConversations.getPrivateConversation({
      accountId: account.profile.id,
      botId: bot.profile.id,
    }) !== activation.conversation
  ) {
    throw new Error('Expected activation to store the canonical private conversation');
  }
});

Deno.test('PrivateMessagingService rejects unknown private conversation participants', () => {
  const { virtualUsers, privateConversations, privateMessaging } = createPrivateMessagingFixture();
  const account = createAccount(virtualUsers, 'Ada');
  const bot = createBot(virtualUsers, 'First Bot', 'first_bot');

  const missingAccount = privateMessaging.activatePrivateConversation({
    accountId: 999,
    botId: bot.profile.id,
  });
  if (missingAccount.activated || missingAccount.reason !== 'account_not_found') {
    throw new Error('Expected an unknown account to be rejected');
  }

  const missingBot = privateMessaging.activatePrivateConversation({
    accountId: account.profile.id,
    botId: 999,
  });
  if (missingBot.activated || missingBot.reason !== 'bot_not_found') {
    throw new Error('Expected an unknown bot to be rejected');
  }
  if (
    privateConversations.getPrivateConversation({ accountId: 999, botId: bot.profile.id }) !==
      undefined ||
    privateConversations.getPrivateConversation({ accountId: account.profile.id, botId: 999 }) !==
      undefined
  ) {
    throw new Error('Expected rejected activations not to create conversations');
  }
});

Deno.test('PrivateMessagingService sends and stores private account messages', () => {
  const { virtualUsers, privateConversations, messages, botUpdates, privateMessaging } =
    createPrivateMessagingFixture();
  const account = createAccount(virtualUsers, 'Ada');
  const bot = createBot(virtualUsers, 'Test Bot', 'test_bot');

  const firstResult = privateMessaging.sendAccountMessage({
    fromAccountId: account.profile.id,
    to: { type: 'private', botId: bot.profile.id },
    text: 'Hello',
  });
  if (!firstResult.sent) {
    throw new Error(`Expected message send to succeed, received ${firstResult.reason}`);
  }
  const secondResult = privateMessaging.sendAccountMessage({
    fromAccountId: account.profile.id,
    to: { type: 'private', botId: bot.profile.id },
    text: 'Again',
  });
  if (!secondResult.sent) {
    throw new Error(`Expected message send to succeed, received ${secondResult.reason}`);
  }

  if (
    privateConversations.getPrivateConversation({
      accountId: account.profile.id,
      botId: bot.profile.id,
    }) ===
      undefined
  ) {
    throw new Error('Expected the first message to activate the private conversation');
  }
  const storedMessages = messages.getPrivateConversationMessages({
    accountId: account.profile.id,
    botId: bot.profile.id,
  });
  if (
    storedMessages.length !== 2 ||
    storedMessages[0].text !== 'Hello' ||
    storedMessages[1].text !== 'Again'
  ) {
    throw new Error('Expected canonical messages to be retained in conversation history');
  }

  const history = privateMessaging.getPrivateMessageHistory({
    accountId: account.profile.id,
    botId: bot.profile.id,
  });
  if (
    !history.found ||
    history.messages.length !== 2 ||
    history.messages[0].message_id !== firstResult.message.message_id ||
    history.messages[0].chat.id !== account.profile.id ||
    history.messages[0].from.id !== account.profile.id
  ) {
    throw new Error('Expected history to project stored messages as private Bot API messages');
  }

  const updates = botUpdates.readPendingUpdates(bot.profile.id, { limit: 100 });
  if (
    updates.length !== 2 ||
    !haveSameBotApiView(updates[0].message, firstResult.message) ||
    !haveSameBotApiView(updates[1].message, secondResult.message)
  ) {
    throw new Error('Expected each sent message to enqueue one update for the target bot');
  }
});

Deno.test('PrivateMessagingService marks bot commands in private account messages', () => {
  const { virtualUsers, messages, privateMessaging } = createPrivateMessagingFixture();
  const account = createAccount(virtualUsers, 'Ada');
  const bot = createBot(virtualUsers, 'Test Bot', 'test_bot');

  const commandResult = privateMessaging.sendAccountMessage({
    fromAccountId: account.profile.id,
    to: { type: 'private', botId: bot.profile.id },
    text: '/start payload',
  });
  const plainResult = privateMessaging.sendAccountMessage({
    fromAccountId: account.profile.id,
    to: { type: 'private', botId: bot.profile.id },
    text: 'Hello',
  });
  if (!commandResult.sent || !plainResult.sent) {
    throw new Error('Expected both message sends to succeed');
  }

  const expectedCommandEntities = [{ type: 'bot_command', offset: 0, length: 6 }];
  const storedMessages = messages.getPrivateConversationMessages({
    accountId: account.profile.id,
    botId: bot.profile.id,
  });
  if (
    JSON.stringify(storedMessages[0].entities) !== JSON.stringify(expectedCommandEntities) ||
    storedMessages[1].entities.length !== 0
  ) {
    throw new Error('Expected canonical messages to store the detected bot command entities');
  }

  const history = privateMessaging.getPrivateMessageHistory({
    accountId: account.profile.id,
    botId: bot.profile.id,
  });
  if (!history.found) {
    throw new Error('Expected the private conversation history to be found');
  }
  for (const projectedCommand of [commandResult.message, history.messages[0]]) {
    if (JSON.stringify(projectedCommand.entities) !== JSON.stringify(expectedCommandEntities)) {
      throw new Error('Expected the projected command message to carry its entities');
    }
  }
  for (const projectedPlainText of [plainResult.message, history.messages[1]]) {
    if ('entities' in projectedPlainText) {
      throw new Error('Expected a message without entities to omit the entities field');
    }
  }
});

Deno.test('PrivateMessagingService numbers private messages in each bot message box', () => {
  const { virtualUsers, botUpdates, privateMessaging } = createPrivateMessagingFixture();
  const account = createAccount(virtualUsers, 'Ada');
  const firstBot = createBot(virtualUsers, 'First Bot', 'first_bot');
  const secondBot = createBot(virtualUsers, 'Second Bot', 'second_bot');

  const firstBotFirstMessage = sendPrivateText(privateMessaging, account.profile.id, firstBot);
  const secondBotFirstMessage = sendPrivateText(privateMessaging, account.profile.id, secondBot);
  const firstBotSecondMessage = sendPrivateText(privateMessaging, account.profile.id, firstBot);

  if (
    firstBotFirstMessage.message_id !== 1 ||
    secondBotFirstMessage.message_id !== 1 ||
    firstBotSecondMessage.message_id !== 2
  ) {
    throw new Error('Expected each bot to number messages from its own message box');
  }
  const secondBotUpdates = botUpdates.readPendingUpdates(secondBot.profile.id, { limit: 100 });
  if (secondBotUpdates.length !== 1 || secondBotUpdates[0].message.message_id !== 1) {
    throw new Error("Expected the bot's update to carry its own message ID");
  }
  const firstBotHistory = privateMessaging.getPrivateMessageHistory({
    accountId: account.profile.id,
    botId: firstBot.profile.id,
  });
  if (
    !firstBotHistory.found ||
    firstBotHistory.messages.map((message) => message.message_id).join() !== '1,2'
  ) {
    throw new Error("Expected history to project the bot's message IDs");
  }
});

Deno.test('PrivateMessagingService continues a bot message box across private chats', () => {
  const { virtualUsers, privateMessaging } = createPrivateMessagingFixture();
  const firstAccount = createAccount(virtualUsers, 'Ada');
  const secondAccount = createAccount(virtualUsers, 'Grace');
  const bot = createBot(virtualUsers, 'Test Bot', 'test_bot');

  const messageIds = [firstAccount, secondAccount, firstAccount].map((account) =>
    sendPrivateText(privateMessaging, account.profile.id, bot).message_id
  );

  if (messageIds.join() !== '1,2,3') {
    throw new Error('Expected a new private chat to continue the bot message ID sequence');
  }
});

Deno.test('PrivateMessagingService adds private messages to the sending account message box', () => {
  const { virtualUsers, messages, userMessageBoxes, privateMessaging } =
    createPrivateMessagingFixture();
  const account = createAccount(virtualUsers, 'Ada');
  const firstBot = createBot(virtualUsers, 'First Bot', 'first_bot');
  const secondBot = createBot(virtualUsers, 'Second Bot', 'second_bot');

  sendPrivateText(privateMessaging, account.profile.id, firstBot);
  sendPrivateText(privateMessaging, account.profile.id, secondBot);

  const [firstBotMessage] = messages.getPrivateConversationMessages({
    accountId: account.profile.id,
    botId: firstBot.profile.id,
  });
  const [secondBotMessage] = messages.getPrivateConversationMessages({
    accountId: account.profile.id,
    botId: secondBot.profile.id,
  });
  if (
    userMessageBoxes.getMessageId(account.profile.id, firstBotMessage.id) !== 1 ||
    userMessageBoxes.getMessageId(account.profile.id, secondBotMessage.id) !== 2 ||
    userMessageBoxes.getMessageId(firstBot.profile.id, firstBotMessage.id) !== 1 ||
    userMessageBoxes.getMessageId(secondBot.profile.id, secondBotMessage.id) !== 1
  ) {
    throw new Error("Expected the account's message box to number messages across its chats");
  }
});

Deno.test('PrivateMessagingService publishes a created event for each sent message', () => {
  const { virtualUsers, messages, publishedEvents, privateMessaging } =
    createPrivateMessagingFixture();
  const account = createAccount(virtualUsers, 'Ada');
  const bot = createBot(virtualUsers, 'Test Bot', 'test_bot');

  const rejectedResult = privateMessaging.sendAccountMessage({
    fromAccountId: account.profile.id,
    to: { type: 'private', botId: bot.profile.id },
    text: '',
  });
  if (rejectedResult.sent) {
    throw new Error('Expected an empty message to be rejected');
  }
  sendPrivateText(privateMessaging, account.profile.id, bot);

  const [storedMessage] = messages.getPrivateConversationMessages({
    accountId: account.profile.id,
    botId: bot.profile.id,
  });
  if (
    publishedEvents.length !== 1 ||
    publishedEvents[0].type !== 'message_created' ||
    publishedEvents[0].message !== storedMessage
  ) {
    throw new Error('Expected only the accepted message to publish a message_created event');
  }
});

Deno.test('PrivateMessagingService validates private messages before changing state', () => {
  const { virtualUsers, privateConversations, messages, botUpdates, privateMessaging } =
    createPrivateMessagingFixture();
  const account = createAccount(virtualUsers, 'Ada');
  const bot = createBot(virtualUsers, 'Test Bot', 'test_bot');

  const failures = [
    privateMessaging.sendAccountMessage({
      fromAccountId: 999,
      to: { type: 'private', botId: bot.profile.id },
      text: 'Hello',
    }),
    privateMessaging.sendAccountMessage({
      fromAccountId: account.profile.id,
      to: { type: 'private', botId: 999 },
      text: 'Hello',
    }),
    privateMessaging.sendAccountMessage({
      fromAccountId: account.profile.id,
      to: { type: 'private', botId: bot.profile.id },
      text: '',
    }),
    privateMessaging.sendAccountMessage({
      fromAccountId: account.profile.id,
      to: { type: 'private', botId: bot.profile.id },
      text: 'x'.repeat(MAX_TEXT_MESSAGE_LENGTH + 1),
    }),
  ];
  const expectedReasons = [
    'account_not_found',
    'bot_not_found',
    'message_text_empty',
    'message_text_too_long',
  ];
  failures.forEach((result, index) => {
    if (result.sent || result.reason !== expectedReasons[index]) {
      throw new Error(`Expected message send to fail with ${expectedReasons[index]}`);
    }
  });

  if (
    privateConversations.getPrivateConversation({
        accountId: account.profile.id,
        botId: bot.profile.id,
      }) !==
      undefined ||
    messages.getPrivateConversationMessages({
        accountId: account.profile.id,
        botId: bot.profile.id,
      }).length !== 0 ||
    botUpdates.readPendingUpdates(bot.profile.id, { limit: 100 }).length !== 0
  ) {
    throw new Error('Expected rejected messages not to change conversation state');
  }
});

Deno.test('PrivateMessagingService stores a bot reply in the private conversation', () => {
  const {
    virtualUsers,
    messages,
    userMessageBoxes,
    botUpdates,
    publishedEvents,
    privateMessaging,
  } = createPrivateMessagingFixture();
  const account = createAccount(virtualUsers, 'Ada');
  const bot = createBot(virtualUsers, 'Test Bot', 'test_bot');
  const incomingMessage = sendPrivateText(privateMessaging, account.profile.id, bot);

  const replyResult = privateMessaging.sendBotMessage({
    fromBotId: bot.profile.id,
    to: { type: 'private', accountId: account.profile.id },
    text: 'See /help',
  });
  if (!replyResult.sent) {
    throw new Error(`Expected the bot reply to succeed, received ${replyResult.reason}`);
  }

  const expectedSender = {
    id: bot.profile.id,
    is_bot: true,
    first_name: 'Test Bot',
    username: 'test_bot',
  };
  if (
    replyResult.message.message_id !== 2 ||
    replyResult.message.chat.id !== account.profile.id ||
    JSON.stringify(replyResult.message.from) !== JSON.stringify(expectedSender) ||
    replyResult.message.date !== 1_700_000_000 ||
    JSON.stringify(replyResult.message.entities) !==
      JSON.stringify([{ type: 'bot_command', offset: 4, length: 5 }])
  ) {
    throw new Error("Expected the reply in the bot's view, sent by the bot to the account's chat");
  }

  const [, storedReply] = messages.getPrivateConversationMessages({
    accountId: account.profile.id,
    botId: bot.profile.id,
  });
  if (
    storedReply?.authorRole !== 'bot' ||
    userMessageBoxes.getMessageId(account.profile.id, storedReply.id) !== 2 ||
    userMessageBoxes.getMessageId(bot.profile.id, storedReply.id) !== 2
  ) {
    throw new Error("Expected the reply to be numbered in both participants' message boxes");
  }
  const history = privateMessaging.getPrivateMessageHistory({
    accountId: account.profile.id,
    botId: bot.profile.id,
  });
  if (
    !history.found ||
    history.messages.length !== 2 ||
    !haveSameBotApiView(history.messages[0], incomingMessage) ||
    !haveSameBotApiView(history.messages[1], replyResult.message)
  ) {
    throw new Error('Expected history to hold the incoming message and then the reply');
  }
  if (
    publishedEvents.length !== 2 ||
    publishedEvents[1].message !== storedReply ||
    botUpdates.readPendingUpdates(bot.profile.id, { limit: 100 }).length !== 1
  ) {
    throw new Error('Expected the reply to be published without becoming an update for its bot');
  }
});

Deno.test('PrivateMessagingService validates bot messages in Telegram order before changing state', () => {
  const { virtualUsers, publishedEvents, privateMessaging } = createPrivateMessagingFixture();
  const account = createAccount(virtualUsers, 'Ada');
  const strangerAccount = createAccount(virtualUsers, 'Grace');
  const bot = createBot(virtualUsers, 'Test Bot', 'test_bot');
  privateMessaging.activatePrivateConversation({
    accountId: account.profile.id,
    botId: bot.profile.id,
  });
  const tooLongText = 'x'.repeat(MAX_TEXT_MESSAGE_LENGTH + 1);
  // Each case also breaks every later rule, so only the earliest check can explain its failure.
  const cases: {
    fromBotId: number;
    accountId: number;
    text: string;
    expectedReason: SendBotMessageFailureReason;
  }[] = [
    { fromBotId: 999, accountId: 999, text: '', expectedReason: 'bot_not_found' },
    { fromBotId: bot.profile.id, accountId: 999, text: '', expectedReason: 'message_text_empty' },
    {
      fromBotId: bot.profile.id,
      accountId: 999,
      text: tooLongText,
      expectedReason: 'account_not_found',
    },
    {
      fromBotId: bot.profile.id,
      accountId: strangerAccount.profile.id,
      text: tooLongText,
      expectedReason: 'conversation_not_started',
    },
    {
      fromBotId: bot.profile.id,
      accountId: account.profile.id,
      text: tooLongText,
      expectedReason: 'message_text_too_long',
    },
  ];

  for (const { fromBotId, accountId, text, expectedReason } of cases) {
    const result = privateMessaging.sendBotMessage({
      fromBotId,
      to: { type: 'private', accountId },
      text,
    });
    if (result.sent || result.reason !== expectedReason) {
      throw new Error(`Expected the bot message to fail with ${expectedReason}`);
    }
  }
  if (publishedEvents.length !== 0) {
    throw new Error('Expected rejected bot messages not to store or publish anything');
  }
});

function createPrivateMessagingFixture() {
  const identities = new TelegramIdentityRepository();
  const accounts = new AccountRepository();
  const bots = new BotRepository();
  const virtualUsers = new VirtualUserService({ identities, accounts, bots });
  const privateConversations = new PrivateConversationRepository();
  const messages = new MessageRepository();
  const userMessageBoxes = new UserMessageBoxRepository();
  const botUpdates = new BotUpdateRepository();
  const botUpdateDelivery = new BotUpdateDeliveryService({
    accounts,
    bots,
    userMessageBoxes,
    botUpdates,
    updateSubscriptions: new BotUpdateSubscriptionRepository(),
  });
  const publishedEvents: ChatDomainEvent[] = [];
  const privateMessaging = new PrivateMessagingService({
    accounts,
    bots,
    privateConversations,
    messages,
    userMessageBoxes,
    events: {
      publish: (event) => {
        publishedEvents.push(event);
        botUpdateDelivery.publish(event);
      },
    },
    currentUnixTimeSeconds: () => 1_700_000_000,
  });
  return {
    virtualUsers,
    privateConversations,
    messages,
    userMessageBoxes,
    botUpdates,
    publishedEvents,
    privateMessaging,
  };
}

function haveSameBotApiView(
  actual: BotApiPrivateTextMessage,
  expected: BotApiPrivateTextMessage,
): boolean {
  return actual.message_id === expected.message_id &&
    actual.chat.id === expected.chat.id &&
    actual.from.id === expected.from.id &&
    actual.date === expected.date &&
    actual.text === expected.text;
}

function sendPrivateText(
  privateMessaging: PrivateMessagingService,
  accountId: number,
  bot: VirtualBot,
): BotApiPrivateTextMessage {
  const result = privateMessaging.sendAccountMessage({
    fromAccountId: accountId,
    to: { type: 'private', botId: bot.profile.id },
    text: 'Hello',
  });
  if (!result.sent) {
    throw new Error(`Expected message send to succeed, received ${result.reason}`);
  }
  return result.message;
}

function createAccount(virtualUsers: VirtualUserService, firstName: string) {
  const result = virtualUsers.createAccount({ first_name: firstName });
  if (!result.created) {
    throw new Error(`Expected account creation to succeed, received ${result.reason}`);
  }
  return result.account;
}

function createBot(virtualUsers: VirtualUserService, firstName: string, username: string) {
  const result = virtualUsers.createBot({ first_name: firstName, username });
  if (!result.created) {
    throw new Error(`Expected bot creation to succeed, received ${result.reason}`);
  }
  return result.bot;
}
