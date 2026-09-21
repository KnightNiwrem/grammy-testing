import {
  type BasicGroupRegistrationFailureReason,
  type BasicGroupRegistrationResult,
  ChatRegistry,
} from '../src/chat_registry.ts';

Deno.test('ChatRegistry stores one private conversation per account and bot pair', () => {
  const chats = new ChatRegistry();
  const conversationKey = { accountId: 1, botId: 2 };

  const firstConversation = chats.getOrCreatePrivateConversation(conversationKey);
  if (
    firstConversation.kind !== 'private' ||
    firstConversation.accountId !== conversationKey.accountId ||
    firstConversation.botId !== conversationKey.botId
  ) {
    throw new Error('Expected the conversation to retain both sides of its canonical identity');
  }

  const secondConversation = chats.getOrCreatePrivateConversation(conversationKey);
  if (secondConversation !== firstConversation) {
    throw new Error('Expected the account and bot pair to have one canonical conversation');
  }
});

Deno.test('ChatRegistry disambiguates private conversations for different bots', () => {
  const chats = new ChatRegistry();

  const firstConversation = chats.getOrCreatePrivateConversation({
    accountId: 1,
    botId: 2,
  });
  const secondConversation = chats.getOrCreatePrivateConversation({
    accountId: 1,
    botId: 3,
  });
  if (firstConversation === secondConversation) {
    throw new Error('Expected each account and bot pair to have a distinct conversation');
  }
  if (firstConversation.accountId !== secondConversation.accountId) {
    throw new Error('Expected both conversations to retain the same account participant');
  }
});

Deno.test('ChatRegistry atomically registers a basic group and its initial memberships', () => {
  const chats = new ChatRegistry();
  const group = { kind: 'basic_group', id: -1, title: 'Test Group' } as const;

  const result = chats.registerBasicGroup(group, 1, [2]);
  if (!result.registered) {
    throw new Error(`Expected group registration to succeed, received ${result.reason}`);
  }
  if (chats.getSharedChat(group.id) !== group) {
    throw new Error('Expected the registered group to be retrievable by ID');
  }
  if (
    chats.getChatMembership(group.id, 1)?.status !== 'owner' ||
    chats.getChatMembership(group.id, 2)?.status !== 'member'
  ) {
    throw new Error('Expected the group memberships to be stored with the chat');
  }
});

Deno.test('ChatRegistry rejects non-unique basic-group members without storing the chat', () => {
  const chats = new ChatRegistry();
  const group = { kind: 'basic_group', id: -1, title: 'Test Group' } as const;

  const ownerRepeatedAsMember = chats.registerBasicGroup(group, 1, [1]);
  assertRegistrationFailure(ownerRepeatedAsMember, 'initial_members_not_unique');

  const duplicateMembers = chats.registerBasicGroup(group, 1, [2, 2]);
  assertRegistrationFailure(duplicateMembers, 'initial_members_not_unique');

  if (chats.getSharedChat(group.id) !== undefined) {
    throw new Error('Expected rejected registration not to store partial chat state');
  }
});

Deno.test('ChatRegistry registers a supergroup with its required owner', () => {
  const chats = new ChatRegistry();
  const supergroup = { kind: 'supergroup', id: -1_000_000_000_001, title: 'Test' } as const;

  const result = chats.registerSupergroup(supergroup, 1);
  if (!result.registered) {
    throw new Error(`Expected supergroup registration to succeed, received ${result.reason}`);
  }
  if (
    chats.getSharedChat(supergroup.id) !== supergroup ||
    chats.getChatMembership(supergroup.id, 1)?.status !== 'owner'
  ) {
    throw new Error('Expected the supergroup and its owner to be stored together');
  }
});

Deno.test('ChatRegistry registers a channel with its required owner', () => {
  const chats = new ChatRegistry();
  const channel = { kind: 'channel', id: -1_000_000_000_001, title: 'Test' } as const;

  const result = chats.registerChannel(channel, 1);
  if (!result.registered) {
    throw new Error(`Expected channel registration to succeed, received ${result.reason}`);
  }
  if (
    chats.getSharedChat(channel.id) !== channel ||
    chats.getChatMembership(channel.id, 1)?.status !== 'owner'
  ) {
    throw new Error('Expected the channel and its owner to be stored together');
  }
});

function assertRegistrationFailure(
  result: BasicGroupRegistrationResult,
  expectedReason: BasicGroupRegistrationFailureReason,
): void {
  if (result.registered || result.reason !== expectedReason) {
    throw new Error(`Expected shared-chat registration to fail with ${expectedReason}`);
  }
}

Deno.test('ChatRegistry preserves an existing shared chat when its ID is registered again', () => {
  const chats = new ChatRegistry();
  const originalGroup = { kind: 'basic_group', id: -1, title: 'Original' } as const;
  const replacementGroup = { kind: 'basic_group', id: -1, title: 'Replacement' } as const;

  const originalResult = chats.registerBasicGroup(originalGroup, 1, []);
  if (!originalResult.registered) {
    throw new Error('Expected original group registration to succeed');
  }

  const replacementResult = chats.registerBasicGroup(replacementGroup, 2, []);
  if (replacementResult.registered || replacementResult.reason !== 'chat_id_taken') {
    throw new Error('Expected duplicate chat ID registration to be rejected');
  }
  if (
    chats.getSharedChat(originalGroup.id) !== originalGroup ||
    chats.getChatMembership(originalGroup.id, 1)?.status !== 'owner' ||
    chats.getChatMembership(originalGroup.id, 2) !== undefined
  ) {
    throw new Error('Expected duplicate registration not to overwrite existing chat state');
  }
});
