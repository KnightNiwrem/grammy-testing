import { MAX_TELEGRAM_USER_ID, MIN_TELEGRAM_USER_ID } from '../types/telegram_identity.ts';

const LOWEST_BASIC_GROUP_ID = -999_999_999_999;
const HIGHEST_BASIC_GROUP_ID = -1;
const LOWEST_SUPERGROUP_OR_CHANNEL_ID = -1_997_852_516_352;
const HIGHEST_SUPERGROUP_OR_CHANNEL_ID = -1_000_000_000_001;

export type TelegramIdentity =
  | {
    readonly kind: 'account';
    readonly id: number;
    readonly username?: string;
  }
  | {
    readonly kind: 'bot';
    readonly id: number;
    readonly username: string;
  }
  | {
    readonly kind: 'basic_group';
    readonly id: number;
  }
  | {
    readonly kind: 'supergroup';
    readonly id: number;
    readonly username?: string;
  }
  | {
    readonly kind: 'channel';
    readonly id: number;
    readonly username?: string;
  };

export type IdentityReservationInput =
  | {
    readonly kind: 'account';
    readonly username?: string;
  }
  | {
    readonly kind: 'bot';
    readonly username: string;
  }
  | {
    readonly kind: 'basic_group';
  }
  | {
    readonly kind: 'supergroup';
    readonly username?: string;
  }
  | {
    readonly kind: 'channel';
    readonly username?: string;
  };

export type IdentityReservationFailureReason =
  | 'username_taken'
  | 'identity_limit_reached';

export type IdentityReservationResult =
  | {
    readonly reserved: true;
    readonly identity: TelegramIdentity;
  }
  | {
    readonly reserved: false;
    readonly reason: IdentityReservationFailureReason;
  };

export class TelegramIdentityRepository {
  readonly #identitiesById = new Map<number, TelegramIdentity>();
  readonly #identitiesByNormalizedUsername = new Map<string, TelegramIdentity>();
  #nextUserId = MIN_TELEGRAM_USER_ID;
  #nextBasicGroupId = HIGHEST_BASIC_GROUP_ID;
  #nextSupergroupOrChannelId = HIGHEST_SUPERGROUP_OR_CHANNEL_ID;

  reserveIdentity(input: IdentityReservationInput): IdentityReservationResult {
    const username = 'username' in input ? input.username : undefined;
    const normalizedUsername = username?.toLowerCase();
    if (
      normalizedUsername !== undefined &&
      this.#identitiesByNormalizedUsername.has(normalizedUsername)
    ) {
      return { reserved: false, reason: 'username_taken' };
    }
    const id = this.#allocateId(input.kind);
    if (id === undefined) {
      return { reserved: false, reason: 'identity_limit_reached' };
    }

    const identity: TelegramIdentity = { id, ...input };
    this.#identitiesById.set(id, identity);
    if (normalizedUsername !== undefined) {
      this.#identitiesByNormalizedUsername.set(normalizedUsername, identity);
    }

    return { reserved: true, identity };
  }

  getById(identityId: number): TelegramIdentity | undefined {
    return this.#identitiesById.get(identityId);
  }

  getByUsername(username: string): TelegramIdentity | undefined {
    return this.#identitiesByNormalizedUsername.get(username.toLowerCase());
  }

  #allocateId(kind: TelegramIdentity['kind']): number | undefined {
    switch (kind) {
      case 'account':
      case 'bot':
        if (this.#nextUserId > MAX_TELEGRAM_USER_ID) {
          return undefined;
        }
        return this.#nextUserId++;
      case 'basic_group':
        if (this.#nextBasicGroupId < LOWEST_BASIC_GROUP_ID) {
          return undefined;
        }
        return this.#nextBasicGroupId--;
      case 'supergroup':
      case 'channel':
        if (this.#nextSupergroupOrChannelId < LOWEST_SUPERGROUP_OR_CHANNEL_ID) {
          return undefined;
        }
        return this.#nextSupergroupOrChannelId--;
    }
  }
}
