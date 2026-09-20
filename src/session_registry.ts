import { AccountRegistry } from './account_registry.ts';
import { BotRegistry } from './bot_registry.ts';
import { TelegramIdentityRegistry } from './telegram_identity_registry.ts';

export class EmulationSession {
  readonly accounts: AccountRegistry;
  readonly bots: BotRegistry;

  constructor(readonly id: string) {
    const identities = new TelegramIdentityRegistry();
    this.accounts = new AccountRegistry(identities);
    this.bots = new BotRegistry(identities);
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
