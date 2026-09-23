import { type BotApiUpdateType, DEFAULT_ALLOWED_UPDATE_TYPES } from '../types/bot_api.ts';

/** Owns the update types each bot has subscribed to through `allowed_updates`. */
export class BotUpdateSubscriptionRepository {
  readonly #allowedUpdateTypesByBotId = new Map<number, ReadonlySet<BotApiUpdateType>>();

  /** Returns the default subscription for a bot that has never chosen one. */
  getAllowedUpdateTypes(botId: number): ReadonlySet<BotApiUpdateType> {
    return this.#allowedUpdateTypesByBotId.get(botId) ?? DEFAULT_ALLOWED_UPDATE_TYPES;
  }

  setAllowedUpdateTypes(botId: number, allowedUpdateTypes: ReadonlySet<BotApiUpdateType>): void {
    this.#allowedUpdateTypesByBotId.set(botId, allowedUpdateTypes);
  }
}
