import { ChatInteractionService } from '../services/chat_interaction.ts';
import { VirtualUserService } from '../services/virtual_user.ts';
import { AccountRepository } from './account.ts';
import { BotRepository } from './bot.ts';
import { ChatRepository } from './chat.ts';
import { TelegramIdentityRepository } from './telegram_identity.ts';

export class EmulationSession {
  readonly identities: TelegramIdentityRepository;
  readonly accounts: AccountRepository;
  readonly bots: BotRepository;
  readonly virtualUsers: VirtualUserService;
  readonly chats: ChatRepository;
  readonly chatInteractions: ChatInteractionService;

  constructor(readonly id: string) {
    this.identities = new TelegramIdentityRepository();
    this.accounts = new AccountRepository();
    this.bots = new BotRepository();
    this.virtualUsers = new VirtualUserService({
      identities: this.identities,
      accounts: this.accounts,
      bots: this.bots,
    });
    this.chats = new ChatRepository();
    this.chatInteractions = new ChatInteractionService({
      identities: this.identities,
      accounts: this.accounts,
      bots: this.bots,
      chats: this.chats,
    });
  }
}

const MAX_SESSION_ID_GENERATION_ATTEMPTS = 10;

export class SessionRepository {
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
