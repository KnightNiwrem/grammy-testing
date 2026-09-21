import { AccountRegistry } from './account_registry.ts';
import { BotRegistry } from './bot_registry.ts';
import { ChatInteractionService } from './chat_interaction_service.ts';
import { ChatRegistry } from './chat_registry.ts';
import { TelegramIdentityRegistry } from './telegram_identity_registry.ts';
import { VirtualUserService } from './virtual_user_service.ts';

export class EmulationSession {
  readonly identities: TelegramIdentityRegistry;
  readonly accounts: AccountRegistry;
  readonly bots: BotRegistry;
  readonly virtualUsers: VirtualUserService;
  readonly chats: ChatRegistry;
  readonly chatInteractions: ChatInteractionService;

  constructor(readonly id: string) {
    this.identities = new TelegramIdentityRegistry();
    this.accounts = new AccountRegistry();
    this.bots = new BotRegistry();
    this.virtualUsers = new VirtualUserService({
      identities: this.identities,
      accounts: this.accounts,
      bots: this.bots,
    });
    this.chats = new ChatRegistry();
    this.chatInteractions = new ChatInteractionService({
      identities: this.identities,
      accounts: this.accounts,
      bots: this.bots,
      chats: this.chats,
    });
  }
}

const MAX_SESSION_ID_GENERATION_ATTEMPTS = 10;

export class SessionRegistry {
  readonly #sessions = new Map<string, EmulationSession>();

  create(): EmulationSession {
    for (let attempt = 0; attempt < MAX_SESSION_ID_GENERATION_ATTEMPTS; attempt++) {
      const id = crypto.randomUUID();
      if (this.#sessions.has(id)) {
        continue;
      }

      const session = new EmulationSession(id);
      this.#sessions.set(id, session);
      return session;
    }

    throw new Error(
      `Unable to generate a unique session ID after ${MAX_SESSION_ID_GENERATION_ATTEMPTS} attempts`,
    );
  }

  delete(id: string): boolean {
    return this.#sessions.delete(id);
  }

  get(id: string): EmulationSession | undefined {
    return this.#sessions.get(id);
  }
}
