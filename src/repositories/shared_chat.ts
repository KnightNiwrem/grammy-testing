import type { ChatMembership } from '../types/chat_membership.ts';
import type { BasicGroup, Channel, SharedChat, Supergroup } from '../types/virtual_chat.ts';

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

export type ChatMemberAdditionFailureReason =
  | 'chat_not_found'
  | 'member_already_present';

export type ChatMemberAdditionResult =
  | { readonly added: true }
  | {
    readonly added: false;
    readonly reason: ChatMemberAdditionFailureReason;
  };

/**
 * Stores shared chats together with their memberships, so that a registered chat always has its
 * owner and initial members.
 */
export class SharedChatRepository {
  readonly #sharedChatsById = new Map<number, SharedChat>();
  readonly #sharedChatMembershipsByChatId = new Map<number, Map<number, ChatMembership>>();

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

  addChatMember(chatId: number, memberId: number): ChatMemberAdditionResult {
    const membershipsByIdentityId = this.#sharedChatMembershipsByChatId.get(chatId);
    if (membershipsByIdentityId === undefined) {
      return { added: false, reason: 'chat_not_found' };
    }
    if (membershipsByIdentityId.has(memberId)) {
      return { added: false, reason: 'member_already_present' };
    }

    membershipsByIdentityId.set(memberId, {
      status: 'member',
      identityId: memberId,
    });
    return { added: true };
  }
}
