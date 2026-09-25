import type { InlineKeyboard } from '../types/inline_keyboard.ts';
import type { ReplyInterface } from '../types/reply_interface.ts';
import type { PrivateConversationKey, PrivateConversationRole } from '../types/virtual_chat.ts';
import type {
  CanonicalMessageId,
  ChatMessage,
  InlineMessageId,
  MessageContent,
  MessageForwardInfo,
  PrivateMessage,
  SupergroupMessage,
  SupergroupMessageAuthor,
  SupergroupMessageContent,
  ViaBot,
} from '../types/virtual_message.ts';

/** Telegram's inline message identifiers encode 24 bytes of TL data as base64url. */
const INLINE_MESSAGE_ID_BYTE_COUNT = 24;

export interface AddPrivateMessageInput {
  readonly conversation: PrivateConversationKey;
  readonly authorRole: PrivateConversationRole;
  readonly sentAtUnixSeconds: number;
  readonly content: MessageContent;
  /** The message of the same conversation this one replies to; omitted when it is no reply. */
  readonly replyToMessageId?: CanonicalMessageId;
  readonly inlineKeyboard?: InlineKeyboard;
  readonly replyInterface?: ReplyInterface;
  /**
   * The bot through whose inline mode the account sent the message, which gives the message an
   * inline message identifier; omitted for other messages.
   */
  readonly viaBotId?: number;
  /** Omitted for a message that is no forward. */
  readonly forwardInfo?: MessageForwardInfo;
  /** Omitted for a message its sender did not protect. */
  readonly isContentProtected?: boolean;
}

export interface AddSupergroupMessageInput {
  readonly chatId: number;
  readonly author: SupergroupMessageAuthor;
  readonly sentAtUnixSeconds: number;
  readonly content: SupergroupMessageContent;
  /** The message of the same supergroup this one replies to; omitted when it is no reply. */
  readonly replyToMessageId?: CanonicalMessageId;
  readonly inlineKeyboard?: InlineKeyboard;
  /** As `AddPrivateMessageInput` describes it. */
  readonly viaBotId?: number;
  /** Omitted for a message that is no forward. */
  readonly forwardInfo?: MessageForwardInfo;
  /** Omitted for a message its sender did not protect. */
  readonly isContentProtected?: boolean;
}

/** The editable parts of a message, replaced as a whole by an edit. */
export interface MessageEdit {
  readonly content: MessageContent;
  readonly inlineKeyboard: InlineKeyboard | undefined;
  readonly contentEditedAtUnixSeconds: number | undefined;
}

/**
 * Stores canonical messages under opaque identities, independent of Telegram message IDs, and finds
 * messages sent through a bot's inline mode by their inline message identifiers.
 */
export class MessageRepository {
  readonly #privateMessagesById = new Map<CanonicalMessageId, PrivateMessage>();
  readonly #privateMessageIdsByAccountId = new Map<number, Map<number, CanonicalMessageId[]>>();
  readonly #supergroupMessagesById = new Map<CanonicalMessageId, SupergroupMessage>();
  readonly #supergroupMessageIdsByChatId = new Map<number, CanonicalMessageId[]>();
  readonly #messageIdsByInlineMessageId = new Map<InlineMessageId, CanonicalMessageId>();

  addPrivateMessage(input: AddPrivateMessageInput): PrivateMessage {
    const message: PrivateMessage = {
      kind: 'private_message',
      id: crypto.randomUUID(),
      conversation: { ...input.conversation },
      authorRole: input.authorRole,
      sentAtUnixSeconds: input.sentAtUnixSeconds,
      content: copyContent(input.content),
      ...(input.replyToMessageId === undefined ? {} : { replyToMessageId: input.replyToMessageId }),
      ...(input.inlineKeyboard === undefined
        ? {}
        : { inlineKeyboard: copyInlineKeyboard(input.inlineKeyboard) }),
      ...this.#createViaBot(input.viaBotId),
      ...(input.forwardInfo === undefined ? {} : { forwardInfo: { ...input.forwardInfo } }),
      ...(input.replyInterface === undefined
        ? {}
        : { replyInterface: copyReplyInterface(input.replyInterface) }),
      isContentProtected: input.isContentProtected ?? false,
    };
    this.#privateMessagesById.set(message.id, message);
    this.#indexInlineMessage(message);

    const messageIdsByBotId = this.#privateMessageIdsByAccountId.get(
      input.conversation.accountId,
    ) ?? new Map<number, CanonicalMessageId[]>();
    const messageIds = messageIdsByBotId.get(input.conversation.botId) ?? [];
    messageIds.push(message.id);
    messageIdsByBotId.set(input.conversation.botId, messageIds);
    this.#privateMessageIdsByAccountId.set(input.conversation.accountId, messageIdsByBotId);

    return message;
  }

  getPrivateMessage(messageId: CanonicalMessageId): PrivateMessage | undefined {
    return this.#privateMessagesById.get(messageId);
  }

  /** Replaces a stored message's editable content and returns the edited message. */
  editPrivateMessage(
    messageId: CanonicalMessageId,
    edit: MessageEdit,
  ): PrivateMessage {
    const storedMessage = this.#privateMessagesById.get(messageId);
    if (storedMessage === undefined) {
      throw new Error(`Private message ${messageId} does not exist`);
    }

    const {
      id,
      kind,
      conversation,
      authorRole,
      sentAtUnixSeconds,
      replyToMessageId,
      viaBot,
      forwardInfo,
      replyInterface,
      isContentProtected,
    } = storedMessage;
    const editedMessage: PrivateMessage = {
      kind,
      id,
      conversation,
      authorRole,
      sentAtUnixSeconds,
      content: copyContent(edit.content),
      ...(replyToMessageId === undefined ? {} : { replyToMessageId }),
      ...(edit.inlineKeyboard === undefined
        ? {}
        : { inlineKeyboard: copyInlineKeyboard(edit.inlineKeyboard) }),
      ...(viaBot === undefined ? {} : { viaBot }),
      ...(forwardInfo === undefined ? {} : { forwardInfo }),
      ...(replyInterface === undefined ? {} : { replyInterface }),
      ...(edit.contentEditedAtUnixSeconds === undefined
        ? {}
        : { contentEditedAtUnixSeconds: edit.contentEditedAtUnixSeconds }),
      isContentProtected,
    };
    this.#privateMessagesById.set(messageId, editedMessage);
    return editedMessage;
  }

  /** Removes a stored message from the store and from its conversation's history. */
  deletePrivateMessage(messageId: CanonicalMessageId): void {
    const storedMessage = this.#privateMessagesById.get(messageId);
    if (storedMessage === undefined) {
      throw new Error(`Private message ${messageId} does not exist`);
    }

    const { accountId, botId } = storedMessage.conversation;
    const conversationMessageIds = this.#privateMessageIdsByAccountId.get(accountId)?.get(botId);
    const historyIndex = conversationMessageIds?.indexOf(messageId) ?? -1;
    if (conversationMessageIds === undefined || historyIndex === -1) {
      throw new Error(`Private message ${messageId} is stored but not listed`);
    }
    conversationMessageIds.splice(historyIndex, 1);
    this.#privateMessagesById.delete(messageId);
    this.#unindexInlineMessage(storedMessage);
  }

  getPrivateConversationMessages(
    conversation: PrivateConversationKey,
  ): readonly PrivateMessage[] {
    const messageIds =
      this.#privateMessageIdsByAccountId.get(conversation.accountId)?.get(conversation.botId) ??
        [];
    return messageIds.map((messageId) => {
      const message = this.#privateMessagesById.get(messageId);
      if (message === undefined) {
        throw new Error(`Private message ${messageId} is listed but not stored`);
      }
      return message;
    });
  }

  addSupergroupMessage(input: AddSupergroupMessageInput): SupergroupMessage {
    const message: SupergroupMessage = {
      kind: 'supergroup_message',
      id: crypto.randomUUID(),
      chatId: input.chatId,
      author: { ...input.author },
      sentAtUnixSeconds: input.sentAtUnixSeconds,
      content: copyContent(input.content),
      ...(input.replyToMessageId === undefined ? {} : { replyToMessageId: input.replyToMessageId }),
      ...(input.inlineKeyboard === undefined
        ? {}
        : { inlineKeyboard: copyInlineKeyboard(input.inlineKeyboard) }),
      ...this.#createViaBot(input.viaBotId),
      ...(input.forwardInfo === undefined ? {} : { forwardInfo: { ...input.forwardInfo } }),
      isContentProtected: input.isContentProtected ?? false,
    };
    this.#supergroupMessagesById.set(message.id, message);
    this.#indexInlineMessage(message);

    const messageIds = this.#supergroupMessageIdsByChatId.get(input.chatId) ?? [];
    messageIds.push(message.id);
    this.#supergroupMessageIdsByChatId.set(input.chatId, messageIds);

    return message;
  }

  getSupergroupMessage(messageId: CanonicalMessageId): SupergroupMessage | undefined {
    return this.#supergroupMessagesById.get(messageId);
  }

  /** Replaces a stored supergroup message's editable content and returns the edited message. */
  editSupergroupMessage(
    messageId: CanonicalMessageId,
    edit: MessageEdit,
  ): SupergroupMessage {
    const storedMessage = this.#supergroupMessagesById.get(messageId);
    if (storedMessage === undefined) {
      throw new Error(`Supergroup message ${messageId} does not exist`);
    }

    const {
      id,
      kind,
      chatId,
      author,
      sentAtUnixSeconds,
      replyToMessageId,
      viaBot,
      forwardInfo,
      isContentProtected,
    } = storedMessage;
    const editedMessage: SupergroupMessage = {
      kind,
      id,
      chatId,
      author,
      sentAtUnixSeconds,
      content: copyContent(edit.content),
      ...(replyToMessageId === undefined ? {} : { replyToMessageId }),
      ...(edit.inlineKeyboard === undefined
        ? {}
        : { inlineKeyboard: copyInlineKeyboard(edit.inlineKeyboard) }),
      ...(viaBot === undefined ? {} : { viaBot }),
      ...(forwardInfo === undefined ? {} : { forwardInfo }),
      ...(edit.contentEditedAtUnixSeconds === undefined
        ? {}
        : { contentEditedAtUnixSeconds: edit.contentEditedAtUnixSeconds }),
      isContentProtected,
    };
    this.#supergroupMessagesById.set(messageId, editedMessage);
    return editedMessage;
  }

  /** Removes a stored message from the store and from its supergroup's history. */
  deleteSupergroupMessage(messageId: CanonicalMessageId): void {
    const storedMessage = this.#supergroupMessagesById.get(messageId);
    if (storedMessage === undefined) {
      throw new Error(`Supergroup message ${messageId} does not exist`);
    }

    const chatMessageIds = this.#supergroupMessageIdsByChatId.get(storedMessage.chatId);
    const historyIndex = chatMessageIds?.indexOf(messageId) ?? -1;
    if (chatMessageIds === undefined || historyIndex === -1) {
      throw new Error(`Supergroup message ${messageId} is stored but not listed`);
    }
    chatMessageIds.splice(historyIndex, 1);
    this.#supergroupMessagesById.delete(messageId);
    this.#unindexInlineMessage(storedMessage);
  }

  /** Finds a message of any chat that was sent through a bot's inline mode, until it is deleted. */
  getMessageByInlineMessageId(inlineMessageId: InlineMessageId): ChatMessage | undefined {
    const messageId = this.#messageIdsByInlineMessageId.get(inlineMessageId);
    if (messageId === undefined) {
      return undefined;
    }
    const message = this.#privateMessagesById.get(messageId) ??
      this.#supergroupMessagesById.get(messageId);
    if (message === undefined) {
      throw new Error(`Inline message ${inlineMessageId} is indexed but not stored`);
    }
    return message;
  }

  getSupergroupMessages(chatId: number): readonly SupergroupMessage[] {
    const messageIds = this.#supergroupMessageIdsByChatId.get(chatId) ?? [];
    return messageIds.map((messageId) => {
      const message = this.#supergroupMessagesById.get(messageId);
      if (message === undefined) {
        throw new Error(`Supergroup message ${messageId} is listed but not stored`);
      }
      return message;
    });
  }

  #createViaBot(viaBotId: number | undefined): { readonly viaBot?: ViaBot } {
    if (viaBotId === undefined) {
      return {};
    }
    const inlineMessageId = crypto.getRandomValues(new Uint8Array(INLINE_MESSAGE_ID_BYTE_COUNT))
      .toBase64({ alphabet: 'base64url', omitPadding: true });
    return { viaBot: { botId: viaBotId, inlineMessageId } };
  }

  #indexInlineMessage(message: ChatMessage): void {
    if (message.viaBot !== undefined) {
      this.#messageIdsByInlineMessageId.set(message.viaBot.inlineMessageId, message.id);
    }
  }

  #unindexInlineMessage(message: ChatMessage): void {
    if (message.viaBot !== undefined) {
      this.#messageIdsByInlineMessageId.delete(message.viaBot.inlineMessageId);
    }
  }
}

function copyContent<Content extends SupergroupMessageContent>(content: Content): Content;
function copyContent(content: SupergroupMessageContent): SupergroupMessageContent {
  switch (content.kind) {
    case 'text':
      return { ...content, entities: content.entities.map((entity) => ({ ...entity })) };
    case 'photo':
    case 'document':
      return {
        ...content,
        caption: {
          text: content.caption.text,
          entities: content.caption.entities.map((entity) => ({ ...entity })),
        },
      };
    case 'members_joined':
      return { ...content, memberIds: [...content.memberIds] };
    case 'member_left':
      return { ...content };
    default: {
      const unhandledContent: never = content;
      throw new Error(`Unhandled message content: ${JSON.stringify(unhandledContent)}`);
    }
  }
}

function copyInlineKeyboard(inlineKeyboard: InlineKeyboard): InlineKeyboard {
  return inlineKeyboard.map((row) => row.map((button) => ({ ...button })));
}

function copyReplyInterface(replyInterface: ReplyInterface): ReplyInterface {
  return replyInterface.kind === 'reply_keyboard'
    ? {
      ...replyInterface,
      rows: replyInterface.rows.map((row) => row.map((button) => ({ ...button }))),
    }
    : { ...replyInterface };
}
