import type { ChatMembership, FormerChatMemberStatus } from '../types/chat_membership.ts';
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

export type ChatMemberRemovalFailureReason = 'chat_not_found' | 'not_a_member';

export type ChatMemberRemovalResult =
  | { readonly removed: true }
  | {
    readonly removed: false;
    readonly reason: ChatMemberRemovalFailureReason;
  };

/**
 * Stores shared chats together with their memberships, so that a registered chat always has its
 * owner and initial members. It remembers how each former member's membership ended until the
 * member is added again.
 */
export class SharedChatRepository {
  readonly #sharedChatsById = new Map<number, SharedChat>();
  readonly #sharedChatMembershipsByChatId = new Map<number, Map<number, ChatMembership>>();
  readonly #formerMemberStatusesByChatId = new Map<number, Map<number, FormerChatMemberStatus>>();

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
    this.#formerMemberStatusesByChatId.set(chat.id, new Map());
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

  /** Returns how a former member's membership ended; `undefined` for a member or a stranger. */
  getFormerMemberStatus(chatId: number, identityId: number): FormerChatMemberStatus | undefined {
    return this.#formerMemberStatusesByChatId.get(chatId)?.get(identityId);
  }

  /** Returns the identities of the chat's members, owner included, in the order they joined. */
  getChatMemberIds(chatId: number): readonly number[] {
    return [...(this.#sharedChatMembershipsByChatId.get(chatId)?.keys() ?? [])];
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
    this.#formerMemberStatusesByChatId.get(chatId)?.delete(memberId);
    return { added: true };
  }

  /** Ends a membership, remembering how it ended. */
  removeChatMember(
    chatId: number,
    memberId: number,
    formerStatus: FormerChatMemberStatus,
  ): ChatMemberRemovalResult {
    const membershipsByIdentityId = this.#sharedChatMembershipsByChatId.get(chatId);
    const formerMemberStatuses = this.#formerMemberStatusesByChatId.get(chatId);
    if (membershipsByIdentityId === undefined || formerMemberStatuses === undefined) {
      return { removed: false, reason: 'chat_not_found' };
    }
    if (!membershipsByIdentityId.delete(memberId)) {
      return { removed: false, reason: 'not_a_member' };
    }

    formerMemberStatuses.set(memberId, formerStatus);
    return { removed: true };
  }
}
