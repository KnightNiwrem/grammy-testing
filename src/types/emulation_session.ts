import type { BotApiService } from '../services/bot_api.ts';
import type { ChatInteractionService } from '../services/chat_interaction.ts';
import type { VirtualUserService } from '../services/virtual_user.ts';

/**
 * The application capabilities of one isolated Telegram emulation.
 *
 * Repositories stay private to composition so that each invariant has a single service owner.
 */
export interface EmulationSession {
  readonly id: string;
  readonly virtualUsers: VirtualUserService;
  readonly chatInteractions: ChatInteractionService;
  readonly botApi: BotApiService;
}
