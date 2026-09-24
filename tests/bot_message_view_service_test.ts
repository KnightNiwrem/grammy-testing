import { AccountRepository } from '../src/repositories/account.ts';
import { BotRepository } from '../src/repositories/bot.ts';
import { MessageRepository } from '../src/repositories/message.ts';
import { TelegramIdentityRepository } from '../src/repositories/telegram_identity.ts';
import { UserMessageBoxRepository } from '../src/repositories/user_message_box.ts';
import { BotMessageViewService } from '../src/services/bot_message_view.ts';
import { VirtualUserService } from '../src/services/virtual_user.ts';

Deno.test('BotMessageViewService shows an account message in its bot private chat', () => {
  const { virtualUsers, messages, userMessageBoxes, botMessageViews } = createViewFixture();
  const account = createAccount(virtualUsers);
  const bot = createBot(virtualUsers);
  const message = messages.addPrivateTextMessage({
    conversation: { accountId: account.profile.id, botId: bot.profile.id },
    authorRole: 'account',
    sentAtUnixSeconds: 1_700_000_000,
    text: '/start',
    entities: [{ type: 'bot_command', offset: 0, length: 6 }],
  });
  userMessageBoxes.assignMessageId(account.profile.id, message.id);
  userMessageBoxes.assignMessageId(bot.profile.id, 'unrelated-message');
  userMessageBoxes.assignMessageId(bot.profile.id, message.id);

  const view = botMessageViews.viewPrivateTextMessageForBot(message);

  const expectedView = {
    message_id: 2,
    from: account.profile,
    chat: { id: account.profile.id, type: 'private', first_name: 'Ada' },
    date: 1_700_000_000,
    text: '/start',
    entities: [{ type: 'bot_command', offset: 0, length: 6 }],
  };
  if (JSON.stringify(view) !== JSON.stringify(expectedView)) {
    throw new Error(`Expected the bot's view of the message, received ${JSON.stringify(view)}`);
  }
});

Deno.test('BotMessageViewService shows a bot message sent to the account chat', () => {
  const { virtualUsers, messages, userMessageBoxes, botMessageViews } = createViewFixture();
  const account = createAccount(virtualUsers);
  const bot = createBot(virtualUsers);
  const message = messages.addPrivateTextMessage({
    conversation: { accountId: account.profile.id, botId: bot.profile.id },
    authorRole: 'bot',
    sentAtUnixSeconds: 1_700_000_000,
    text: 'Welcome!',
    entities: [],
  });
  userMessageBoxes.assignMessageId(bot.profile.id, message.id);

  const view = botMessageViews.viewPrivateTextMessageForBot(message);

  const expectedSender = {
    id: bot.profile.id,
    is_bot: true,
    first_name: 'Test Bot',
    username: 'test_bot',
  };
  if (
    view.message_id !== 1 ||
    view.chat.id !== account.profile.id ||
    JSON.stringify(view.from) !== JSON.stringify(expectedSender) ||
    'entities' in view
  ) {
    throw new Error("Expected the bot as sender in the account's chat, without entities");
  }
});

Deno.test('BotMessageViewService shows the edit date and inline keyboard in Telegram order', () => {
  const { virtualUsers, messages, userMessageBoxes, botMessageViews } = createViewFixture();
  const account = createAccount(virtualUsers);
  const bot = createBot(virtualUsers);
  const sentMessage = messages.addPrivateTextMessage({
    conversation: { accountId: account.profile.id, botId: bot.profile.id },
    authorRole: 'bot',
    sentAtUnixSeconds: 1_700_000_000,
    text: 'Continue?',
    entities: [],
  });
  const message = messages.editPrivateTextMessage(sentMessage.id, {
    text: 'Try /help',
    entities: [{ type: 'bot_command', offset: 4, length: 5 }],
    inlineKeyboard: [[
      { kind: 'callback', text: 'Yes', callbackData: 'yes' },
      { kind: 'url', text: 'Docs', url: 'https://grammy.dev' },
    ]],
    textEditedAtUnixSeconds: 1_700_000_005,
  });
  userMessageBoxes.assignMessageId(bot.profile.id, message.id);

  const view = botMessageViews.viewPrivateTextMessageForBot(message);

  const expectedView = {
    message_id: 1,
    from: { id: bot.profile.id, is_bot: true, first_name: 'Test Bot', username: 'test_bot' },
    chat: { id: account.profile.id, type: 'private', first_name: 'Ada' },
    date: 1_700_000_000,
    edit_date: 1_700_000_005,
    text: 'Try /help',
    entities: [{ type: 'bot_command', offset: 4, length: 5 }],
    reply_markup: {
      inline_keyboard: [[
        { text: 'Yes', callback_data: 'yes' },
        { text: 'Docs', url: 'https://grammy.dev' },
      ]],
    },
  };
  if (JSON.stringify(view) !== JSON.stringify(expectedView)) {
    throw new Error(
      `Expected the edited message with its keyboard, received ${JSON.stringify(view)}`,
    );
  }
});

Deno.test('BotMessageViewService shows a callback query with its message as the bot sees it', () => {
  const { virtualUsers, messages, userMessageBoxes, botMessageViews } = createViewFixture();
  const account = createAccount(virtualUsers);
  const bot = createBot(virtualUsers);
  const message = messages.addPrivateTextMessage({
    conversation: { accountId: account.profile.id, botId: bot.profile.id },
    authorRole: 'bot',
    sentAtUnixSeconds: 1_700_000_000,
    text: 'Continue?',
    entities: [],
    inlineKeyboard: [[{ kind: 'callback', text: 'Yes', callbackData: 'yes' }]],
  });
  userMessageBoxes.assignMessageId(bot.profile.id, message.id);

  const view = botMessageViews.viewCallbackQueryForBot({
    id: '7',
    conversation: message.conversation,
    messageId: message.id,
    chatInstance: '-42',
    callbackData: 'yes',
    state: { status: 'awaiting_answer' },
  }, message);

  const expectedView = {
    id: '7',
    from: account.profile,
    message: botMessageViews.viewPrivateTextMessageForBot(message),
    chat_instance: '-42',
    data: 'yes',
  };
  if (JSON.stringify(view) !== JSON.stringify(expectedView)) {
    throw new Error(
      `Expected the bot's view of the callback query, received ${JSON.stringify(view)}`,
    );
  }
});

Deno.test('BotMessageViewService rejects a message missing from the bot message box', () => {
  const { virtualUsers, messages, userMessageBoxes, botMessageViews } = createViewFixture();
  const account = createAccount(virtualUsers);
  const bot = createBot(virtualUsers);
  const message = messages.addPrivateTextMessage({
    conversation: { accountId: account.profile.id, botId: bot.profile.id },
    authorRole: 'account',
    sentAtUnixSeconds: 1_700_000_000,
    text: 'Hello',
    entities: [],
  });
  userMessageBoxes.assignMessageId(account.profile.id, message.id);

  let viewError: unknown;
  try {
    botMessageViews.viewPrivateTextMessageForBot(message);
  } catch (error) {
    viewError = error;
  }
  if (!(viewError instanceof Error)) {
    throw new Error('Expected viewing a message the bot has not numbered to throw');
  }
});

function createViewFixture() {
  const identities = new TelegramIdentityRepository();
  const accounts = new AccountRepository();
  const bots = new BotRepository();
  const virtualUsers = new VirtualUserService({ identities, accounts, bots });
  const messages = new MessageRepository();
  const userMessageBoxes = new UserMessageBoxRepository();
  const botMessageViews = new BotMessageViewService({ accounts, bots, userMessageBoxes });
  return { virtualUsers, messages, userMessageBoxes, botMessageViews };
}

function createAccount(virtualUsers: VirtualUserService) {
  const result = virtualUsers.createAccount({ first_name: 'Ada' });
  if (!result.created) {
    throw new Error(`Expected account creation to succeed, received ${result.reason}`);
  }
  return result.account;
}

function createBot(virtualUsers: VirtualUserService) {
  const result = virtualUsers.createBot({ first_name: 'Test Bot', username: 'test_bot' });
  if (!result.created) {
    throw new Error(`Expected bot creation to succeed, received ${result.reason}`);
  }
  return result.bot;
}
