import type { PrivateConversationKey, PrivateConversationRole } from '../types/virtual_chat.ts';
import type { PrivateTextMessage, TextEntity } from '../types/virtual_message.ts';

export interface AddPrivateTextMessageInput {
  readonly conversation: PrivateConversationKey;
  readonly authorRole: PrivateConversationRole;
  readonly sentAtUnixSeconds: number;
  readonly text: string;
  readonly entities: readonly TextEntity[];
}

/** Stores canonical messages under opaque identities, independent of Telegram message IDs. */
export class MessageRepository {
  readonly #privateMessagesByAccountId = new Map<
    number,
    Map<number, PrivateTextMessage[]>
  >();

  addPrivateTextMessage(input: AddPrivateTextMessageInput): PrivateTextMessage {
    const message: PrivateTextMessage = {
      kind: 'private_text',
      id: crypto.randomUUID(),
      conversation: { ...input.conversation },
      authorRole: input.authorRole,
      sentAtUnixSeconds: input.sentAtUnixSeconds,
      text: input.text,
      entities: input.entities.map((entity) => ({ ...entity })),
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
