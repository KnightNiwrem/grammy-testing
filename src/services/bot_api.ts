import type { BotApiUpdate } from '../types/bot_api.ts';
import type { VirtualBot, VirtualBotProfile } from '../types/virtual_bot.ts';

export interface GetUpdatesRequest {
  readonly offset?: number;
  readonly limit: number;
  readonly timeoutSeconds: number;
  readonly signal?: AbortSignal;
}

interface BotCredentialLookup {
  getByToken(token: string): VirtualBot | undefined;
}

interface BotUpdateMailboxPolling {
  getUpdates(botId: number, input: GetUpdatesRequest): Promise<readonly BotApiUpdate[]>;
}

interface BotApiServiceDependencies {
  readonly bots: BotCredentialLookup;
  readonly botUpdates: BotUpdateMailboxPolling;
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

  constructor({ bots, botUpdates }: BotApiServiceDependencies) {
    this.#bots = bots;
    this.#botUpdates = botUpdates;
  }

  /** Returns the profile of the bot that owns `token`, or `undefined` if no bot does. */
  authenticate(token: string): VirtualBotProfile | undefined {
    return this.#bots.getByToken(token)?.profile;
  }

  getUpdates(
    authenticatedBot: VirtualBotProfile,
    request: GetUpdatesRequest,
  ): Promise<readonly BotApiUpdate[]> {
    return this.#botUpdates.getUpdates(authenticatedBot.id, request);
  }
}
