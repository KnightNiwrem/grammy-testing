import { HTTP_STATUS_CREATED, HTTP_STATUS_NO_CONTENT, HTTP_STATUS_OK } from './constants.ts';
import {
  createdVirtualAccountSchema,
  createdVirtualBotSchema,
  getMeResponseSchema,
} from './schemas.ts';
import type {
  CreatedVirtualAccount,
  CreatedVirtualBot,
  CreateVirtualAccountInput,
  CreateVirtualBotInput,
  EmulationSession,
  VirtualBotProfile,
} from './types.ts';
import { normalizeUrlRoot, requestJson, requestWithoutBody } from './utils.ts';

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
    await requestWithoutBody(this.#fetch, {
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

  createAccount(input: CreateVirtualAccountInput): Promise<CreatedVirtualAccount> {
    return requestJson(this.#fetch, {
      method: 'POST',
      url: `${this.#sessionUrl}/accounts`,
      expectedStatus: HTTP_STATUS_CREATED,
      responseSchema: createdVirtualAccountSchema,
      body: input,
    });
  }

  async getMe(botToken: string): Promise<VirtualBotProfile> {
    if (typeof botToken !== 'string' || botToken.length === 0) {
      throw new TypeError('botToken must be a non-empty string');
    }

    const response = await requestJson(this.#fetch, {
      method: 'POST',
      url: new URL(`bot${encodeURIComponent(botToken)}/getMe`, this.#botApiRoot).href,
      expectedStatus: HTTP_STATUS_OK,
      responseSchema: getMeResponseSchema,
    });
    return response.result;
  }
}
