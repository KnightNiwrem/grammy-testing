import type { ChatMembership } from '../types/chat_membership.ts';
import type { VirtualAccount } from '../types/virtual_account.ts';
import type { VirtualBot } from '../types/virtual_bot.ts';
import {
  CHAT_ACTION_TIMEOUT_MILLISECONDS,
  type ChatAction,
  type ChatActionChat,
  type PrivateConversationKey,
  type SharedChat,
  type ShownChatActionType,
  type VisibleChatAction,
} from '../types/virtual_chat.ts';

export type GetChatActionsResult =
  | { readonly found: true; readonly chatActions: readonly VisibleChatAction[] }
  | {
    readonly found: false;
    readonly reason: 'account_not_found' | 'bot_not_found' | 'chat_not_found' | 'not_a_member';
  };

/** Identifies a supergroup as one of its members sees it. */
export interface SupergroupChatActionsKey {
  readonly accountId: number;
  readonly chatId: number;
}

interface AccountLookup {
  getById(accountId: number): VirtualAccount | undefined;
}

interface BotLookup {
  getById(botId: number): VirtualBot | undefined;
}

interface SupergroupMembershipLookup {
  getSharedChat(chatId: number): SharedChat | undefined;
  getChatMembership(chatId: number, identityId: number): ChatMembership | undefined;
}

interface ChatActionStore {
  showAction(
    chat: ChatActionChat,
    shownAction: {
      readonly botId: number;
      readonly action: ShownChatActionType;
      readonly sentAtMilliseconds: number;
    },
  ): void;
  removeAction(chat: ChatActionChat, botId: number): void;
  getActions(chat: ChatActionChat): readonly {
    readonly botId: number;
    readonly action: ShownChatActionType;
    readonly sentAtMilliseconds: number;
  }[];
}

interface ChatActionServiceDependencies {
  readonly accounts: AccountLookup;
  readonly bots: BotLookup;
  readonly sharedChats: SupergroupMembershipLookup;
  readonly chatActions: ChatActionStore;
  readonly currentTimeMilliseconds: () => number;
}

/**
 * Keeps the chat actions, such as typing, that bots show in their chats, as accounts' clients see
 * them through TDLib's `DialogActionManager`. A bot's action shows until it cancels it, until
 * `CHAT_ACTION_TIMEOUT_MILLISECONDS` pass without the bot sending it again, or until the bot sends
 * a message to the chat, which ends any action of a bot.
 *
 * Callers check that the bot may send the action to the chat before recording it.
 */
export class ChatActionService {
  readonly #accounts: AccountLookup;
  readonly #bots: BotLookup;
  readonly #sharedChats: SupergroupMembershipLookup;
  readonly #chatActions: ChatActionStore;
  readonly #currentTimeMilliseconds: () => number;

  constructor(
    { accounts, bots, sharedChats, chatActions, currentTimeMilliseconds }:
      ChatActionServiceDependencies,
  ) {
    this.#accounts = accounts;
    this.#bots = bots;
    this.#sharedChats = sharedChats;
    this.#chatActions = chatActions;
    this.#currentTimeMilliseconds = currentTimeMilliseconds;
  }

  /** Records a chat action a bot sent to a chat; `cancel` stops showing the bot's action. */
  recordBotChatAction(
    { botId, chat, action }: {
      readonly botId: number;
      readonly chat: ChatActionChat;
      readonly action: ChatAction;
    },
  ): void {
    if (action === 'cancel') {
      this.#chatActions.removeAction(chat, botId);
      return;
    }
    this.#chatActions.showAction(chat, {
      botId,
      action,
      sentAtMilliseconds: this.#currentTimeMilliseconds(),
    });
  }

  /** Ends the chat action of a bot that sent a message to the chat. */
  endBotChatAction({ botId, chat }: { readonly botId: number; readonly chat: ChatActionChat }) {
    this.#chatActions.removeAction(chat, botId);
  }

  /** Returns the chat action an account's client shows in its private chat with a bot. */
  getPrivateChatActions({ accountId, botId }: PrivateConversationKey): GetChatActionsResult {
    if (this.#accounts.getById(accountId) === undefined) {
      return { found: false, reason: 'account_not_found' };
    }
    if (this.#bots.getById(botId) === undefined) {
      return { found: false, reason: 'bot_not_found' };
    }
    return {
      found: true,
      chatActions: this.#findVisibleActions({ type: 'private', accountId, botId }),
    };
  }

  /**
   * Returns the chat actions a member's client shows in a supergroup, in the order the bots last
   * sent them.
   */
  getSupergroupChatActions(
    { accountId, chatId }: SupergroupChatActionsKey,
  ): GetChatActionsResult {
    if (this.#accounts.getById(accountId) === undefined) {
      return { found: false, reason: 'account_not_found' };
    }
    if (this.#sharedChats.getSharedChat(chatId)?.kind !== 'supergroup') {
      return { found: false, reason: 'chat_not_found' };
    }
    if (this.#sharedChats.getChatMembership(chatId, accountId) === undefined) {
      return { found: false, reason: 'not_a_member' };
    }
    return { found: true, chatActions: this.#findVisibleActions({ type: 'supergroup', chatId }) };
  }

  #findVisibleActions(chat: ChatActionChat): readonly VisibleChatAction[] {
    const now = this.#currentTimeMilliseconds();
    return this.#chatActions.getActions(chat)
      .filter(({ sentAtMilliseconds }) =>
        now < sentAtMilliseconds + CHAT_ACTION_TIMEOUT_MILLISECONDS
      )
      .map(({ botId, action }) => ({ botId, action }));
  }
}
