import type { AccountRepository } from '../repositories/account.ts';
import type { BotRepository } from '../repositories/bot.ts';
import type { ChatRepository } from '../repositories/chat.ts';
import type { TelegramIdentityRepository } from '../repositories/telegram_identity.ts';
import type { ChatInteractionService } from '../services/chat_interaction.ts';
import type { VirtualUserService } from '../services/virtual_user.ts';

/** Session-scoped state and operations for one isolated Telegram emulation. */
export interface EmulationSession {
  readonly id: string;
  readonly identities: TelegramIdentityRepository;
  readonly accounts: AccountRepository;
  readonly bots: BotRepository;
  readonly virtualUsers: VirtualUserService;
  readonly chats: ChatRepository;
  readonly chatInteractions: ChatInteractionService;
}
