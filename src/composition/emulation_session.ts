import type { EmulationSession } from '../emulation_session.ts';
import { AccountRepository } from '../repositories/account.ts';
import { BotRepository } from '../repositories/bot.ts';
import { ChatRepository } from '../repositories/chat.ts';
import { TelegramIdentityRepository } from '../repositories/telegram_identity.ts';
import { ChatInteractionService } from '../services/chat_interaction.ts';
import { VirtualUserService } from '../services/virtual_user.ts';

export function createEmulationSession(id: string): EmulationSession {
  const identities = new TelegramIdentityRepository();
  const accounts = new AccountRepository();
  const bots = new BotRepository();
  const virtualUsers = new VirtualUserService({ identities, accounts, bots });
  const chats = new ChatRepository();
  const chatInteractions = new ChatInteractionService({
    identities,
    accounts,
    bots,
    chats,
  });

  return {
    id,
    identities,
    accounts,
    bots,
    virtualUsers,
    chats,
    chatInteractions,
  };
}
