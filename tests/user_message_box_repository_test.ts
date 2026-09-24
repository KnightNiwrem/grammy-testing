import { UserMessageBoxRepository } from '../src/repositories/user_message_box.ts';

Deno.test('UserMessageBoxRepository numbers each owner message box independently', () => {
  const userMessageBoxes = new UserMessageBoxRepository();

  const assignedMessageIds = [
    userMessageBoxes.assignMessageId(1, 'first'),
    userMessageBoxes.assignMessageId(2, 'first'),
    userMessageBoxes.assignMessageId(1, 'second'),
  ];

  if (assignedMessageIds.join() !== '1,1,2') {
    throw new Error('Expected each owner message box to start at 1 and increase independently');
  }
  if (
    userMessageBoxes.getMessageId(1, 'first') !== 1 ||
    userMessageBoxes.getMessageId(2, 'first') !== 1 ||
    userMessageBoxes.getMessageId(1, 'second') !== 2
  ) {
    throw new Error('Expected lookups to return the assigned message IDs');
  }
  if (
    userMessageBoxes.getMessageId(2, 'second') !== undefined ||
    userMessageBoxes.getMessageId(3, 'first') !== undefined
  ) {
    throw new Error('Expected messages outside an owner message box to have no message ID');
  }
});

Deno.test('UserMessageBoxRepository rejects assigning a message twice in one box', () => {
  const userMessageBoxes = new UserMessageBoxRepository();
  userMessageBoxes.assignMessageId(1, 'first');

  let rejected = false;
  try {
    userMessageBoxes.assignMessageId(1, 'first');
  } catch {
    rejected = true;
  }

  if (!rejected || userMessageBoxes.assignMessageId(1, 'second') !== 2) {
    throw new Error('Expected a repeated assignment to fail without consuming a message ID');
  }
});

Deno.test('UserMessageBoxRepository resolves message IDs back to canonical messages per box', () => {
  const userMessageBoxes = new UserMessageBoxRepository();
  userMessageBoxes.assignMessageId(1, 'first');
  userMessageBoxes.assignMessageId(2, 'second');
  userMessageBoxes.assignMessageId(2, 'first');

  if (
    userMessageBoxes.getCanonicalMessageId(1, 1) !== 'first' ||
    userMessageBoxes.getCanonicalMessageId(2, 1) !== 'second' ||
    userMessageBoxes.getCanonicalMessageId(2, 2) !== 'first'
  ) {
    throw new Error("Expected each box's message IDs to resolve to its own canonical messages");
  }
  if (
    userMessageBoxes.getCanonicalMessageId(1, 2) !== undefined ||
    userMessageBoxes.getCanonicalMessageId(3, 1) !== undefined
  ) {
    throw new Error('Expected unassigned message IDs to resolve to nothing');
  }
});
