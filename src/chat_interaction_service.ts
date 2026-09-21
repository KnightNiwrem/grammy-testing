import type { BasicGroupRegistrationResult } from './chat_registry.ts';
import type { IdentityReservationResult } from './telegram_identity_registry.ts';
import type { VirtualAccount } from './virtual_account.ts';
import type { VirtualBot } from './virtual_bot.ts';
import type { BasicGroup, PrivateConversation, PrivateConversationKey } from './virtual_chat.ts';

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

interface AccountLookup {
  getById(accountId: number): VirtualAccount | undefined;
}

interface BotLookup {
  getById(botId: number): VirtualBot | undefined;
}

interface PrivateConversationStore {
  getOrCreatePrivateConversation(key: PrivateConversationKey): PrivateConversation;
}

interface BasicGroupIdentityReservationStore {
  reserveIdentity(input: { readonly kind: 'basic_group' }): IdentityReservationResult;
}

interface BasicGroupStore {
  registerBasicGroup(
    group: BasicGroup,
    ownerAccountId: number,
    initialMemberIds: readonly number[],
  ): BasicGroupRegistrationResult;
}

interface ChatInteractionServiceDependencies {
  readonly identities: BasicGroupIdentityReservationStore;
  readonly accounts: AccountLookup;
  readonly bots: BotLookup;
  readonly chats: PrivateConversationStore & BasicGroupStore;
}

export class ChatInteractionService {
  readonly #identities: BasicGroupIdentityReservationStore;
  readonly #accounts: AccountLookup;
  readonly #bots: BotLookup;
  readonly #chats: PrivateConversationStore & BasicGroupStore;

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

    const groupId = this.#reserveBasicGroupId();
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

  #reserveBasicGroupId(): number | undefined {
    const identityReservation = this.#identities.reserveIdentity({ kind: 'basic_group' });
    if (!identityReservation.reserved) {
      if (identityReservation.reason !== 'identity_limit_reached') {
        throw new Error(
          `Basic-group identity reservation failed unexpectedly: ${identityReservation.reason}`,
        );
      }
      return undefined;
    }
    if (identityReservation.identity.kind !== 'basic_group') {
      throw new Error('Basic-group identity reservation returned a different identity kind');
    }

    return identityReservation.identity.id;
  }
}
