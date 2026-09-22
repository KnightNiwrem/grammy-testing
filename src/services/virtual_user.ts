import type {
  IdentityReservationFailureReason,
  IdentityReservationInput,
  IdentityReservationResult,
} from '../repositories/telegram_identity.ts';
import type { VirtualAccount, VirtualAccountProfile } from '../virtual_account.ts';
import type { VirtualBot, VirtualBotProfile } from '../virtual_bot.ts';

export type CreateVirtualAccountInput =
  & Pick<VirtualAccountProfile, 'first_name'>
  & Partial<
    Pick<
      VirtualAccountProfile,
      'last_name' | 'username' | 'language_code'
    >
  >;

export type AccountCreationResult =
  | {
    readonly created: true;
    readonly account: VirtualAccount;
  }
  | {
    readonly created: false;
    readonly reason: IdentityReservationFailureReason;
  };

export type CreateVirtualBotInput = Pick<VirtualBotProfile, 'first_name' | 'username'>;

export type BotCreationResult =
  | {
    readonly created: true;
    readonly bot: VirtualBot;
  }
  | {
    readonly created: false;
    readonly reason: IdentityReservationFailureReason;
  };

interface IdentityReservationStore {
  reserveIdentity(input: IdentityReservationInput): IdentityReservationResult;
}

interface AccountStore {
  add(account: VirtualAccount): boolean;
}

interface BotStore {
  add(bot: VirtualBot): boolean;
}

interface VirtualUserServiceDependencies {
  readonly identities: IdentityReservationStore;
  readonly accounts: AccountStore;
  readonly bots: BotStore;
}

export class VirtualUserService {
  readonly #identities: IdentityReservationStore;
  readonly #accounts: AccountStore;
  readonly #bots: BotStore;

  constructor({ identities, accounts, bots }: VirtualUserServiceDependencies) {
    this.#identities = identities;
    this.#accounts = accounts;
    this.#bots = bots;
  }

  createAccount(input: CreateVirtualAccountInput): AccountCreationResult {
    const identityReservation = this.#identities.reserveIdentity({
      kind: 'account',
      username: input.username,
    });
    if (!identityReservation.reserved) {
      return { created: false, reason: identityReservation.reason };
    }
    if (identityReservation.identity.kind !== 'account') {
      throw new Error('Account identity reservation returned a different identity kind');
    }

    const profile: VirtualAccountProfile = {
      ...input,
      id: identityReservation.identity.id,
      is_bot: false,
    };
    const account: VirtualAccount = { profile };
    if (!this.#accounts.add(account)) {
      throw new Error(`Account ID ${profile.id} is already registered`);
    }

    return { created: true, account };
  }

  createBot(input: CreateVirtualBotInput): BotCreationResult {
    const tokenSecret = crypto.randomUUID();
    const identityReservation = this.#identities.reserveIdentity({
      kind: 'bot',
      username: input.username,
    });
    if (!identityReservation.reserved) {
      return { created: false, reason: identityReservation.reason };
    }
    if (identityReservation.identity.kind !== 'bot') {
      throw new Error('Bot identity reservation returned a different identity kind');
    }

    const profile: VirtualBotProfile = {
      id: identityReservation.identity.id,
      is_bot: true,
      first_name: input.first_name,
      username: input.username,
      can_join_groups: true,
      can_read_all_group_messages: false,
      supports_inline_queries: false,
      can_connect_to_business: false,
      has_main_web_app: false,
      has_topics_enabled: false,
      allows_users_to_create_topics: false,
      can_manage_bots: false,
      supports_join_request_queries: false,
    };
    const bot: VirtualBot = {
      token: `${profile.id}:${tokenSecret}`,
      profile,
    };
    if (!this.#bots.add(bot)) {
      throw new Error(`Bot ID ${profile.id} or token is already registered`);
    }

    return { created: true, bot };
  }
}
