import {
  BOT_API_UPDATE_TYPES,
  type BotApiUpdate,
  type BotApiUpdateType,
  DEFAULT_ALLOWED_UPDATE_TYPES,
} from '../types/bot_api.ts';
import type { VirtualBot, VirtualBotProfile } from '../types/virtual_bot.ts';

export interface GetUpdatesRequest {
  readonly offset?: number;
  readonly limit: number;
  readonly timeoutSeconds: number;
  /** Requested update type names; omitting them keeps the bot's current subscription. */
  readonly allowedUpdates?: readonly string[];
  readonly signal?: AbortSignal;
}

type PendingUpdatesRequest = Omit<GetUpdatesRequest, 'allowedUpdates'>;

interface BotCredentialLookup {
  getByToken(token: string): VirtualBot | undefined;
}

interface BotUpdateMailboxPolling {
  getUpdates(botId: number, input: PendingUpdatesRequest): Promise<readonly BotApiUpdate[]>;
}

interface BotUpdateSubscriptionStore {
  setAllowedUpdateTypes(botId: number, allowedUpdateTypes: ReadonlySet<BotApiUpdateType>): void;
}

interface BotApiServiceDependencies {
  readonly bots: BotCredentialLookup;
  readonly botUpdates: BotUpdateMailboxPolling;
  readonly updateSubscriptions: BotUpdateSubscriptionStore;
}

/**
 * The application boundary for Bot API methods.
 *
 * Transport authenticates each call with `authenticate` before invoking a method, so that an
 * invalid token is rejected before request parameters are validated, as Telegram does. Invariants
 * that span a bot's configuration and update delivery, such as polling and webhook delivery being
 * mutually exclusive, belong here rather than in route handlers.
 */
export class BotApiService {
  readonly #bots: BotCredentialLookup;
  readonly #botUpdates: BotUpdateMailboxPolling;
  readonly #updateSubscriptions: BotUpdateSubscriptionStore;

  constructor({ bots, botUpdates, updateSubscriptions }: BotApiServiceDependencies) {
    this.#bots = bots;
    this.#botUpdates = botUpdates;
    this.#updateSubscriptions = updateSubscriptions;
  }

  /** Returns the profile of the bot that owns `token`, or `undefined` if no bot does. */
  authenticate(token: string): VirtualBotProfile | undefined {
    return this.#bots.getByToken(token)?.profile;
  }

  /**
   * Changes the bot's subscription before reading its mailbox, as Telegram does. The new
   * subscription applies only to updates created afterward; pending updates are still returned.
   */
  getUpdates(
    authenticatedBot: VirtualBotProfile,
    { allowedUpdates, ...pendingUpdatesRequest }: GetUpdatesRequest,
  ): Promise<readonly BotApiUpdate[]> {
    if (allowedUpdates !== undefined) {
      this.#updateSubscriptions.setAllowedUpdateTypes(
        authenticatedBot.id,
        resolveAllowedUpdateTypes(allowedUpdates),
      );
    }
    return this.#botUpdates.getUpdates(authenticatedBot.id, pendingUpdatesRequest);
  }
}

/**
 * Interprets `allowed_updates` as Telegram's `get_allowed_update_types` does: names match
 * case-insensitively, unrecognized names are ignored, and a list with no recognized name selects
 * the default subscription.
 */
function resolveAllowedUpdateTypes(
  requestedUpdateTypeNames: readonly string[],
): ReadonlySet<BotApiUpdateType> {
  const requestedNames = new Set(requestedUpdateTypeNames.map((name) => name.toLowerCase()));
  const allowedUpdateTypes = new Set(
    BOT_API_UPDATE_TYPES.filter((updateType) => requestedNames.has(updateType)),
  );
  return allowedUpdateTypes.size === 0 ? DEFAULT_ALLOWED_UPDATE_TYPES : allowedUpdateTypes;
}
