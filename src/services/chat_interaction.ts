import { projectPrivateTextMessageForBot } from '../projections/bot_api_message.ts';
import type {
  BasicGroupRegistrationResult,
  ChatMemberAdditionResult,
  SharedChatRegistrationResult,
} from '../repositories/chat.ts';
import type { IdentityReservationResult } from '../repositories/telegram_identity.ts';
import { findBotCommandEntities } from '../text_entities/bot_command.ts';
import type { BotApiPrivateTextMessage } from '../types/bot_api.ts';
import type { ChatDomainEvent } from '../types/chat_domain_event.ts';
import type { ChatMembership } from '../types/chat_membership.ts';
import type { VirtualAccount } from '../types/virtual_account.ts';
import type { VirtualBot } from '../types/virtual_bot.ts';
import type {
  BasicGroup,
  Channel,
  PrivateConversation,
  PrivateConversationKey,
  PrivateConversationRole,
  SharedChat,
  Supergroup,
} from '../types/virtual_chat.ts';
import {
  type CanonicalMessageId,
  MAX_TEXT_MESSAGE_LENGTH,
  type PrivateTextMessage,
  type TextEntity,
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

export interface SendMessageInput {
  readonly fromAccountId: number;
  readonly to: {
    readonly type: 'private';
    readonly botId: number;
  };
  readonly text: string;
}

export type SendMessageFailureReason =
  | 'account_not_found'
  | 'bot_not_found'
  | 'message_text_empty'
  | 'message_text_too_long';

export type SendMessageResult =
  | {
    readonly sent: true;
    readonly message: BotApiPrivateTextMessage;
  }
  | {
    readonly sent: false;
    readonly reason: SendMessageFailureReason;
  };

export interface SendBotMessageInput {
  readonly fromBotId: number;
  readonly to: {
    readonly type: 'private';
    readonly accountId: number;
  };
  readonly text: string;
}

export type SendBotMessageFailureReason =
  | 'bot_not_found'
  | 'message_text_empty'
  | 'account_not_found'
  | 'conversation_not_started'
  | 'message_text_too_long';

export type SendBotMessageResult =
  | {
    readonly sent: true;
    readonly message: BotApiPrivateTextMessage;
  }
  | {
    readonly sent: false;
    readonly reason: SendBotMessageFailureReason;
  };

export interface GetPrivateMessageHistoryInput {
  readonly accountId: number;
  readonly botId: number;
}

export type GetPrivateMessageHistoryResult =
  | {
    readonly found: true;
    readonly messages: readonly BotApiPrivateTextMessage[];
  }
  | {
    readonly found: false;
    readonly reason: 'account_not_found' | 'bot_not_found';
  };

interface AccountLookup {
  getById(accountId: number): VirtualAccount | undefined;
}

interface BotLookup {
  getById(botId: number): VirtualBot | undefined;
}

interface PrivateConversationStore {
  getOrCreatePrivateConversation(key: PrivateConversationKey): PrivateConversation;
  getPrivateConversation(key: PrivateConversationKey): PrivateConversation | undefined;
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

interface PrivateMessageStore {
  addPrivateTextMessage(input: {
    readonly conversation: PrivateConversationKey;
    readonly authorRole: PrivateConversationRole;
    readonly sentAtUnixSeconds: number;
    readonly text: string;
    readonly entities: readonly TextEntity[];
  }): PrivateTextMessage;
  getPrivateConversationMessages(
    conversation: PrivateConversationKey,
  ): readonly PrivateTextMessage[];
}

interface UserMessageBoxStore {
  assignMessageId(ownerId: number, canonicalMessageId: CanonicalMessageId): number;
  getMessageId(ownerId: number, canonicalMessageId: CanonicalMessageId): number | undefined;
}

interface ChatDomainEventSink {
  publish(event: ChatDomainEvent): void;
}

interface ChatInteractionServiceDependencies {
  readonly identities: SharedChatIdentityReservationStore;
  readonly accounts: AccountLookup;
  readonly bots: BotLookup;
  readonly chats: ChatStore;
  readonly messages: PrivateMessageStore;
  readonly userMessageBoxes: UserMessageBoxStore;
  readonly events: ChatDomainEventSink;
  readonly currentUnixTimeSeconds: () => number;
}

export class ChatInteractionService {
  readonly #identities: SharedChatIdentityReservationStore;
  readonly #accounts: AccountLookup;
  readonly #bots: BotLookup;
  readonly #chats: ChatStore;
  readonly #messages: PrivateMessageStore;
  readonly #userMessageBoxes: UserMessageBoxStore;
  readonly #events: ChatDomainEventSink;
  readonly #currentUnixTimeSeconds: () => number;

  constructor(
    {
      identities,
      accounts,
      bots,
      chats,
      messages,
      userMessageBoxes,
      events,
      currentUnixTimeSeconds,
    }: ChatInteractionServiceDependencies,
  ) {
    this.#identities = identities;
    this.#accounts = accounts;
    this.#bots = bots;
    this.#chats = chats;
    this.#messages = messages;
    this.#userMessageBoxes = userMessageBoxes;
    this.#events = events;
    this.#currentUnixTimeSeconds = currentUnixTimeSeconds;
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

  sendMessage(input: SendMessageInput): SendMessageResult {
    const account = this.#accounts.getById(input.fromAccountId);
    if (account === undefined) {
      return { sent: false, reason: 'account_not_found' };
    }
    const bot = this.#bots.getById(input.to.botId);
    if (bot === undefined) {
      return { sent: false, reason: 'bot_not_found' };
    }
    if (input.text.length === 0) {
      return { sent: false, reason: 'message_text_empty' };
    }
    if (input.text.length > MAX_TEXT_MESSAGE_LENGTH) {
      return { sent: false, reason: 'message_text_too_long' };
    }

    this.#chats.getOrCreatePrivateConversation({
      accountId: account.profile.id,
      botId: bot.profile.id,
    });
    return {
      sent: true,
      message: this.#storePrivateTextMessage({
        account,
        bot,
        authorRole: 'account',
        text: input.text,
      }),
    };
  }

  /**
   * Sends text from a bot to an account. As on Telegram, a bot cannot initiate a private
   * conversation, so the account must have started one with the bot.
   *
   * Checks follow Telegram's order: the text is checked for emptiness before the recipient is
   * resolved, and for length afterward.
   */
  sendBotMessage(input: SendBotMessageInput): SendBotMessageResult {
    const bot = this.#bots.getById(input.fromBotId);
    if (bot === undefined) {
      return { sent: false, reason: 'bot_not_found' };
    }
    if (input.text.length === 0) {
      return { sent: false, reason: 'message_text_empty' };
    }
    const account = this.#accounts.getById(input.to.accountId);
    if (account === undefined) {
      return { sent: false, reason: 'account_not_found' };
    }
    const conversation = this.#chats.getPrivateConversation({
      accountId: account.profile.id,
      botId: bot.profile.id,
    });
    if (conversation === undefined) {
      return { sent: false, reason: 'conversation_not_started' };
    }
    if (input.text.length > MAX_TEXT_MESSAGE_LENGTH) {
      return { sent: false, reason: 'message_text_too_long' };
    }

    return {
      sent: true,
      message: this.#storePrivateTextMessage({ account, bot, authorRole: 'bot', text: input.text }),
    };
  }

  getPrivateMessageHistory(
    input: GetPrivateMessageHistoryInput,
  ): GetPrivateMessageHistoryResult {
    const account = this.#accounts.getById(input.accountId);
    if (account === undefined) {
      return { found: false, reason: 'account_not_found' };
    }
    const bot = this.#bots.getById(input.botId);
    if (bot === undefined) {
      return { found: false, reason: 'bot_not_found' };
    }

    const messages = this.#messages.getPrivateConversationMessages(input).map((message) =>
      this.#projectPrivateTextMessageForBot(message, account, bot)
    );
    return { found: true, messages };
  }

  /**
   * Stores validated text written by one participant of an existing private conversation, numbers
   * it in both participants' message boxes, and publishes its creation.
   */
  #storePrivateTextMessage(
    { account, bot, authorRole, text }: {
      readonly account: VirtualAccount;
      readonly bot: VirtualBot;
      readonly authorRole: PrivateConversationRole;
      readonly text: string;
    },
  ): BotApiPrivateTextMessage {
    const storedMessage = this.#messages.addPrivateTextMessage({
      conversation: { accountId: account.profile.id, botId: bot.profile.id },
      authorRole,
      sentAtUnixSeconds: this.#currentUnixTimeSeconds(),
      text,
      // Telegram marks bot commands in text sent in private chats with bots, which every private
      // conversation here is, whichever participant writes it. Other entity types are not detected.
      entities: findBotCommandEntities(text),
    });
    // Telegram numbers a private message in each participant's message box. Only the bot's
    // numbering is projected today; the account's keeps the stored model faithful to Telegram.
    this.#userMessageBoxes.assignMessageId(account.profile.id, storedMessage.id);
    this.#userMessageBoxes.assignMessageId(bot.profile.id, storedMessage.id);
    this.#events.publish({ type: 'message_created', message: storedMessage });

    return this.#projectPrivateTextMessageForBot(storedMessage, account, bot);
  }

  #projectPrivateTextMessageForBot(
    message: PrivateTextMessage,
    account: VirtualAccount,
    bot: VirtualBot,
  ): BotApiPrivateTextMessage {
    const observerMessageId = this.#userMessageBoxes.getMessageId(bot.profile.id, message.id);
    if (observerMessageId === undefined) {
      throw new Error(`Private message ${message.id} was not delivered to bot ${bot.profile.id}`);
    }
    return projectPrivateTextMessageForBot({
      message,
      account: account.profile,
      bot: bot.profile,
      observerMessageId,
    });
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
