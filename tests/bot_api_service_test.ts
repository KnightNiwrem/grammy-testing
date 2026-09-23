import { AccountRepository } from '../src/repositories/account.ts';
import { BotRepository } from '../src/repositories/bot.ts';
import { BotUpdateRepository } from '../src/repositories/bot_update.ts';
import { BotUpdateSubscriptionRepository } from '../src/repositories/bot_update_subscription.ts';
import { TelegramIdentityRepository } from '../src/repositories/telegram_identity.ts';
import { BotApiService, type GetUpdatesResult } from '../src/services/bot_api.ts';
import { VirtualUserService } from '../src/services/virtual_user.ts';
import {
  type BotApiPrivateTextMessage,
  type BotApiUpdate,
  type BotApiUpdateType,
  DEFAULT_ALLOWED_UPDATE_TYPES,
} from '../src/types/bot_api.ts';

Deno.test('BotApiService authenticates a bot by its token', () => {
  const { virtualUsers, botApi } = createBotApiFixture();
  const bot = createBot(virtualUsers, 'test_bot');

  if (botApi.authenticate(bot.token) !== bot.profile) {
    throw new Error('Expected a known token to authenticate its bot');
  }
  if (botApi.authenticate(`${bot.profile.id}:unknown`) !== undefined) {
    throw new Error('Expected an unknown token not to authenticate');
  }
});

Deno.test('BotApiService polls only the authenticated bot mailbox', async () => {
  const { virtualUsers, botUpdates, botApi } = createBotApiFixture();
  const targetBot = createBot(virtualUsers, 'target_bot');
  const otherBot = createBot(virtualUsers, 'other_bot');
  botUpdates.enqueueMessageUpdate(otherBot.profile.id, createPrivateTextMessage(1));
  botUpdates.enqueueMessageUpdate(targetBot.profile.id, createPrivateTextMessage(2));

  const authenticatedBot = botApi.authenticate(targetBot.token);
  if (authenticatedBot === undefined) {
    throw new Error('Expected the target bot to authenticate');
  }
  const updates = expectRetrievedUpdates(
    await botApi.getUpdates(authenticatedBot, { limit: 100, timeoutSeconds: 0 }),
  );

  if (updates.length !== 1 || updates[0].message.message_id !== 2) {
    throw new Error("Expected getUpdates to return only the authenticated bot's updates");
  }
});

Deno.test('BotApiService keeps a bot update subscription until a request replaces it', async () => {
  const { virtualUsers, updateSubscriptions, botApi } = createBotApiFixture();
  const subscribedBot = createBot(virtualUsers, 'subscribed_bot');
  const otherBot = createBot(virtualUsers, 'other_bot');

  await botApi.getUpdates(subscribedBot.profile, {
    limit: 100,
    timeoutSeconds: 0,
    allowedUpdates: ['callback_query'],
  });
  await botApi.getUpdates(subscribedBot.profile, { limit: 100, timeoutSeconds: 0 });

  assertAllowedUpdateTypes(
    updateSubscriptions.getAllowedUpdateTypes(subscribedBot.profile.id),
    ['callback_query'],
  );
  assertAllowedUpdateTypes(
    updateSubscriptions.getAllowedUpdateTypes(otherBot.profile.id),
    [...DEFAULT_ALLOWED_UPDATE_TYPES],
  );
});

Deno.test('BotApiService resolves allowed update names as Telegram does', async () => {
  const { virtualUsers, updateSubscriptions, botApi } = createBotApiFixture();
  const bot = createBot(virtualUsers, 'test_bot');
  const cases: { allowedUpdates: string[]; expected: readonly BotApiUpdateType[] }[] = [
    { allowedUpdates: ['MESSAGE', 'not_an_update_type'], expected: ['message'] },
    { allowedUpdates: ['chat_member'], expected: ['chat_member'] },
    { allowedUpdates: ['not_an_update_type'], expected: [...DEFAULT_ALLOWED_UPDATE_TYPES] },
    { allowedUpdates: ['message'], expected: ['message'] },
    { allowedUpdates: [], expected: [...DEFAULT_ALLOWED_UPDATE_TYPES] },
  ];

  for (const { allowedUpdates, expected } of cases) {
    await botApi.getUpdates(bot.profile, { limit: 100, timeoutSeconds: 0, allowedUpdates });
    assertAllowedUpdateTypes(updateSubscriptions.getAllowedUpdateTypes(bot.profile.id), expected);
  }
  const optInUpdateTypes: BotApiUpdateType[] = [
    'chat_member',
    'message_reaction',
    'message_reaction_count',
  ];
  for (const optInUpdateType of optInUpdateTypes) {
    if (DEFAULT_ALLOWED_UPDATE_TYPES.has(optInUpdateType)) {
      throw new Error(`Expected the default subscription to exclude ${optInUpdateType}`);
    }
  }
});

Deno.test('BotApiService keeps updates that arrive during a negative offset long poll', async () => {
  const { virtualUsers, botUpdates, botApi } = createBotApiFixture();
  const bot = createBot(virtualUsers, 'test_bot');
  const pendingResult = botApi.getUpdates(bot.profile, {
    offset: -1,
    limit: 100,
    timeoutSeconds: 1,
  });

  queueMicrotask(() => {
    for (const messageId of [1, 2, 3]) {
      botUpdates.enqueueMessageUpdate(bot.profile.id, createPrivateTextMessage(messageId));
    }
  });

  const updates = expectRetrievedUpdates(await pendingResult);
  if (updates.map((update) => update.update_id).join() !== '1,2,3') {
    throw new Error('Expected the long poll to return every update that arrived while waiting');
  }
  const remainingUpdates = botUpdates.readPendingUpdates(bot.profile.id, { limit: 100 });
  if (remainingUpdates.map((update) => update.update_id).join() !== '1,2,3') {
    throw new Error('Expected updates that arrived while waiting to remain pending');
  }
});

Deno.test('BotApiService terminates a held long poll when another is held for the bot', async () => {
  const { virtualUsers, botUpdates, botApi } = createBotApiFixture();
  const bot = createBot(virtualUsers, 'test_bot');
  const displacedResult = botApi.getUpdates(bot.profile, { limit: 100, timeoutSeconds: 50 });
  const replacementResult = botApi.getUpdates(bot.profile, { limit: 100, timeoutSeconds: 50 });

  const displaced = await displacedResult;
  if (displaced.retrieved || displaced.reason !== 'terminated_by_other_long_poll') {
    throw new Error('Expected the earlier held long poll to be terminated');
  }

  botUpdates.enqueueMessageUpdate(bot.profile.id, createPrivateTextMessage(1));
  const updates = expectRetrievedUpdates(await replacementResult);
  if (updates.length !== 1 || updates[0].message.message_id !== 1) {
    throw new Error('Expected the replacement long poll to receive the next update');
  }
});

Deno.test('BotApiService does not terminate a held long poll for an immediate answer', async () => {
  const { virtualUsers, botUpdates, botApi } = createBotApiFixture();
  const bot = createBot(virtualUsers, 'test_bot');
  const heldResult = botApi.getUpdates(bot.profile, { limit: 100, timeoutSeconds: 50 });

  const immediateUpdates = expectRetrievedUpdates(
    await botApi.getUpdates(bot.profile, { limit: 100, timeoutSeconds: 0 }),
  );
  if (immediateUpdates.length !== 0) {
    throw new Error('Expected the immediate request to find no updates');
  }

  botUpdates.enqueueMessageUpdate(bot.profile.id, createPrivateTextMessage(1));
  if (expectRetrievedUpdates(await heldResult).length !== 1) {
    throw new Error('Expected the held long poll to survive a request answered immediately');
  }
});

Deno.test('BotApiService holds long polls for different bots independently', async () => {
  const { virtualUsers, botUpdates, botApi } = createBotApiFixture();
  const firstBot = createBot(virtualUsers, 'first_bot');
  const secondBot = createBot(virtualUsers, 'second_bot');
  const firstResult = botApi.getUpdates(firstBot.profile, { limit: 100, timeoutSeconds: 50 });
  const secondResult = botApi.getUpdates(secondBot.profile, { limit: 100, timeoutSeconds: 50 });

  botUpdates.enqueueMessageUpdate(firstBot.profile.id, createPrivateTextMessage(1));
  botUpdates.enqueueMessageUpdate(secondBot.profile.id, createPrivateTextMessage(2));

  if (expectRetrievedUpdates(await firstResult)[0]?.message.message_id !== 1) {
    throw new Error("Expected the first bot's long poll to receive its update");
  }
  if (expectRetrievedUpdates(await secondResult)[0]?.message.message_id !== 2) {
    throw new Error("Expected the second bot's long poll to receive its update");
  }
});

Deno.test('BotApiService ends a cancelled long poll without terminating it', async () => {
  const { virtualUsers, botUpdates, botApi } = createBotApiFixture();
  const bot = createBot(virtualUsers, 'test_bot');
  const abortController = new AbortController();
  const cancelledResult = botApi.getUpdates(bot.profile, {
    limit: 100,
    timeoutSeconds: 50,
    signal: abortController.signal,
  });

  abortController.abort();
  if (expectRetrievedUpdates(await cancelledResult).length !== 0) {
    throw new Error('Expected a cancelled long poll to end without updates');
  }

  const laterResult = botApi.getUpdates(bot.profile, { limit: 100, timeoutSeconds: 50 });
  botUpdates.enqueueMessageUpdate(bot.profile.id, createPrivateTextMessage(1));
  if (expectRetrievedUpdates(await laterResult).length !== 1) {
    throw new Error('Expected a long poll after cancellation to receive the next update');
  }
});

function expectRetrievedUpdates(result: GetUpdatesResult): readonly BotApiUpdate[] {
  if (!result.retrieved) {
    throw new Error(`Expected getUpdates to retrieve updates, received ${result.reason}`);
  }
  return result.updates;
}

function assertAllowedUpdateTypes(
  actual: ReadonlySet<BotApiUpdateType>,
  expected: readonly BotApiUpdateType[],
): void {
  if (actual.size !== expected.length || !expected.every((updateType) => actual.has(updateType))) {
    throw new Error(
      `Expected allowed update types ${JSON.stringify(expected)}, received ${
        JSON.stringify([...actual])
      }`,
    );
  }
}

function createBotApiFixture() {
  const identities = new TelegramIdentityRepository();
  const bots = new BotRepository();
  const virtualUsers = new VirtualUserService({
    identities,
    accounts: new AccountRepository(),
    bots,
  });
  const botUpdates = new BotUpdateRepository();
  const updateSubscriptions = new BotUpdateSubscriptionRepository();
  const botApi = new BotApiService({ bots, botUpdates, updateSubscriptions });
  return { virtualUsers, botUpdates, updateSubscriptions, botApi };
}

function createBot(virtualUsers: VirtualUserService, username: string) {
  const result = virtualUsers.createBot({ first_name: 'Test Bot', username });
  if (!result.created) {
    throw new Error(`Expected bot creation to succeed, received ${result.reason}`);
  }
  return result.bot;
}

function createPrivateTextMessage(messageId: number): BotApiPrivateTextMessage {
  const author = { id: 1, is_bot: false as const, first_name: 'Ada' };
  return {
    message_id: messageId,
    from: author,
    chat: { id: author.id, type: 'private', first_name: author.first_name },
    date: 1_700_000_000,
    text: 'Hello',
  };
}
