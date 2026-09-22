import { HTTP_STATUS_CREATED, HTTP_STATUS_NO_CONTENT, HTTP_STATUS_OK } from './constants.ts';
import {
  createdVirtualAccountSchema,
  createdVirtualBotSchema,
  getMeResponseSchema,
  messageHistoryResponseSchema,
  sentMessageResponseSchema,
} from './schemas.ts';
import type {
  AccountMessageHistoryInput,
  AccountSendMessageInput,
  CreatedVirtualAccount,
  CreatedVirtualBot,
  CreateVirtualAccountInput,
  CreateVirtualBotInput,
  EmulationSession,
  PrivateTextMessage,
  VirtualAccountClient,
  VirtualAccountProfile,
  VirtualBotProfile,
} from './types.ts';
import { normalizeUrlRoot, requestEmptyResponse, requestJson } from './utils.ts';

export interface EmulationSessionClient extends EmulationSession {
  /** Ends the session and discards all state owned by it. */
  end(): Promise<void>;
  createBot(input: CreateVirtualBotInput): Promise<CreatedVirtualBot>;
  createAccount(input: CreateVirtualAccountInput): Promise<CreatedVirtualAccount>;
  /** Calls the emulated Bot API getMe method with a virtual bot token. */
  getMe(botToken: string): Promise<VirtualBotProfile>;
}

export function createEmulationSessionClient(
  serverRoot: URL,
  session: EmulationSession,
  fetchImplementation: typeof globalThis.fetch,
): EmulationSessionClient {
  return new HttpEmulationSessionClient(serverRoot, session, fetchImplementation);
}

class HttpEmulationSessionClient implements EmulationSessionClient {
  readonly id: string;
  readonly botApiRoot: string;
  readonly #sessionUrl: string;
  readonly #botApiRoot: URL;
  readonly #fetch: typeof globalThis.fetch;

  constructor(
    serverRoot: URL,
    session: EmulationSession,
    fetchImplementation: typeof globalThis.fetch,
  ) {
    this.id = session.id;
    this.botApiRoot = session.botApiRoot;
    this.#sessionUrl = new URL(`sessions/${encodeURIComponent(session.id)}`, serverRoot).href;
    this.#botApiRoot = normalizeUrlRoot(session.botApiRoot, 'botApiRoot');
    this.#fetch = fetchImplementation;
  }

  async end(): Promise<void> {
    await requestEmptyResponse(this.#fetch, {
      method: 'DELETE',
      url: this.#sessionUrl,
      expectedStatus: HTTP_STATUS_NO_CONTENT,
    });
  }

  createBot(input: CreateVirtualBotInput): Promise<CreatedVirtualBot> {
    return requestJson(this.#fetch, {
      method: 'POST',
      url: `${this.#sessionUrl}/bots`,
      expectedStatus: HTTP_STATUS_CREATED,
      responseSchema: createdVirtualBotSchema,
      body: input,
    });
  }

  async createAccount(input: CreateVirtualAccountInput): Promise<CreatedVirtualAccount> {
    const response = await requestJson(this.#fetch, {
      method: 'POST',
      url: `${this.#sessionUrl}/accounts`,
      expectedStatus: HTTP_STATUS_CREATED,
      responseSchema: createdVirtualAccountSchema,
      body: input,
    });
    return {
      account: createVirtualAccountClient(
        response.account,
        `${this.#sessionUrl}/accounts/${response.account.id}`,
        this.#fetch,
      ),
    };
  }

  async getMe(botToken: string): Promise<VirtualBotProfile> {
    validateBotToken(botToken);

    const response = await requestJson(this.#fetch, {
      method: 'POST',
      url: new URL(`bot${encodeURIComponent(botToken)}/getMe`, this.#botApiRoot).href,
      expectedStatus: HTTP_STATUS_OK,
      responseSchema: getMeResponseSchema,
    });
    return response.result;
  }
}

function createVirtualAccountClient(
  profile: VirtualAccountProfile,
  accountUrl: string,
  fetchImplementation: typeof globalThis.fetch,
): VirtualAccountClient {
  return Object.freeze({
    ...profile,
    async sendMessage(input: AccountSendMessageInput): Promise<PrivateTextMessage> {
      const response = await requestJson(fetchImplementation, {
        method: 'POST',
        url: `${accountUrl}/messages`,
        expectedStatus: HTTP_STATUS_CREATED,
        responseSchema: sentMessageResponseSchema,
        body: input,
      });
      return response.message;
    },
    async getMessages(input: AccountMessageHistoryInput): Promise<readonly PrivateTextMessage[]> {
      const botId = encodeURIComponent(input.chat.botId);
      const response = await requestJson(fetchImplementation, {
        method: 'GET',
        url: `${accountUrl}/conversations/private/${botId}/messages`,
        expectedStatus: HTTP_STATUS_OK,
        responseSchema: messageHistoryResponseSchema,
      });
      return response.messages;
    },
  });
}

function validateBotToken(botToken: string): void {
  if (typeof botToken !== 'string' || botToken.length === 0) {
    throw new TypeError('botToken must be a non-empty string');
  }
}
