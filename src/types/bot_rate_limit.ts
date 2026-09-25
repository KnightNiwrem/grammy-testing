/**
 * `429 Too Many Requests` answers that a test queues for a bot's next Bot API calls, so that the
 * bot's handling of Telegram's rate limits can be tested without reproducing the limits.
 */
export interface QueuedRateLimitResponses {
  /**
   * The Bot API method whose calls receive the answers, by its current name; omitted for calls of
   * any method.
   */
  readonly methodName?: string;
  /** The `retry_after` of every answer: how many seconds the bot should wait before retrying. */
  readonly retryAfterSeconds: number;
  /** How many of the next matching calls still receive an answer; always positive. */
  readonly remainingCount: number;
}
