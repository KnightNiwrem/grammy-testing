import { AccountRepository } from '../src/repositories/account.ts';
import { BotRepository } from '../src/repositories/bot.ts';
import { BotUpdateRepository } from '../src/repositories/bot_update.ts';
import { ChatRepository } from '../src/repositories/chat.ts';
import { MessageRepository } from '../src/repositories/message.ts';
import { TelegramIdentityRepository } from '../src/repositories/telegram_identity.ts';
import { UserMessageBoxRepository } from '../src/repositories/user_message_box.ts';
import { BotUpdateDeliveryService } from '../src/services/bot_update_delivery.ts';
import {
  type AddChatMemberFailureReason,
  type AddChatMemberResult,
  type BasicGroupCreationFailureReason,
  type BasicGroupCreationResult,
  type ChannelCreationResult,
  ChatInteractionService,
  type SupergroupCreationResult,
} from '../src/services/chat_interaction.ts';
import { VirtualUserService } from '../src/services/virtual_user.ts';
import type { BotApiPrivateTextMessage } from '../src/types/bot_api.ts';
import type { ChatDomainEvent } from '../src/types/chat_domain_event.ts';
import { MAX_TEXT_MESSAGE_LENGTH } from '../src/types/virtual_message.ts';
import type { ChatMembership } from '../src/types/chat_membership.ts';
import type { BasicGroup, Channel, Supergroup } from '../src/types/virtual_chat.ts';
import type { VirtualBot } from '../src/types/virtual_bot.ts';

Deno.test('ChatInteractionService activates a private conversation for known participants', () => {
  const { virtualUsers, chats, chatInteractions } = createChatInteractionFixture();
  const account = createAccount(virtualUsers, 'Ada');
  const bot = createBot(virtualUsers, 'First Bot', 'first_bot');

  const activation = chatInteractions.activatePrivateConversation({
    accountId: account.profile.id,
    botId: bot.profile.id,
  });
  if (!activation.activated) {
    throw new Error(`Expected activation to succeed, received ${activation.reason}`);
  }
  if (
    chats.getPrivateConversation({
      accountId: account.profile.id,
      botId: bot.profile.id,
    }) !== activation.conversation
  ) {
    throw new Error('Expected activation to store the canonical private conversation');
  }
});

Deno.test('ChatInteractionService rejects unknown private conversation participants', () => {
  const { virtualUsers, chats, chatInteractions } = createChatInteractionFixture();
  const account = createAccount(virtualUsers, 'Ada');
  const bot = createBot(virtualUsers, 'First Bot', 'first_bot');

  const missingAccount = chatInteractions.activatePrivateConversation({
    accountId: 999,
    botId: bot.profile.id,
  });
  if (missingAccount.activated || missingAccount.reason !== 'account_not_found') {
    throw new Error('Expected an unknown account to be rejected');
  }

  const missingBot = chatInteractions.activatePrivateConversation({
    accountId: account.profile.id,
    botId: 999,
  });
  if (missingBot.activated || missingBot.reason !== 'bot_not_found') {
    throw new Error('Expected an unknown bot to be rejected');
  }
  if (
    chats.getPrivateConversation({ accountId: 999, botId: bot.profile.id }) !== undefined ||
    chats.getPrivateConversation({ accountId: account.profile.id, botId: 999 }) !== undefined
  ) {
    throw new Error('Expected rejected activations not to create conversations');
  }
});

Deno.test('ChatInteractionService creates a basic group with its initial participants', () => {
  const { virtualUsers, identities, chats, chatInteractions } = createChatInteractionFixture();
  const creator = createAccount(virtualUsers, 'Ada');
  const member = createAccount(virtualUsers, 'Grace');
  const bot = createBot(virtualUsers, 'Test Bot', 'test_bot');

  const creation = chatInteractions.createBasicGroup({
    title: 'Test Group',
    creatorAccountId: creator.profile.id,
    initialMemberIds: [member.profile.id, bot.profile.id],
  });
  const group = getCreatedBasicGroup(creation);
  if (group.id !== -1) {
    throw new Error('Expected the first basic group to receive ID -1');
  }
  if (identities.getById(group.id)?.kind !== 'basic_group') {
    throw new Error('Expected the group ID to belong to a reserved basic-group identity');
  }
  if (chats.getSharedChat(group.id) !== group) {
    throw new Error('Expected the created group to be stored as the canonical shared chat');
  }
  assertMembershipStatus(chats.getChatMembership(group.id, creator.profile.id)?.status, 'owner');
  assertMembershipStatus(chats.getChatMembership(group.id, member.profile.id)?.status, 'member');
  assertMembershipStatus(chats.getChatMembership(group.id, bot.profile.id)?.status, 'member');
});

Deno.test('ChatInteractionService validates basic-group participants before reserving an ID', () => {
  const { virtualUsers, chatInteractions } = createChatInteractionFixture();
  const creator = createAccount(virtualUsers, 'Ada');
  const member = createAccount(virtualUsers, 'Grace');

  const missingCreator = chatInteractions.createBasicGroup({
    title: 'Missing Creator',
    creatorAccountId: 999,
    initialMemberIds: [],
  });
  assertBasicGroupCreationFailure(missingCreator, 'creator_account_not_found');

  const ownerRepeatedAsMember = chatInteractions.createBasicGroup({
    title: 'Repeated Owner',
    creatorAccountId: creator.profile.id,
    initialMemberIds: [creator.profile.id],
  });
  assertBasicGroupCreationFailure(ownerRepeatedAsMember, 'initial_members_not_unique');

  const duplicateMembers = chatInteractions.createBasicGroup({
    title: 'Duplicate Members',
    creatorAccountId: creator.profile.id,
    initialMemberIds: [member.profile.id, member.profile.id],
  });
  assertBasicGroupCreationFailure(duplicateMembers, 'initial_members_not_unique');

  const missingMember = chatInteractions.createBasicGroup({
    title: 'Missing Member',
    creatorAccountId: creator.profile.id,
    initialMemberIds: [999],
  });
  assertBasicGroupCreationFailure(missingMember, 'initial_member_not_found');

  const validCreation = chatInteractions.createBasicGroup({
    title: 'First Valid Group',
    creatorAccountId: creator.profile.id,
    initialMemberIds: [member.profile.id],
  });
  if (getCreatedBasicGroup(validCreation).id !== -1) {
    throw new Error('Expected rejected creation attempts not to consume a basic-group ID');
  }
});

Deno.test('ChatInteractionService creates owner-only supergroups and channels', () => {
  const { virtualUsers, identities, chats, chatInteractions } = createChatInteractionFixture();
  const creator = createAccount(virtualUsers, 'Ada');
  const nonMember = createAccount(virtualUsers, 'Grace');

  const supergroup = getCreatedSupergroup(chatInteractions.createSupergroup({
    title: 'Test Supergroup',
    description: 'Supergroup description',
    creatorAccountId: creator.profile.id,
  }));
  const channel = getCreatedChannel(chatInteractions.createChannel({
    title: 'Test Channel',
    creatorAccountId: creator.profile.id,
  }));

  assertSharedChatIds(supergroup, channel);
  assertSharedChatDescriptions(supergroup, channel);
  assertSharedChatIdentityKind(identities, supergroup, 'supergroup');
  assertSharedChatIdentityKind(identities, channel, 'channel');
  assertStoredOwnerOnlyChat(
    chats,
    supergroup,
    creator.profile.id,
    nonMember.profile.id,
  );
  assertStoredOwnerOnlyChat(
    chats,
    channel,
    creator.profile.id,
    nonMember.profile.id,
  );
});

Deno.test('ChatInteractionService validates owners before reserving shared-chat IDs', () => {
  const { virtualUsers, chatInteractions } = createChatInteractionFixture();

  const missingSupergroupOwner = chatInteractions.createSupergroup({
    title: 'Missing Owner',
    creatorAccountId: 999,
  });
  assertOwnerOnlyChatCreationFailure(missingSupergroupOwner, 'creator_account_not_found');

  const missingChannelOwner = chatInteractions.createChannel({
    title: 'Missing Owner',
    creatorAccountId: 999,
  });
  assertOwnerOnlyChatCreationFailure(missingChannelOwner, 'creator_account_not_found');

  const creator = createAccount(virtualUsers, 'Ada');
  const validChannel = getCreatedChannel(chatInteractions.createChannel({
    title: 'First Valid Shared Chat',
    creatorAccountId: creator.profile.id,
  }));
  if (validChannel.id !== -1_000_000_000_001) {
    throw new Error('Expected rejected creations not to consume a shared-chat ID');
  }
});

Deno.test('ChatInteractionService adds permitted members to shared chats', () => {
  const { virtualUsers, chats, chatInteractions } = createChatInteractionFixture();
  const owner = createAccount(virtualUsers, 'Ada');
  const account = createAccount(virtualUsers, 'Grace');
  const bot = createBot(virtualUsers, 'Test Bot', 'test_bot');
  const basicGroup = getCreatedBasicGroup(chatInteractions.createBasicGroup({
    title: 'Test Group',
    creatorAccountId: owner.profile.id,
    initialMemberIds: [],
  }));
  const supergroup = getCreatedSupergroup(chatInteractions.createSupergroup({
    title: 'Test Supergroup',
    creatorAccountId: owner.profile.id,
  }));
  const channel = getCreatedChannel(chatInteractions.createChannel({
    title: 'Test Channel',
    creatorAccountId: owner.profile.id,
  }));

  assertMemberAdded(chatInteractions.addChatMember({
    actorAccountId: owner.profile.id,
    chatId: basicGroup.id,
    memberId: bot.profile.id,
  }));
  assertMemberAdded(chatInteractions.addChatMember({
    actorAccountId: owner.profile.id,
    chatId: supergroup.id,
    memberId: bot.profile.id,
  }));
  assertMemberAdded(chatInteractions.addChatMember({
    actorAccountId: owner.profile.id,
    chatId: channel.id,
    memberId: account.profile.id,
  }));

  assertMembershipStatus(chats.getChatMembership(basicGroup.id, bot.profile.id)?.status, 'member');
  assertMembershipStatus(chats.getChatMembership(supergroup.id, bot.profile.id)?.status, 'member');
  assertMembershipStatus(chats.getChatMembership(channel.id, account.profile.id)?.status, 'member');
});

Deno.test('ChatInteractionService validates member additions before changing chat state', () => {
  const { virtualUsers, chats, chatInteractions } = createChatInteractionFixture();
  const owner = createAccount(virtualUsers, 'Ada');
  const existingMember = createAccount(virtualUsers, 'Grace');
  const candidate = createAccount(virtualUsers, 'Linus');
  const bot = createBot(virtualUsers, 'Test Bot', 'test_bot');
  const channel = getCreatedChannel(chatInteractions.createChannel({
    title: 'Test Channel',
    creatorAccountId: owner.profile.id,
  }));
  assertMemberAdded(chatInteractions.addChatMember({
    actorAccountId: owner.profile.id,
    chatId: channel.id,
    memberId: existingMember.profile.id,
  }));

  assertMemberAdditionFailure(
    chatInteractions.addChatMember({
      actorAccountId: 999,
      chatId: channel.id,
      memberId: candidate.profile.id,
    }),
    'actor_account_not_found',
  );
  assertMemberAdditionFailure(
    chatInteractions.addChatMember({
      actorAccountId: owner.profile.id,
      chatId: -999,
      memberId: candidate.profile.id,
    }),
    'chat_not_found',
  );
  assertMemberAdditionFailure(
    chatInteractions.addChatMember({
      actorAccountId: existingMember.profile.id,
      chatId: channel.id,
      memberId: candidate.profile.id,
    }),
    'actor_not_authorized',
  );
  assertMemberAdditionFailure(
    chatInteractions.addChatMember({
      actorAccountId: owner.profile.id,
      chatId: channel.id,
      memberId: 999,
    }),
    'member_not_found',
  );
  assertMemberAdditionFailure(
    chatInteractions.addChatMember({
      actorAccountId: owner.profile.id,
      chatId: channel.id,
      memberId: bot.profile.id,
    }),
    'bot_not_permitted_in_channel',
  );
  assertMemberAdditionFailure(
    chatInteractions.addChatMember({
      actorAccountId: owner.profile.id,
      chatId: channel.id,
      memberId: existingMember.profile.id,
    }),
    'member_already_present',
  );

  if (
    chats.getChatMembership(channel.id, candidate.profile.id) !== undefined ||
    chats.getChatMembership(channel.id, bot.profile.id) !== undefined
  ) {
    throw new Error('Expected rejected member additions not to change chat memberships');
  }
});

Deno.test('ChatInteractionService sends and stores private account messages', async () => {
  const { virtualUsers, chats, messages, botUpdates, chatInteractions } =
    createChatInteractionFixture();
  const account = createAccount(virtualUsers, 'Ada');
  const bot = createBot(virtualUsers, 'Test Bot', 'test_bot');

  const firstResult = chatInteractions.sendMessage({
    fromAccountId: account.profile.id,
    to: { type: 'private', botId: bot.profile.id },
    text: 'Hello',
  });
  if (!firstResult.sent) {
    throw new Error(`Expected message send to succeed, received ${firstResult.reason}`);
  }
  const secondResult = chatInteractions.sendMessage({
    fromAccountId: account.profile.id,
    to: { type: 'private', botId: bot.profile.id },
    text: 'Again',
  });
  if (!secondResult.sent) {
    throw new Error(`Expected message send to succeed, received ${secondResult.reason}`);
  }

  if (
    chats.getPrivateConversation({ accountId: account.profile.id, botId: bot.profile.id }) ===
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

  const history = chatInteractions.getPrivateMessageHistory({
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

  const updates = await botUpdates.getUpdates(bot.profile.id, {
    limit: 100,
    timeoutSeconds: 0,
  });
  if (
    updates.length !== 2 ||
    !haveSameBotApiView(updates[0].message, firstResult.message) ||
    !haveSameBotApiView(updates[1].message, secondResult.message)
  ) {
    throw new Error('Expected each sent message to enqueue one update for the target bot');
  }
});

Deno.test('ChatInteractionService numbers private messages in each bot message box', async () => {
  const { virtualUsers, botUpdates, chatInteractions } = createChatInteractionFixture();
  const account = createAccount(virtualUsers, 'Ada');
  const firstBot = createBot(virtualUsers, 'First Bot', 'first_bot');
  const secondBot = createBot(virtualUsers, 'Second Bot', 'second_bot');

  const firstBotFirstMessage = sendPrivateText(chatInteractions, account.profile.id, firstBot);
  const secondBotFirstMessage = sendPrivateText(chatInteractions, account.profile.id, secondBot);
  const firstBotSecondMessage = sendPrivateText(chatInteractions, account.profile.id, firstBot);

  if (
    firstBotFirstMessage.message_id !== 1 ||
    secondBotFirstMessage.message_id !== 1 ||
    firstBotSecondMessage.message_id !== 2
  ) {
    throw new Error('Expected each bot to number messages from its own message box');
  }
  const secondBotUpdates = await botUpdates.getUpdates(secondBot.profile.id, {
    limit: 100,
    timeoutSeconds: 0,
  });
  if (secondBotUpdates.length !== 1 || secondBotUpdates[0].message.message_id !== 1) {
    throw new Error("Expected the bot's update to carry its own message ID");
  }
  const firstBotHistory = chatInteractions.getPrivateMessageHistory({
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

Deno.test('ChatInteractionService continues a bot message box across private chats', () => {
  const { virtualUsers, chatInteractions } = createChatInteractionFixture();
  const firstAccount = createAccount(virtualUsers, 'Ada');
  const secondAccount = createAccount(virtualUsers, 'Grace');
  const bot = createBot(virtualUsers, 'Test Bot', 'test_bot');

  const messageIds = [firstAccount, secondAccount, firstAccount].map((account) =>
    sendPrivateText(chatInteractions, account.profile.id, bot).message_id
  );

  if (messageIds.join() !== '1,2,3') {
    throw new Error('Expected a new private chat to continue the bot message ID sequence');
  }
});

Deno.test('ChatInteractionService adds private messages to the sending account message box', () => {
  const { virtualUsers, messages, userMessageBoxes, chatInteractions } =
    createChatInteractionFixture();
  const account = createAccount(virtualUsers, 'Ada');
  const firstBot = createBot(virtualUsers, 'First Bot', 'first_bot');
  const secondBot = createBot(virtualUsers, 'Second Bot', 'second_bot');

  sendPrivateText(chatInteractions, account.profile.id, firstBot);
  sendPrivateText(chatInteractions, account.profile.id, secondBot);

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

Deno.test('ChatInteractionService publishes a created event for each sent message', () => {
  const { virtualUsers, messages, publishedEvents, chatInteractions } =
    createChatInteractionFixture();
  const account = createAccount(virtualUsers, 'Ada');
  const bot = createBot(virtualUsers, 'Test Bot', 'test_bot');

  const rejectedResult = chatInteractions.sendMessage({
    fromAccountId: account.profile.id,
    to: { type: 'private', botId: bot.profile.id },
    text: '',
  });
  if (rejectedResult.sent) {
    throw new Error('Expected an empty message to be rejected');
  }
  sendPrivateText(chatInteractions, account.profile.id, bot);

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

Deno.test('ChatInteractionService validates private messages before changing state', async () => {
  const { virtualUsers, chats, messages, botUpdates, chatInteractions } =
    createChatInteractionFixture();
  const account = createAccount(virtualUsers, 'Ada');
  const bot = createBot(virtualUsers, 'Test Bot', 'test_bot');

  const failures = [
    chatInteractions.sendMessage({
      fromAccountId: 999,
      to: { type: 'private', botId: bot.profile.id },
      text: 'Hello',
    }),
    chatInteractions.sendMessage({
      fromAccountId: account.profile.id,
      to: { type: 'private', botId: 999 },
      text: 'Hello',
    }),
    chatInteractions.sendMessage({
      fromAccountId: account.profile.id,
      to: { type: 'private', botId: bot.profile.id },
      text: '',
    }),
    chatInteractions.sendMessage({
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
    chats.getPrivateConversation({ accountId: account.profile.id, botId: bot.profile.id }) !==
      undefined ||
    messages.getPrivateConversationMessages({
        accountId: account.profile.id,
        botId: bot.profile.id,
      }).length !== 0 ||
    (await botUpdates.getUpdates(bot.profile.id, { limit: 100, timeoutSeconds: 0 })).length !== 0
  ) {
    throw new Error('Expected rejected messages not to change conversation state');
  }
});

function getCreatedBasicGroup(result: BasicGroupCreationResult): BasicGroup {
  if (!result.created) {
    throw new Error(`Expected group creation to succeed, received ${result.reason}`);
  }
  return result.group;
}

function getCreatedSupergroup(result: SupergroupCreationResult): Supergroup {
  if (!result.created) {
    throw new Error(`Expected supergroup creation to succeed, received ${result.reason}`);
  }
  return result.supergroup;
}

function getCreatedChannel(result: ChannelCreationResult): Channel {
  if (!result.created) {
    throw new Error(`Expected channel creation to succeed, received ${result.reason}`);
  }
  return result.channel;
}

function assertBasicGroupCreationFailure(
  result: BasicGroupCreationResult,
  expectedReason: BasicGroupCreationFailureReason,
): void {
  if (result.created || result.reason !== expectedReason) {
    throw new Error(`Expected basic-group creation to fail with ${expectedReason}`);
  }
}

function assertOwnerOnlyChatCreationFailure(
  result: SupergroupCreationResult | ChannelCreationResult,
  expectedReason: 'creator_account_not_found' | 'identity_limit_reached',
): void {
  if (result.created || result.reason !== expectedReason) {
    throw new Error(`Expected shared-chat creation to fail with ${expectedReason}`);
  }
}

function assertMemberAdded(result: AddChatMemberResult): void {
  if (!result.added) {
    throw new Error(`Expected member addition to succeed, received ${result.reason}`);
  }
}

function assertMemberAdditionFailure(
  result: AddChatMemberResult,
  expectedReason: AddChatMemberFailureReason,
): void {
  if (result.added || result.reason !== expectedReason) {
    throw new Error(`Expected member addition to fail with ${expectedReason}`);
  }
}

function assertSharedChatIds(supergroup: Supergroup, channel: Channel): void {
  if (
    supergroup.id !== -1_000_000_000_001 ||
    channel.id !== -1_000_000_000_002
  ) {
    throw new Error('Expected supergroups and channels to share their descending ID sequence');
  }
}

function assertSharedChatDescriptions(supergroup: Supergroup, channel: Channel): void {
  if (
    supergroup.description !== 'Supergroup description' ||
    channel.description !== undefined
  ) {
    throw new Error('Expected shared-chat descriptions to preserve their creation inputs');
  }
}

function assertSharedChatIdentityKind(
  identities: TelegramIdentityRepository,
  chat: Supergroup | Channel,
  expectedKind: 'supergroup' | 'channel',
): void {
  if (identities.getById(chat.id)?.kind !== expectedKind) {
    throw new Error(`Expected the shared-chat identity kind to be ${expectedKind}`);
  }
}

function assertStoredOwnerOnlyChat(
  chats: ChatRepository,
  chat: Supergroup | Channel,
  ownerAccountId: number,
  nonMemberAccountId: number,
): void {
  if (chats.getSharedChat(chat.id) !== chat) {
    throw new Error('Expected the created shared chat to be stored canonically');
  }
  assertMembershipStatus(chats.getChatMembership(chat.id, ownerAccountId)?.status, 'owner');
  if (chats.getChatMembership(chat.id, nonMemberAccountId) !== undefined) {
    throw new Error('Expected an owner-only shared chat not to add other accounts at creation');
  }
}

function assertMembershipStatus(
  actualStatus: ChatMembership['status'] | undefined,
  expectedStatus: ChatMembership['status'],
): void {
  if (actualStatus !== expectedStatus) {
    throw new Error(`Expected ${expectedStatus} membership, received ${actualStatus}`);
  }
}

function createChatInteractionFixture() {
  const identities = new TelegramIdentityRepository();
  const accounts = new AccountRepository();
  const bots = new BotRepository();
  const virtualUsers = new VirtualUserService({ identities, accounts, bots });
  const chats = new ChatRepository();
  const messages = new MessageRepository();
  const userMessageBoxes = new UserMessageBoxRepository();
  const botUpdates = new BotUpdateRepository();
  const botUpdateDelivery = new BotUpdateDeliveryService({
    accounts,
    userMessageBoxes,
    botUpdates,
  });
  const publishedEvents: ChatDomainEvent[] = [];
  const chatInteractions = new ChatInteractionService({
    identities,
    accounts,
    bots,
    chats,
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
    identities,
    virtualUsers,
    chats,
    messages,
    userMessageBoxes,
    botUpdates,
    publishedEvents,
    chatInteractions,
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
  chatInteractions: ChatInteractionService,
  accountId: number,
  bot: VirtualBot,
): BotApiPrivateTextMessage {
  const result = chatInteractions.sendMessage({
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
