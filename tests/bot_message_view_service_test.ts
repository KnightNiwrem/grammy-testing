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

Deno.test('BotMessageViewService shows a bot message, then its edit date and keyboard, in Telegram order', () => {
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
  userMessageBoxes.assignMessageId(bot.profile.id, sentMessage.id);
  const botSender = {
    id: bot.profile.id,
    is_bot: true,
    first_name: 'Test Bot',
    username: 'test_bot',
  };
  const sentView = botMessageViews.viewPrivateTextMessageForBot(sentMessage);
  if (
    JSON.stringify(sentView) !== JSON.stringify({
      message_id: 1,
      from: botSender,
      chat: { id: account.profile.id, type: 'private', first_name: 'Ada' },
      date: 1_700_000_000,
      text: 'Continue?',
    })
  ) {
    throw new Error(
      `Expected the bot as sender, without entities, received ${JSON.stringify(sentView)}`,
    );
  }

  const message = messages.editPrivateTextMessage(sentMessage.id, {
    text: 'Try /help',
    entities: [{ type: 'bot_command', offset: 4, length: 5 }],
    inlineKeyboard: [[
      { kind: 'callback', text: 'Yes', callbackData: 'yes' },
      { kind: 'url', text: 'Docs', url: 'https://grammy.dev' },
    ]],
    textEditedAtUnixSeconds: 1_700_000_005,
  });

  const view = botMessageViews.viewPrivateTextMessageForBot(message);

  const expectedView = {
    message_id: 1,
    from: botSender,
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

Deno.test('BotMessageViewService shows the current replied message until it is deleted', () => {
  const { virtualUsers, messages, userMessageBoxes, botMessageViews } = createViewFixture();
  const account = createAccount(virtualUsers);
  const bot = createBot(virtualUsers);
  const conversation = { accountId: account.profile.id, botId: bot.profile.id };
  const question = messages.addPrivateTextMessage({
    conversation,
    authorRole: 'bot',
    sentAtUnixSeconds: 1_700_000_000,
    text: 'Your name?',
    entities: [],
  });
  userMessageBoxes.assignMessageId(bot.profile.id, question.id);
  const answer = messages.addPrivateTextMessage({
    conversation,
    authorRole: 'account',
    sentAtUnixSeconds: 1_700_000_001,
    text: 'Ada',
    entities: [],
    replyToMessageId: question.id,
  });
  userMessageBoxes.assignMessageId(bot.profile.id, answer.id);
  const confirmation = messages.addPrivateTextMessage({
    conversation,
    authorRole: 'bot',
    sentAtUnixSeconds: 1_700_000_002,
    text: 'Saved',
    entities: [],
    replyToMessageId: answer.id,
    isContentProtected: true,
  });
  userMessageBoxes.assignMessageId(bot.profile.id, confirmation.id);
  messages.editPrivateTextMessage(question.id, {
    text: 'Your first name?',
    entities: [],
    inlineKeyboard: undefined,
    textEditedAtUnixSeconds: 1_700_000_003,
  });
  const botSender = {
    id: bot.profile.id,
    is_bot: true,
    first_name: 'Test Bot',
    username: 'test_bot',
  };
  const chat = { id: account.profile.id, type: 'private', first_name: 'Ada' };

  const answerView = botMessageViews.viewPrivateTextMessageForBot(answer);
  const confirmationView = botMessageViews.viewPrivateTextMessageForBot(confirmation);

  const expectedAnswerView = {
    message_id: 2,
    from: account.profile,
    chat,
    date: 1_700_000_001,
    reply_to_message: {
      message_id: 1,
      from: botSender,
      chat,
      date: 1_700_000_000,
      edit_date: 1_700_000_003,
      text: 'Your first name?',
    },
    text: 'Ada',
  };
  if (JSON.stringify(answerView) !== JSON.stringify(expectedAnswerView)) {
    throw new Error(
      `Expected the reply to show the edited question, received ${JSON.stringify(answerView)}`,
    );
  }
  const expectedConfirmationView = {
    message_id: 3,
    from: botSender,
    chat,
    date: 1_700_000_002,
    reply_to_message: {
      message_id: 2,
      from: account.profile,
      chat,
      date: 1_700_000_001,
      text: 'Ada',
    },
    text: 'Saved',
    has_protected_content: true,
  };
  if (JSON.stringify(confirmationView) !== JSON.stringify(expectedConfirmationView)) {
    throw new Error(
      `Expected a protected reply without a nested reply, received ${
        JSON.stringify(confirmationView)
      }`,
    );
  }

  messages.deletePrivateTextMessage(question.id);
  const answerViewAfterDeletion = botMessageViews.viewPrivateTextMessageForBot(answer);
  if ('reply_to_message' in answerViewAfterDeletion) {
    throw new Error('Expected a reply to a deleted message to omit reply_to_message');
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
  const botMessageViews = new BotMessageViewService({ accounts, bots, userMessageBoxes, messages });
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
