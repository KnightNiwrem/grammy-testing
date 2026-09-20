import { BotRegistry } from '../src/bot_registry.ts';
import { TelegramIdentityRegistry } from '../src/telegram_identity_registry.ts';

Deno.test('BotRegistry creates and retrieves a virtual bot', () => {
  const bots = new BotRegistry(new TelegramIdentityRegistry());

  const result = bots.create({
    first_name: 'Test Bot',
    username: 'test_bot',
  });

  if (!result.created) {
    throw new Error(`Expected bot creation to succeed, received ${result.reason}`);
  }
  if (
    result.bot.profile.id !== 1 ||
    result.bot.profile.is_bot !== true ||
    result.bot.profile.first_name !== 'Test Bot' ||
    result.bot.profile.username !== 'test_bot' ||
    result.bot.profile.can_join_groups !== true ||
    result.bot.profile.can_read_all_group_messages !== false ||
    result.bot.profile.supports_inline_queries !== false ||
    result.bot.profile.can_connect_to_business !== false ||
    result.bot.profile.has_main_web_app !== false ||
    result.bot.profile.has_topics_enabled !== false ||
    result.bot.profile.allows_users_to_create_topics !== false ||
    result.bot.profile.can_manage_bots !== false ||
    result.bot.profile.supports_join_request_queries !== false
  ) {
    throw new Error('Expected the bot profile to contain its identity and capability defaults');
  }
  if (!result.bot.token.startsWith(`${result.bot.profile.id}:`)) {
    throw new Error('Expected the bot token to be prefixed with its user ID');
  }
  if (bots.getByToken(result.bot.token) !== result.bot) {
    throw new Error('Expected token lookup to return the created bot');
  }
});
