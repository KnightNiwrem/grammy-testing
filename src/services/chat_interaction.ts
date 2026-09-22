import type {
  BasicGroupRegistrationResult,
  ChatMemberAdditionResult,
  SharedChatRegistrationResult,
} from '../repositories/chat.ts';
import type { IdentityReservationResult } from '../repositories/telegram_identity.ts';
import type { ChatMembership } from '../chat_membership.ts';
import type { VirtualAccount } from '../virtual_account.ts';
import type { VirtualBot } from '../virtual_bot.ts';
import type {
  BasicGroup,
  Channel,
  PrivateConversation,
  PrivateConversationKey,
  SharedChat,
  Supergroup,
} from '../virtual_chat.ts';

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

export type PrivateConversationActivationFailureReason =
  | 'account_not_found'
  | 'bot_not_found';

export type PrivateConversationActivationResult =
  | {
    readonly activated: true;
    readonly conversation: PrivateConversation;
  }
  | {
    readonly activated: false;
    readonly reason: PrivateConversationActivationFailureReason;
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

interface AccountLookup {
  getById(accountId: number): VirtualAccount | undefined;
}

interface BotLookup {
  getById(botId: number): VirtualBot | undefined;
}

interface PrivateConversationStore {
  getOrCreatePrivateConversation(key: PrivateConversationKey): PrivateConversation;
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
  addChatMember(chatId: number, memberId: number): ChatMemberAdditionResult;
}

type ChatStore =
  & PrivateConversationStore
  & BasicGroupStore
  & OwnerOnlySharedChatStore
  & ChatMembershipStore;

interface ChatInteractionServiceDependencies {
  readonly identities: SharedChatIdentityReservationStore;
  readonly accounts: AccountLookup;
  readonly bots: BotLookup;
  readonly chats: ChatStore;
}

export class ChatInteractionService {
  readonly #identities: SharedChatIdentityReservationStore;
  readonly #accounts: AccountLookup;
  readonly #bots: BotLookup;
  readonly #chats: ChatStore;

  constructor({ identities, accounts, bots, chats }: ChatInteractionServiceDependencies) {
    this.#identities = identities;
    this.#accounts = accounts;
    this.#bots = bots;
    this.#chats = chats;
  }

  activatePrivateConversation(
    input: PrivateConversationKey,
  ): PrivateConversationActivationResult {
    if (this.#accounts.getById(input.accountId) === undefined) {
      return { activated: false, reason: 'account_not_found' };
    }
    if (this.#bots.getById(input.botId) === undefined) {
      return { activated: false, reason: 'bot_not_found' };
    }

    return {
      activated: true,
      conversation: this.#chats.getOrCreatePrivateConversation(input),
    };
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
    const registration = this.#chats.registerBasicGroup(
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
    };
    const registration = this.#chats.registerSupergroup(supergroup, input.creatorAccountId);
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
    const registration = this.#chats.registerChannel(channel, input.creatorAccountId);
    if (!registration.registered) {
      throw new Error(`Reserved channel could not be registered: ${registration.reason}`);
    }

    return { created: true, channel };
  }

  addChatMember(input: AddChatMemberInput): AddChatMemberResult {
    if (this.#accounts.getById(input.actorAccountId) === undefined) {
      return { added: false, reason: 'actor_account_not_found' };
    }

    const chat = this.#chats.getSharedChat(input.chatId);
    if (chat === undefined) {
      return { added: false, reason: 'chat_not_found' };
    }
    const actorMembership = this.#chats.getChatMembership(input.chatId, input.actorAccountId);
    if (actorMembership?.status !== 'owner') {
      return { added: false, reason: 'actor_not_authorized' };
    }

    const memberIsAccount = this.#accounts.getById(input.memberId) !== undefined;
    const memberIsBot = this.#bots.getById(input.memberId) !== undefined;
    if (!memberIsAccount && !memberIsBot) {
      return { added: false, reason: 'member_not_found' };
    }
    if (chat.kind === 'channel' && memberIsBot) {
      return { added: false, reason: 'bot_not_permitted_in_channel' };
    }

    return this.#chats.addChatMember(input.chatId, input.memberId);
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
