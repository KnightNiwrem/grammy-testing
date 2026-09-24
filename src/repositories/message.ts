import type { InlineKeyboard } from '../types/inline_keyboard.ts';
import type { PrivateConversationKey, PrivateConversationRole } from '../types/virtual_chat.ts';
import type {
  CanonicalMessageId,
  PrivateTextMessage,
  TextEntity,
} from '../types/virtual_message.ts';

export interface AddPrivateTextMessageInput {
  readonly conversation: PrivateConversationKey;
  readonly authorRole: PrivateConversationRole;
  readonly sentAtUnixSeconds: number;
  readonly text: string;
  readonly entities: readonly TextEntity[];
  /** The message of the same conversation this one replies to; omitted when it is no reply. */
  readonly replyToMessageId?: CanonicalMessageId;
  readonly inlineKeyboard?: InlineKeyboard;
  /** Omitted for a message its sender did not protect. */
  readonly isContentProtected?: boolean;
}

/** The editable content of a private text message, replaced as a whole by an edit. */
export interface PrivateTextMessageEdit {
  readonly text: string;
  readonly entities: readonly TextEntity[];
  readonly inlineKeyboard: InlineKeyboard | undefined;
  readonly textEditedAtUnixSeconds: number | undefined;
}

/** Stores canonical messages under opaque identities, independent of Telegram message IDs. */
export class MessageRepository {
  readonly #privateMessagesById = new Map<CanonicalMessageId, PrivateTextMessage>();
  readonly #privateMessageIdsByAccountId = new Map<number, Map<number, CanonicalMessageId[]>>();

  addPrivateTextMessage(input: AddPrivateTextMessageInput): PrivateTextMessage {
    const message: PrivateTextMessage = {
      kind: 'private_text',
      id: crypto.randomUUID(),
      conversation: { ...input.conversation },
      authorRole: input.authorRole,
      sentAtUnixSeconds: input.sentAtUnixSeconds,
      text: input.text,
      entities: copyEntities(input.entities),
      ...(input.replyToMessageId === undefined ? {} : { replyToMessageId: input.replyToMessageId }),
      ...(input.inlineKeyboard === undefined
        ? {}
        : { inlineKeyboard: copyInlineKeyboard(input.inlineKeyboard) }),
      isContentProtected: input.isContentProtected ?? false,
    };
    this.#privateMessagesById.set(message.id, message);

    const messageIdsByBotId = this.#privateMessageIdsByAccountId.get(
      input.conversation.accountId,
    ) ?? new Map<number, CanonicalMessageId[]>();
    const messageIds = messageIdsByBotId.get(input.conversation.botId) ?? [];
    messageIds.push(message.id);
    messageIdsByBotId.set(input.conversation.botId, messageIds);
    this.#privateMessageIdsByAccountId.set(input.conversation.accountId, messageIdsByBotId);

    return message;
  }

  getPrivateTextMessage(messageId: CanonicalMessageId): PrivateTextMessage | undefined {
    return this.#privateMessagesById.get(messageId);
  }

  /** Replaces a stored message's editable content and returns the edited message. */
  editPrivateTextMessage(
    messageId: CanonicalMessageId,
    edit: PrivateTextMessageEdit,
  ): PrivateTextMessage {
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
      isContentProtected,
    } = storedMessage;
    const editedMessage: PrivateTextMessage = {
      kind,
      id,
      conversation,
      authorRole,
      sentAtUnixSeconds,
      text: edit.text,
      entities: copyEntities(edit.entities),
      ...(replyToMessageId === undefined ? {} : { replyToMessageId }),
      ...(edit.inlineKeyboard === undefined
        ? {}
        : { inlineKeyboard: copyInlineKeyboard(edit.inlineKeyboard) }),
      ...(edit.textEditedAtUnixSeconds === undefined
        ? {}
        : { textEditedAtUnixSeconds: edit.textEditedAtUnixSeconds }),
      isContentProtected,
    };
    this.#privateMessagesById.set(messageId, editedMessage);
    return editedMessage;
  }

  /** Removes a stored message from the store and from its conversation's history. */
  deletePrivateTextMessage(messageId: CanonicalMessageId): void {
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
  }

  getPrivateConversationMessages(
    conversation: PrivateConversationKey,
  ): readonly PrivateTextMessage[] {
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
}

function copyEntities(entities: readonly TextEntity[]): readonly TextEntity[] {
  return entities.map((entity): TextEntity => ({ ...entity }));
}

function copyInlineKeyboard(inlineKeyboard: InlineKeyboard): InlineKeyboard {
  return inlineKeyboard.map((row) => row.map((button) => ({ ...button })));
}
