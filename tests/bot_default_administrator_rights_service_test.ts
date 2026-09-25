import { AccountRepository } from '../src/repositories/account.ts';
import { BotRepository } from '../src/repositories/bot.ts';
import { BotDefaultAdministratorRightsRepository } from '../src/repositories/bot_default_administrator_rights.ts';
import { TelegramIdentityRepository } from '../src/repositories/telegram_identity.ts';
import {
  BotDefaultAdministratorRightsService,
  type GetBotDefaultAdministratorRightsResult,
} from '../src/services/bot_default_administrator_rights.ts';
import { VirtualUserService } from '../src/services/virtual_user.ts';

Deno.test('BotDefaultAdministratorRightsService keeps group and channel rights apart', () => {
  const { defaultAdministratorRights, botId } = createFixture();

  defaultAdministratorRights.setDefaultAdministratorRights({
    botId,
    kind: 'group',
    requestedRights: ['can_delete_messages'],
  });

  assertRights(
    defaultAdministratorRights.getDefaultAdministratorRights({ botId, kind: 'group' }),
    ['can_delete_messages', 'can_manage_chat'],
  );
  assertRights(
    defaultAdministratorRights.getDefaultAdministratorRights({ botId, kind: 'channel' }),
    [],
  );
});

Deno.test('BotDefaultAdministratorRightsService normalizes rights as TDLib does', () => {
  const { defaultAdministratorRights, botId } = createFixture();
  const cases = [
    // Channel-only rights are dropped for groups; anonymity alone still implies managing.
    ['group', ['can_post_messages', 'can_manage_direct_messages'], []],
    ['group', ['is_anonymous'], ['is_anonymous', 'can_manage_chat']],
    ['group', ['can_pin_messages', 'can_manage_tags'], [
      'can_pin_messages',
      'can_manage_tags',
      'can_manage_chat',
    ]],
    // Group-only rights and anonymity are dropped for channels.
    ['channel', ['can_pin_messages', 'can_manage_topics', 'can_manage_tags', 'is_anonymous'], []],
    ['channel', ['can_post_messages', 'can_restrict_members'], [
      'can_post_messages',
      'can_restrict_members',
      'can_manage_chat',
    ]],
  ] as const;
  for (const [kind, requestedRights, expectedRights] of cases) {
    defaultAdministratorRights.setDefaultAdministratorRights({ botId, kind, requestedRights });
    assertRights(
      defaultAdministratorRights.getDefaultAdministratorRights({ botId, kind }),
      expectedRights,
    );
  }
});

Deno.test('BotDefaultAdministratorRightsService answers an unknown bot', () => {
  const { defaultAdministratorRights, botId } = createFixture();
  const target = { botId: botId + 100, kind: 'group' } as const;

  const setResult = defaultAdministratorRights.setDefaultAdministratorRights({
    ...target,
    requestedRights: [],
  });
  const getResult = defaultAdministratorRights.getDefaultAdministratorRights(target);

  if (setResult.set || getResult.found) {
    throw new Error('Expected the unknown bot to be reported');
  }
});

function createFixture() {
  const bots = new BotRepository();
  const virtualUsers = new VirtualUserService({
    identities: new TelegramIdentityRepository(),
    accounts: new AccountRepository(),
    bots,
  });
  const creation = virtualUsers.createBot({ first_name: 'Admin Bot', username: 'admin_bot' });
  if (!creation.created) {
    throw new Error(`Expected bot creation to succeed, received ${creation.reason}`);
  }
  const defaultAdministratorRights = new BotDefaultAdministratorRightsService({
    bots,
    defaultAdministratorRights: new BotDefaultAdministratorRightsRepository(),
  });
  return { defaultAdministratorRights, botId: creation.bot.profile.id };
}

function assertRights(
  result: GetBotDefaultAdministratorRightsResult,
  expectedRights: readonly string[],
): void {
  if (
    !result.found ||
    JSON.stringify([...result.rights].sort()) !== JSON.stringify([...expectedRights].sort())
  ) {
    throw new Error(
      `Expected ${JSON.stringify(expectedRights)}, received ${
        JSON.stringify(result.found ? [...result.rights] : result)
      }`,
    );
  }
}
