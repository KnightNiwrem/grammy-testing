import { EmulationSession } from '../src/session_registry.ts';
import type { VirtualUserService } from '../src/virtual_user_service.ts';

Deno.test('ChatInteractionService activates a private conversation for known participants', () => {
  const { virtualUsers, chats, chatInteractions } = new EmulationSession('test-session');
  const account = createAccount(virtualUsers, 'Ada');
  const bot = createBot(virtualUsers, 'First Bot', 'first_bot');

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
  const { virtualUsers, chats, chatInteractions } = new EmulationSession('test-session');
  const account = createAccount(virtualUsers, 'Ada');
  const bot = createBot(virtualUsers, 'First Bot', 'first_bot');

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

function createAccount(virtualUsers: VirtualUserService, firstName: string) {
  const result = virtualUsers.createAccount({ first_name: firstName });
  if (!result.created) {
    throw new Error(`Expected account creation to succeed, received ${result.reason}`);
  }
  return result.account;
}

function createBot(virtualUsers: VirtualUserService, firstName: string, username: string) {
  const result = virtualUsers.createBot({ first_name: firstName, username });
  if (!result.created) {
    throw new Error(`Expected bot creation to succeed, received ${result.reason}`);
  }
  return result.bot;
}
