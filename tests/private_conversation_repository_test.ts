import { PrivateConversationRepository } from '../src/repositories/private_conversation.ts';

Deno.test('PrivateConversationRepository stores one private conversation per account and bot pair', () => {
  const privateConversations = new PrivateConversationRepository();
  const conversationKey = { accountId: 1, botId: 2 };

  const firstConversation = privateConversations.getOrCreatePrivateConversation(conversationKey);
  if (
    firstConversation.kind !== 'private' ||
    firstConversation.accountId !== conversationKey.accountId ||
    firstConversation.botId !== conversationKey.botId
  ) {
    throw new Error('Expected the conversation to retain both sides of its canonical identity');
  }

  const secondConversation = privateConversations.getOrCreatePrivateConversation(conversationKey);
  if (secondConversation !== firstConversation) {
    throw new Error('Expected the account and bot pair to have one canonical conversation');
  }
});

Deno.test('PrivateConversationRepository disambiguates private conversations for different bots', () => {
  const privateConversations = new PrivateConversationRepository();

  const firstConversation = privateConversations.getOrCreatePrivateConversation({
    accountId: 1,
    botId: 2,
  });
  const secondConversation = privateConversations.getOrCreatePrivateConversation({
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

Deno.test('PrivateConversationRepository gives each conversation a Telegram chat instance', () => {
  const privateConversations = new PrivateConversationRepository();
  const firstConversation = privateConversations.getOrCreatePrivateConversation({
    accountId: 1,
    botId: 2,
  });
  const secondConversation = privateConversations.getOrCreatePrivateConversation({
    accountId: 1,
    botId: 3,
  });

  for (const { chatInstance } of [firstConversation, secondConversation]) {
    const value = /^-?\d+$/.test(chatInstance) ? BigInt(chatInstance) : undefined;
    if (value === undefined || value < -(2n ** 63n) || value >= 2n ** 63n) {
      throw new Error(`Expected a signed 64-bit decimal chat instance, received ${chatInstance}`);
    }
  }
  if (firstConversation.chatInstance === secondConversation.chatInstance) {
    throw new Error('Expected distinct conversations to have distinct chat instances');
  }
});
