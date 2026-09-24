import { AccountRepository } from '../src/repositories/account.ts';
import { BotRepository } from '../src/repositories/bot.ts';
import { FileRepository } from '../src/repositories/file.ts';
import { MessageRepository } from '../src/repositories/message.ts';
import { MessageBoxRepository } from '../src/repositories/message_box.ts';
import { SharedChatRepository } from '../src/repositories/shared_chat.ts';
import { TelegramIdentityRepository } from '../src/repositories/telegram_identity.ts';
import { SharedChatAdministrationService } from '../src/services/shared_chat_administration.ts';
import { SupergroupMessagingService } from '../src/services/supergroup_messaging.ts';
import { VirtualUserService } from '../src/services/virtual_user.ts';
import type { ChatDomainEvent } from '../src/types/chat_domain_event.ts';
import { getContentText, type SupergroupMessage } from '../src/types/virtual_message.ts';

Deno.test('SupergroupMessagingService numbers messages once for the supergroup and publishes them', () => {
  const { supergroupMessaging, messageBoxes, publishedEvents, owner, bot, supergroup } =
    createSupergroupMessagingFixture();

  const accountMessage = expectSent(supergroupMessaging.sendAccountMessage({
    fromAccountId: owner.profile.id,
    chatId: supergroup.id,
    content: { kind: 'text', text: '  /start  ' },
  }));
  const botMessage = expectSent(supergroupMessaging.sendBotMessage({
    fromBotId: bot.profile.id,
    chatId: supergroup.id,
    replyTo: { messageId: 1, allowSendingWithoutReply: false },
    isContentProtected: true,
    content: { kind: 'text', text: 'Welcome' },
  }));
  const replyToMissing = expectSent(supergroupMessaging.sendBotMessage({
    fromBotId: bot.profile.id,
    chatId: supergroup.id,
    replyTo: { messageId: 99, allowSendingWithoutReply: true },
    content: { kind: 'text', text: 'Anyone?' },
  }));

  if (
    getContentText(accountMessage.content).text !== '/start' ||
    JSON.stringify(getContentText(accountMessage.content).entities) !==
      JSON.stringify([{ type: 'bot_command', offset: 0, length: 6 }]) ||
    botMessage.replyToMessageId !== accountMessage.id || !botMessage.isContentProtected ||
    replyToMissing.replyToMessageId !== undefined
  ) {
    throw new Error('Expected normalized text, a resolved reply, and a reply sent without target');
  }
  const messageIds = [accountMessage, botMessage, replyToMissing].map((message) =>
    messageBoxes.getMessageId(supergroup.id, message.id)
  );
  if (
    JSON.stringify(messageIds) !== JSON.stringify([1, 2, 3]) ||
    messageBoxes.getMessageId(owner.profile.id, accountMessage.id) !== undefined ||
    messageBoxes.getMessageId(bot.profile.id, botMessage.id) !== undefined
  ) {
    throw new Error("Expected the supergroup's own box to number its messages");
  }
  if (
    JSON.stringify(publishedEvents.map((event) => event.type)) !==
      JSON.stringify(['message_created', 'message_created', 'message_created'])
  ) {
    throw new Error('Expected each committed message to be published');
  }
});

Deno.test('SupergroupMessagingService lets only members write and read', () => {
  const { supergroupMessaging, virtualUsers, publishedEvents, owner, bot, supergroup } =
    createSupergroupMessagingFixture();
  const stranger = createAccount(virtualUsers, 'Grace');
  const strangerBot = createBot(virtualUsers, 'stranger_bot');
  const publishedEventCount = publishedEvents.length;

  const accountFailures = [
    supergroupMessaging.sendAccountMessage({
      fromAccountId: 999,
      chatId: supergroup.id,
      content: { kind: 'text', text: 'Hi' },
    }),
    supergroupMessaging.sendAccountMessage({
      fromAccountId: owner.profile.id,
      chatId: -1_000_000_009_999,
      content: { kind: 'text', text: 'Hi' },
    }),
    supergroupMessaging.sendAccountMessage({
      fromAccountId: stranger.profile.id,
      chatId: supergroup.id,
      content: { kind: 'text', text: 'Hi' },
    }),
    supergroupMessaging.sendAccountMessage({
      fromAccountId: owner.profile.id,
      chatId: supergroup.id,
      content: { kind: 'text', text: '' },
    }),
    supergroupMessaging.sendAccountMessage({
      fromAccountId: owner.profile.id,
      chatId: supergroup.id,
      content: { kind: 'text', text: 'x'.repeat(4_097) },
    }),
    supergroupMessaging.sendAccountMessage({
      fromAccountId: owner.profile.id,
      chatId: supergroup.id,
      replyToMessageId: 1,
      content: { kind: 'text', text: 'Hi' },
    }),
  ].map((result) => result.sent ? 'sent' : result.reason);
  const botFailures = [
    supergroupMessaging.sendBotMessage({
      fromBotId: 999,
      chatId: supergroup.id,
      content: { kind: 'text', text: 'Hi' },
    }),
    supergroupMessaging.sendBotMessage({
      fromBotId: bot.profile.id,
      chatId: supergroup.id,
      content: { kind: 'text', text: '' },
    }),
    supergroupMessaging.sendBotMessage({
      fromBotId: strangerBot.profile.id,
      chatId: supergroup.id,
      content: { kind: 'text', text: 'Hi' },
    }),
    supergroupMessaging.sendBotMessage({
      fromBotId: bot.profile.id,
      chatId: supergroup.id,
      replyTo: { messageId: 1, allowSendingWithoutReply: false },
      content: { kind: 'text', text: 'Hi' },
    }),
    supergroupMessaging.sendBotMessage({
      fromBotId: bot.profile.id,
      chatId: supergroup.id,
      content: { kind: 'text', text: '   ' },
    }),
    supergroupMessaging.sendBotMessage({
      fromBotId: bot.profile.id,
      chatId: supergroup.id,
      inlineKeyboard: [[{ kind: 'callback', text: 'A', callbackData: 'a'.repeat(65) }]],
      content: { kind: 'text', text: 'Pick' },
    }),
  ].map((result) => result.sent ? 'sent' : result.reason);
  const otherFailures = [
    supergroupMessaging.sendBotChatAction({
      fromBotId: strangerBot.profile.id,
      chatId: supergroup.id,
      action: 'typing',
    }),
    supergroupMessaging.getMessageHistory({
      accountId: stranger.profile.id,
      chatId: supergroup.id,
    }),
  ].map((result) => 'reason' in result ? result.reason : 'succeeded');

  const expected = {
    accountFailures: [
      'account_not_found',
      'chat_not_found',
      'not_a_member',
      'message_text_empty',
      'message_text_too_long',
      'reply_message_not_found',
    ],
    botFailures: [
      'bot_not_found',
      'message_text_empty',
      'chat_not_found',
      'reply_message_not_found',
      'text_invalid',
      'callback_data_invalid',
    ],
    otherFailures: ['chat_not_found', 'not_a_member'],
  };
  const received = { accountFailures, botFailures, otherFailures };
  if (JSON.stringify(received) !== JSON.stringify(expected)) {
    throw new Error(`Expected member checks, received ${JSON.stringify(received)}`);
  }
  if (publishedEvents.length !== publishedEventCount) {
    throw new Error('Expected rejected messages not to be published');
  }
});

Deno.test("SupergroupMessagingService edits and deletes only the author's own messages", () => {
  const {
    supergroupMessaging,
    virtualUsers,
    sharedChatAdministration,
    publishedEvents,
    owner,
    bot,
    supergroup,
  } = createSupergroupMessagingFixture();
  const otherBot = createBot(virtualUsers, 'other_bot');
  sharedChatAdministration.addChatMember({
    actorAccountId: owner.profile.id,
    chatId: supergroup.id,
    memberId: otherBot.profile.id,
  });
  expectSent(supergroupMessaging.sendAccountMessage({
    fromAccountId: owner.profile.id,
    chatId: supergroup.id,
    content: { kind: 'text', text: 'Hello' },
  }));
  expectSent(supergroupMessaging.sendBotMessage({
    fromBotId: bot.profile.id,
    chatId: supergroup.id,
    content: { kind: 'text', text: 'Menu' },
  }));

  const editFailures = [
    supergroupMessaging.editBotMessageText({
      fromBotId: bot.profile.id,
      chatId: supergroup.id,
      messageId: 1,
      text: 'Changed',
    }),
    supergroupMessaging.editBotMessageText({
      fromBotId: otherBot.profile.id,
      chatId: supergroup.id,
      messageId: 2,
      text: 'Changed',
    }),
    supergroupMessaging.editBotMessageText({
      fromBotId: bot.profile.id,
      chatId: supergroup.id,
      messageId: 99,
      text: 'Changed',
    }),
    supergroupMessaging.editBotMessageInlineKeyboard({
      fromBotId: bot.profile.id,
      chatId: supergroup.id,
      messageId: 2,
    }),
    supergroupMessaging.editAccountMessage({
      fromAccountId: owner.profile.id,
      chatId: supergroup.id,
      messageId: 2,
      edit: { kind: 'text', text: 'Changed' },
    }),
    supergroupMessaging.editAccountMessage({
      fromAccountId: owner.profile.id,
      chatId: supergroup.id,
      messageId: 1,
      edit: { kind: 'text', text: 'Hello' },
    }),
  ].map((result) => result.edited ? 'edited' : result.reason);
  const deletionFailures = [
    supergroupMessaging.deleteMessagesByBot({
      fromBotId: bot.profile.id,
      chatId: supergroup.id,
      messageIds: [2, 1],
    }),
    supergroupMessaging.deleteMessagesByBot({
      fromBotId: otherBot.profile.id,
      chatId: supergroup.id,
      messageIds: [2],
    }),
  ].map((result) => result.deleted ? 'deleted' : result.reason);
  const expectedFailures = {
    editFailures: [
      'message_not_editable',
      'message_not_editable',
      'message_not_found',
      'message_not_modified',
      'message_not_editable',
      'message_not_modified',
    ],
    deletionFailures: ['message_not_deletable', 'message_not_deletable'],
  };
  if (JSON.stringify({ editFailures, deletionFailures }) !== JSON.stringify(expectedFailures)) {
    throw new Error(
      `Expected authorship checks, received ${JSON.stringify({ editFailures, deletionFailures })}`,
    );
  }

  const publishedEventCount = publishedEvents.length;
  const accountEdit = supergroupMessaging.editAccountMessage({
    fromAccountId: owner.profile.id,
    chatId: supergroup.id,
    messageId: 1,
    edit: { kind: 'text', text: 'Hello /help' },
  });
  const deletion = supergroupMessaging.deleteMessagesByBot({
    fromBotId: bot.profile.id,
    chatId: supergroup.id,
    messageIds: [2, 2, 99],
  });
  const history = supergroupMessaging.getMessageHistory({
    accountId: owner.profile.id,
    chatId: supergroup.id,
  });
  if (
    !accountEdit.edited || accountEdit.message.contentEditedAtUnixSeconds !== 1_700_000_000 ||
    publishedEvents.at(-1)?.type !== 'message_edited' ||
    publishedEvents.length !== publishedEventCount + 1 ||
    !deletion.deleted || deletion.deletedMessageCount !== 1 ||
    !history.found ||
    JSON.stringify(history.messages.map(({ content }) => getContentText(content).text)) !==
      JSON.stringify(['Hello /help'])
  ) {
    throw new Error('Expected the account edit to be published and the bot message deleted');
  }
});

function createSupergroupMessagingFixture() {
  const identities = new TelegramIdentityRepository();
  const accounts = new AccountRepository();
  const bots = new BotRepository();
  const virtualUsers = new VirtualUserService({ identities, accounts, bots });
  const sharedChats = new SharedChatRepository();
  const messageBoxes = new MessageBoxRepository();
  const publishedEvents: ChatDomainEvent[] = [];
  const events = { publish: (event: ChatDomainEvent) => publishedEvents.push(event) };
  const currentUnixTimeSeconds = () => 1_700_000_000;
  const sharedChatAdministration = new SharedChatAdministrationService({
    identities,
    accounts,
    bots,
    sharedChats,
    events,
    currentUnixTimeSeconds,
  });
  const supergroupMessaging = new SupergroupMessagingService({
    accounts,
    bots,
    sharedChats,
    messages: new MessageRepository(),
    files: new FileRepository(),
    messageBoxes,
    events,
    currentUnixTimeSeconds,
  });

  const owner = createAccount(virtualUsers, 'Ada');
  const bot = createBot(virtualUsers, 'test_bot');
  const creation = sharedChatAdministration.createSupergroup({
    title: 'Team',
    creatorAccountId: owner.profile.id,
  });
  if (!creation.created) {
    throw new Error(`Expected the supergroup to be created, received ${creation.reason}`);
  }
  const addition = sharedChatAdministration.addChatMember({
    actorAccountId: owner.profile.id,
    chatId: creation.supergroup.id,
    memberId: bot.profile.id,
  });
  if (!addition.added) {
    throw new Error(`Expected the bot to be added, received ${addition.reason}`);
  }
  publishedEvents.splice(0);

  return {
    virtualUsers,
    sharedChatAdministration,
    supergroupMessaging,
    messageBoxes,
    publishedEvents,
    owner,
    bot,
    supergroup: creation.supergroup,
  };
}

function expectSent(
  result:
    | { readonly sent: true; readonly message: SupergroupMessage }
    | { readonly sent: false; readonly reason: string },
): SupergroupMessage {
  if (!result.sent) {
    throw new Error(`Expected the message to be sent, received ${result.reason}`);
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

function createBot(virtualUsers: VirtualUserService, username: string) {
  const result = virtualUsers.createBot({ first_name: 'Test Bot', username });
  if (!result.created) {
    throw new Error(`Expected bot creation to succeed, received ${result.reason}`);
  }
  return result.bot;
}
