import type {
  IdentityReservationFailureReason,
  TelegramIdentityRegistry,
} from './telegram_identity_registry.ts';
import type { VirtualBot, VirtualBotProfile } from './virtual_bot.ts';

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

export class BotRegistry {
  readonly #identities: TelegramIdentityRegistry;
  readonly #botsById = new Map<number, VirtualBot>();
  readonly #botsByToken = new Map<string, VirtualBot>();

  constructor(identities: TelegramIdentityRegistry) {
    this.#identities = identities;
  }

  create(input: CreateVirtualBotInput): BotCreationResult {
    const tokenSecret = crypto.randomUUID();
    const identityReservation = this.#identities.reserveIdentity(input.username);
    if (!identityReservation.reserved) {
      return { created: false, reason: identityReservation.reason };
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
    this.#botsById.set(profile.id, bot);
    this.#botsByToken.set(bot.token, bot);

    return { created: true, bot };
  }

  getByToken(token: string): VirtualBot | undefined {
    return this.#botsByToken.get(token);
  }
}
