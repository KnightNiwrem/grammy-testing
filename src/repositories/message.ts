import type { PrivateConversationKey } from '../types/virtual_chat.ts';
import type { PrivateTextMessage } from '../types/virtual_message.ts';

export interface AddPrivateTextMessageInput {
  readonly conversation: PrivateConversationKey;
  readonly authorAccountId: number;
  readonly sentAtUnixSeconds: number;
  readonly text: string;
}

/** Stores canonical messages and owns the session's message identifier sequence. */
export class MessageRepository {
  readonly #privateMessagesByAccountId = new Map<
    number,
    Map<number, PrivateTextMessage[]>
  >();
  #nextMessageId = 1;

  addPrivateTextMessage(input: AddPrivateTextMessageInput): PrivateTextMessage {
    const message: PrivateTextMessage = {
      kind: 'private_text',
      messageId: this.#nextMessageId++,
      conversation: { ...input.conversation },
      authorAccountId: input.authorAccountId,
      sentAtUnixSeconds: input.sentAtUnixSeconds,
      text: input.text,
    };

    const messagesByBotId = this.#privateMessagesByAccountId.get(input.conversation.accountId) ??
      new Map<number, PrivateTextMessage[]>();
    const messages = messagesByBotId.get(input.conversation.botId) ?? [];
    messages.push(message);
    messagesByBotId.set(input.conversation.botId, messages);
    this.#privateMessagesByAccountId.set(input.conversation.accountId, messagesByBotId);

    return message;
  }

  getPrivateConversationMessages(
    conversation: PrivateConversationKey,
  ): readonly PrivateTextMessage[] {
    return [
      ...(
        this.#privateMessagesByAccountId.get(conversation.accountId)?.get(conversation.botId) ?? []
      ),
    ];
  }
}
