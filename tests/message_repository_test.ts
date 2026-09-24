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

Deno.test('MessageRepository keeps what an edit cannot change', () => {
  const messages = new MessageRepository();
  const conversation = { accountId: 1, botId: 2 };
  const question = messages.addPrivateTextMessage({
    conversation,
    authorRole: 'account',
    sentAtUnixSeconds: 1_700_000_000,
    text: 'Colors?',
    entities: [],
  });
  const replyInterface = {
    kind: 'reply_keyboard' as const,
    rows: [[{ text: 'Red' }]],
    isPersistent: true,
    resizesToFit: false,
    isOneTime: false,
  };
  const answer = messages.addPrivateTextMessage({
    conversation,
    authorRole: 'bot',
    sentAtUnixSeconds: 1_700_000_001,
    text: 'Pick one',
    entities: [],
    replyToMessageId: question.id,
    replyInterface,
    isContentProtected: true,
  });
  if (
    answer.replyInterface === replyInterface ||
    JSON.stringify(answer.replyInterface) !== JSON.stringify(replyInterface) ||
    question.isContentProtected || 'replyToMessageId' in question || 'replyInterface' in question
  ) {
    throw new Error('Expected a stored copy of the reply interface only where one was sent');
  }

  const editedAnswer = messages.editPrivateTextMessage(answer.id, {
    text: 'Pick a color',
    entities: [],
    inlineKeyboard: undefined,
    textEditedAtUnixSeconds: 1_700_000_005,
  });
  if (
    editedAnswer.replyToMessageId !== question.id ||
    editedAnswer.replyInterface !== answer.replyInterface ||
    !editedAnswer.isContentProtected
  ) {
    throw new Error('Expected the edit to keep the reply, reply interface, and protection');
  }
});

Deno.test('MessageRepository deletes a message from the store and its conversation history', () => {
  const messages = new MessageRepository();
  const conversation = { accountId: 1, botId: 2 };
  const addMessage = (text: string) =>
    messages.addPrivateTextMessage({
      conversation,
      authorRole: 'account',
      sentAtUnixSeconds: 1_700_000_000,
      text,
      entities: [],
    });
  const firstMessage = addMessage('first');
  const deletedMessage = addMessage('deleted');
  const lastMessage = addMessage('last');

  messages.deletePrivateTextMessage(deletedMessage.id);
  if (messages.getPrivateTextMessage(deletedMessage.id) !== undefined) {
    throw new Error('Expected the deleted message not to be retrievable');
  }
  const history = messages.getPrivateConversationMessages(conversation);
  if (history.length !== 2 || history[0] !== firstMessage || history[1] !== lastMessage) {
    throw new Error('Expected history to keep the other messages in order');
  }

  let secondDeletionError: unknown;
  try {
    messages.deletePrivateTextMessage(deletedMessage.id);
  } catch (error) {
    secondDeletionError = error;
  }
  if (!(secondDeletionError instanceof Error)) {
    throw new Error('Expected deleting a message that is not stored to throw');
  }
});

Deno.test('MessageRepository stores, edits, and deletes supergroup messages by chat', () => {
  const messages = new MessageRepository();
  const add = (chatId: number, text: string) =>
    messages.addSupergroupTextMessage({
      chatId,
      author: { kind: 'account', accountId: 1 },
      sentAtUnixSeconds: 1_700_000_000,
      text,
      entities: [],
    });
  const first = add(-1_000_000_000_001, 'first');
  add(-1_000_000_000_002, 'unrelated');
  const second = add(-1_000_000_000_001, 'second');

  const edited = messages.editSupergroupTextMessage(first.id, {
    text: 'edited',
    entities: [],
    inlineKeyboard: undefined,
    textEditedAtUnixSeconds: 1_700_000_001,
  });
  messages.deleteSupergroupTextMessage(second.id);

  const history = messages.getSupergroupMessages(-1_000_000_000_001);
  if (
    history.length !== 1 || history[0] !== edited || edited.id !== first.id ||
    edited.textEditedAtUnixSeconds !== 1_700_000_001 || !first.author ||
    messages.getSupergroupTextMessage(second.id) !== undefined ||
    messages.getPrivateTextMessage(first.id) !== undefined
  ) {
    throw new Error('Expected the supergroup history to hold only its edited remaining message');
  }
});
