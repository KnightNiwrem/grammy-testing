import { AccountRepository } from '../src/repositories/account.ts';
import { BotRepository } from '../src/repositories/bot.ts';
import { BotUpdateRepository } from '../src/repositories/bot_update.ts';
import { BotUpdateSubscriptionRepository } from '../src/repositories/bot_update_subscription.ts';
import { MessageRepository } from '../src/repositories/message.ts';
import { PrivateConversationRepository } from '../src/repositories/private_conversation.ts';
import { TelegramIdentityRepository } from '../src/repositories/telegram_identity.ts';
import { UserMessageBoxRepository } from '../src/repositories/user_message_box.ts';
import { BotMessageViewService } from '../src/services/bot_message_view.ts';
import { BotUpdateDeliveryService } from '../src/services/bot_update_delivery.ts';
import {
  type BotMessageReplyTarget,
  type DeleteMessagesByBotFailureReason,
  type EditBotMessageTextFailureReason,
  PrivateMessagingService,
  type SendBotMessageFailureReason,
} from '../src/services/private_messaging.ts';
import { VirtualUserService } from '../src/services/virtual_user.ts';
import type { BotApiPrivateTextMessage, BotApiUpdate } from '../src/types/bot_api.ts';
import type { ChatDomainEvent } from '../src/types/chat_domain_event.ts';
import type { InlineKeyboard } from '../src/types/inline_keyboard.ts';
import type { ReplyInterfaceMarkup } from '../src/types/reply_interface.ts';
import {
  MAX_TEXT_MESSAGE_LENGTH,
  type PrivateTextMessage,
  type TextEntity,
} from '../src/types/virtual_message.ts';
import type { VirtualBot } from '../src/types/virtual_bot.ts';

Deno.test('PrivateMessagingService activates a private conversation only for known participants', () => {
  const { virtualUsers, privateConversations, privateMessaging } = createPrivateMessagingFixture();
  const account = createAccount(virtualUsers, 'Ada');
  const bot = createBot(virtualUsers, 'First Bot', 'first_bot');

  const missingAccount = privateMessaging.activatePrivateConversation({
    accountId: 999,
    botId: bot.profile.id,
  });
  const missingBot = privateMessaging.activatePrivateConversation({
    accountId: account.profile.id,
    botId: 999,
  });
  if (
    missingAccount.activated || missingAccount.reason !== 'account_not_found' ||
    missingBot.activated || missingBot.reason !== 'bot_not_found'
  ) {
    throw new Error('Expected unknown participants to be rejected');
  }
  if (
    privateConversations.getPrivateConversation({ accountId: 999, botId: bot.profile.id }) !==
      undefined ||
    privateConversations.getPrivateConversation({ accountId: account.profile.id, botId: 999 }) !==
      undefined
  ) {
    throw new Error('Expected rejected activations not to create conversations');
  }

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

Deno.test('PrivateMessagingService sends, stores, and publishes private account messages', () => {
  const {
    virtualUsers,
    privateConversations,
    messages,
    botUpdates,
    publishedEvents,
    privateMessaging,
  } = createPrivateMessagingFixture();
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
    storedMessages[0] !== firstResult.message ||
    storedMessages[1] !== secondResult.message
  ) {
    throw new Error('Expected the sent canonical messages to be retained in conversation history');
  }
  if (
    firstResult.message.text !== 'Hello' ||
    firstResult.message.authorRole !== 'account' ||
    firstResult.message.sentAtUnixSeconds !== 1_700_000_000 ||
    firstResult.message.conversation.accountId !== account.profile.id ||
    firstResult.message.conversation.botId !== bot.profile.id
  ) {
    throw new Error('Expected the result to carry the canonical account message');
  }

  const history = privateMessaging.getPrivateMessageHistory({
    accountId: account.profile.id,
    botId: bot.profile.id,
  });
  if (
    !history.found ||
    history.messages.map((message) => message.id).join() !==
      [firstResult.message.id, secondResult.message.id].join()
  ) {
    throw new Error('Expected history to return the stored messages in order');
  }
  if (
    publishedEvents.length !== 2 ||
    publishedEvents.some((event, index) =>
      event.type !== 'message_created' || event.message !== storedMessages[index]
    )
  ) {
    throw new Error('Expected each sent message to publish a message_created event');
  }

  const updates = botUpdates.confirmAndReadPendingUpdates(bot.profile.id, { limit: 100 });
  if (
    updates.length !== 2 ||
    messageFromUpdate(updates[0])?.text !== 'Hello' ||
    messageFromUpdate(updates[1])?.text !== 'Again'
  ) {
    throw new Error('Expected each sent message to enqueue one update for the target bot');
  }
});

Deno.test("PrivateMessagingService numbers private messages in each user's message box", () => {
  const { virtualUsers, userMessageBoxes, botUpdates, privateMessaging } =
    createPrivateMessagingFixture();
  const account = createAccount(virtualUsers, 'Ada');
  const otherAccount = createAccount(virtualUsers, 'Grace');
  const firstBot = createBot(virtualUsers, 'First Bot', 'first_bot');
  const secondBot = createBot(virtualUsers, 'Second Bot', 'second_bot');

  const sentMessages = [
    sendPrivateText(privateMessaging, account.profile.id, firstBot),
    sendPrivateText(privateMessaging, account.profile.id, secondBot),
    sendPrivateText(privateMessaging, otherAccount.profile.id, firstBot),
    sendPrivateText(privateMessaging, account.profile.id, firstBot),
  ];
  const messageIdsIn = (ownerId: number) =>
    sentMessages.map((message) => userMessageBoxes.getMessageId(ownerId, message.id) ?? '-').join();

  // Each user numbers the messages of all its private chats in one sequence.
  if (
    messageIdsIn(firstBot.profile.id) !== '1,-,2,3' ||
    messageIdsIn(secondBot.profile.id) !== '-,1,-,-' ||
    messageIdsIn(account.profile.id) !== '1,2,-,3'
  ) {
    throw new Error('Expected each user to number messages from its own message box');
  }
  const secondBotUpdates = botUpdates.confirmAndReadPendingUpdates(secondBot.profile.id, {
    limit: 100,
  });
  if (secondBotUpdates.length !== 1 || messageFromUpdate(secondBotUpdates[0])?.message_id !== 1) {
    throw new Error("Expected the bot's update to carry its own message ID");
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
    botUpdates.confirmAndReadPendingUpdates(bot.profile.id, { limit: 100 }).length !== 0
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

  const reply = replyResult.message;
  if (
    reply.authorRole !== 'bot' ||
    reply.conversation.accountId !== account.profile.id ||
    reply.conversation.botId !== bot.profile.id ||
    reply.sentAtUnixSeconds !== 1_700_000_000 ||
    JSON.stringify(reply.entities) !==
      JSON.stringify([{ type: 'bot_command', offset: 4, length: 5 }])
  ) {
    throw new Error("Expected the result to carry the bot's canonical reply with its entities");
  }
  if (
    userMessageBoxes.getMessageId(account.profile.id, reply.id) !== 2 ||
    userMessageBoxes.getMessageId(bot.profile.id, reply.id) !== 2
  ) {
    throw new Error("Expected the reply to be numbered in both participants' message boxes");
  }
  const storedMessages = messages.getPrivateConversationMessages({
    accountId: account.profile.id,
    botId: bot.profile.id,
  });
  const history = privateMessaging.getPrivateMessageHistory({
    accountId: account.profile.id,
    botId: bot.profile.id,
  });
  if (
    storedMessages.length !== 2 ||
    storedMessages[0] !== incomingMessage ||
    storedMessages[1] !== reply ||
    !history.found ||
    history.messages.map((message) => message.id).join() !==
      [incomingMessage.id, reply.id].join()
  ) {
    throw new Error('Expected history to hold the incoming message and then the reply');
  }
  if (
    publishedEvents.length !== 2 ||
    publishedEvents[1].message !== reply ||
    botUpdates.confirmAndReadPendingUpdates(bot.profile.id, { limit: 100 }).length !== 1
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
    replyTo?: BotMessageReplyTarget;
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
      replyTo: { botMessageId: 1, allowSendingWithoutReply: false },
      expectedReason: 'conversation_not_started',
    },
    {
      fromBotId: bot.profile.id,
      accountId: account.profile.id,
      text: tooLongText,
      replyTo: { botMessageId: 1, allowSendingWithoutReply: false },
      expectedReason: 'reply_message_not_found',
    },
    {
      fromBotId: bot.profile.id,
      accountId: account.profile.id,
      text: tooLongText,
      expectedReason: 'message_text_too_long',
    },
  ];

  for (const { fromBotId, accountId, text, replyTo, expectedReason } of cases) {
    const result = privateMessaging.sendBotMessage({
      fromBotId,
      to: { type: 'private', accountId },
      text,
      replyTo,
    });
    if (result.sent || result.reason !== expectedReason) {
      throw new Error(`Expected the bot message to fail with ${expectedReason}`);
    }
  }
  if (publishedEvents.length !== 0) {
    throw new Error('Expected rejected bot messages not to store or publish anything');
  }
});

Deno.test('PrivateMessagingService stores replies only to messages of the same chat', () => {
  const { virtualUsers, messages, publishedEvents, privateMessaging } =
    createPrivateMessagingFixture();
  const account = createAccount(virtualUsers, 'Ada');
  const otherAccount = createAccount(virtualUsers, 'Grace');
  const bot = createBot(virtualUsers, 'Test Bot', 'test_bot');
  const otherChatMessage = sendPrivateText(privateMessaging, otherAccount.profile.id, bot);
  const question = sendPrivateText(privateMessaging, account.profile.id, bot);
  const otherChatMessageId = 1;
  const questionId = 2;

  const botReply = privateMessaging.sendBotMessage({
    fromBotId: bot.profile.id,
    to: { type: 'private', accountId: account.profile.id },
    text: 'Hi',
    replyTo: { botMessageId: questionId, allowSendingWithoutReply: false },
    isContentProtected: true,
  });
  const accountReply = privateMessaging.sendAccountMessage({
    fromAccountId: account.profile.id,
    to: { type: 'private', botId: bot.profile.id },
    text: 'Thanks',
    replyToBotMessageId: 3,
  });
  if (
    !botReply.sent || botReply.message.replyToMessageId !== question.id ||
    !botReply.message.isContentProtected ||
    !accountReply.sent || accountReply.message.replyToMessageId !== botReply.message.id ||
    accountReply.message.isContentProtected
  ) {
    throw new Error('Expected both participants to reply to messages of their chat');
  }

  const eventCountBeforeRejections = publishedEvents.length;
  const botReplyToOtherChat = privateMessaging.sendBotMessage({
    fromBotId: bot.profile.id,
    to: { type: 'private', accountId: account.profile.id },
    text: 'Hi',
    replyTo: { botMessageId: otherChatMessageId, allowSendingWithoutReply: false },
  });
  const accountReplyToMissingMessage = privateMessaging.sendAccountMessage({
    fromAccountId: account.profile.id,
    to: { type: 'private', botId: bot.profile.id },
    text: 'Thanks',
    replyToBotMessageId: 99,
  });
  if (
    botReplyToOtherChat.sent || botReplyToOtherChat.reason !== 'reply_message_not_found' ||
    accountReplyToMissingMessage.sent ||
    accountReplyToMissingMessage.reason !== 'reply_message_not_found' ||
    publishedEvents.length !== eventCountBeforeRejections
  ) {
    throw new Error('Expected replies to messages outside the chat to fail without a message');
  }

  privateMessaging.deleteMessagesByBot({
    fromBotId: bot.profile.id,
    chat: { type: 'private', accountId: account.profile.id },
    botMessageIds: [questionId],
  });
  const replyToDeletedMessage = privateMessaging.sendBotMessage({
    fromBotId: bot.profile.id,
    to: { type: 'private', accountId: account.profile.id },
    text: 'Still there?',
    replyTo: { botMessageId: questionId, allowSendingWithoutReply: true },
  });
  if (!replyToDeletedMessage.sent || replyToDeletedMessage.message.replyToMessageId !== undefined) {
    throw new Error(
      'Expected allowSendingWithoutReply to send a reply to a deleted message as none',
    );
  }
  if (messages.getPrivateTextMessage(otherChatMessage.id) !== otherChatMessage) {
    throw new Error("Expected the other chat's message to be unaffected");
  }
});

Deno.test('PrivateMessagingService shows the reply interface the latest bot message set', () => {
  const { virtualUsers, userMessageBoxes, privateMessaging } = createPrivateMessagingFixture();
  const account = createAccount(virtualUsers, 'Ada');
  const bot = createBot(virtualUsers, 'Test Bot', 'test_bot');
  const chat = { accountId: account.profile.id, botId: bot.profile.id };
  sendPrivateText(privateMessaging, account.profile.id, bot);
  const sendWithReplyInterfaceMarkup = (replyInterfaceMarkup: ReplyInterfaceMarkup) => {
    const result = privateMessaging.sendBotMessage({
      fromBotId: bot.profile.id,
      to: { type: 'private', accountId: account.profile.id },
      text: 'Choose',
      replyInterfaceMarkup,
    });
    if (!result.sent) {
      throw new Error(`Expected the bot message to be sent, received ${result.reason}`);
    }
    return result.message;
  };
  const shownReplyInterface = () => {
    const result = privateMessaging.getPrivateChatReplyInterface(chat);
    if (!result.found) {
      throw new Error(`Expected the chat's reply interface, received ${result.reason}`);
    }
    return result.shownReplyInterface;
  };
  const pressButton = (text: string) =>
    privateMessaging.pressReplyKeyboardButton({
      fromAccountId: account.profile.id,
      chat: { type: 'private', botId: bot.profile.id },
      text,
    });

  const keyboardMessage = sendWithReplyInterfaceMarkup(COLOR_KEYBOARD);
  sendBotMessage(privateMessaging, account.profile.id, bot, YES_NO_KEYBOARD);
  if (
    shownReplyInterface()?.message.id !== keyboardMessage.id ||
    JSON.stringify(shownReplyInterface()?.replyInterface) !== JSON.stringify(COLOR_KEYBOARD)
  ) {
    throw new Error('Expected the keyboard to stay shown after a message with an inline keyboard');
  }
  const press = pressButton('Red');
  const pressOfMissingButton = pressButton('Blue');
  if (
    !press.sent || press.message.authorRole !== 'account' || press.message.text !== 'Red' ||
    pressOfMissingButton.sent || pressOfMissingButton.reason !== 'reply_keyboard_button_not_found'
  ) {
    throw new Error("Expected only the keyboard's buttons to send their text");
  }
  if (!pressButton('Green').sent || shownReplyInterface()?.message.id !== keyboardMessage.id) {
    throw new Error('Expected a one-time keyboard to stay available after it is used');
  }

  const forcedReplyMessage = sendWithReplyInterfaceMarkup({
    kind: 'forced_reply',
    inputFieldPlaceholder: 'Your name',
  });
  if (shownReplyInterface()?.message.id !== forcedReplyMessage.id || pressButton('Red').sent) {
    throw new Error('Expected a forced reply to replace the keyboard');
  }
  sendWithReplyInterfaceMarkup(COLOR_KEYBOARD);
  sendWithReplyInterfaceMarkup({ kind: 'reply_keyboard_removal' });
  if (shownReplyInterface() !== undefined) {
    throw new Error('Expected a removal to clear the shown keyboard');
  }

  const replacedKeyboardMessage = sendWithReplyInterfaceMarkup(COLOR_KEYBOARD);
  privateMessaging.deleteMessagesByBot({
    fromBotId: bot.profile.id,
    chat: { type: 'private', accountId: account.profile.id },
    botMessageIds: [expectBotMessageId(userMessageBoxes, bot, replacedKeyboardMessage.id)],
  });
  if (shownReplyInterface() !== undefined) {
    throw new Error("Expected deleting the keyboard's message to clear it");
  }

  const unknownAccount = privateMessaging.getPrivateChatReplyInterface({
    accountId: 999,
    botId: bot.profile.id,
  });
  const pressForUnknownBot = privateMessaging.pressReplyKeyboardButton({
    fromAccountId: account.profile.id,
    chat: { type: 'private', botId: 999 },
    text: 'Red',
  });
  if (
    unknownAccount.found || unknownAccount.reason !== 'account_not_found' ||
    pressForUnknownBot.sent || pressForUnknownBot.reason !== 'bot_not_found'
  ) {
    throw new Error('Expected unknown participants to be reported');
  }
});

Deno.test('PrivateMessagingService stores an inline keyboard whose callback data fits 64 bytes', () => {
  const { virtualUsers, messages, publishedEvents, privateMessaging } =
    createPrivateMessagingFixture();
  const account = createAccount(virtualUsers, 'Ada');
  const bot = createBot(virtualUsers, 'Test Bot', 'test_bot');
  sendPrivateText(privateMessaging, account.profile.id, bot);
  const send = (inlineKeyboard: InlineKeyboard) =>
    privateMessaging.sendBotMessage({
      fromBotId: bot.profile.id,
      to: { type: 'private', accountId: account.profile.id },
      text: 'Choose',
      inlineKeyboard,
    });
  // 32 two-byte characters fill the 64-byte callback data limit exactly.
  const inlineKeyboard: InlineKeyboard = [
    [{ kind: 'callback', text: 'Full', callbackData: 'é'.repeat(32) }],
    [{ kind: 'url', text: 'Docs', url: 'https://grammy.dev' }],
  ];

  const result = send(inlineKeyboard);
  if (!result.sent) {
    throw new Error(`Expected the bot message to be sent, received ${result.reason}`);
  }
  if (
    JSON.stringify(result.message.inlineKeyboard) !== JSON.stringify(inlineKeyboard) ||
    messages.getPrivateTextMessage(result.message.id) !== result.message
  ) {
    throw new Error('Expected the stored bot message to carry its inline keyboard');
  }
  const oversized = send([[{ kind: 'callback', text: 'Too long', callbackData: 'é'.repeat(33) }]]);
  if (oversized.sent || oversized.reason !== 'callback_data_invalid') {
    throw new Error('Expected 66 bytes of callback data to be rejected');
  }
  if (publishedEvents.length !== 2) {
    throw new Error('Expected the rejected bot message not to be stored or published');
  }
});

Deno.test('PrivateMessagingService edits the text and keyboard of a bot message', () => {
  const { virtualUsers, userMessageBoxes, publishedEvents, privateMessaging, advanceClockSeconds } =
    createPrivateMessagingFixture();
  const account = createAccount(virtualUsers, 'Ada');
  const bot = createBot(virtualUsers, 'Test Bot', 'test_bot');
  sendPrivateText(privateMessaging, account.profile.id, bot);
  const botMessage = sendBotMessage(privateMessaging, account.profile.id, bot, YES_NO_KEYBOARD);
  const botMessageId = expectBotMessageId(userMessageBoxes, bot, botMessage.id);
  advanceClockSeconds(5);

  const textEdit = privateMessaging.editBotMessageText({
    fromBotId: bot.profile.id,
    chat: { type: 'private', accountId: account.profile.id },
    botMessageId,
    text: 'Chosen: /yes',
  });
  if (!textEdit.edited) {
    throw new Error(`Expected the text edit to succeed, received ${textEdit.reason}`);
  }
  if (
    textEdit.message.id !== botMessage.id ||
    textEdit.message.sentAtUnixSeconds !== 1_700_000_000 ||
    textEdit.message.textEditedAtUnixSeconds !== 1_700_000_005 ||
    textEdit.message.text !== 'Chosen: /yes' ||
    JSON.stringify(textEdit.message.entities) !==
      JSON.stringify([{ type: 'bot_command', offset: 8, length: 4 }]) ||
    textEdit.message.inlineKeyboard !== undefined
  ) {
    throw new Error('Expected a dated text edit that recomputes entities and drops the keyboard');
  }
  advanceClockSeconds(5);

  const keyboardEdit = privateMessaging.editBotMessageInlineKeyboard({
    fromBotId: bot.profile.id,
    chat: { type: 'private', accountId: account.profile.id },
    botMessageId,
    inlineKeyboard: YES_NO_KEYBOARD,
  });
  if (!keyboardEdit.edited) {
    throw new Error(`Expected the keyboard edit to succeed, received ${keyboardEdit.reason}`);
  }
  if (
    keyboardEdit.message.text !== 'Chosen: /yes' ||
    keyboardEdit.message.textEditedAtUnixSeconds !== 1_700_000_005 ||
    JSON.stringify(keyboardEdit.message.inlineKeyboard) !== JSON.stringify(YES_NO_KEYBOARD)
  ) {
    throw new Error('Expected a keyboard edit to keep the text and its edit date');
  }

  const sameTextEdit = privateMessaging.editBotMessageText({
    fromBotId: bot.profile.id,
    chat: { type: 'private', accountId: account.profile.id },
    botMessageId,
    text: 'Chosen: /yes',
  });
  if (
    !sameTextEdit.edited ||
    sameTextEdit.message.textEditedAtUnixSeconds !== 1_700_000_005 ||
    sameTextEdit.message.inlineKeyboard !== undefined
  ) {
    throw new Error('Expected an unchanged text to keep its edit date while the keyboard goes');
  }
  if (publishedEvents.length !== 2) {
    throw new Error('Expected edits not to publish chat events');
  }
});

Deno.test('PrivateMessagingService validates bot message edits in Telegram order', () => {
  const { virtualUsers, userMessageBoxes, messages, privateMessaging } =
    createPrivateMessagingFixture();
  const account = createAccount(virtualUsers, 'Ada');
  const strangerAccount = createAccount(virtualUsers, 'Grace');
  const otherAccount = createAccount(virtualUsers, 'Joan');
  const bot = createBot(virtualUsers, 'Test Bot', 'test_bot');
  const accountMessage = sendPrivateText(privateMessaging, account.profile.id, bot);
  const botMessage = sendBotMessage(privateMessaging, account.profile.id, bot, YES_NO_KEYBOARD);
  const otherChatMessage = sendPrivateText(privateMessaging, otherAccount.profile.id, bot);
  const accountMessageId = expectBotMessageId(userMessageBoxes, bot, accountMessage.id);
  const botMessageId = expectBotMessageId(userMessageBoxes, bot, botMessage.id);
  const otherChatMessageId = expectBotMessageId(userMessageBoxes, bot, otherChatMessage.id);
  const tooLongText = 'x'.repeat(MAX_TEXT_MESSAGE_LENGTH + 1);
  const invalidKeyboard: InlineKeyboard = [
    [{ kind: 'callback', text: 'Too long', callbackData: 'x'.repeat(65) }],
  ];
  // Each case also breaks every later rule, so only the earliest check can explain its failure.
  const cases: {
    fromBotId: number;
    accountId: number;
    botMessageId: number;
    text: string;
    inlineKeyboard?: InlineKeyboard;
    expectedReason: EditBotMessageTextFailureReason;
  }[] = [
    {
      fromBotId: 999,
      accountId: 999,
      botMessageId: 999,
      text: '',
      expectedReason: 'bot_not_found',
    },
    {
      fromBotId: bot.profile.id,
      accountId: 999,
      botMessageId: 999,
      text: '',
      expectedReason: 'message_text_empty',
    },
    {
      fromBotId: bot.profile.id,
      accountId: 999,
      botMessageId: 999,
      text: tooLongText,
      expectedReason: 'account_not_found',
    },
    {
      fromBotId: bot.profile.id,
      accountId: strangerAccount.profile.id,
      botMessageId,
      text: tooLongText,
      expectedReason: 'conversation_not_started',
    },
    {
      fromBotId: bot.profile.id,
      accountId: account.profile.id,
      botMessageId: 999,
      text: tooLongText,
      expectedReason: 'message_not_found',
    },
    {
      fromBotId: bot.profile.id,
      accountId: account.profile.id,
      botMessageId: otherChatMessageId,
      text: tooLongText,
      expectedReason: 'message_not_found',
    },
    {
      fromBotId: bot.profile.id,
      accountId: account.profile.id,
      botMessageId: accountMessageId,
      text: tooLongText,
      expectedReason: 'message_not_editable',
    },
    {
      fromBotId: bot.profile.id,
      accountId: account.profile.id,
      botMessageId,
      text: tooLongText,
      inlineKeyboard: invalidKeyboard,
      expectedReason: 'message_text_too_long',
    },
    {
      fromBotId: bot.profile.id,
      accountId: account.profile.id,
      botMessageId,
      text: botMessage.text,
      inlineKeyboard: invalidKeyboard,
      expectedReason: 'callback_data_invalid',
    },
    {
      fromBotId: bot.profile.id,
      accountId: account.profile.id,
      botMessageId,
      text: botMessage.text,
      inlineKeyboard: YES_NO_KEYBOARD,
      expectedReason: 'message_not_modified',
    },
  ];

  for (
    const { fromBotId, accountId, botMessageId, text, inlineKeyboard, expectedReason } of cases
  ) {
    const result = privateMessaging.editBotMessageText({
      fromBotId,
      chat: { type: 'private', accountId },
      botMessageId,
      text,
      inlineKeyboard,
    });
    if (result.edited || result.reason !== expectedReason) {
      throw new Error(`Expected the edit to fail with ${expectedReason}`);
    }
  }
  const keyboardEdit = privateMessaging.editBotMessageInlineKeyboard({
    fromBotId: bot.profile.id,
    chat: { type: 'private', accountId: account.profile.id },
    botMessageId,
    inlineKeyboard: YES_NO_KEYBOARD,
  });
  if (keyboardEdit.edited || keyboardEdit.reason !== 'message_not_modified') {
    throw new Error('Expected an identical keyboard edit to be rejected as not modified');
  }
  if (messages.getPrivateTextMessage(botMessage.id) !== botMessage) {
    throw new Error('Expected rejected edits to leave the message unchanged');
  }
});

Deno.test('PrivateMessagingService lets a bot delete messages of its private chat', () => {
  const { virtualUsers, userMessageBoxes, messages, publishedEvents, privateMessaging } =
    createPrivateMessagingFixture();
  const account = createAccount(virtualUsers, 'Ada');
  const otherAccount = createAccount(virtualUsers, 'Grace');
  const bot = createBot(virtualUsers, 'Test Bot', 'test_bot');
  const accountMessage = sendPrivateText(privateMessaging, account.profile.id, bot);
  const botMessage = sendBotMessage(privateMessaging, account.profile.id, bot, YES_NO_KEYBOARD);
  const keptMessage = sendBotMessage(privateMessaging, account.profile.id, bot);
  const otherChatMessage = sendPrivateText(privateMessaging, otherAccount.profile.id, bot);
  const accountMessageId = expectBotMessageId(userMessageBoxes, bot, accountMessage.id);
  const botMessageId = expectBotMessageId(userMessageBoxes, bot, botMessage.id);
  const otherChatMessageId = expectBotMessageId(userMessageBoxes, bot, otherChatMessage.id);
  const publishedEventCount = publishedEvents.length;

  const deletion = privateMessaging.deleteMessagesByBot({
    fromBotId: bot.profile.id,
    chat: { type: 'private', accountId: account.profile.id },
    botMessageIds: [accountMessageId, botMessageId, botMessageId, otherChatMessageId, 999],
  });
  if (!deletion.deleted || deletion.deletedMessageCount !== 2) {
    throw new Error(
      "Expected both participants' messages to be deleted once and other IDs to be skipped",
    );
  }
  const history = messages.getPrivateConversationMessages({
    accountId: account.profile.id,
    botId: bot.profile.id,
  });
  if (history.length !== 1 || history[0] !== keptMessage) {
    throw new Error('Expected only the undeleted message to remain in the history');
  }
  if (messages.getPrivateTextMessage(otherChatMessage.id) !== otherChatMessage) {
    throw new Error("Expected a message of the bot's other chat to be kept");
  }
  if (publishedEvents.length !== publishedEventCount) {
    throw new Error('Expected deletions not to publish chat events');
  }

  const repeatedDeletion = privateMessaging.deleteMessagesByBot({
    fromBotId: bot.profile.id,
    chat: { type: 'private', accountId: account.profile.id },
    botMessageIds: [botMessageId],
  });
  if (!repeatedDeletion.deleted || repeatedDeletion.deletedMessageCount !== 0) {
    throw new Error('Expected an already deleted message to be skipped');
  }
  const editOfDeletedMessage = privateMessaging.editBotMessageText({
    fromBotId: bot.profile.id,
    chat: { type: 'private', accountId: account.profile.id },
    botMessageId,
    text: 'Done',
  });
  if (editOfDeletedMessage.edited || editOfDeletedMessage.reason !== 'message_not_found') {
    throw new Error('Expected a deleted message not to be found for editing');
  }
  const nextMessage = sendPrivateText(privateMessaging, account.profile.id, bot);
  if (
    expectBotMessageId(userMessageBoxes, bot, nextMessage.id) !== otherChatMessageId + 1 ||
    expectBotMessageId(userMessageBoxes, bot, botMessage.id) !== botMessageId
  ) {
    throw new Error('Expected deleted messages to keep their IDs, which are never reused');
  }
});

Deno.test('PrivateMessagingService validates message deletions before changing state', () => {
  const { virtualUsers, userMessageBoxes, messages, privateMessaging } =
    createPrivateMessagingFixture();
  const account = createAccount(virtualUsers, 'Ada');
  const strangerAccount = createAccount(virtualUsers, 'Grace');
  const bot = createBot(virtualUsers, 'Test Bot', 'test_bot');
  const message = sendPrivateText(privateMessaging, account.profile.id, bot);
  const botMessageId = expectBotMessageId(userMessageBoxes, bot, message.id);
  const cases: {
    fromBotId: number;
    accountId: number;
    expectedReason: DeleteMessagesByBotFailureReason;
  }[] = [
    { fromBotId: 999, accountId: 999, expectedReason: 'bot_not_found' },
    { fromBotId: bot.profile.id, accountId: 999, expectedReason: 'account_not_found' },
    {
      fromBotId: bot.profile.id,
      accountId: strangerAccount.profile.id,
      expectedReason: 'conversation_not_started',
    },
  ];

  for (const { fromBotId, accountId, expectedReason } of cases) {
    const result = privateMessaging.deleteMessagesByBot({
      fromBotId,
      chat: { type: 'private', accountId },
      botMessageIds: [botMessageId],
    });
    if (result.deleted || result.reason !== expectedReason) {
      throw new Error(`Expected the deletion to fail with ${expectedReason}`);
    }
  }
  if (messages.getPrivateTextMessage(message.id) !== message) {
    throw new Error('Expected rejected deletions to keep the message');
  }
});

Deno.test('PrivateMessagingService normalizes bot text and entities as Telegram does', () => {
  const { virtualUsers, privateMessaging } = createPrivateMessagingFixture();
  const account = createAccount(virtualUsers, 'Ada');
  const bot = createBot(virtualUsers, 'Test Bot', 'test_bot');
  sendPrivateText(privateMessaging, account.profile.id, bot);

  const result = privateMessaging.sendBotMessage({
    fromBotId: bot.profile.id,
    to: { type: 'private', accountId: account.profile.id },
    text: '\n Hi Ada, see\tsite /help  \r\n',
    entities: [
      { type: 'text_mention', offset: 5, length: 3, userId: account.profile.id },
      { type: 'text_link', offset: 14, length: 4, url: 'Example.com' },
      { type: 'bold', offset: 2, length: 20 },
    ],
  });
  if (!result.sent) {
    throw new Error(
      `Expected the formatted message to be sent, received ${JSON.stringify(result)}`,
    );
  }
  // Whitespace is trimmed from both ends, the tab becomes a space, and formatting splits around the
  // mention, the link, and the detected command.
  const expectedEntities = [
    { type: 'bold', offset: 0, length: 3 },
    { type: 'text_mention', offset: 3, length: 3, userId: account.profile.id },
    { type: 'bold', offset: 3, length: 3 },
    { type: 'bold', offset: 6, length: 6 },
    { type: 'text_link', offset: 12, length: 4, url: 'http://example.com/' },
    { type: 'bold', offset: 12, length: 4 },
    { type: 'bold', offset: 16, length: 1 },
    { type: 'bot_command', offset: 17, length: 5 },
    { type: 'bold', offset: 17, length: 3 },
  ];
  if (
    result.message.text !== 'Hi Ada, see site /help' ||
    JSON.stringify(result.message.entities) !== JSON.stringify(expectedEntities)
  ) {
    throw new Error(
      `Expected normalized text and entities, received ${JSON.stringify(result.message)}`,
    );
  }
});

Deno.test('PrivateMessagingService rejects bot text Telegram cannot normalize after the chat check', () => {
  const { virtualUsers, publishedEvents, privateMessaging } = createPrivateMessagingFixture();
  const account = createAccount(virtualUsers, 'Ada');
  const strangerAccount = createAccount(virtualUsers, 'Grace');
  const bot = createBot(virtualUsers, 'Test Bot', 'test_bot');
  sendPrivateText(privateMessaging, account.profile.id, bot);
  const send = (accountId: number, text: string, entities: readonly TextEntity[] = []) =>
    privateMessaging.sendBotMessage({
      fromBotId: bot.profile.id,
      to: { type: 'private', accountId },
      text,
      entities,
    });
  const unknownUserMention: TextEntity = {
    type: 'text_mention',
    offset: 0,
    length: 1,
    userId: 999,
  };

  const unstartedChatResult = send(strangerAccount.profile.id, ' ', [unknownUserMention]);
  if (unstartedChatResult.sent || unstartedChatResult.reason !== 'conversation_not_started') {
    throw new Error('Expected the chat to be checked before the text is normalized');
  }
  const cases: ReadonlyArray<readonly [string, readonly TextEntity[], string]> = [
    [' \n\u200b ', [], 'Text must be non-empty'],
    ['x', [unknownUserMention], 'User not found'],
    [
      'x',
      [{ type: 'text_link', offset: 0, length: 1, url: 'localhost' }],
      "Entity URL 'localhost' is invalid: Wrong HTTP URL",
    ],
    [
      'x',
      [{ type: 'bold', offset: 0, length: 2 }],
      'Entity beginning at UTF-16 offset 0 ends after the end of the text at UTF-16 offset 2',
    ],
  ];
  for (const [text, entities, expectedError] of cases) {
    const result = send(account.profile.id, text, entities);
    if (result.sent || result.reason !== 'text_invalid' || result.textError !== expectedError) {
      throw new Error(
        `Expected ${JSON.stringify(text)} to fail with ${expectedError}, received ${
          JSON.stringify(result)
        }`,
      );
    }
  }

  // Length counts the normalized text, so trailing whitespace does not make text too long.
  const longResult = send(account.profile.id, `${'x'.repeat(MAX_TEXT_MESSAGE_LENGTH)}  `);
  if (!longResult.sent) {
    throw new Error(
      `Expected trimmed text at the length limit to be sent, received ${
        JSON.stringify(longResult)
      }`,
    );
  }
  if (publishedEvents.length !== 2) {
    throw new Error('Expected rejected bot messages not to be stored or published');
  }
});

Deno.test('PrivateMessagingService normalizes account text as a Telegram client does', () => {
  const { virtualUsers, publishedEvents, privateMessaging } = createPrivateMessagingFixture();
  const account = createAccount(virtualUsers, 'Ada');
  const bot = createBot(virtualUsers, 'Test Bot', 'test_bot');
  const send = (text: string) =>
    privateMessaging.sendAccountMessage({
      fromAccountId: account.profile.id,
      to: { type: 'private', botId: bot.profile.id },
      text,
    });

  const result = send('  /start\r\n');
  if (
    !result.sent || result.message.text !== '/start' ||
    JSON.stringify(result.message.entities) !==
      JSON.stringify([{ type: 'bot_command', offset: 0, length: 6 }])
  ) {
    throw new Error(`Expected trimmed text with its command, received ${JSON.stringify(result)}`);
  }
  const blankResult = send(' \n ');
  if (
    blankResult.sent || blankResult.reason !== 'text_invalid' ||
    blankResult.textError !== 'Text must be non-empty' || publishedEvents.length !== 1
  ) {
    throw new Error(`Expected blank text to be rejected, received ${JSON.stringify(blankResult)}`);
  }
});

Deno.test('PrivateMessagingService treats changed entities as an edit of the text', () => {
  const { virtualUsers, userMessageBoxes, privateMessaging, advanceClockSeconds } =
    createPrivateMessagingFixture();
  const account = createAccount(virtualUsers, 'Ada');
  const bot = createBot(virtualUsers, 'Test Bot', 'test_bot');
  sendPrivateText(privateMessaging, account.profile.id, bot);
  const botMessage = sendBotMessage(privateMessaging, account.profile.id, bot);
  const botMessageId = expectBotMessageId(userMessageBoxes, bot, botMessage.id);
  const editText = (entities: readonly TextEntity[]) =>
    privateMessaging.editBotMessageText({
      fromBotId: bot.profile.id,
      chat: { type: 'private', accountId: account.profile.id },
      botMessageId,
      text: botMessage.text,
      entities,
    });
  advanceClockSeconds(5);

  const boldEdit = editText([{ type: 'bold', offset: 0, length: 8 }]);
  if (
    !boldEdit.edited || boldEdit.message.textEditedAtUnixSeconds !== 1_700_000_005 ||
    JSON.stringify(boldEdit.message.entities) !==
      JSON.stringify([{ type: 'bold', offset: 0, length: 8 }])
  ) {
    throw new Error(
      `Expected formatting alone to be a dated edit, received ${JSON.stringify(boldEdit)}`,
    );
  }
  const repeatedEdit = editText([{ type: 'bold', offset: 0, length: 4 }, {
    type: 'bold',
    offset: 4,
    length: 4,
  }]);
  if (repeatedEdit.edited || repeatedEdit.reason !== 'message_not_modified') {
    throw new Error(
      `Expected formatting that normalizes to the same entities to be no edit, received ${
        JSON.stringify(repeatedEdit)
      }`,
    );
  }
});

Deno.test('PrivateMessagingService lets a bot show chat actions only in started chats', () => {
  const { virtualUsers, publishedEvents, privateMessaging } = createPrivateMessagingFixture();
  const account = createAccount(virtualUsers, 'Ada');
  const strangerAccount = createAccount(virtualUsers, 'Grace');
  const bot = createBot(virtualUsers, 'Test Bot', 'test_bot');
  sendPrivateText(privateMessaging, account.profile.id, bot);
  const sendAction = (fromBotId: number, accountId: number) =>
    privateMessaging.sendBotChatAction({
      fromBotId,
      to: { type: 'private', accountId },
      action: 'typing',
    });

  const cases = [
    [sendAction(bot.profile.id, account.profile.id), undefined],
    [sendAction(999, account.profile.id), 'bot_not_found'],
    [sendAction(bot.profile.id, 999), 'account_not_found'],
    [sendAction(bot.profile.id, strangerAccount.profile.id), 'conversation_not_started'],
  ] as const;
  for (const [result, expectedReason] of cases) {
    const reason = result.sent ? undefined : result.reason;
    if (reason !== expectedReason) {
      throw new Error(
        `Expected ${expectedReason ?? 'success'}, received ${JSON.stringify(result)}`,
      );
    }
  }
  if (publishedEvents.length !== 1) {
    throw new Error('Expected chat actions not to store or publish anything');
  }
});

const COLOR_KEYBOARD: ReplyInterfaceMarkup = {
  kind: 'reply_keyboard',
  rows: [[{ text: 'Red' }, { text: 'Green' }]],
  isPersistent: false,
  resizesToFit: true,
  isOneTime: true,
};

const YES_NO_KEYBOARD: InlineKeyboard = [[
  { kind: 'callback', text: 'Yes', callbackData: 'yes' },
  { kind: 'callback', text: 'No', callbackData: 'no' },
]];

function sendBotMessage(
  privateMessaging: PrivateMessagingService,
  accountId: number,
  bot: VirtualBot,
  inlineKeyboard?: InlineKeyboard,
): PrivateTextMessage {
  const result = privateMessaging.sendBotMessage({
    fromBotId: bot.profile.id,
    to: { type: 'private', accountId },
    text: 'Continue?',
    inlineKeyboard,
  });
  if (!result.sent) {
    throw new Error(`Expected the bot message to be sent, received ${result.reason}`);
  }
  return result.message;
}

function expectBotMessageId(
  userMessageBoxes: UserMessageBoxRepository,
  bot: VirtualBot,
  canonicalMessageId: string,
): number {
  const botMessageId = userMessageBoxes.getMessageId(bot.profile.id, canonicalMessageId);
  if (botMessageId === undefined) {
    throw new Error(`Expected message ${canonicalMessageId} in the bot's message box`);
  }
  return botMessageId;
}

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
    botMessageViews: new BotMessageViewService({ accounts, bots, userMessageBoxes, messages }),
    botUpdates,
    updateSubscriptions: new BotUpdateSubscriptionRepository(),
  });
  const publishedEvents: ChatDomainEvent[] = [];
  let currentUnixTimeSeconds = 1_700_000_000;
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
    currentUnixTimeSeconds: () => currentUnixTimeSeconds,
  });
  const advanceClockSeconds = (seconds: number) => {
    currentUnixTimeSeconds += seconds;
  };
  return {
    virtualUsers,
    privateConversations,
    messages,
    userMessageBoxes,
    botUpdates,
    publishedEvents,
    privateMessaging,
    advanceClockSeconds,
  };
}

function sendPrivateText(
  privateMessaging: PrivateMessagingService,
  accountId: number,
  bot: VirtualBot,
): PrivateTextMessage {
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

function messageFromUpdate(update: BotApiUpdate | undefined): BotApiPrivateTextMessage | undefined {
  return update !== undefined && 'message' in update ? update.message : undefined;
}
