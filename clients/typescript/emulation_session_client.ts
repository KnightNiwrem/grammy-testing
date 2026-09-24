import type { z } from 'zod';

import { HTTP_STATUS_CREATED, HTTP_STATUS_NO_CONTENT, HTTP_STATUS_OK } from './constants.ts';
import {
  botCommandsResponseSchema,
  callbackQueryResponseSchema,
  createdSupergroupResponseSchema,
  createdVirtualAccountSchema,
  createdVirtualBotSchema,
  getMeResponseSchema,
  messageHistoryResponseSchema,
  replyInterfaceResponseSchema,
  sentMessageResponseSchema,
  sentSupergroupMessageResponseSchema,
  supergroupMessageHistoryResponseSchema,
} from './schemas.ts';
import type {
  AccountBotCommandsInput,
  AccountEditMessageCaptionInput,
  AccountEditMessageInput,
  AccountMessageHistoryInput,
  AccountReplyInterfaceInput,
  AccountSendDocumentInput,
  AccountSendMessageInput,
  AccountSendPhotoInput,
  AddChatMemberInput,
  BotBlockInput,
  BotCommand,
  CallbackQuery,
  CreatedVirtualAccount,
  CreatedVirtualBot,
  CreateSupergroupInput,
  CreateVirtualAccountInput,
  CreateVirtualBotInput,
  DemoteChatMemberInput,
  EmulationSession,
  LeaveChatInput,
  MessageIn,
  MessageTarget,
  PressCallbackButtonInput,
  PressReplyKeyboardButtonInput,
  PrivateMessage,
  PromoteChatMemberInput,
  RemoveChatMemberInput,
  ReplyInterface,
  Supergroup,
  VirtualAccountClient,
  VirtualAccountProfile,
  VirtualBotProfile,
} from './types.ts';
import { normalizeUrlRoot, requestBytes, requestEmptyResponse, requestJson } from './utils.ts';

export interface EmulationSessionClient extends EmulationSession {
  /** Ends the session and discards all state owned by it. */
  end(): Promise<void>;
  createBot(input: CreateVirtualBotInput): Promise<CreatedVirtualBot>;
  createAccount(input: CreateVirtualAccountInput): Promise<CreatedVirtualAccount>;
  /** Calls the emulated Bot API getMe method with a virtual bot token. */
  getMe(botToken: string): Promise<VirtualBotProfile>;
  /**
   * Returns the content of a photo or document of the session's messages by its
   * `file_unique_id`, which, unlike `file_id`, is the same for every user.
   */
  downloadFile(fileUniqueId: string): Promise<Uint8Array>;
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

  downloadFile(fileUniqueId: string): Promise<Uint8Array> {
    return requestBytes(this.#fetch, {
      method: 'GET',
      url: `${this.#sessionUrl}/files/${encodeURIComponent(fileUniqueId)}`,
      expectedStatus: HTTP_STATUS_OK,
    });
  }
}

function createVirtualAccountClient(
  profile: VirtualAccountProfile,
  accountUrl: string,
  fetchImplementation: typeof globalThis.fetch,
): VirtualAccountClient {
  return Object.freeze({
    ...profile,
    async sendMessage<Target extends MessageTarget>(
      input: AccountSendMessageInput<Target>,
    ): Promise<MessageIn<Target>> {
      const response = await requestJson(fetchImplementation, {
        method: 'POST',
        url: `${accountUrl}/messages`,
        expectedStatus: HTTP_STATUS_CREATED,
        responseSchema: messageResponseSchemasFor(input.to).sent,
        body: input,
      });
      return response.message;
    },
    async sendPhoto<Target extends MessageTarget>(
      { to, photo, caption, reply_to_message_id }: AccountSendPhotoInput<Target>,
    ): Promise<MessageIn<Target>> {
      const response = await requestJson(fetchImplementation, {
        method: 'POST',
        url: `${accountUrl}/messages`,
        expectedStatus: HTTP_STATUS_CREATED,
        responseSchema: messageResponseSchemasFor(to).sent,
        body: { to, photo: { content_base64: photo.toBase64() }, caption, reply_to_message_id },
      });
      return response.message;
    },
    async sendDocument<Target extends MessageTarget>(
      { to, document, file_name, caption, reply_to_message_id }: AccountSendDocumentInput<Target>,
    ): Promise<MessageIn<Target>> {
      const response = await requestJson(fetchImplementation, {
        method: 'POST',
        url: `${accountUrl}/messages`,
        expectedStatus: HTTP_STATUS_CREATED,
        responseSchema: messageResponseSchemasFor(to).sent,
        body: {
          to,
          document: { content_base64: document.toBase64(), file_name },
          caption,
          reply_to_message_id,
        },
      });
      return response.message;
    },
    async editMessage<Target extends MessageTarget>(
      input: AccountEditMessageInput<Target>,
    ): Promise<MessageIn<Target>> {
      const messageId = encodeURIComponent(input.message_id);
      const response = await requestJson(fetchImplementation, {
        method: 'PATCH',
        url: `${conversationUrl(accountUrl, input.chat)}/messages/${messageId}`,
        expectedStatus: HTTP_STATUS_OK,
        responseSchema: messageResponseSchemasFor(input.chat).sent,
        body: { text: input.text },
      });
      return response.message;
    },
    async editMessageCaption<Target extends MessageTarget>(
      input: AccountEditMessageCaptionInput<Target>,
    ): Promise<MessageIn<Target>> {
      const messageId = encodeURIComponent(input.message_id);
      const response = await requestJson(fetchImplementation, {
        method: 'PATCH',
        url: `${conversationUrl(accountUrl, input.chat)}/messages/${messageId}`,
        expectedStatus: HTTP_STATUS_OK,
        responseSchema: messageResponseSchemasFor(input.chat).sent,
        body: { caption: input.caption },
      });
      return response.message;
    },
    async createSupergroup(input: CreateSupergroupInput): Promise<Supergroup> {
      const response = await requestJson(fetchImplementation, {
        method: 'POST',
        url: `${accountUrl}/supergroups`,
        expectedStatus: HTTP_STATUS_CREATED,
        responseSchema: createdSupergroupResponseSchema,
        body: input,
      });
      return response.supergroup;
    },
    async addChatMember(input: AddChatMemberInput): Promise<void> {
      await requestEmptyResponse(fetchImplementation, {
        method: 'PUT',
        url: `${conversationUrl(accountUrl, input.chat)}/members/${
          encodeURIComponent(input.userId)
        }`,
        expectedStatus: HTTP_STATUS_NO_CONTENT,
      });
    },
    async removeChatMember(input: RemoveChatMemberInput): Promise<void> {
      await requestEmptyResponse(fetchImplementation, {
        method: 'DELETE',
        url: `${conversationUrl(accountUrl, input.chat)}/members/${
          encodeURIComponent(input.userId)
        }`,
        expectedStatus: HTTP_STATUS_NO_CONTENT,
      });
    },
    async leaveChat(input: LeaveChatInput): Promise<void> {
      await requestEmptyResponse(fetchImplementation, {
        method: 'DELETE',
        url: `${conversationUrl(accountUrl, input.chat)}/members/${encodeURIComponent(profile.id)}`,
        expectedStatus: HTTP_STATUS_NO_CONTENT,
      });
    },
    async promoteChatMember(input: PromoteChatMemberInput): Promise<void> {
      await requestEmptyResponse(fetchImplementation, {
        method: 'PUT',
        url: `${conversationUrl(accountUrl, input.chat)}/administrators/${
          encodeURIComponent(input.userId)
        }`,
        expectedStatus: HTTP_STATUS_NO_CONTENT,
        body: input.rights,
      });
    },
    async demoteChatMember(input: DemoteChatMemberInput): Promise<void> {
      await requestEmptyResponse(fetchImplementation, {
        method: 'DELETE',
        url: `${conversationUrl(accountUrl, input.chat)}/administrators/${
          encodeURIComponent(input.userId)
        }`,
        expectedStatus: HTTP_STATUS_NO_CONTENT,
      });
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
    async getMessages<Target extends MessageTarget>(
      input: AccountMessageHistoryInput<Target>,
    ): Promise<readonly MessageIn<Target>[]> {
      const response = await requestJson(fetchImplementation, {
        method: 'GET',
        url: `${conversationUrl(accountUrl, input.chat)}/messages`,
        expectedStatus: HTTP_STATUS_OK,
        responseSchema: messageResponseSchemasFor(input.chat).history,
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
    ): Promise<PrivateMessage> {
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

/** The account's view of a chat, under which its messages and members are addressed. */
function conversationUrl(accountUrl: string, chat: MessageTarget): string {
  return chat.type === 'private'
    ? `${accountUrl}/conversations/private/${encodeURIComponent(chat.botId)}`
    : `${accountUrl}/conversations/supergroup/${encodeURIComponent(chat.chatId)}`;
}

interface MessageResponseSchemas<Target extends MessageTarget> {
  readonly sent: z.ZodType<{ readonly message: MessageIn<Target> }>;
  readonly history: z.ZodType<{ readonly messages: readonly MessageIn<Target>[] }>;
}

/**
 * Selects the response schemas for a chat's messages. TypeScript cannot relate the checked chat
 * type to the generic target, so the result is asserted; each schema validates the response at
 * run time as the messages of exactly that chat type.
 */
function messageResponseSchemasFor<Target extends MessageTarget>(
  target: Target,
): MessageResponseSchemas<Target> {
  const schemas: MessageResponseSchemas<MessageTarget> = target.type === 'supergroup'
    ? { sent: sentSupergroupMessageResponseSchema, history: supergroupMessageHistoryResponseSchema }
    : { sent: sentMessageResponseSchema, history: messageHistoryResponseSchema };
  return schemas as MessageResponseSchemas<Target>;
}

function validateBotToken(botToken: string): void {
  if (typeof botToken !== 'string' || botToken.length === 0) {
    throw new TypeError('botToken must be a non-empty string');
  }
}
