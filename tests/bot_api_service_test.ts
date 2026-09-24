import { AccountRepository } from '../src/repositories/account.ts';
import { BotRepository } from '../src/repositories/bot.ts';
import { BotCommandRepository } from '../src/repositories/bot_command.ts';
import { BotUpdateRepository } from '../src/repositories/bot_update.ts';
import { BotUpdateSubscriptionRepository } from '../src/repositories/bot_update_subscription.ts';
import { CallbackQueryRepository } from '../src/repositories/callback_query.ts';
import { MessageRepository } from '../src/repositories/message.ts';
import { PrivateConversationRepository } from '../src/repositories/private_conversation.ts';
import { TelegramIdentityRepository } from '../src/repositories/telegram_identity.ts';
import { UserMessageBoxRepository } from '../src/repositories/user_message_box.ts';
import { BotApiService } from '../src/services/bot_api.ts';
import { BotCommandService } from '../src/services/bot_command.ts';
import { BotMessageViewService } from '../src/services/bot_message_view.ts';
import { BotUpdateDeliveryService } from '../src/services/bot_update_delivery.ts';
import { BotUpdatePollingService } from '../src/services/bot_update_polling.ts';
import { CallbackQueryService } from '../src/services/callback_query.ts';
import { PrivateMessagingService } from '../src/services/private_messaging.ts';
import { VirtualUserService } from '../src/services/virtual_user.ts';

Deno.test('BotApiService translates private messaging failures into Bot API reasons', () => {
  const { virtualUsers, privateMessaging, botApi } = createBotApiFixture();
  const bot = createBot(virtualUsers, 'test_bot');
  const account = createAccount(virtualUsers);
  const strangerAccount = createAccount(virtualUsers);
  privateMessaging.sendAccountMessage({
    fromAccountId: account.profile.id,
    to: { type: 'private', botId: bot.profile.id },
    text: '/start',
  });
  // Any user who has not written to the bot is, like an unknown chat, not found.
  const chatId = strangerAccount.profile.id;

  const cases = [
    ['sendMessage', botApi.sendMessage(bot.profile, { chatId, text: 'Hello' }), 'chat_not_found'],
    [
      'editMessageText',
      botApi.editMessageText(bot.profile, { chatId, messageId: 1, text: 'Done' }),
      'chat_not_found',
    ],
    [
      'editMessageReplyMarkup',
      botApi.editMessageReplyMarkup(bot.profile, { chatId, messageId: 1 }),
      'chat_not_found',
    ],
    [
      'deleteMessage',
      botApi.deleteMessage(bot.profile, { chatId, messageId: 1 }),
      'chat_not_found',
    ],
    [
      'deleteMessages',
      botApi.deleteMessages(bot.profile, { chatId, messageIds: [1] }),
      'chat_not_found',
    ],
    [
      'sendChatAction',
      botApi.sendChatAction(bot.profile, { chatId, action: 'typing' }),
      'chat_not_found',
    ],
    // The text is checked before the chat.
    ['sendMessage', botApi.sendMessage(bot.profile, { chatId, text: '' }), 'message_text_empty'],
    [
      'sendMessage',
      botApi.sendMessage(bot.profile, {
        chatId: account.profile.id,
        text: 'Hello',
        replyTo: { messageId: 99, allowSendingWithoutReply: false },
      }),
      'reply_message_not_found',
    ],
  ] as const;
  for (const [method, result, expectedReason] of cases) {
    if (!('reason' in result) || result.reason !== expectedReason) {
      throw new Error(
        `Expected ${method} to report ${expectedReason}, received ${JSON.stringify(result)}`,
      );
    }
  }
});

Deno.test('BotApiService reads text with its parse mode or entities', () => {
  const { botApi } = createBotApiFixture();
  const bold = { type: 'bold', offset: 0, length: 2 } as const;
  const read = (text: string, parseMode?: string) =>
    botApi.readFormattedText({ text, parseMode, entities: [bold] });

  // Without a parse mode, or with `none`, the specified entities stand.
  for (const parseMode of [undefined, '', 'None']) {
    const result = read('*a*', parseMode);
    if (
      !result.read || result.formattedText.text !== '*a*' ||
      JSON.stringify(result.formattedText.entities) !== JSON.stringify([bold])
    ) {
      throw new Error(
        `Expected parse mode ${parseMode} to keep the entities, received ${JSON.stringify(result)}`,
      );
    }
  }
  // A parse mode, matched case-insensitively, overrides them.
  const markdownResult = read('_a_', 'MARKDOWNV2');
  if (
    !markdownResult.read || markdownResult.formattedText.text !== 'a' ||
    JSON.stringify(markdownResult.formattedText.entities) !==
      JSON.stringify([{ type: 'italic', offset: 0, length: 1 }])
  ) {
    throw new Error(`Expected the markup to be parsed, received ${JSON.stringify(markdownResult)}`);
  }

  const failures: ReadonlyArray<readonly [ReturnType<typeof read>, string]> = [
    [read('x'.repeat(2 ** 15 + 1), 'HTML'), 'text_too_long'],
    [read('x'.repeat(2 ** 15 + 1)), 'text_too_long'],
    [read('a', 'XML'), 'parse_mode_unsupported'],
    [read('\ud800', 'HTML'), 'text_encoding_invalid'],
    [read('<tg-time unix="1">now</tg-time>', 'html'), 'date_time_unsupported'],
    [read('<b>', 'HTML'), 'markup_invalid'],
  ];
  for (const [result, expectedReason] of failures) {
    if (result.read || result.reason !== expectedReason) {
      throw new Error(`Expected ${expectedReason}, received ${JSON.stringify(result)}`);
    }
  }
  const markupFailure = read('<b>', 'HTML');
  if (
    markupFailure.read || markupFailure.reason !== 'markup_invalid' ||
    markupFailure.markupError !== 'Can\'t find end tag corresponding to start tag "b"'
  ) {
    throw new Error(`Expected TDLib's markup error, received ${JSON.stringify(markupFailure)}`);
  }
});

function createBotApiFixture() {
  const identities = new TelegramIdentityRepository();
  const accounts = new AccountRepository();
  const bots = new BotRepository();
  const virtualUsers = new VirtualUserService({ identities, accounts, bots });
  const userMessageBoxes = new UserMessageBoxRepository();
  const messages = new MessageRepository();
  const botUpdates = new BotUpdateRepository();
  const updateSubscriptions = new BotUpdateSubscriptionRepository();
  const botMessageViews = new BotMessageViewService({ accounts, bots, userMessageBoxes, messages });
  const events = new BotUpdateDeliveryService({ botMessageViews, botUpdates, updateSubscriptions });
  const privateConversations = new PrivateConversationRepository();
  const privateMessaging = new PrivateMessagingService({
    accounts,
    bots,
    privateConversations,
    messages,
    userMessageBoxes,
    events,
    currentUnixTimeSeconds: () => 1_700_000_000,
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
    botCommands: new BotCommandService({
      accounts,
      bots,
      privateConversations,
      botCommands: new BotCommandRepository(),
    }),
  });
  return { virtualUsers, privateMessaging, botApi };
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
