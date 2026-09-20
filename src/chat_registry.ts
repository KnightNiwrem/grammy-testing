import type { PrivateConversation, PrivateConversationKey } from './virtual_chat.ts';

export class ChatRegistry {
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
