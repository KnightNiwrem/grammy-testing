import type { EmulationSession } from '../types/emulation_session.ts';
import { AccountRepository } from '../repositories/account.ts';
import { BotRepository } from '../repositories/bot.ts';
import { ChatRepository } from '../repositories/chat.ts';
import { BotUpdateRepository } from '../repositories/bot_update.ts';
import { MessageRepository } from '../repositories/message.ts';
import { TelegramIdentityRepository } from '../repositories/telegram_identity.ts';
import { UserMessageBoxRepository } from '../repositories/user_message_box.ts';
import { ChatInteractionService } from '../services/chat_interaction.ts';
import { VirtualUserService } from '../services/virtual_user.ts';

export function createEmulationSession(id: string): EmulationSession {
  const identities = new TelegramIdentityRepository();
  const accounts = new AccountRepository();
  const bots = new BotRepository();
  const virtualUsers = new VirtualUserService({ identities, accounts, bots });
  const chats = new ChatRepository();
  const messages = new MessageRepository();
  const userMessageBoxes = new UserMessageBoxRepository();
  const botUpdates = new BotUpdateRepository();
  const chatInteractions = new ChatInteractionService({
    identities,
    accounts,
    bots,
    chats,
    messages,
    userMessageBoxes,
    botUpdates,
    currentUnixTimeSeconds: () => Math.floor(Date.now() / 1_000),
  });

  return {
    id,
    identities,
    accounts,
    bots,
    virtualUsers,
    chats,
    messages,
    botUpdates,
    chatInteractions,
  };
}
