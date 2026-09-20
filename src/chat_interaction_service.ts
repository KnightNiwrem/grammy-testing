import type { VirtualAccount } from './virtual_account.ts';
import type { VirtualBot } from './virtual_bot.ts';
import type { PrivateConversation, PrivateConversationKey } from './virtual_chat.ts';

export type PrivateConversationActivationFailureReason =
  | 'account_not_found'
  | 'bot_not_found';

export type PrivateConversationActivationResult =
  | {
    readonly activated: true;
    readonly conversation: PrivateConversation;
  }
  | {
    readonly activated: false;
    readonly reason: PrivateConversationActivationFailureReason;
  };

interface AccountLookup {
  getById(accountId: number): VirtualAccount | undefined;
}

interface BotLookup {
  getById(botId: number): VirtualBot | undefined;
}

interface PrivateConversationStore {
  getOrCreatePrivateConversation(key: PrivateConversationKey): PrivateConversation;
}

interface ChatInteractionServiceDependencies {
  readonly accounts: AccountLookup;
  readonly bots: BotLookup;
  readonly chats: PrivateConversationStore;
}

export class ChatInteractionService {
  readonly #accounts: AccountLookup;
  readonly #bots: BotLookup;
  readonly #chats: PrivateConversationStore;

  constructor({ accounts, bots, chats }: ChatInteractionServiceDependencies) {
    this.#accounts = accounts;
    this.#bots = bots;
    this.#chats = chats;
  }

  activatePrivateConversation(
    input: PrivateConversationKey,
  ): PrivateConversationActivationResult {
    if (this.#accounts.getById(input.accountId) === undefined) {
      return { activated: false, reason: 'account_not_found' };
    }
    if (this.#bots.getById(input.botId) === undefined) {
      return { activated: false, reason: 'bot_not_found' };
    }

    return {
      activated: true,
      conversation: this.#chats.getOrCreatePrivateConversation(input),
    };
  }
}
