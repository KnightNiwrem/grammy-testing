import { AccountRegistry } from '../src/account_registry.ts';
import { BotRegistry } from '../src/bot_registry.ts';
import { TelegramIdentityRegistry } from '../src/telegram_identity_registry.ts';
import { VirtualUserService } from '../src/virtual_user_service.ts';

Deno.test('VirtualUserService creates accounts and bots in their shared user ID sequence', () => {
  const { accounts, bots, virtualUsers } = createVirtualUserState();

  const accountResult = virtualUsers.createAccount({ first_name: 'Ada' });
  const botResult = virtualUsers.createBot({
    first_name: 'Test Bot',
    username: 'test_bot',
  });
  if (!accountResult.created || !botResult.created) {
    throw new Error('Expected account and bot creation to succeed');
  }
  if (accountResult.account.profile.id !== 1 || botResult.bot.profile.id !== 2) {
    throw new Error('Expected accounts and bots to share one user ID sequence');
  }
  if (
    accounts.getById(accountResult.account.profile.id) !== accountResult.account ||
    bots.getById(botResult.bot.profile.id) !== botResult.bot ||
    bots.getByToken(botResult.bot.token) !== botResult.bot
  ) {
    throw new Error('Expected created users to be stored in their respective registries');
  }
});

Deno.test('VirtualUserService creates complete bot profiles and tokens', () => {
  const { virtualUsers } = createVirtualUserState();

  const result = virtualUsers.createBot({
    first_name: 'Test Bot',
    username: 'test_bot',
  });
  if (!result.created) {
    throw new Error(`Expected bot creation to succeed, received ${result.reason}`);
  }
  const expectedProfile = {
    id: 1,
    is_bot: true,
    first_name: 'Test Bot',
    username: 'test_bot',
    can_join_groups: true,
    can_read_all_group_messages: false,
    supports_inline_queries: false,
    can_connect_to_business: false,
    has_main_web_app: false,
    has_topics_enabled: false,
    allows_users_to_create_topics: false,
    can_manage_bots: false,
    supports_join_request_queries: false,
  };
  if (JSON.stringify(result.bot.profile) !== JSON.stringify(expectedProfile)) {
    throw new Error('Expected the bot profile to contain its identity and capability defaults');
  }
  if (!result.bot.token.startsWith(`${result.bot.profile.id}:`)) {
    throw new Error('Expected the bot token to be prefixed with its user ID');
  }
});

Deno.test('VirtualUserService reports global username conflicts without storing a user', () => {
  const { accounts, virtualUsers } = createVirtualUserState();

  const botResult = virtualUsers.createBot({
    first_name: 'Test Bot',
    username: 'shared_name',
  });
  if (!botResult.created) {
    throw new Error('Expected initial bot creation to succeed');
  }

  const accountResult = virtualUsers.createAccount({
    first_name: 'Ada',
    username: 'SHARED_NAME',
  });
  if (accountResult.created || accountResult.reason !== 'username_taken') {
    throw new Error('Expected the duplicate username to be rejected case-insensitively');
  }
  if (accounts.getById(2) !== undefined) {
    throw new Error('Expected a rejected account not to be stored');
  }
});

function createVirtualUserState(): {
  accounts: AccountRegistry;
  bots: BotRegistry;
  virtualUsers: VirtualUserService;
} {
  const identities = new TelegramIdentityRegistry();
  const accounts = new AccountRegistry();
  const bots = new BotRegistry();
  return {
    accounts,
    bots,
    virtualUsers: new VirtualUserService({ identities, accounts, bots }),
  };
}
