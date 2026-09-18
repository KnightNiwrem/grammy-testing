/**
 * Client library for tests: connects to a running emulation server, opens an isolated session,
 * declares the entities the test needs, and hands back the API root to point the bot at.
 */
import type {
  ChatResponse,
  CreateBotRequest,
  CreateBotResponse,
  CreatePrivateChatRequest,
  CreateSessionResponse,
  CreateUserRequest,
  CreateUserResponse,
} from '../shared/admin_protocol.ts';
import { AdminTransport } from './admin_transport.ts';
import { TestBot, TestChat, TestUser } from './handles.ts';

export { EmulationServerError } from './admin_transport.ts';
export { type ListMessagesFilter, TestBot, TestChat, TestUser } from './handles.ts';

export interface EmulationClientOptions {
  /** Origin of the running emulation server, for example `http://localhost:8081`. */
  serverUrl: string;
  /** Replaces the global `fetch`; lets tests drive the server handler without a socket. */
  fetch?: typeof fetch;
}

export class EmulationClient {
  private readonly transport: AdminTransport;

  constructor(options: EmulationClientOptions) {
    const serverUrl = options.serverUrl.replace(/\/+$/, '');
    const fetchFn = options.fetch ?? ((...args: Parameters<typeof fetch>) => fetch(...args));
    this.transport = new AdminTransport(serverUrl, fetchFn);
  }

  async createSession(): Promise<TestSession> {
    const created = await this.transport.request<CreateSessionResponse>('POST', '/sessions');
    return new TestSession(this.transport, created.sessionId, created.apiRoot);
  }
}

/**
 * A private chat is the conversation between one user and one bot. Both are members from the
 * start, which corresponds to the user having started the bot.
 */
export interface CreatePrivateChatOptions {
  user: TestUser;
  bot: TestBot;
}

export class TestSession {
  constructor(
    private readonly transport: AdminTransport,
    readonly id: string,
    /** Pass as the bot's `apiRoot` so its requests reach this session instead of Telegram. */
    readonly apiRoot: string,
  ) {}

  async createBot(definition: CreateBotRequest): Promise<TestBot> {
    const created = await this.transport.request<CreateBotResponse>(
      'POST',
      `/sessions/${this.id}/bots`,
      definition,
    );
    return new TestBot(created.token, created.user);
  }

  async createUser(definition: CreateUserRequest): Promise<TestUser> {
    const created = await this.transport.request<CreateUserResponse>(
      'POST',
      `/sessions/${this.id}/users`,
      definition,
    );
    return new TestUser(created);
  }

  async createPrivateChat(options: CreatePrivateChatOptions): Promise<TestChat> {
    const body: CreatePrivateChatRequest = {
      type: 'private',
      user_id: options.user.id,
      member_ids: [options.user.id, options.bot.id],
    };
    const created = await this.transport.request<ChatResponse>(
      'POST',
      `/sessions/${this.id}/chats`,
      body,
    );
    return new TestChat(this.transport, this.id, created.chat, created.member_ids);
  }

  /** Removes the session and everything declared in it from the server. */
  destroy(): Promise<void> {
    return this.transport.request<void>('DELETE', `/sessions/${this.id}`);
  }
}
