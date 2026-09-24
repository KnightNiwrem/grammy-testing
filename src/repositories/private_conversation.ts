import type { PrivateConversation, PrivateConversationKey } from '../types/virtual_chat.ts';

export class PrivateConversationRepository {
  readonly #privateConversationsByAccountId = new Map<number, Map<number, PrivateConversation>>();

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
}

/** Telegram's chat instances look like random signed 64-bit integers. */
function createChatInstance(): string {
  return crypto.getRandomValues(new BigInt64Array(1))[0].toString();
}
