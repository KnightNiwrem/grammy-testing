import type {
  BasicGroupRegistrationResult,
  ChatMemberAdditionResult,
  ChatMemberRemovalResult,
  ChatMemberStatusUpdateResult,
  CustomTitleUpdateResult,
  FormerMemberStatusUpdateResult,
  NonOwnerMemberStatus,
  SharedChatRegistrationResult,
} from '../repositories/shared_chat.ts';
import type { IdentityReservationResult } from '../repositories/telegram_identity.ts';
import type { ChatDomainEvent } from '../types/chat_domain_event.ts';
import {
  type ChatMembership,
  type ChatMemberStatus,
  type FormerChatMemberStatus,
  holdsSupergroupAdministratorRight,
  isSameChatMemberStatus,
  LEFT_CHAT_MEMBER_STATUS,
  resolveSupergroupBotMembership,
  type SupergroupAdministratorRights,
  type SupergroupBotAccessFailureReason,
} from '../types/chat_membership.ts';
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

export interface PromoteChatMemberInput {
  /** The owner, who alone promotes administrators here. */
  readonly actorAccountId: number;
  readonly chatId: number;
  readonly memberId: number;
  /** The rights the administrator holds from now on, which must include at least one. */
  readonly rights: SupergroupAdministratorRights;
}

/** Why the owner of a supergroup cannot manage one of its members. */
type OwnerMemberManagementFailureReason =
  | 'actor_account_not_found'
  | 'chat_not_found'
  | 'actor_not_authorized'
  | 'member_not_found'
  | 'not_a_member';

export type ChatMemberRoleChangeFailureReason =
  | OwnerMemberManagementFailureReason
  | 'member_is_owner';

export type PromoteChatMemberFailureReason =
  | ChatMemberRoleChangeFailureReason
  | 'no_rights_granted';

export type PromoteChatMemberResult =
  | { readonly promoted: true }
  | { readonly promoted: false; readonly reason: PromoteChatMemberFailureReason };

export interface SetCustomTitleInput {
  /** The owner, who alone sets custom titles here. */
  readonly actorAccountId: number;
  readonly chatId: number;
  /** The owner itself or an administrator. */
  readonly memberId: number;
  /** The new title; empty removes it. */
  readonly customTitle: string;
}

export type SetCustomTitleResult =
  | { readonly set: true }
  | {
    readonly set: false;
    readonly reason: OwnerMemberManagementFailureReason | 'not_an_administrator';
  };

export interface SetContentProtectionInput {
  /** The owner, who alone restricts saving content. */
  readonly actorAccountId: number;
  readonly chatId: number;
  readonly hasProtectedContent: boolean;
}

export type SetContentProtectionResult =
  | { readonly set: true }
  | {
    readonly set: false;
    readonly reason: 'actor_account_not_found' | 'chat_not_found' | 'actor_not_authorized';
  };

export interface DemoteChatMemberInput {
  /** The owner, who alone demotes administrators here. */
  readonly actorAccountId: number;
  readonly chatId: number;
  readonly memberId: number;
}

export type DemoteChatMemberResult =
  | { readonly demoted: true }
  | { readonly demoted: false; readonly reason: ChatMemberRoleChangeFailureReason };

export interface BanChatMemberInput {
  readonly actorBotId: number;
  readonly chatId: number;
  /** The account or bot to ban, whether it is a member or not. */
  readonly memberId: number;
  /**
   * When the ban ends, as the bot requested it; omitted for a ban that lasts until it is lifted.
   * As on Telegram, a ban shorter than 30 seconds or longer than 366 days lasts until it is lifted.
   */
  readonly requestedBanEndUnixSeconds?: number;
}

/** Why a bot cannot ban a user or lift its ban, in the order Telegram checks them. */
export type BotModerationFailureReason =
  | 'bot_not_found'
  | SupergroupBotAccessFailureReason
  | 'cannot_restrict_self'
  | 'member_not_found'
  | 'member_is_owner'
  | 'not_enough_rights'
  | 'member_is_administrator';

export type BanChatMemberResult =
  | { readonly banned: true }
  | { readonly banned: false; readonly reason: BotModerationFailureReason };

export interface UnbanChatMemberInput {
  readonly actorBotId: number;
  readonly chatId: number;
  readonly memberId: number;
  /** Changes nothing unless the user is banned; otherwise a member is removed, as Telegram does. */
  readonly onlyIfBanned: boolean;
}

export type UnbanChatMemberResult =
  | { readonly unbanned: true }
  | {
    readonly unbanned: false;
    readonly reason: Exclude<BotModerationFailureReason, 'cannot_restrict_self'>;
  };

export interface ChatMemberQueryInput {
  /** The bot that asks, which must be a member of the supergroup. */
  readonly observerBotId: number;
  readonly chatId: number;
}

export interface GetChatMemberStatusInput extends ChatMemberQueryInput {
  readonly userId: number;
}

export type GetChatMemberStatusResult =
  | { readonly found: true; readonly status: ChatMemberStatus }
  | {
    readonly found: false;
    readonly reason: 'bot_not_found' | SupergroupBotAccessFailureReason | 'member_not_found';
  };

/** A current member of a chat with its standing. */
export interface ChatMemberStanding {
  readonly userId: number;
  readonly status: ChatMembership;
}

export type GetChatAdministratorsResult =
  | {
    readonly found: true;
    /** The owner, then the administrators in the order they joined. */
    readonly administrators: readonly ChatMemberStanding[];
  }
  | { readonly found: false; readonly reason: 'bot_not_found' | SupergroupBotAccessFailureReason };

export type GetChatMemberCountResult =
  | { readonly found: true; readonly memberCount: number }
  | { readonly found: false; readonly reason: 'bot_not_found' | SupergroupBotAccessFailureReason };

/** A bot moderating a supergroup it is a member of, and the user it moderates. */
interface ModerationTarget {
  readonly chat: Supergroup;
  readonly botId: number;
  readonly botMembership: ChatMembership;
  readonly memberId: number;
  readonly memberStatus: ChatMemberStatus;
}

/** A ban of a member that the bot lifts at once, which is how Telegram removes a member. */
const MEMBER_REMOVAL_BAN_DURATION_SECONDS = 60;

/** Telegram treats a ban shorter than this as one that lasts until it is lifted. */
const MIN_TEMPORARY_BAN_DURATION_SECONDS = 30;

/** Telegram treats a ban longer than this as one that lasts until it is lifted. */
const MAX_TEMPORARY_BAN_DURATION_SECONDS = 366 * 24 * 60 * 60;

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
  getChatMemberIds(chatId: number): readonly number[];
  addChatMember(chatId: number, memberId: number): ChatMemberAdditionResult;
  updateChatMemberStatus(
    chatId: number,
    memberId: number,
    status: NonOwnerMemberStatus,
  ): ChatMemberStatusUpdateResult;
  setCustomTitle(
    chatId: number,
    memberId: number,
    customTitle: string | undefined,
  ): CustomTitleUpdateResult;
  updateSupergroupContentProtection(chatId: number, hasProtectedContent: boolean): boolean;
  removeChatMember(
    chatId: number,
    memberId: number,
    formerStatus: FormerChatMemberStatus,
  ): ChatMemberRemovalResult;
  updateFormerMemberStatus(
    chatId: number,
    identityId: number,
    formerStatus: FormerChatMemberStatus,
  ): FormerMemberStatusUpdateResult;
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
 * Establishes and changes who takes part in basic groups, supergroups, and channels, and in what
 * standing: supergroup owners promote administrators, and administrator bots ban users. Each
 * change of a standing is published, so that a bot learns of changes of its own, and a member's
 * arrival or departure is recorded in a supergroup as a service message, as Telegram does. Service
 * messages of basic groups and channels, whose messages are not supported, are not recorded.
 *
 * Bots also read the standing of a supergroup's users here, as a member of the supergroup.
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
      hasProtectedContent: false,
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

    // As an owner does in Telegram's apps, adding a banned user lifts its ban.
    const statusBeforeJoining = this.#sharedChats.getFormerMemberStatus(
      input.chatId,
      input.memberId,
    ) ?? LEFT_CHAT_MEMBER_STATUS;
    const addition = this.#sharedChats.addChatMember(input.chatId, input.memberId);
    if (!addition.added) {
      return addition;
    }
    const addedAtUnixSeconds = this.#currentUnixTimeSeconds();
    this.#events.publish({
      type: 'chat_member_status_changed',
      chat,
      actorId: input.actorAccountId,
      memberId: input.memberId,
      oldStatus: statusBeforeJoining,
      newStatus: { status: 'member' },
      changedAtUnixSeconds: addedAtUnixSeconds,
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

    this.#endMembership(chat, {
      actor: member,
      memberId,
      membership,
      statusAfterLeaving: LEFT_CHAT_MEMBER_STATUS,
    });
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
      membership,
      statusAfterLeaving: chat.kind === 'basic_group'
        ? LEFT_CHAT_MEMBER_STATUS
        : { status: 'kicked' },
    });
    return { removed: true };
  }

  /**
   * Promotes a member of a supergroup to administrator as its owner, or changes the rights of an
   * administrator, who keeps its custom title. A promotion that changes nothing succeeds without
   * effect.
   */
  promoteChatMember(input: PromoteChatMemberInput): PromoteChatMemberResult {
    if (input.rights.size === 0) {
      return { promoted: false, reason: 'no_rights_granted' };
    }
    const change = this.#changeMemberRoleAsOwner(input, (membership) => ({
      status: 'administrator',
      rights: input.rights,
      ...(membership.status === 'administrator' && membership.customTitle !== undefined
        ? { customTitle: membership.customTitle }
        : {}),
    }));
    return change.changed ? { promoted: true } : { promoted: false, reason: change.reason };
  }

  /**
   * Demotes an administrator of a supergroup to a member as its owner, which drops its custom
   * title. Demoting a member that is no administrator succeeds without effect.
   */
  demoteChatMember(input: DemoteChatMemberInput): DemoteChatMemberResult {
    const change = this.#changeMemberRoleAsOwner(input, () => ({ status: 'member' }));
    return change.changed ? { demoted: true } : { demoted: false, reason: change.reason };
  }

  /**
   * Sets the custom title that clients show for the owner of a supergroup or an administrator in
   * place of its role, as the owner. Setting the title it has succeeds without effect.
   */
  setCustomTitle(input: SetCustomTitleInput): SetCustomTitleResult {
    const target = this.#resolveMemberAsOwner(input);
    if (!target.resolved) {
      return { set: false, reason: target.reason };
    }
    const { chat, membership } = target;
    if (membership.status === 'member') {
      return { set: false, reason: 'not_an_administrator' };
    }
    const newCustomTitle = input.customTitle === '' ? undefined : input.customTitle;
    if (membership.customTitle === newCustomTitle) {
      return { set: true };
    }
    const { customTitle: _, ...untitledMembership } = membership;
    const newStatus: ChatMembership = newCustomTitle === undefined
      ? untitledMembership
      : { ...untitledMembership, customTitle: newCustomTitle };

    const update = this.#sharedChats.setCustomTitle(chat.id, input.memberId, newCustomTitle);
    if (!update.updated) {
      throw new Error(
        `Custom title of member ${input.memberId} of chat ${chat.id} could not be set: ${update.reason}`,
      );
    }
    this.#events.publish({
      type: 'chat_member_status_changed',
      chat,
      actorId: input.actorAccountId,
      memberId: input.memberId,
      oldStatus: membership,
      newStatus,
      changedAtUnixSeconds: this.#currentUnixTimeSeconds(),
    });
    return { set: true };
  }

  /**
   * Bans a user from a supergroup as a bot, removing it if it is a member; a user that is not a
   * member is banned before it can join. The bot's removal of a member is recorded as the bot's
   * service message.
   *
   * Checks follow TDLib's order: a ban that changes nothing succeeds without rights, and nobody can
   * ban the owner; otherwise the bot needs the `can_restrict_members` right. Telegram lets a bot
   * ban only administrators it promoted, and bots promote none here.
   */
  banChatMember(input: BanChatMemberInput): BanChatMemberResult {
    const target = this.#resolveModerationTarget(input);
    if (!target.resolved) {
      return { banned: false, reason: target.reason };
    }
    if (input.memberId === input.actorBotId) {
      return { banned: false, reason: 'cannot_restrict_self' };
    }
    const restriction = this.#restrictAsBot(target, {
      status: 'kicked',
      ...this.#normalizeBanEnd(input.requestedBanEndUnixSeconds),
    });
    return restriction.restricted
      ? { banned: true }
      : { banned: false, reason: restriction.reason };
  }

  /**
   * Lifts a user's ban from a supergroup as a bot, so that it may join again. As on Telegram,
   * unless only a ban is to be lifted, this also removes a member, which the bot's service message
   * records, and a bot that names itself leaves.
   */
  unbanChatMember(input: UnbanChatMemberInput): UnbanChatMemberResult {
    const target = this.#resolveModerationTarget(input);
    if (!target.resolved) {
      return { unbanned: false, reason: target.reason };
    }
    if (input.onlyIfBanned && target.memberStatus.status !== 'kicked') {
      return { unbanned: true };
    }
    if (input.memberId === input.actorBotId) {
      const leaving = this.leaveChat({ memberId: input.actorBotId, chatId: input.chatId });
      if (!leaving.left) {
        throw new Error(`Bot ${input.actorBotId} could not leave chat ${input.chatId}`);
      }
      return { unbanned: true };
    }

    let bannedTarget: ModerationTarget = target;
    if (target.memberStatus.status === 'member') {
      // Telegram removes a member by banning it briefly, then lifting the ban.
      const removalBan: FormerChatMemberStatus = {
        status: 'kicked',
        bannedUntilUnixSeconds: this.#currentUnixTimeSeconds() +
          MEMBER_REMOVAL_BAN_DURATION_SECONDS,
      };
      const removal = this.#restrictAsBot(target, removalBan);
      if (!removal.restricted) {
        return { unbanned: false, reason: removal.reason };
      }
      bannedTarget = { ...target, memberStatus: removalBan };
    }
    const liftedBan = this.#restrictAsBot(bannedTarget, LEFT_CHAT_MEMBER_STATUS);
    return liftedBan.restricted
      ? { unbanned: true }
      : { unbanned: false, reason: liftedBan.reason };
  }

  /**
   * Returns a user's standing in a supergroup to a bot that is a member of it. A user of the session
   * that never joined the supergroup has `left` it.
   */
  getChatMemberStatus(input: GetChatMemberStatusInput): GetChatMemberStatusResult {
    const access = this.#resolveBotObserver(input);
    if (!access.resolved) {
      return { found: false, reason: access.reason };
    }
    if (this.#identifyUser(input.userId) === undefined) {
      return { found: false, reason: 'member_not_found' };
    }
    return { found: true, status: this.#lookUpChatMemberStatus(input.chatId, input.userId) };
  }

  /** Returns the owner and administrators of a supergroup to a bot that is a member of it. */
  getChatAdministrators(input: ChatMemberQueryInput): GetChatAdministratorsResult {
    const access = this.#resolveBotObserver(input);
    if (!access.resolved) {
      return { found: false, reason: access.reason };
    }
    const standings = this.#sharedChats.getChatMemberIds(input.chatId).flatMap((userId) => {
      const status = this.#sharedChats.getChatMembership(input.chatId, userId);
      return status === undefined || status.status === 'member' ? [] : [{ userId, status }];
    });
    return {
      found: true,
      administrators: [
        ...standings.filter(({ status }) => status.status === 'owner'),
        ...standings.filter(({ status }) => status.status === 'administrator'),
      ],
    };
  }

  /** Returns how many members a supergroup has, its owner and bots included. */
  getChatMemberCount(input: ChatMemberQueryInput): GetChatMemberCountResult {
    const access = this.#resolveBotObserver(input);
    return access.resolved
      ? { found: true, memberCount: this.#sharedChats.getChatMemberIds(input.chatId).length }
      : { found: false, reason: access.reason };
  }

  /** Changes the role of a supergroup member that is not the owner, as the owner. */
  /**
   * Protects all messages of a supergroup from forwarding and saving, or lifts that protection, as
   * its owner, who alone may, as TDLib's `toggle_dialog_has_protected_content` requires. It applies
   * to every message, including earlier ones, as long as it lasts.
   */
  setContentProtection(input: SetContentProtectionInput): SetContentProtectionResult {
    if (this.#accounts.getById(input.actorAccountId) === undefined) {
      return { set: false, reason: 'actor_account_not_found' };
    }
    if (this.#sharedChats.getSharedChat(input.chatId)?.kind !== 'supergroup') {
      return { set: false, reason: 'chat_not_found' };
    }
    if (
      this.#sharedChats.getChatMembership(input.chatId, input.actorAccountId)?.status !== 'owner'
    ) {
      return { set: false, reason: 'actor_not_authorized' };
    }
    if (
      !this.#sharedChats.updateSupergroupContentProtection(input.chatId, input.hasProtectedContent)
    ) {
      throw new Error(`Supergroup ${input.chatId} could not be updated`);
    }
    return { set: true };
  }

  /** Resolves a member of a supergroup that the acting account owns, for the owner to manage. */
  #resolveMemberAsOwner(
    { actorAccountId, chatId, memberId }: {
      readonly actorAccountId: number;
      readonly chatId: number;
      readonly memberId: number;
    },
  ):
    | { readonly resolved: true; readonly chat: Supergroup; readonly membership: ChatMembership }
    | { readonly resolved: false; readonly reason: OwnerMemberManagementFailureReason } {
    if (this.#accounts.getById(actorAccountId) === undefined) {
      return { resolved: false, reason: 'actor_account_not_found' };
    }
    const chat = this.#sharedChats.getSharedChat(chatId);
    if (chat?.kind !== 'supergroup') {
      return { resolved: false, reason: 'chat_not_found' };
    }
    if (this.#sharedChats.getChatMembership(chatId, actorAccountId)?.status !== 'owner') {
      return { resolved: false, reason: 'actor_not_authorized' };
    }
    if (this.#identifyUser(memberId) === undefined) {
      return { resolved: false, reason: 'member_not_found' };
    }
    const membership = this.#sharedChats.getChatMembership(chatId, memberId);
    if (membership === undefined) {
      return { resolved: false, reason: 'not_a_member' };
    }
    return { resolved: true, chat, membership };
  }

  #changeMemberRoleAsOwner(
    input: {
      readonly actorAccountId: number;
      readonly chatId: number;
      readonly memberId: number;
    },
    getNewStatus: (membership: NonOwnerMemberStatus) => NonOwnerMemberStatus,
  ):
    | { readonly changed: true }
    | { readonly changed: false; readonly reason: ChatMemberRoleChangeFailureReason } {
    const target = this.#resolveMemberAsOwner(input);
    if (!target.resolved) {
      return { changed: false, reason: target.reason };
    }
    const { actorAccountId, chatId, memberId } = input;
    const { chat, membership } = target;
    if (membership.status === 'owner') {
      return { changed: false, reason: 'member_is_owner' };
    }
    const newStatus = getNewStatus(membership);
    if (isSameChatMemberStatus(membership, newStatus)) {
      return { changed: true };
    }

    const update = this.#sharedChats.updateChatMemberStatus(chatId, memberId, newStatus);
    if (!update.updated) {
      throw new Error(
        `Member ${memberId} of chat ${chatId} could not be updated: ${update.reason}`,
      );
    }
    this.#events.publish({
      type: 'chat_member_status_changed',
      chat,
      actorId: actorAccountId,
      memberId,
      oldStatus: membership,
      newStatus,
      changedAtUnixSeconds: this.#currentUnixTimeSeconds(),
    });
    return { changed: true };
  }

  /** Resolves a bot that moderates a supergroup and the standing of the user it moderates. */
  #resolveModerationTarget(
    { actorBotId, chatId, memberId }: {
      readonly actorBotId: number;
      readonly chatId: number;
      readonly memberId: number;
    },
  ):
    | ({ readonly resolved: true } & ModerationTarget)
    | {
      readonly resolved: false;
      readonly reason: 'bot_not_found' | SupergroupBotAccessFailureReason | 'member_not_found';
    } {
    const access = this.#resolveBotObserver({ observerBotId: actorBotId, chatId });
    if (!access.resolved) {
      return { resolved: false, reason: access.reason };
    }
    if (this.#identifyUser(memberId) === undefined) {
      return { resolved: false, reason: 'member_not_found' };
    }
    return {
      resolved: true,
      chat: access.supergroup,
      botId: actorBotId,
      botMembership: access.membership,
      memberId,
      memberStatus: this.#lookUpChatMemberStatus(chatId, memberId),
    };
  }

  /**
   * Bans a user or lifts its ban as a bot, in TDLib's order of checks, and removes the user if it is
   * a member.
   */
  #restrictAsBot(
    { chat, botId, botMembership, memberId, memberStatus }: ModerationTarget,
    newStatus: FormerChatMemberStatus,
  ):
    | { readonly restricted: true }
    | {
      readonly restricted: false;
      readonly reason: 'member_is_owner' | 'not_enough_rights' | 'member_is_administrator';
    } {
    if (isSameChatMemberStatus(memberStatus, newStatus)) {
      return { restricted: true };
    }
    if (memberStatus.status === 'owner') {
      return { restricted: false, reason: 'member_is_owner' };
    }
    if (!holdsSupergroupAdministratorRight(botMembership, 'can_restrict_members')) {
      return { restricted: false, reason: 'not_enough_rights' };
    }
    if (memberStatus.status === 'administrator') {
      return { restricted: false, reason: 'member_is_administrator' };
    }

    const actor: SupergroupMessageAuthor = { kind: 'bot', botId };
    if (memberStatus.status === 'member') {
      this.#endMembership(chat, {
        actor,
        memberId,
        membership: memberStatus,
        statusAfterLeaving: newStatus,
      });
      return { restricted: true };
    }
    const update = this.#sharedChats.updateFormerMemberStatus(chat.id, memberId, newStatus);
    if (!update.updated) {
      throw new Error(`Non-member ${memberId} of chat ${chat.id} could not be updated`);
    }
    this.#events.publish({
      type: 'chat_member_status_changed',
      chat,
      actorId: botId,
      memberId,
      oldStatus: memberStatus,
      newStatus,
      changedAtUnixSeconds: this.#currentUnixTimeSeconds(),
    });
    return { restricted: true };
  }

  /**
   * Resolves the end of a ban as Telegram does: a ban shorter than 30 seconds or longer than 366
   * days lasts until it is lifted.
   */
  #normalizeBanEnd(
    requestedBanEndUnixSeconds: number | undefined,
  ): { readonly bannedUntilUnixSeconds?: number } {
    if (requestedBanEndUnixSeconds === undefined) {
      return {};
    }
    const banDurationSeconds = requestedBanEndUnixSeconds - this.#currentUnixTimeSeconds();
    return banDurationSeconds < MIN_TEMPORARY_BAN_DURATION_SECONDS ||
        banDurationSeconds > MAX_TEMPORARY_BAN_DURATION_SECONDS
      ? {}
      : { bannedUntilUnixSeconds: requestedBanEndUnixSeconds };
  }

  /** Resolves a bot that asks about a supergroup, which it must be a member of. */
  #resolveBotObserver({ observerBotId, chatId }: ChatMemberQueryInput):
    | {
      readonly resolved: true;
      readonly supergroup: Supergroup;
      readonly membership: ChatMembership;
    }
    | {
      readonly resolved: false;
      readonly reason: 'bot_not_found' | SupergroupBotAccessFailureReason;
    } {
    if (this.#bots.getById(observerBotId) === undefined) {
      return { resolved: false, reason: 'bot_not_found' };
    }
    return resolveSupergroupBotMembership(this.#sharedChats, observerBotId, chatId);
  }

  /** A user's standing in a chat; a user that never joined it has `left` it. */
  #lookUpChatMemberStatus(chatId: number, userId: number): ChatMemberStatus {
    return this.#sharedChats.getChatMembership(chatId, userId) ??
      this.#sharedChats.getFormerMemberStatus(chatId, userId) ?? LEFT_CHAT_MEMBER_STATUS;
  }

  /** Ends a current membership that is not the owner's, then publishes and records the change. */
  #endMembership(
    chat: SharedChat,
    { actor, memberId, membership, statusAfterLeaving }: {
      /** The member itself when it leaves, or the account or bot that removes it. */
      readonly actor: SupergroupMessageAuthor;
      readonly memberId: number;
      /** The membership that ends. */
      readonly membership: ChatMembership;
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
      type: 'chat_member_status_changed',
      chat,
      actorId: actor.kind === 'account' ? actor.accountId : actor.botId,
      memberId,
      oldStatus: membership,
      newStatus: statusAfterLeaving,
      changedAtUnixSeconds: leftAtUnixSeconds,
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
