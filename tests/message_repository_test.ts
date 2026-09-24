import { MessageRepository } from '../src/repositories/message.ts';

Deno.test('MessageRepository stores ordered private conversation history', () => {
  const messages = new MessageRepository();
  const firstConversation = { accountId: 1, botId: 2 };
  const secondConversation = { accountId: 1, botId: 3 };

  const firstMessage = messages.addPrivateTextMessage({
    conversation: firstConversation,
    authorRole: 'account',
    sentAtUnixSeconds: 1_700_000_000,
    text: 'first',
    entities: [],
  });
  const unrelatedMessage = messages.addPrivateTextMessage({
    conversation: secondConversation,
    authorRole: 'account',
    sentAtUnixSeconds: 1_700_000_001,
    text: 'unrelated',
    entities: [],
  });
  const secondMessage = messages.addPrivateTextMessage({
    conversation: firstConversation,
    authorRole: 'account',
    sentAtUnixSeconds: 1_700_000_002,
    text: 'second',
    entities: [],
  });

  if (
    new Set([firstMessage.id, unrelatedMessage.id, secondMessage.id]).size !== 3
  ) {
    throw new Error('Expected each canonical message to have a distinct identity');
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

Deno.test('MessageRepository edits a message in place without changing its identity', () => {
  const messages = new MessageRepository();
  const conversation = { accountId: 1, botId: 2 };
  const inlineKeyboard = [[{ kind: 'callback' as const, text: 'Yes', callbackData: 'yes' }]];
  const firstMessage = messages.addPrivateTextMessage({
    conversation,
    authorRole: 'bot',
    sentAtUnixSeconds: 1_700_000_000,
    text: 'Continue?',
    entities: [],
    inlineKeyboard,
  });
  const secondMessage = messages.addPrivateTextMessage({
    conversation,
    authorRole: 'account',
    sentAtUnixSeconds: 1_700_000_001,
    text: 'Later',
    entities: [],
  });
  if (
    JSON.stringify(firstMessage.inlineKeyboard) !== JSON.stringify(inlineKeyboard) ||
    firstMessage.inlineKeyboard === inlineKeyboard ||
    secondMessage.inlineKeyboard !== undefined
  ) {
    throw new Error('Expected a stored copy of the inline keyboard only where one was attached');
  }

  const editedMessage = messages.editPrivateTextMessage(firstMessage.id, {
    text: 'Continued /start',
    entities: [{ type: 'bot_command', offset: 10, length: 6 }],
    inlineKeyboard: undefined,
    textEditedAtUnixSeconds: 1_700_000_005,
  });
  if (
    editedMessage.id !== firstMessage.id ||
    editedMessage.sentAtUnixSeconds !== 1_700_000_000 ||
    editedMessage.authorRole !== 'bot' ||
    editedMessage.text !== 'Continued /start' ||
    editedMessage.entities.length !== 1 ||
    editedMessage.textEditedAtUnixSeconds !== 1_700_000_005 ||
    'inlineKeyboard' in editedMessage
  ) {
    throw new Error('Expected the edit to replace only the editable content');
  }
  if (messages.getPrivateTextMessage(firstMessage.id) !== editedMessage) {
    throw new Error('Expected lookups to return the edited message');
  }
  const history = messages.getPrivateConversationMessages(conversation);
  if (history[0] !== editedMessage || history[1] !== secondMessage) {
    throw new Error('Expected history to keep the edited message in its original position');
  }
  if (messages.getPrivateTextMessage('unknown') !== undefined) {
    throw new Error('Expected an unknown canonical message ID to find nothing');
  }
});
