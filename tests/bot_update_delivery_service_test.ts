import { AccountRepository } from '../src/repositories/account.ts';
import { BotRepository } from '../src/repositories/bot.ts';
import { BotUpdateRepository } from '../src/repositories/bot_update.ts';
import { BotUpdateSubscriptionRepository } from '../src/repositories/bot_update_subscription.ts';
import { MessageRepository } from '../src/repositories/message.ts';
import { SharedChatRepository } from '../src/repositories/shared_chat.ts';
import { TelegramIdentityRepository } from '../src/repositories/telegram_identity.ts';
import { MessageBoxRepository } from '../src/repositories/message_box.ts';
import { BotMessageViewService } from '../src/services/bot_message_view.ts';
import { BotUpdateDeliveryService } from '../src/services/bot_update_delivery.ts';
import { VirtualUserService } from '../src/services/virtual_user.ts';
import type { BotApiTextMessage, BotApiUpdate } from '../src/types/bot_api.ts';

Deno.test('BotUpdateDeliveryService delivers a private message to its conversation bot', () => {
  const { virtualUsers, messages, messageBoxes, botUpdates, botUpdateDelivery } =
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
  messageBoxes.assignMessageId(targetBot.profile.id, 'unrelated-message');
  messageBoxes.assignMessageId(targetBot.profile.id, message.id);

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
  const { virtualUsers, messages, messageBoxes, botUpdates, botUpdateDelivery } =
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
  messageBoxes.assignMessageId(bot.profile.id, message.id);

  botUpdateDelivery.publish({ type: 'message_created', message });

  if (botUpdates.confirmAndReadPendingUpdates(bot.profile.id, { limit: 100 }).length !== 0) {
    throw new Error('Expected a bot-authored message not to become an update for its bot');
  }
});

Deno.test('BotUpdateDeliveryService delivers a callback query to the bot whose button was pressed', () => {
  const { virtualUsers, messages, messageBoxes, botUpdates, botUpdateDelivery } =
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
  messageBoxes.assignMessageId(bot.profile.id, message.id);

  botUpdateDelivery.publish({
    type: 'callback_query_created',
    callbackQuery: {
      id: '7',
      ...message.conversation,
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
    messageBoxes,
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
  messageBoxes.assignMessageId(bot.profile.id, botMessage.id);
  messageBoxes.assignMessageId(bot.profile.id, accountMessage.id);

  updateSubscriptions.setAllowedUpdateTypes(bot.profile.id, new Set(['callback_query']));
  botUpdateDelivery.publish({ type: 'message_created', message: accountMessage });
  botUpdateDelivery.publish({ type: 'message_edited', message: accountMessage });
  botUpdateDelivery.publish({
    type: 'bot_block_changed',
    accountId: account.profile.id,
    botId: bot.profile.id,
    isBlocked: true,
    changedAtUnixSeconds: 1_700_000_002,
  });
  updateSubscriptions.setAllowedUpdateTypes(bot.profile.id, new Set(['message']));
  botUpdateDelivery.publish({
    type: 'callback_query_created',
    callbackQuery: {
      id: '7',
      ...botMessage.conversation,
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

Deno.test('BotUpdateDeliveryService delivers an account edit, but not its own, to the bot', () => {
  const { virtualUsers, messages, messageBoxes, botUpdates, botUpdateDelivery } =
    createDeliveryFixture();
  const account = createAccount(virtualUsers);
  const bot = createBot(virtualUsers, 'test_bot');
  const conversation = { accountId: account.profile.id, botId: bot.profile.id };
  const accountMessage = messages.addPrivateTextMessage({
    conversation,
    authorRole: 'account',
    sentAtUnixSeconds: 1_700_000_000,
    text: 'Hello',
    entities: [],
  });
  const botMessage = messages.addPrivateTextMessage({
    conversation,
    authorRole: 'bot',
    sentAtUnixSeconds: 1_700_000_001,
    text: 'Hi',
    entities: [],
  });
  messageBoxes.assignMessageId(bot.profile.id, accountMessage.id);
  messageBoxes.assignMessageId(bot.profile.id, botMessage.id);
  const edit = { entities: [], inlineKeyboard: undefined, textEditedAtUnixSeconds: 1_700_000_005 };

  botUpdateDelivery.publish({
    type: 'message_edited',
    message: messages.editPrivateTextMessage(botMessage.id, { ...edit, text: 'Hi there' }),
  });
  botUpdateDelivery.publish({
    type: 'message_edited',
    message: messages.editPrivateTextMessage(accountMessage.id, { ...edit, text: 'Hello!' }),
  });

  const updates = botUpdates.confirmAndReadPendingUpdates(bot.profile.id, { limit: 100 });
  if (
    JSON.stringify(updates) !== JSON.stringify([{
      update_id: 1,
      edited_message: {
        message_id: 1,
        from: account.profile,
        chat: { id: account.profile.id, type: 'private', first_name: 'Ada' },
        date: 1_700_000_000,
        edit_date: 1_700_000_005,
        text: 'Hello!',
      },
    }])
  ) {
    throw new Error(
      `Expected only the account edit as an update, received ${JSON.stringify(updates)}`,
    );
  }
});

Deno.test('BotUpdateDeliveryService reports a block and unblock as changes of the bot membership', () => {
  const { virtualUsers, botUpdates, botUpdateDelivery } = createDeliveryFixture();
  const account = createAccount(virtualUsers);
  const bot = createBot(virtualUsers, 'test_bot');
  const otherBot = createBot(virtualUsers, 'other_bot');
  const blockChange = { accountId: account.profile.id, botId: bot.profile.id };

  botUpdateDelivery.publish({
    type: 'bot_block_changed',
    ...blockChange,
    isBlocked: true,
    changedAtUnixSeconds: 1_700_000_000,
  });
  botUpdateDelivery.publish({
    type: 'bot_block_changed',
    ...blockChange,
    isBlocked: false,
    changedAtUnixSeconds: 1_700_000_009,
  });

  const botUser = {
    id: bot.profile.id,
    is_bot: true,
    first_name: 'Test Bot',
    username: 'test_bot',
  };
  const chat = { id: account.profile.id, type: 'private', first_name: 'Ada' };
  const member = { user: botUser, status: 'member' };
  const kicked = { user: botUser, status: 'kicked', until_date: 0 };
  const updates = botUpdates.confirmAndReadPendingUpdates(bot.profile.id, { limit: 100 });
  if (
    JSON.stringify(updates) !== JSON.stringify([
      {
        update_id: 1,
        my_chat_member: {
          chat,
          from: account.profile,
          date: 1_700_000_000,
          old_chat_member: member,
          new_chat_member: kicked,
        },
      },
      {
        update_id: 2,
        my_chat_member: {
          chat,
          from: account.profile,
          date: 1_700_000_009,
          old_chat_member: kicked,
          new_chat_member: member,
        },
      },
    ])
  ) {
    throw new Error(
      `Expected my_chat_member updates in Telegram form, received ${JSON.stringify(updates)}`,
    );
  }
  if (botUpdates.confirmAndReadPendingUpdates(otherBot.profile.id, { limit: 100 }).length !== 0) {
    throw new Error('Expected a block to reach only the blocked bot');
  }
});

Deno.test('BotUpdateDeliveryService delivers supergroup additions and edits to the bots concerned', () => {
  const {
    virtualUsers,
    sharedChats,
    messages,
    messageBoxes,
    botUpdates,
    updateSubscriptions,
    botUpdateDelivery,
  } = createDeliveryFixture();
  const owner = createAccount(virtualUsers);
  const privacyModeBot = createBot(virtualUsers, 'privacy_bot');
  const readerBotResult = virtualUsers.createBot({
    first_name: 'Reader Bot',
    username: 'reader_bot',
    can_read_all_group_messages: true,
  });
  if (!readerBotResult.created) {
    throw new Error('Expected the reader bot to be created');
  }
  const readerBot = readerBotResult.bot;
  const supergroup = {
    kind: 'supergroup',
    id: -1_000_000_000_001,
    title: 'Team',
    chatInstance: '-42',
  } as const;
  sharedChats.registerSupergroup(supergroup, owner.profile.id);
  updateSubscriptions.setAllowedUpdateTypes(privacyModeBot.profile.id, new Set(['message']));
  for (const memberId of [privacyModeBot.profile.id, readerBot.profile.id, 999]) {
    sharedChats.addChatMember(supergroup.id, memberId);
    botUpdateDelivery.publish({
      type: 'chat_member_added',
      chat: supergroup,
      actorAccountId: owner.profile.id,
      memberId,
      addedAtUnixSeconds: 1_700_000_000,
    });
  }
  const message = messages.addSupergroupTextMessage({
    chatId: supergroup.id,
    author: { kind: 'account', accountId: owner.profile.id },
    sentAtUnixSeconds: 1_700_000_001,
    text: 'Hello',
    entities: [],
  });
  messageBoxes.assignMessageId(supergroup.id, message.id);
  const editedMessage = messages.editSupergroupTextMessage(message.id, {
    text: 'Hello again',
    entities: [],
    inlineKeyboard: undefined,
    textEditedAtUnixSeconds: 1_700_000_002,
  });
  botUpdateDelivery.publish({ type: 'message_edited', message: editedMessage });

  const readerUpdates = botUpdates.confirmAndReadPendingUpdates(readerBot.profile.id, {
    limit: 100,
  });
  const readerUpdateKinds = readerUpdates.map((update) => Object.keys(update)[1]);
  const editedUpdate = readerUpdates[1];
  if (
    JSON.stringify(readerUpdateKinds) !== JSON.stringify(['my_chat_member', 'edited_message']) ||
    !('edited_message' in editedUpdate) || editedUpdate.edited_message.message_id !== 1 ||
    editedUpdate.edited_message.edit_date !== 1_700_000_002
  ) {
    throw new Error(
      `Expected the reader bot to join and see the edit, received ${JSON.stringify(readerUpdates)}`,
    );
  }
  const privacyModeUpdates = botUpdates.confirmAndReadPendingUpdates(privacyModeBot.profile.id, {
    limit: 100,
  });
  if (privacyModeUpdates.length !== 0) {
    throw new Error(
      'Expected no unsubscribed join and no unaddressed edit for the privacy-mode bot',
    );
  }
});

function createDeliveryFixture() {
  const identities = new TelegramIdentityRepository();
  const accounts = new AccountRepository();
  const bots = new BotRepository();
  const virtualUsers = new VirtualUserService({ identities, accounts, bots });
  const messages = new MessageRepository();
  const messageBoxes = new MessageBoxRepository();
  const botUpdates = new BotUpdateRepository();
  const updateSubscriptions = new BotUpdateSubscriptionRepository();
  const sharedChats = new SharedChatRepository();
  const botUpdateDelivery = new BotUpdateDeliveryService({
    botMessageViews: new BotMessageViewService({
      accounts,
      bots,
      sharedChats,
      messageBoxes,
      messages,
    }),
    botUpdates,
    updateSubscriptions,
    bots,
    sharedChats,
    messages,
  });
  return {
    virtualUsers,
    sharedChats,
    messages,
    messageBoxes,
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

function messageFromUpdate(update: BotApiUpdate | undefined): BotApiTextMessage | undefined {
  return update !== undefined && 'message' in update ? update.message : undefined;
}
