import type { ChatActionChat, ShownChatActionType } from '../types/virtual_chat.ts';

/** A chat action a bot shows in a chat, with when it last sent it. */
export interface ShownChatAction {
  readonly botId: number;
  readonly action: ShownChatActionType;
  readonly sentAtMilliseconds: number;
}

/**
 * Stores the chat actions bots show in each chat, one per bot, in the order the bots last sent
 * them.
 */
export class ChatActionRepository {
  readonly #actionsByChatKey = new Map<string, readonly ShownChatAction[]>();

  /** Replaces the bot's action in the chat with a newly sent one, which becomes the latest. */
  showAction(chat: ChatActionChat, shownAction: ShownChatAction): void {
    const chatKey = serializeChatKey(chat);
    this.#actionsByChatKey.set(chatKey, [
      ...this.#withoutBotAction(chatKey, shownAction.botId),
      { ...shownAction },
    ]);
  }

  /** Removes the bot's action from the chat, if it shows one. */
  removeAction(chat: ChatActionChat, botId: number): void {
    const chatKey = serializeChatKey(chat);
    const remainingActions = this.#withoutBotAction(chatKey, botId);
    if (remainingActions.length === 0) {
      this.#actionsByChatKey.delete(chatKey);
    } else {
      this.#actionsByChatKey.set(chatKey, remainingActions);
    }
  }

  /** Returns the chat's actions, oldest first, including any that clients no longer show. */
  getActions(chat: ChatActionChat): readonly ShownChatAction[] {
    return this.#actionsByChatKey.get(serializeChatKey(chat)) ?? [];
  }

  #withoutBotAction(chatKey: string, botId: number): readonly ShownChatAction[] {
    return (this.#actionsByChatKey.get(chatKey) ?? []).filter((action) => action.botId !== botId);
  }
}

function serializeChatKey(chat: ChatActionChat): string {
  switch (chat.type) {
    case 'private':
      return `private:${chat.accountId}:${chat.botId}`;
    case 'supergroup':
      return `supergroup:${chat.chatId}`;
    default: {
      const unhandledChat: never = chat;
      throw new Error(`Unhandled chat action chat: ${JSON.stringify(unhandledChat)}`);
    }
  }
}
