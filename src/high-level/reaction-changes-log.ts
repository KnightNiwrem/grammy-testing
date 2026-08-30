import type { Context } from 'grammy';
import type { ReactionType } from 'grammy/types';

import type { Reply } from './reply';

/**
 * A captured `setMessageReaction` API call, normalised for test assertions.
 */
export interface ReactionChange<TContext extends Context = Context> {
  /** The `chat_id` from the outgoing payload. */
  chatId: number | string;
  /** The target `message_id`. */
  messageId: number;
  /** The bot's complete replacement reaction set. Empty means remove its reaction. */
  reaction: readonly ReactionType[];
  /** Whether Telegram should show the reaction with a large animation. */
  isBig: boolean | undefined;
  /** The captured reply when the target was sent by the bot during this test. */
  reply: Reply<TContext> | undefined;
  /** The original captured outgoing-API payload (escape hatch). */
  raw: Record<string, unknown>;
}

/**
 * Collection of captured `setMessageReaction` calls in capture order.
 * Available orchestrator-wide as `chats.reactionChanges` and per chat as
 * `chat.reactionChanges`.
 */
export class ReactionChangesLog<TContext extends Context = Context> {
  private readonly items: ReactionChange<TContext>[] = [];

  /**
   * Appends a captured reaction change to the log.
   * @param change - The reaction change to append.
   */
  push(change: ReactionChange<TContext>): void {
    this.items.push(change);
  }

  /**
   * Number of captured reaction changes.
   * @returns The count of captured changes.
   */
  get length(): number {
    return this.items.length;
  }

  /**
   * The most recently captured reaction change, or `undefined`.
   * @returns The last change, or `undefined`.
   */
  get last(): ReactionChange<TContext> | undefined {
    return this.items.at(-1);
  }

  /**
   * Read-only view of all captured reaction changes in dispatch order.
   * @returns A read-only array of all captured changes.
   */
  get all(): readonly ReactionChange<TContext>[] {
    return this.items;
  }

  /**
   * Returns the last reaction change or throws if the log is empty.
   * @returns The last `ReactionChange<TContext>`.
   * @throws {Error} When the log is empty.
   */
  lastOrThrow(): ReactionChange<TContext> {
    const last = this.items.at(-1);

    if (last === undefined) {
      throw new Error('Expected a reaction change but the log is empty');
    }

    return last;
  }

  /** Removes all reaction changes from the log. */
  clear(): void {
    this.items.length = 0;
  }
}
