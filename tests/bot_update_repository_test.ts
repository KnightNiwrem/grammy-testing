import { BotUpdateRepository } from '../src/repositories/bot_update.ts';
import type { BotApiPrivateTextMessage } from '../src/types/bot_api.ts';

Deno.test('BotUpdateRepository sequences and confirms each bot mailbox independently', () => {
  const botUpdates = new BotUpdateRepository();
  const message = createMessage('first');

  botUpdates.enqueueMessageUpdate(10, message);
  botUpdates.enqueueMessageUpdate(10, createMessage('second'));
  botUpdates.enqueueMessageUpdate(20, message);

  const limitedUpdates = botUpdates.readPendingUpdates(10, { limit: 1 });
  if (limitedUpdates.length !== 1 || limitedUpdates[0].update_id !== 1) {
    throw new Error('Expected a read to honor its limit without confirming updates');
  }

  const repeatedUpdates = botUpdates.readPendingUpdates(10, { limit: 100 });
  if (
    repeatedUpdates.length !== 2 ||
    repeatedUpdates[0].update_id !== 1 ||
    repeatedUpdates[1].update_id !== 2
  ) {
    throw new Error('Expected unconfirmed updates to remain pending');
  }

  const afterConfirmation = botUpdates.readPendingUpdates(10, {
    firstUnconfirmedUpdateId: 2,
    limit: 100,
  });
  if (afterConfirmation.length !== 1 || afterConfirmation[0].update_id !== 2) {
    throw new Error('Expected a read to confirm only earlier updates');
  }

  const otherBotUpdates = botUpdates.readPendingUpdates(20, { limit: 100 });
  if (otherBotUpdates.length !== 1 || otherBotUpdates[0].update_id !== 1) {
    throw new Error('Expected each bot to own an independent update sequence');
  }
});

Deno.test('BotUpdateRepository wakes a waiter when an update arrives for its bot', async () => {
  const botUpdates = new BotUpdateRepository();
  const pendingWait = botUpdates.waitForUpdate(10, { timeoutSeconds: 1 });

  queueMicrotask(() => botUpdates.enqueueMessageUpdate(10, createMessage('arrived')));

  await pendingWait;
  const updates = botUpdates.readPendingUpdates(10, { limit: 100 });
  if (updates.length !== 1 || updates[0].message.text !== 'arrived') {
    throw new Error('Expected an enqueued update to end the wait');
  }
});

Deno.test('BotUpdateRepository ends a wait when its signal aborts', async () => {
  const botUpdates = new BotUpdateRepository();
  const abortController = new AbortController();
  const pendingWait = botUpdates.waitForUpdate(10, {
    timeoutSeconds: 50,
    signal: abortController.signal,
  });

  abortController.abort();
  await pendingWait;
  await botUpdates.waitForUpdate(10, { timeoutSeconds: 50, signal: abortController.signal });
});

Deno.test('BotUpdateRepository resolves a negative offset against the queue tail', () => {
  const botUpdates = new BotUpdateRepository();
  if (botUpdates.resolveFirstUnconfirmedUpdateId(10, -1) !== 1) {
    throw new Error('Expected a negative offset on an empty queue to keep future updates');
  }
  botUpdates.enqueueMessageUpdate(10, createMessage('first'));
  botUpdates.enqueueMessageUpdate(10, createMessage('second'));
  botUpdates.enqueueMessageUpdate(10, createMessage('third'));

  const firstUnconfirmedUpdateId = botUpdates.resolveFirstUnconfirmedUpdateId(10, -2);
  const tailUpdates = botUpdates.readPendingUpdates(10, { firstUnconfirmedUpdateId, limit: 100 });
  if (tailUpdates.map((update) => update.update_id).join() !== '2,3') {
    throw new Error('Expected a negative offset to return the requested queue tail');
  }

  const remainingUpdates = botUpdates.readPendingUpdates(10, { limit: 100 });
  if (remainingUpdates.map((update) => update.update_id).join() !== '2,3') {
    throw new Error('Expected a negative offset to forget updates before the tail');
  }
  if (botUpdates.resolveFirstUnconfirmedUpdateId(10, -5) !== 2) {
    throw new Error('Expected a negative offset beyond the queue length to keep every update');
  }
});

function createMessage(text: string): BotApiPrivateTextMessage {
  return {
    message_id: 1,
    from: { id: 1, is_bot: false, first_name: 'Ada' },
    chat: { id: 1, type: 'private', first_name: 'Ada' },
    date: 1_700_000_000,
    text,
  };
}
