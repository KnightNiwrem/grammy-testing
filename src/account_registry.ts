import type {
  IdentityReservationFailureReason,
  TelegramIdentityRegistry,
} from './telegram_identity_registry.ts';
import type { VirtualAccount, VirtualAccountProfile } from './virtual_account.ts';

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

export class AccountRegistry {
  readonly #identities: TelegramIdentityRegistry;
  readonly #accountsById = new Map<number, VirtualAccount>();

  constructor(identities: TelegramIdentityRegistry) {
    this.#identities = identities;
  }

  create(input: CreateVirtualAccountInput): AccountCreationResult {
    const identityReservation = this.#identities.reserveIdentity(input.username);
    if (!identityReservation.reserved) {
      return { created: false, reason: identityReservation.reason };
    }

    const profile: VirtualAccountProfile = {
      ...input,
      id: identityReservation.identity.id,
      is_bot: false,
    };
    const account: VirtualAccount = { profile };
    this.#accountsById.set(profile.id, account);

    return { created: true, account };
  }
}
