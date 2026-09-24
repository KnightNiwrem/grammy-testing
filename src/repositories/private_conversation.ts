import type { PrivateConversation, PrivateConversationKey } from '../types/virtual_chat.ts';
import type { CanonicalMessageId } from '../types/virtual_message.ts';

export class PrivateConversationRepository {
  readonly #privateConversationsByAccountId = new Map<number, Map<number, PrivateConversation>>();
  /** Keyed like conversations: by account ID, then by bot ID. */
  readonly #replyInterfaceMessageIdsByAccountId = new Map<
    number,
    Map<number, CanonicalMessageId>
  >();

  getOrCreatePrivateConversation(
    input: PrivateConversationKey,
  ): PrivateConversation {
    const existingConversation = this.getPrivateConversation(input);
    if (existingConversation !== undefined) {
      return existingConversation;
    }

    const conversation: PrivateConversation = {
      kind: 'private',
      accountId: input.accountId,
      botId: input.botId,
      chatInstance: createChatInstance(),
    };
    const conversationsByBotId = this.#privateConversationsByAccountId.get(input.accountId) ??
      new Map<number, PrivateConversation>();
    conversationsByBotId.set(input.botId, conversation);
    this.#privateConversationsByAccountId.set(input.accountId, conversationsByBotId);

    return conversation;
  }

  getPrivateConversation(
    { accountId, botId }: PrivateConversationKey,
  ): PrivateConversation | undefined {
    return this.#privateConversationsByAccountId.get(accountId)?.get(botId);
  }

  /**
   * Returns the message whose reply interface the account's client shows in the conversation, as
   * TDLib's `reply_markup_message_id` identifies it, or `undefined` when it shows none.
   */
  getReplyInterfaceMessageId(
    { accountId, botId }: PrivateConversationKey,
  ): CanonicalMessageId | undefined {
    return this.#replyInterfaceMessageIdsByAccountId.get(accountId)?.get(botId);
  }

  /** Records the message whose reply interface the client shows; `undefined` shows none. */
  setReplyInterfaceMessageId(
    { accountId, botId }: PrivateConversationKey,
    messageId: CanonicalMessageId | undefined,
  ): void {
    if (this.getPrivateConversation({ accountId, botId }) === undefined) {
      throw new Error(
        `Private conversation of account ${accountId} and bot ${botId} does not exist`,
      );
    }
    const messageIdsByBotId = this.#replyInterfaceMessageIdsByAccountId.get(accountId) ??
      new Map<number, CanonicalMessageId>();
    if (messageId === undefined) {
      messageIdsByBotId.delete(botId);
    } else {
      messageIdsByBotId.set(botId, messageId);
    }
    this.#replyInterfaceMessageIdsByAccountId.set(accountId, messageIdsByBotId);
  }
}

/** Telegram's chat instances look like random signed 64-bit integers. */
function createChatInstance(): string {
  return crypto.getRandomValues(new BigInt64Array(1))[0].toString();
}
