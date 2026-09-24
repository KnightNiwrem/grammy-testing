import type {
  BasicGroupRegistrationResult,
  ChatMemberAdditionResult,
  ChatMemberRemovalResult,
  SharedChatRegistrationResult,
} from '../repositories/shared_chat.ts';
import type { IdentityReservationResult } from '../repositories/telegram_identity.ts';
import type { ChatDomainEvent } from '../types/chat_domain_event.ts';
import type { ChatMembership, FormerChatMemberStatus } from '../types/chat_membership.ts';
import type { VirtualAccount } from '../types/virtual_account.ts';
import type { VirtualBot } from '../types/virtual_bot.ts';
import {
  type BasicGroup,
  type Channel,
  createChatInstance,
  type SharedChat,
  type Supergroup,
} from '../types/virtual_chat.ts';
import type {
  MembershipServiceContent,
  SupergroupMessageAuthor,
} from '../types/virtual_message.ts';

export interface CreateBasicGroupInput {
  readonly title: string;
  readonly creatorAccountId: number;
  readonly initialMemberIds: readonly number[];
}

type BasicGroupParticipantValidationFailureReason =
  | 'creator_account_not_found'
  | 'initial_member_not_found'
  | 'initial_members_not_unique';

export type BasicGroupCreationFailureReason =
  | BasicGroupParticipantValidationFailureReason
  | 'identity_limit_reached';

export type BasicGroupCreationResult =
  | {
    readonly created: true;
    readonly group: BasicGroup;
  }
  | {
    readonly created: false;
    readonly reason: BasicGroupCreationFailureReason;
  };

export interface CreateSupergroupInput {
  readonly title: string;
  readonly description?: string;
  readonly creatorAccountId: number;
}

export type SupergroupCreationFailureReason =
  | 'creator_account_not_found'
  | 'identity_limit_reached';

export type SupergroupCreationResult =
  | {
    readonly created: true;
    readonly supergroup: Supergroup;
  }
  | {
    readonly created: false;
    readonly reason: SupergroupCreationFailureReason;
  };

export interface CreateChannelInput {
  readonly title: string;
  readonly description?: string;
  readonly creatorAccountId: number;
}

export type ChannelCreationFailureReason =
  | 'creator_account_not_found'
  | 'identity_limit_reached';

export type ChannelCreationResult =
  | {
    readonly created: true;
    readonly channel: Channel;
  }
  | {
    readonly created: false;
    readonly reason: ChannelCreationFailureReason;
  };

export interface AddChatMemberInput {
  readonly actorAccountId: number;
  readonly chatId: number;
  readonly memberId: number;
}

export type AddChatMemberFailureReason =
  | 'actor_account_not_found'
  | 'chat_not_found'
  | 'actor_not_authorized'
  | 'member_not_found'
  | 'bot_not_permitted_in_channel'
  | 'member_already_present';

export type AddChatMemberResult =
  | { readonly added: true }
  | {
    readonly added: false;
    readonly reason: AddChatMemberFailureReason;
  };

export interface LeaveChatInput {
  /** The account or bot that leaves. */
  readonly memberId: number;
  readonly chatId: number;
}

export type LeaveChatFailureReason =
  | 'member_not_found'
  | 'chat_not_found'
  | 'not_a_member'
  | 'owner_cannot_leave';

export type LeaveChatResult =
  | { readonly left: true }
  | {
    readonly left: false;
    readonly reason: LeaveChatFailureReason;
    /** How the membership ended, for a former member; omitted for a user that never joined. */
    readonly formerStatus?: FormerChatMemberStatus;
  };

export interface RemoveChatMemberInput {
  readonly actorAccountId: number;
  readonly chatId: number;
  readonly memberId: number;
}

export type RemoveChatMemberFailureReason =
  | 'actor_account_not_found'
  | 'chat_not_found'
  | 'actor_not_authorized'
  | 'member_not_found'
  | 'not_a_member'
  | 'member_is_owner';

export type RemoveChatMemberResult =
  | { readonly removed: true }
  | {
    readonly removed: false;
    readonly reason: RemoveChatMemberFailureReason;
  };

interface AccountLookup {
  getById(accountId: number): VirtualAccount | undefined;
}

interface BotLookup {
  getById(botId: number): VirtualBot | undefined;
}

interface SharedChatIdentityReservationStore {
  reserveIdentity(input: { readonly kind: SharedChat['kind'] }): IdentityReservationResult;
}

interface BasicGroupStore {
  registerBasicGroup(
    group: BasicGroup,
    ownerAccountId: number,
    initialMemberIds: readonly number[],
  ): BasicGroupRegistrationResult;
}

interface OwnerOnlySharedChatStore {
  registerSupergroup(
    supergroup: Supergroup,
    ownerAccountId: number,
  ): SharedChatRegistrationResult;

  registerChannel(
    channel: Channel,
    ownerAccountId: number,
  ): SharedChatRegistrationResult;
}

interface ChatMembershipStore {
  getSharedChat(chatId: number): SharedChat | undefined;
  getChatMembership(chatId: number, identityId: number): ChatMembership | undefined;
  getFormerMemberStatus(chatId: number, identityId: number): FormerChatMemberStatus | undefined;
  addChatMember(chatId: number, memberId: number): ChatMemberAdditionResult;
  removeChatMember(
    chatId: number,
    memberId: number,
    formerStatus: FormerChatMemberStatus,
  ): ChatMemberRemovalResult;
}

type SharedChatStore =
  & BasicGroupStore
  & OwnerOnlySharedChatStore
  & ChatMembershipStore;

interface ChatDomainEventSink {
  publish(event: ChatDomainEvent): void;
}

interface SupergroupMembershipChangeRecorder {
  recordMembershipChange(input: {
    readonly chatId: number;
    readonly author: SupergroupMessageAuthor;
    readonly content: MembershipServiceContent;
    readonly changedAtUnixSeconds: number;
  }): void;
}

interface SharedChatAdministrationServiceDependencies {
  readonly identities: SharedChatIdentityReservationStore;
  readonly accounts: AccountLookup;
  readonly bots: BotLookup;
  readonly sharedChats: SharedChatStore;
  readonly supergroupMessages: SupergroupMembershipChangeRecorder;
  readonly events: ChatDomainEventSink;
  readonly currentUnixTimeSeconds: () => number;
}

/**
 * Establishes and changes who takes part in basic groups, supergroups, and channels. Each change
 * of a membership is published, so that a bot learns that it joined or left a chat, and, in a
 * supergroup, recorded as a service message, as Telegram does. Service messages of basic groups
 * and channels, whose messages are not supported, are not recorded.
 */
export class SharedChatAdministrationService {
  readonly #identities: SharedChatIdentityReservationStore;
  readonly #accounts: AccountLookup;
  readonly #bots: BotLookup;
  readonly #sharedChats: SharedChatStore;
  readonly #supergroupMessages: SupergroupMembershipChangeRecorder;
  readonly #events: ChatDomainEventSink;
  readonly #currentUnixTimeSeconds: () => number;

  constructor(
    {
      identities,
      accounts,
      bots,
      sharedChats,
      supergroupMessages,
      events,
      currentUnixTimeSeconds,
    }: SharedChatAdministrationServiceDependencies,
  ) {
    this.#identities = identities;
    this.#accounts = accounts;
    this.#bots = bots;
    this.#sharedChats = sharedChats;
    this.#supergroupMessages = supergroupMessages;
    this.#events = events;
    this.#currentUnixTimeSeconds = currentUnixTimeSeconds;
  }

  createBasicGroup(input: CreateBasicGroupInput): BasicGroupCreationResult {
    const participantValidationFailure = this.#validateBasicGroupParticipants(input);
    if (participantValidationFailure !== undefined) {
      return { created: false, reason: participantValidationFailure };
    }

    const groupId = this.#reserveSharedChatId('basic_group');
    if (groupId === undefined) {
      return { created: false, reason: 'identity_limit_reached' };
    }
    const group: BasicGroup = {
      kind: 'basic_group',
      id: groupId,
      title: input.title,
    };
    const registration = this.#sharedChats.registerBasicGroup(
      group,
      input.creatorAccountId,
      input.initialMemberIds,
    );
    if (!registration.registered) {
      throw new Error(`Reserved basic group could not be registered: ${registration.reason}`);
    }

    return { created: true, group };
  }

  createSupergroup(input: CreateSupergroupInput): SupergroupCreationResult {
    if (this.#accounts.getById(input.creatorAccountId) === undefined) {
      return { created: false, reason: 'creator_account_not_found' };
    }

    const supergroupId = this.#reserveSharedChatId('supergroup');
    if (supergroupId === undefined) {
      return { created: false, reason: 'identity_limit_reached' };
    }
    const supergroup: Supergroup = {
      kind: 'supergroup',
      id: supergroupId,
      title: input.title,
      description: input.description,
      chatInstance: createChatInstance(),
    };
    const registration = this.#sharedChats.registerSupergroup(supergroup, input.creatorAccountId);
    if (!registration.registered) {
      throw new Error(`Reserved supergroup could not be registered: ${registration.reason}`);
    }

    return { created: true, supergroup };
  }

  createChannel(input: CreateChannelInput): ChannelCreationResult {
    if (this.#accounts.getById(input.creatorAccountId) === undefined) {
      return { created: false, reason: 'creator_account_not_found' };
    }

    const channelId = this.#reserveSharedChatId('channel');
    if (channelId === undefined) {
      return { created: false, reason: 'identity_limit_reached' };
    }
    const channel: Channel = {
      kind: 'channel',
      id: channelId,
      title: input.title,
      description: input.description,
    };
    const registration = this.#sharedChats.registerChannel(channel, input.creatorAccountId);
    if (!registration.registered) {
      throw new Error(`Reserved channel could not be registered: ${registration.reason}`);
    }

    return { created: true, channel };
  }

  addChatMember(input: AddChatMemberInput): AddChatMemberResult {
    if (this.#accounts.getById(input.actorAccountId) === undefined) {
      return { added: false, reason: 'actor_account_not_found' };
    }

    const chat = this.#sharedChats.getSharedChat(input.chatId);
    if (chat === undefined) {
      return { added: false, reason: 'chat_not_found' };
    }
    const actorMembership = this.#sharedChats.getChatMembership(
      input.chatId,
      input.actorAccountId,
    );
    if (actorMembership?.status !== 'owner') {
      return { added: false, reason: 'actor_not_authorized' };
    }

    const member = this.#identifyUser(input.memberId);
    if (member === undefined) {
      return { added: false, reason: 'member_not_found' };
    }
    if (chat.kind === 'channel' && member.kind === 'bot') {
      return { added: false, reason: 'bot_not_permitted_in_channel' };
    }

    // As an owner does in Telegram's apps, adding a removed member lifts its ban.
    const statusBeforeJoining = this.#sharedChats.getFormerMemberStatus(
      input.chatId,
      input.memberId,
    ) ?? 'left';
    const addition = this.#sharedChats.addChatMember(input.chatId, input.memberId);
    if (!addition.added) {
      return addition;
    }
    const addedAtUnixSeconds = this.#currentUnixTimeSeconds();
    this.#events.publish({
      type: 'chat_member_added',
      chat,
      actorAccountId: input.actorAccountId,
      memberId: input.memberId,
      statusBeforeJoining,
      addedAtUnixSeconds,
    });
    this.#recordSupergroupMembershipChange(chat, {
      author: { kind: 'account', accountId: input.actorAccountId },
      content: { kind: 'members_joined', memberIds: [input.memberId] },
      changedAtUnixSeconds: addedAtUnixSeconds,
    });
    return addition;
  }

  /**
   * Ends the membership of an account or a bot that leaves a chat. The owner cannot leave: Telegram
   * keeps a creator who left as the chat's owner, which the emulator does not support.
   */
  leaveChat({ memberId, chatId }: LeaveChatInput): LeaveChatResult {
    const member = this.#identifyUser(memberId);
    if (member === undefined) {
      return { left: false, reason: 'member_not_found' };
    }
    const chat = this.#sharedChats.getSharedChat(chatId);
    if (chat === undefined) {
      return { left: false, reason: 'chat_not_found' };
    }
    const membership = this.#sharedChats.getChatMembership(chatId, memberId);
    if (membership === undefined) {
      const formerStatus = this.#sharedChats.getFormerMemberStatus(chatId, memberId);
      return {
        left: false,
        reason: 'not_a_member',
        ...(formerStatus === undefined ? {} : { formerStatus }),
      };
    }
    if (membership.status === 'owner') {
      return { left: false, reason: 'owner_cannot_leave' };
    }

    this.#endMembership(chat, { actor: member, memberId, statusAfterLeaving: 'left' });
    return { left: true };
  }

  /**
   * Removes a member from a chat as its owner. As in Telegram's apps, removal from a supergroup or
   * channel bans the member until it is added again, whereas a basic group just loses the member.
   */
  removeChatMember(input: RemoveChatMemberInput): RemoveChatMemberResult {
    if (this.#accounts.getById(input.actorAccountId) === undefined) {
      return { removed: false, reason: 'actor_account_not_found' };
    }
    const chat = this.#sharedChats.getSharedChat(input.chatId);
    if (chat === undefined) {
      return { removed: false, reason: 'chat_not_found' };
    }
    const actorMembership = this.#sharedChats.getChatMembership(
      input.chatId,
      input.actorAccountId,
    );
    if (actorMembership?.status !== 'owner') {
      return { removed: false, reason: 'actor_not_authorized' };
    }
    if (this.#identifyUser(input.memberId) === undefined) {
      return { removed: false, reason: 'member_not_found' };
    }
    const membership = this.#sharedChats.getChatMembership(input.chatId, input.memberId);
    if (membership === undefined) {
      return { removed: false, reason: 'not_a_member' };
    }
    if (membership.status === 'owner') {
      return { removed: false, reason: 'member_is_owner' };
    }

    this.#endMembership(chat, {
      actor: { kind: 'account', accountId: input.actorAccountId },
      memberId: input.memberId,
      statusAfterLeaving: chat.kind === 'basic_group' ? 'left' : 'kicked',
    });
    return { removed: true };
  }

  /** Ends a current membership that is not the owner's, then publishes and records the change. */
  #endMembership(
    chat: SharedChat,
    { actor, memberId, statusAfterLeaving }: {
      /** The member itself when it leaves, or the account that removes it. */
      readonly actor: SupergroupMessageAuthor;
      readonly memberId: number;
      readonly statusAfterLeaving: FormerChatMemberStatus;
    },
  ): void {
    const removal = this.#sharedChats.removeChatMember(chat.id, memberId, statusAfterLeaving);
    if (!removal.removed) {
      throw new Error(
        `Member ${memberId} of chat ${chat.id} could not be removed: ${removal.reason}`,
      );
    }
    const leftAtUnixSeconds = this.#currentUnixTimeSeconds();
    this.#events.publish({
      type: 'chat_member_left',
      chat,
      actorId: actor.kind === 'account' ? actor.accountId : actor.botId,
      memberId,
      statusAfterLeaving,
      leftAtUnixSeconds,
    });
    this.#recordSupergroupMembershipChange(chat, {
      author: actor,
      content: { kind: 'member_left', memberId },
      changedAtUnixSeconds: leftAtUnixSeconds,
    });
  }

  #recordSupergroupMembershipChange(
    chat: SharedChat,
    change: {
      readonly author: SupergroupMessageAuthor;
      readonly content: MembershipServiceContent;
      readonly changedAtUnixSeconds: number;
    },
  ): void {
    if (chat.kind === 'supergroup') {
      this.#supergroupMessages.recordMembershipChange({ chatId: chat.id, ...change });
    }
  }

  /** Identifies a user as an account or a bot, as service messages name their authors. */
  #identifyUser(userId: number): SupergroupMessageAuthor | undefined {
    if (this.#accounts.getById(userId) !== undefined) {
      return { kind: 'account', accountId: userId };
    }
    return this.#bots.getById(userId) === undefined ? undefined : { kind: 'bot', botId: userId };
  }

  #validateBasicGroupParticipants(
    input: CreateBasicGroupInput,
  ): BasicGroupParticipantValidationFailureReason | undefined {
    if (this.#accounts.getById(input.creatorAccountId) === undefined) {
      return 'creator_account_not_found';
    }

    const participantIds = new Set([input.creatorAccountId]);
    for (const initialMemberId of input.initialMemberIds) {
      if (participantIds.has(initialMemberId)) {
        return 'initial_members_not_unique';
      }
      participantIds.add(initialMemberId);
    }
    for (const initialMemberId of input.initialMemberIds) {
      if (
        this.#accounts.getById(initialMemberId) === undefined &&
        this.#bots.getById(initialMemberId) === undefined
      ) {
        return 'initial_member_not_found';
      }
    }

    return undefined;
  }

  #reserveSharedChatId(kind: SharedChat['kind']): number | undefined {
    const identityReservation = this.#identities.reserveIdentity({ kind });
    if (!identityReservation.reserved) {
      if (identityReservation.reason !== 'identity_limit_reached') {
        throw new Error(
          `${kind} identity reservation failed unexpectedly: ${identityReservation.reason}`,
        );
      }
      return undefined;
    }
    if (identityReservation.identity.kind !== kind) {
      throw new Error(`${kind} identity reservation returned a different identity kind`);
    }

    return identityReservation.identity.id;
  }
}
