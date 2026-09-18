/**
 * Handles to entities a test has declared in a session. Each carries the Telegram object the
 * server created and offers the operations that concern that entity.
 */
import type { Chat, Message, User, UserFromGetMe } from 'grammy/types';
import type { ListMessagesResponse } from '../shared/admin_protocol.ts';
import type { AdminTransport } from './admin_transport.ts';

export class TestBot {
  constructor(
    /** Token to construct the bot under test with. */
    readonly token: string,
    readonly user: UserFromGetMe,
  ) {}

  get id(): number {
    return this.user.id;
  }
}

export class TestUser {
  constructor(readonly user: User) {}

  get id(): number {
    return this.user.id;
  }
}

export interface ListMessagesFilter {
  /** Only messages sent by this user or bot. */
  fromId?: number;
}

export class TestChat {
  constructor(
    private readonly transport: AdminTransport,
    private readonly sessionId: string,
    readonly chat: Chat,
    /** Identifiers of the members declared when the chat was created. */
    readonly memberIds: readonly number[],
  ) {}

  get id(): number {
    return this.chat.id;
  }

  /** Messages sent in this chat so far, oldest first. Always fetched from the server. */
  listMessages(filter: ListMessagesFilter = {}): Promise<Message[]> {
    const query = new URLSearchParams();
    if (filter.fromId !== undefined) query.set('from_id', String(filter.fromId));
    const suffix = query.size === 0 ? '' : `?${query}`;
    return this.transport.request<ListMessagesResponse>(
      'GET',
      `/sessions/${this.sessionId}/chats/${this.chat.id}/messages${suffix}`,
    );
  }
}
