import type { QueuedRateLimitResponses } from '../types/bot_rate_limit.ts';

/** Stores the rate limit answers queued for each bot, in the order they were queued. */
export class BotRateLimitRepository {
  readonly #queuedResponsesByBotId = new Map<number, QueuedRateLimitResponses[]>();

  enqueue(botId: number, responses: QueuedRateLimitResponses): void {
    const queue = this.#queuedResponsesByBotId.get(botId) ?? [];
    queue.push({ ...responses });
    this.#queuedResponsesByBotId.set(botId, queue);
  }

  /** Returns the bot's queued answers, earliest first. */
  list(botId: number): readonly QueuedRateLimitResponses[] {
    return (this.#queuedResponsesByBotId.get(botId) ?? []).map((responses) => ({ ...responses }));
  }

  /**
   * Takes one answer for a call of the method from the earliest queued answers that apply to it,
   * forgetting them once none remain; returns its `retry_after` in seconds, or `undefined` if
   * none apply.
   */
  take(botId: number, methodName: string): number | undefined {
    const queue = this.#queuedResponsesByBotId.get(botId) ?? [];
    const index = queue.findIndex((responses) =>
      responses.methodName === undefined || responses.methodName === methodName
    );
    if (index === -1) {
      return undefined;
    }
    const { retryAfterSeconds, remainingCount } = queue[index];
    if (remainingCount === 1) {
      queue.splice(index, 1);
    } else {
      queue[index] = { ...queue[index], remainingCount: remainingCount - 1 };
    }
    return retryAfterSeconds;
  }
}
