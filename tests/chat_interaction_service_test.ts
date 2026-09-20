import { AccountRegistry } from '../src/account_registry.ts';
import { BotRegistry } from '../src/bot_registry.ts';
import { ChatInteractionService } from '../src/chat_interaction_service.ts';
import { ChatRegistry } from '../src/chat_registry.ts';
import { TelegramIdentityRegistry } from '../src/telegram_identity_registry.ts';

Deno.test('ChatInteractionService activates a private conversation for known participants', () => {
  const { accounts, bots, chats, chatInteractions } = createChatState();
  const account = createAccount(accounts, 'Ada');
  const bot = createBot(bots, 'First Bot', 'first_bot');

  const activation = chatInteractions.activatePrivateConversation({
    accountId: account.profile.id,
    botId: bot.profile.id,
  });
  if (!activation.activated) {
    throw new Error(`Expected activation to succeed, received ${activation.reason}`);
  }
  if (
    chats.getPrivateConversation({
      accountId: account.profile.id,
      botId: bot.profile.id,
    }) !== activation.conversation
  ) {
    throw new Error('Expected activation to store the canonical private conversation');
  }
});

Deno.test('ChatInteractionService rejects unknown private conversation participants', () => {
  const { accounts, bots, chats, chatInteractions } = createChatState();
  const account = createAccount(accounts, 'Ada');
  const bot = createBot(bots, 'First Bot', 'first_bot');

  const missingAccount = chatInteractions.activatePrivateConversation({
    accountId: 999,
    botId: bot.profile.id,
  });
  if (missingAccount.activated || missingAccount.reason !== 'account_not_found') {
    throw new Error('Expected an unknown account to be rejected');
  }

  const missingBot = chatInteractions.activatePrivateConversation({
    accountId: account.profile.id,
    botId: 999,
  });
  if (missingBot.activated || missingBot.reason !== 'bot_not_found') {
    throw new Error('Expected an unknown bot to be rejected');
  }
  if (
    chats.getPrivateConversation({ accountId: 999, botId: bot.profile.id }) !== undefined ||
    chats.getPrivateConversation({ accountId: account.profile.id, botId: 999 }) !== undefined
  ) {
    throw new Error('Expected rejected activations not to create conversations');
  }
});

function createChatState(): {
  accounts: AccountRegistry;
  bots: BotRegistry;
  chats: ChatRegistry;
  chatInteractions: ChatInteractionService;
} {
  const identities = new TelegramIdentityRegistry();
  const accounts = new AccountRegistry(identities);
  const bots = new BotRegistry(identities);
  const chats = new ChatRegistry();
  return {
    accounts,
    bots,
    chats,
    chatInteractions: new ChatInteractionService({ accounts, bots, chats }),
  };
}

function createAccount(accounts: AccountRegistry, firstName: string) {
  const result = accounts.create({ first_name: firstName });
  if (!result.created) {
    throw new Error(`Expected account creation to succeed, received ${result.reason}`);
  }
  return result.account;
}

function createBot(bots: BotRegistry, firstName: string, username: string) {
  const result = bots.create({ first_name: firstName, username });
  if (!result.created) {
    throw new Error(`Expected bot creation to succeed, received ${result.reason}`);
  }
  return result.bot;
}
