import { EmulationSession } from '../src/session_registry.ts';
import type {
  BasicGroupCreationFailureReason,
  BasicGroupCreationResult,
} from '../src/chat_interaction_service.ts';
import type { ChatMembership } from '../src/chat_membership.ts';
import type { BasicGroup } from '../src/virtual_chat.ts';
import type { VirtualUserService } from '../src/virtual_user_service.ts';

Deno.test('ChatInteractionService activates a private conversation for known participants', () => {
  const { virtualUsers, chats, chatInteractions } = new EmulationSession('test-session');
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
  const { virtualUsers, chats, chatInteractions } = new EmulationSession('test-session');
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
  const { virtualUsers, identities, chats, chatInteractions } = new EmulationSession(
    'test-session',
  );
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
  const { virtualUsers, chatInteractions } = new EmulationSession('test-session');
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

function getCreatedBasicGroup(result: BasicGroupCreationResult): BasicGroup {
  if (!result.created) {
    throw new Error(`Expected group creation to succeed, received ${result.reason}`);
  }
  return result.group;
}

function assertBasicGroupCreationFailure(
  result: BasicGroupCreationResult,
  expectedReason: BasicGroupCreationFailureReason,
): void {
  if (result.created || result.reason !== expectedReason) {
    throw new Error(`Expected basic-group creation to fail with ${expectedReason}`);
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
