import type { BotApiService } from '../services/bot_api.ts';
import type { PrivateMessagingService } from '../services/private_messaging.ts';
import type { SharedChatAdministrationService } from '../services/shared_chat_administration.ts';
import type { VirtualUserService } from '../services/virtual_user.ts';

/**
 * The application capabilities of one isolated Telegram emulation.
 *
 * Repositories stay private to composition so that each invariant has a single service owner.
 */
export interface EmulationSession {
  readonly id: string;
  readonly virtualUsers: VirtualUserService;
  readonly sharedChatAdministration: SharedChatAdministrationService;
  readonly privateMessaging: PrivateMessagingService;
  readonly botApi: BotApiService;
  /**
   * Stops the session from keeping requests waiting: held long polls are answered and later ones
   * are not held. Requests that are already running complete against the session's state.
   */
  end(): void;
}
