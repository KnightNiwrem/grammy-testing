import { ChatRegistry } from '../src/chat_registry.ts';

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
