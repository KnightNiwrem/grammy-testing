const MAX_TELEGRAM_USER_ID = 4_503_599_627_370_495;

export interface TelegramIdentity {
  readonly id: number;
  readonly username?: string;
}

export type IdentityReservationResult =
  | {
    readonly reserved: true;
    readonly identity: TelegramIdentity;
  }
  | {
    readonly reserved: false;
    readonly reason: 'username_taken' | 'identity_limit_reached';
  };

export class TelegramIdentityRegistry {
  readonly #identitiesById = new Map<number, TelegramIdentity>();
  readonly #identitiesByNormalizedUsername = new Map<string, TelegramIdentity>();
  #nextUserId = 1;

  reserveIdentity(username?: string): IdentityReservationResult {
    const normalizedUsername = username?.toLowerCase();
    if (
      normalizedUsername !== undefined &&
      this.#identitiesByNormalizedUsername.has(normalizedUsername)
    ) {
      return { reserved: false, reason: 'username_taken' };
    }
    if (this.#nextUserId > MAX_TELEGRAM_USER_ID) {
      return { reserved: false, reason: 'identity_limit_reached' };
    }

    const id = this.#nextUserId++;
    const identity: TelegramIdentity = username === undefined ? { id } : { id, username };
    this.#identitiesById.set(id, identity);
    if (normalizedUsername !== undefined) {
      this.#identitiesByNormalizedUsername.set(normalizedUsername, identity);
    }

    return { reserved: true, identity };
  }
}
