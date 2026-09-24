import { CallbackQueryRepository } from '../src/repositories/callback_query.ts';

const CALLBACK_QUERY_INPUT = {
  conversation: { accountId: 1, botId: 2 },
  messageId: 'message',
  chatInstance: '-42',
  callbackData: 'yes',
};

Deno.test('CallbackQueryRepository stores callback queries under distinct IDs', () => {
  const callbackQueries = new CallbackQueryRepository();

  const firstQuery = callbackQueries.addCallbackQuery(CALLBACK_QUERY_INPUT);
  const secondQuery = callbackQueries.addCallbackQuery(CALLBACK_QUERY_INPUT);

  if (firstQuery.id === secondQuery.id || !/^\d+$/.test(firstQuery.id)) {
    throw new Error('Expected distinct decimal callback query IDs');
  }
  if (
    callbackQueries.getCallbackQuery(firstQuery.id) !== firstQuery ||
    firstQuery.callbackData !== 'yes' ||
    firstQuery.chatInstance !== '-42' ||
    firstQuery.answer !== undefined
  ) {
    throw new Error('Expected a stored, unanswered callback query');
  }
  if (callbackQueries.getCallbackQuery('unknown') !== undefined) {
    throw new Error('Expected an unknown callback query ID to find nothing');
  }
});

Deno.test('CallbackQueryRepository records one answer per callback query', () => {
  const callbackQueries = new CallbackQueryRepository();
  const callbackQuery = callbackQueries.addCallbackQuery(CALLBACK_QUERY_INPUT);
  const answer = { text: 'Saved', showAlert: true, cacheTimeSeconds: 5 };

  const answeredQuery = callbackQueries.recordAnswer(callbackQuery.id, answer);
  if (
    JSON.stringify(answeredQuery.answer) !== JSON.stringify(answer) ||
    callbackQueries.getCallbackQuery(callbackQuery.id) !== answeredQuery
  ) {
    throw new Error('Expected the answer to be recorded on the stored query');
  }

  let rejected = false;
  try {
    callbackQueries.recordAnswer(callbackQuery.id, { showAlert: false, cacheTimeSeconds: 0 });
  } catch {
    rejected = true;
  }
  if (!rejected || callbackQueries.getCallbackQuery(callbackQuery.id) !== answeredQuery) {
    throw new Error('Expected a second answer to fail without replacing the first');
  }
});
