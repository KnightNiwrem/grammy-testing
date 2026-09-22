import { BotUpdateRepository } from '../src/repositories/bot_update.ts';
import type { BotApiPrivateTextMessage } from '../src/types/bot_api.ts';

Deno.test('BotUpdateRepository sequences and confirms each bot mailbox independently', async () => {
  const botUpdates = new BotUpdateRepository();
  const message = createMessage('first');

  botUpdates.enqueueMessageUpdate(10, message);
  botUpdates.enqueueMessageUpdate(10, createMessage('second'));
  botUpdates.enqueueMessageUpdate(20, message);

  const limitedUpdates = await botUpdates.getUpdates(10, {
    limit: 1,
    timeoutSeconds: 0,
  });
  if (limitedUpdates.length !== 1 || limitedUpdates[0].update_id !== 1) {
    throw new Error('Expected getUpdates to honor its limit without confirming updates');
  }

  const repeatedUpdates = await botUpdates.getUpdates(10, {
    limit: 100,
    timeoutSeconds: 0,
  });
  if (
    repeatedUpdates.length !== 2 ||
    repeatedUpdates[0].update_id !== 1 ||
    repeatedUpdates[1].update_id !== 2
  ) {
    throw new Error('Expected unconfirmed updates to remain pending');
  }

  const afterConfirmation = await botUpdates.getUpdates(10, {
    offset: 2,
    limit: 100,
    timeoutSeconds: 0,
  });
  if (afterConfirmation.length !== 1 || afterConfirmation[0].update_id !== 2) {
    throw new Error('Expected offset to confirm only earlier updates');
  }

  const otherBotUpdates = await botUpdates.getUpdates(20, {
    limit: 100,
    timeoutSeconds: 0,
  });
  if (otherBotUpdates.length !== 1 || otherBotUpdates[0].update_id !== 1) {
    throw new Error('Expected each bot to own an independent update sequence');
  }
});

Deno.test('BotUpdateRepository wakes long polling when an update arrives', async () => {
  const botUpdates = new BotUpdateRepository();
  const pendingUpdates = botUpdates.getUpdates(10, {
    limit: 100,
    timeoutSeconds: 1,
  });

  queueMicrotask(() => botUpdates.enqueueMessageUpdate(10, createMessage('arrived')));

  const updates = await pendingUpdates;
  if (updates.length !== 1 || updates[0].message.text !== 'arrived') {
    throw new Error('Expected an enqueued update to complete the pending long poll');
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
