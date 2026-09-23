import { AccountRepository } from '../src/repositories/account.ts';
import { BotRepository } from '../src/repositories/bot.ts';
import { BotUpdateRepository } from '../src/repositories/bot_update.ts';
import { BotUpdateSubscriptionRepository } from '../src/repositories/bot_update_subscription.ts';
import { TelegramIdentityRepository } from '../src/repositories/telegram_identity.ts';
import { BotApiService } from '../src/services/bot_api.ts';
import { VirtualUserService } from '../src/services/virtual_user.ts';
import {
  type BotApiPrivateTextMessage,
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
  const updates = await botApi.getUpdates(authenticatedBot, { limit: 100, timeoutSeconds: 0 });

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
