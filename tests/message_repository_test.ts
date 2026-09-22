import { MessageRepository } from '../src/repositories/message.ts';

Deno.test('MessageRepository stores ordered private conversation history', () => {
  const messages = new MessageRepository();
  const firstConversation = { accountId: 1, botId: 2 };
  const secondConversation = { accountId: 1, botId: 3 };

  const firstMessage = messages.addPrivateTextMessage({
    conversation: firstConversation,
    authorAccountId: 1,
    sentAtUnixSeconds: 1_700_000_000,
    text: 'first',
  });
  const unrelatedMessage = messages.addPrivateTextMessage({
    conversation: secondConversation,
    authorAccountId: 1,
    sentAtUnixSeconds: 1_700_000_001,
    text: 'unrelated',
  });
  const secondMessage = messages.addPrivateTextMessage({
    conversation: firstConversation,
    authorAccountId: 1,
    sentAtUnixSeconds: 1_700_000_002,
    text: 'second',
  });

  if (
    firstMessage.messageId !== 1 ||
    unrelatedMessage.messageId !== 2 ||
    secondMessage.messageId !== 3
  ) {
    throw new Error('Expected messages to use the session message identifier sequence');
  }
  const history = messages.getPrivateConversationMessages(firstConversation);
  if (history.length !== 2 || history[0] !== firstMessage || history[1] !== secondMessage) {
    throw new Error('Expected history to contain only the conversation messages in order');
  }

  const repeatedHistoryLookup = messages.getPrivateConversationMessages(firstConversation);
  if (history === repeatedHistoryLookup) {
    throw new Error('Expected each history lookup to return a separate array');
  }
});
