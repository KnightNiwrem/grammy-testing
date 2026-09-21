import type { ChatMembership } from './chat_membership.ts';
import type {
  BasicGroup,
  Channel,
  PrivateConversation,
  PrivateConversationKey,
  SharedChat,
  Supergroup,
} from './virtual_chat.ts';

export type SharedChatRegistrationFailureReason = 'chat_id_taken';

export type BasicGroupRegistrationFailureReason =
  | SharedChatRegistrationFailureReason
  | 'initial_members_not_unique';

export type SharedChatRegistrationResult =
  | { readonly registered: true }
  | {
    readonly registered: false;
    readonly reason: SharedChatRegistrationFailureReason;
  };

export type BasicGroupRegistrationResult =
  | { readonly registered: true }
  | {
    readonly registered: false;
    readonly reason: BasicGroupRegistrationFailureReason;
  };

export class ChatRegistry {
  readonly #privateConversationsByAccountId = new Map<number, Map<number, PrivateConversation>>();
  readonly #sharedChatsById = new Map<number, SharedChat>();
  readonly #sharedChatMembershipsByChatId = new Map<number, Map<number, ChatMembership>>();

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

  registerBasicGroup(
    group: BasicGroup,
    ownerAccountId: number,
    initialMemberIds: readonly number[],
  ): BasicGroupRegistrationResult {
    if (this.#sharedChatsById.has(group.id)) {
      return { registered: false, reason: 'chat_id_taken' };
    }

    const membershipsByIdentityId = new Map<number, ChatMembership>([
      [ownerAccountId, { status: 'owner', identityId: ownerAccountId }],
    ]);
    for (const initialMemberId of initialMemberIds) {
      if (membershipsByIdentityId.has(initialMemberId)) {
        return { registered: false, reason: 'initial_members_not_unique' };
      }
      membershipsByIdentityId.set(initialMemberId, {
        status: 'member',
        identityId: initialMemberId,
      });
    }

    this.#storeSharedChat(group, membershipsByIdentityId);
    return { registered: true };
  }

  registerSupergroup(
    supergroup: Supergroup,
    ownerAccountId: number,
  ): SharedChatRegistrationResult {
    return this.#registerOwnerOnlyChat(supergroup, ownerAccountId);
  }

  registerChannel(
    channel: Channel,
    ownerAccountId: number,
  ): SharedChatRegistrationResult {
    return this.#registerOwnerOnlyChat(channel, ownerAccountId);
  }

  #registerOwnerOnlyChat(
    chat: Supergroup | Channel,
    ownerAccountId: number,
  ): SharedChatRegistrationResult {
    if (this.#sharedChatsById.has(chat.id)) {
      return { registered: false, reason: 'chat_id_taken' };
    }

    this.#storeSharedChat(
      chat,
      new Map([
        [ownerAccountId, { status: 'owner', identityId: ownerAccountId }],
      ]),
    );
    return { registered: true };
  }

  #storeSharedChat(
    chat: SharedChat,
    membershipsByIdentityId: Map<number, ChatMembership>,
  ): void {
    this.#sharedChatsById.set(chat.id, chat);
    this.#sharedChatMembershipsByChatId.set(chat.id, membershipsByIdentityId);
  }

  getSharedChat(id: number): SharedChat | undefined {
    return this.#sharedChatsById.get(id);
  }

  getChatMembership(
    chatId: number,
    identityId: number,
  ): ChatMembership | undefined {
    return this.#sharedChatMembershipsByChatId.get(chatId)?.get(identityId);
  }
}
