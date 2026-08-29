import type { Context } from 'grammy';

import { MessagesLog } from './messages-log';
import type { Supergroup } from './supergroup';

/**
 * Options accepted by `supergroup.newTopic(...)`.
 */
export interface NewTopicOptions {
  /** Display name of the forum topic. */
  name: string;
  /**
   * Explicit `message_thread_id` for the topic. When omitted, a unique ID is
   * auto-generated from the shared message-ID counter — mirroring real Telegram,
   * where a topic's thread ID equals the `message_id` of its creation service message.
   */
  messageThreadId?: number;
}

/**
 * A forum topic registered on a forum-enabled `Supergroup`. Carries a stable
 * `messageThreadId` and a topic-scoped `MessagesLog` projection containing only
 * the captured bot messages that targeted this topic.
 *
 * Mint topics with `supergroup.newTopic({ name, messageThreadId? })` on a
 * supergroup created with `isForum: true`.
 */
export class ForumTopic<TContext extends Context = Context> {
  /** Topic-scoped projection of captured bot messages targeting this topic. */
  readonly messages = new MessagesLog<TContext>();

  /**
   * Creates a `ForumTopic` bound to its parent forum.
   * @param forum - The forum supergroup this topic belongs to.
   * @param name - Display name of the topic.
   * @param messageThreadId - The stable `message_thread_id` identifying this topic.
   */
  constructor(
    public readonly forum: Supergroup<TContext>,
    public readonly name: string,
    public readonly messageThreadId: number,
  ) {}
}
