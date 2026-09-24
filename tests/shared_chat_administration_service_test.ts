import { AccountRepository } from '../src/repositories/account.ts';
import { BotRepository } from '../src/repositories/bot.ts';
import { SharedChatRepository } from '../src/repositories/shared_chat.ts';
import { TelegramIdentityRepository } from '../src/repositories/telegram_identity.ts';
import {
  type AddChatMemberFailureReason,
  type AddChatMemberResult,
  type BasicGroupCreationFailureReason,
  type BasicGroupCreationResult,
  type ChannelCreationResult,
  SharedChatAdministrationService,
  type SupergroupCreationResult,
} from '../src/services/shared_chat_administration.ts';
import { VirtualUserService } from '../src/services/virtual_user.ts';
import type { ChatMembership } from '../src/types/chat_membership.ts';
import type { BasicGroup, Channel, Supergroup } from '../src/types/virtual_chat.ts';

Deno.test('SharedChatAdministrationService creates a basic group with its initial participants', () => {
  const { virtualUsers, identities, sharedChats, sharedChatAdministration } =
    createSharedChatAdministrationFixture();
  const creator = createAccount(virtualUsers, 'Ada');
  const member = createAccount(virtualUsers, 'Grace');
  const bot = createBot(virtualUsers, 'Test Bot', 'test_bot');

  const creation = sharedChatAdministration.createBasicGroup({
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
  if (sharedChats.getSharedChat(group.id) !== group) {
    throw new Error('Expected the created group to be stored as the canonical shared chat');
  }
  assertMembershipStatus(
    sharedChats.getChatMembership(group.id, creator.profile.id)?.status,
    'owner',
  );
  assertMembershipStatus(
    sharedChats.getChatMembership(group.id, member.profile.id)?.status,
    'member',
  );
  assertMembershipStatus(sharedChats.getChatMembership(group.id, bot.profile.id)?.status, 'member');
});

Deno.test('SharedChatAdministrationService validates basic-group participants before reserving an ID', () => {
  const { virtualUsers, sharedChatAdministration } = createSharedChatAdministrationFixture();
  const creator = createAccount(virtualUsers, 'Ada');
  const member = createAccount(virtualUsers, 'Grace');

  const missingCreator = sharedChatAdministration.createBasicGroup({
    title: 'Missing Creator',
    creatorAccountId: 999,
    initialMemberIds: [],
  });
  assertBasicGroupCreationFailure(missingCreator, 'creator_account_not_found');

  const ownerRepeatedAsMember = sharedChatAdministration.createBasicGroup({
    title: 'Repeated Owner',
    creatorAccountId: creator.profile.id,
    initialMemberIds: [creator.profile.id],
  });
  assertBasicGroupCreationFailure(ownerRepeatedAsMember, 'initial_members_not_unique');

  const duplicateMembers = sharedChatAdministration.createBasicGroup({
    title: 'Duplicate Members',
    creatorAccountId: creator.profile.id,
    initialMemberIds: [member.profile.id, member.profile.id],
  });
  assertBasicGroupCreationFailure(duplicateMembers, 'initial_members_not_unique');

  const missingMember = sharedChatAdministration.createBasicGroup({
    title: 'Missing Member',
    creatorAccountId: creator.profile.id,
    initialMemberIds: [999],
  });
  assertBasicGroupCreationFailure(missingMember, 'initial_member_not_found');

  const validCreation = sharedChatAdministration.createBasicGroup({
    title: 'First Valid Group',
    creatorAccountId: creator.profile.id,
    initialMemberIds: [member.profile.id],
  });
  if (getCreatedBasicGroup(validCreation).id !== -1) {
    throw new Error('Expected rejected creation attempts not to consume a basic-group ID');
  }
});

Deno.test('SharedChatAdministrationService creates owner-only supergroups and channels', () => {
  const { virtualUsers, identities, sharedChats, sharedChatAdministration } =
    createSharedChatAdministrationFixture();
  const creator = createAccount(virtualUsers, 'Ada');
  const nonMember = createAccount(virtualUsers, 'Grace');

  const supergroup = getCreatedSupergroup(sharedChatAdministration.createSupergroup({
    title: 'Test Supergroup',
    description: 'Supergroup description',
    creatorAccountId: creator.profile.id,
  }));
  const channel = getCreatedChannel(sharedChatAdministration.createChannel({
    title: 'Test Channel',
    creatorAccountId: creator.profile.id,
  }));

  assertSharedChatIds(supergroup, channel);
  assertSharedChatDescriptions(supergroup, channel);
  assertSharedChatIdentityKind(identities, supergroup, 'supergroup');
  assertSharedChatIdentityKind(identities, channel, 'channel');
  assertStoredOwnerOnlyChat(
    sharedChats,
    supergroup,
    creator.profile.id,
    nonMember.profile.id,
  );
  assertStoredOwnerOnlyChat(
    sharedChats,
    channel,
    creator.profile.id,
    nonMember.profile.id,
  );
});

Deno.test('SharedChatAdministrationService validates owners before reserving shared-chat IDs', () => {
  const { virtualUsers, sharedChatAdministration } = createSharedChatAdministrationFixture();

  const missingSupergroupOwner = sharedChatAdministration.createSupergroup({
    title: 'Missing Owner',
    creatorAccountId: 999,
  });
  assertOwnerOnlyChatCreationFailure(missingSupergroupOwner, 'creator_account_not_found');

  const missingChannelOwner = sharedChatAdministration.createChannel({
    title: 'Missing Owner',
    creatorAccountId: 999,
  });
  assertOwnerOnlyChatCreationFailure(missingChannelOwner, 'creator_account_not_found');

  const creator = createAccount(virtualUsers, 'Ada');
  const validChannel = getCreatedChannel(sharedChatAdministration.createChannel({
    title: 'First Valid Shared Chat',
    creatorAccountId: creator.profile.id,
  }));
  if (validChannel.id !== -1_000_000_000_001) {
    throw new Error('Expected rejected creations not to consume a shared-chat ID');
  }
});

Deno.test('SharedChatAdministrationService adds permitted members to shared chats', () => {
  const { virtualUsers, sharedChats, sharedChatAdministration } =
    createSharedChatAdministrationFixture();
  const owner = createAccount(virtualUsers, 'Ada');
  const account = createAccount(virtualUsers, 'Grace');
  const bot = createBot(virtualUsers, 'Test Bot', 'test_bot');
  const basicGroup = getCreatedBasicGroup(sharedChatAdministration.createBasicGroup({
    title: 'Test Group',
    creatorAccountId: owner.profile.id,
    initialMemberIds: [],
  }));
  const supergroup = getCreatedSupergroup(sharedChatAdministration.createSupergroup({
    title: 'Test Supergroup',
    creatorAccountId: owner.profile.id,
  }));
  const channel = getCreatedChannel(sharedChatAdministration.createChannel({
    title: 'Test Channel',
    creatorAccountId: owner.profile.id,
  }));

  assertMemberAdded(sharedChatAdministration.addChatMember({
    actorAccountId: owner.profile.id,
    chatId: basicGroup.id,
    memberId: bot.profile.id,
  }));
  assertMemberAdded(sharedChatAdministration.addChatMember({
    actorAccountId: owner.profile.id,
    chatId: supergroup.id,
    memberId: bot.profile.id,
  }));
  assertMemberAdded(sharedChatAdministration.addChatMember({
    actorAccountId: owner.profile.id,
    chatId: channel.id,
    memberId: account.profile.id,
  }));

  assertMembershipStatus(
    sharedChats.getChatMembership(basicGroup.id, bot.profile.id)?.status,
    'member',
  );
  assertMembershipStatus(
    sharedChats.getChatMembership(supergroup.id, bot.profile.id)?.status,
    'member',
  );
  assertMembershipStatus(
    sharedChats.getChatMembership(channel.id, account.profile.id)?.status,
    'member',
  );
});

Deno.test('SharedChatAdministrationService validates member additions before changing chat state', () => {
  const { virtualUsers, sharedChats, sharedChatAdministration } =
    createSharedChatAdministrationFixture();
  const owner = createAccount(virtualUsers, 'Ada');
  const existingMember = createAccount(virtualUsers, 'Grace');
  const candidate = createAccount(virtualUsers, 'Linus');
  const bot = createBot(virtualUsers, 'Test Bot', 'test_bot');
  const channel = getCreatedChannel(sharedChatAdministration.createChannel({
    title: 'Test Channel',
    creatorAccountId: owner.profile.id,
  }));
  assertMemberAdded(sharedChatAdministration.addChatMember({
    actorAccountId: owner.profile.id,
    chatId: channel.id,
    memberId: existingMember.profile.id,
  }));

  assertMemberAdditionFailure(
    sharedChatAdministration.addChatMember({
      actorAccountId: 999,
      chatId: channel.id,
      memberId: candidate.profile.id,
    }),
    'actor_account_not_found',
  );
  assertMemberAdditionFailure(
    sharedChatAdministration.addChatMember({
      actorAccountId: owner.profile.id,
      chatId: -999,
      memberId: candidate.profile.id,
    }),
    'chat_not_found',
  );
  assertMemberAdditionFailure(
    sharedChatAdministration.addChatMember({
      actorAccountId: existingMember.profile.id,
      chatId: channel.id,
      memberId: candidate.profile.id,
    }),
    'actor_not_authorized',
  );
  assertMemberAdditionFailure(
    sharedChatAdministration.addChatMember({
      actorAccountId: owner.profile.id,
      chatId: channel.id,
      memberId: 999,
    }),
    'member_not_found',
  );
  assertMemberAdditionFailure(
    sharedChatAdministration.addChatMember({
      actorAccountId: owner.profile.id,
      chatId: channel.id,
      memberId: bot.profile.id,
    }),
    'bot_not_permitted_in_channel',
  );
  assertMemberAdditionFailure(
    sharedChatAdministration.addChatMember({
      actorAccountId: owner.profile.id,
      chatId: channel.id,
      memberId: existingMember.profile.id,
    }),
    'member_already_present',
  );

  if (
    sharedChats.getChatMembership(channel.id, candidate.profile.id) !== undefined ||
    sharedChats.getChatMembership(channel.id, bot.profile.id) !== undefined
  ) {
    throw new Error('Expected rejected member additions not to change chat memberships');
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
  sharedChats: SharedChatRepository,
  chat: Supergroup | Channel,
  ownerAccountId: number,
  nonMemberAccountId: number,
): void {
  if (sharedChats.getSharedChat(chat.id) !== chat) {
    throw new Error('Expected the created shared chat to be stored canonically');
  }
  assertMembershipStatus(sharedChats.getChatMembership(chat.id, ownerAccountId)?.status, 'owner');
  if (sharedChats.getChatMembership(chat.id, nonMemberAccountId) !== undefined) {
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

function createSharedChatAdministrationFixture() {
  const identities = new TelegramIdentityRepository();
  const accounts = new AccountRepository();
  const bots = new BotRepository();
  const virtualUsers = new VirtualUserService({ identities, accounts, bots });
  const sharedChats = new SharedChatRepository();
  const sharedChatAdministration = new SharedChatAdministrationService({
    identities,
    accounts,
    bots,
    sharedChats,
  });
  return { identities, virtualUsers, sharedChats, sharedChatAdministration };
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
