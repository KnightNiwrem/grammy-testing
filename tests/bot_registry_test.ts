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
    result.bot.profile.username !== 'test_bot'
  ) {
    throw new Error('Expected the bot profile to contain its allocated identity and input fields');
  }
  if (!result.bot.token.startsWith(`${result.bot.profile.id}:`)) {
    throw new Error('Expected the bot token to be prefixed with its user ID');
  }
  if (bots.getByToken(result.bot.token) !== result.bot) {
    throw new Error('Expected token lookup to return the created bot');
  }
});
