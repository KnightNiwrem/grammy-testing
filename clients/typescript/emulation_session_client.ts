import { HTTP_STATUS_CREATED, HTTP_STATUS_NO_CONTENT, HTTP_STATUS_OK } from './constants.ts';
import {
  botCommandsResponseSchema,
  callbackQueryResponseSchema,
  createdVirtualAccountSchema,
  createdVirtualBotSchema,
  getMeResponseSchema,
  messageHistoryResponseSchema,
  replyInterfaceResponseSchema,
  sentMessageResponseSchema,
} from './schemas.ts';
import type {
  AccountBotCommandsInput,
  AccountMessageHistoryInput,
  AccountReplyInterfaceInput,
  AccountSendMessageInput,
  BotBlockInput,
  BotCommand,
  CallbackQuery,
  CreatedVirtualAccount,
  CreatedVirtualBot,
  CreateVirtualAccountInput,
  CreateVirtualBotInput,
  EmulationSession,
  PressCallbackButtonInput,
  PressReplyKeyboardButtonInput,
  PrivateTextMessage,
  ReplyInterface,
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
    async blockBot(input: BotBlockInput): Promise<void> {
      await requestEmptyResponse(fetchImplementation, {
        method: 'PUT',
        url: `${accountUrl}/blocked-bots/${encodeURIComponent(input.botId)}`,
        expectedStatus: HTTP_STATUS_NO_CONTENT,
      });
    },
    async unblockBot(input: BotBlockInput): Promise<void> {
      await requestEmptyResponse(fetchImplementation, {
        method: 'DELETE',
        url: `${accountUrl}/blocked-bots/${encodeURIComponent(input.botId)}`,
        expectedStatus: HTTP_STATUS_NO_CONTENT,
      });
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
    async pressCallbackButton(input: PressCallbackButtonInput): Promise<CallbackQuery> {
      const response = await requestJson(fetchImplementation, {
        method: 'POST',
        url: `${accountUrl}/callback-queries`,
        expectedStatus: HTTP_STATUS_CREATED,
        responseSchema: callbackQueryResponseSchema,
        body: input,
      });
      return response.callback_query;
    },
    async getCallbackQuery(callbackQueryId: string): Promise<CallbackQuery> {
      const response = await requestJson(fetchImplementation, {
        method: 'GET',
        url: `${accountUrl}/callback-queries/${encodeURIComponent(callbackQueryId)}`,
        expectedStatus: HTTP_STATUS_OK,
        responseSchema: callbackQueryResponseSchema,
      });
      return response.callback_query;
    },
    async getBotCommands(input: AccountBotCommandsInput): Promise<readonly BotCommand[]> {
      const botId = encodeURIComponent(input.chat.botId);
      const response = await requestJson(fetchImplementation, {
        method: 'GET',
        url: `${accountUrl}/conversations/private/${botId}/commands`,
        expectedStatus: HTTP_STATUS_OK,
        responseSchema: botCommandsResponseSchema,
      });
      return response.commands;
    },
    async getReplyInterface(input: AccountReplyInterfaceInput): Promise<ReplyInterface | null> {
      const botId = encodeURIComponent(input.chat.botId);
      const response = await requestJson(fetchImplementation, {
        method: 'GET',
        url: `${accountUrl}/conversations/private/${botId}/reply-interface`,
        expectedStatus: HTTP_STATUS_OK,
        responseSchema: replyInterfaceResponseSchema,
      });
      return response.reply_interface;
    },
    async pressReplyKeyboardButton(
      input: PressReplyKeyboardButtonInput,
    ): Promise<PrivateTextMessage> {
      const response = await requestJson(fetchImplementation, {
        method: 'POST',
        url: `${accountUrl}/reply-keyboard-presses`,
        expectedStatus: HTTP_STATUS_CREATED,
        responseSchema: sentMessageResponseSchema,
        body: input,
      });
      return response.message;
    },
  });
}

function validateBotToken(botToken: string): void {
  if (typeof botToken !== 'string' || botToken.length === 0) {
    throw new TypeError('botToken must be a non-empty string');
  }
}
