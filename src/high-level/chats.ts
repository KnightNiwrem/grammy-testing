/* eslint-disable max-classes-per-file -- RepliesInbox is tightly coupled to Chats */
/* eslint-disable prefer-const -- newUser uses let-then-assign for closure capture */
/* eslint-disable no-param-reassign -- attachBot intentionally hands bot to each chat */

import type { Bot, Context, RawApi } from 'grammy';
import type { ChatMember, ChatPermissions, Message, Poll, Update, User as TelegramUser } from 'grammy/types';

import type { IdleTracker } from '../low-level/idle';
import type { OutgoingRequests, Request } from '../low-level/outgoing-requests';
import type { Responses } from '../low-level/responses';

import { ActionsLog } from './actions-log';
import { BusinessAccount } from './business-account';
import { Channel } from './channel';
import { type AnyChat, setBotRef } from './chat';
import { type Deletion, DeletionsLog } from './deletions-log';
import { makeChatMember } from './dispatch';
import { DraftsLog } from './drafts-log';
import { type Edit, EditsLog } from './edits-log';
import { Group } from './group';
import { IdGenerator } from './id-generator';
import { MessagesLog } from './messages-log';
import {
  clampUntilDate,
  expandChatPermissions,
  extractPromoteFlags,
  liftsAllRestrictions,
  type ModerationAction,
  ModerationLog,
} from './moderation-log';
import { PrivateChat } from './private-chat';
import { type ReactionChange, ReactionChangesLog } from './reaction-changes-log';
import { ReactionRemovalsLog } from './reaction-removals-log';
import { Reply } from './reply';
import { Supergroup } from './supergroup';
import type { Membership, PromotePermissions } from './types';
import { User, type UserProfile } from './user';

/**
 * Optional profile for chat factory methods. Mirrors `UserProfile` — pass an object to
 * supply a specific `id` (any integer, e.g. a production log-channel ID) and/or a custom
 * title. Omitting `id` auto-generates one; omitting `title` derives a default from the type
 * name and the absolute value of the ID.
 */
export interface ChatProfile {
  id?: number;
  title?: string;
}

/**
 * Profile for `chats.newSupergroup(...)`. Extends `ChatProfile` with the forum flag —
 * pass `isForum: true` to mint a forum supergroup that can register topics via
 * `supergroup.newTopic(...)` and includes `is_forum: true` in its Telegram chat shape.
 */
export interface SupergroupProfile extends ChatProfile {
  isForum?: boolean;
}

interface ResolveChatProfileReturn {
  id: number;
  title: string;
}

/**
 * Normalises the `string | ChatProfile | undefined` argument accepted by chat factory methods
 * into a concrete `{ id, title }` pair.
 * @param profile - Raw argument passed to the factory.
 * @param nextId - Counter function that yields the next auto-generated ID.
 * @param defaultTitle - Derives a title from the resolved ID when none is supplied.
 * @returns Resolved `{ id, title }` pair.
 */
function resolveChatProfile(
  profile: ChatProfile | string | undefined,
  nextId: () => number,
  defaultTitle: (id: number) => string,
): ResolveChatProfileReturn {
  if (typeof profile === 'string') {
    const id = nextId();

    return { id, title: profile };
  }

  const id = profile?.id ?? nextId();

  return { id, title: profile?.title ?? defaultTitle(id) };
}

/**
 * Converts a `Membership` record to the `ChatMember` discriminated union shape expected by the Telegram API.
 * `User<TContext>` is structurally compatible with the Telegram `User` interface (same required fields).
 * For `'administrator'` and `'restricted'` statuses the record's flags are spread over a complete
 * default-false base from `makeChatMember`, so required booleans real Telegram always returns
 * (e.g. `can_change_info`) come back as `false` rather than missing when a membership stores only
 * the granted flags. The spread may still carry flags beyond the strict shape, hence the casts.
 * @param membership - The membership record to convert.
 * @param chatType - The chat's type; channels additionally default the channel-only
 *   administrator booleans (`can_post_messages`, `can_edit_messages`,
 *   `can_manage_direct_messages`) to `false`, as real Telegram returns them there.
 * @returns The corresponding `ChatMember` discriminated union value.
 */
function membershipToChatMember<TContext extends Context>(
  membership: Membership<TContext>,
  chatType: 'channel' | 'group' | 'supergroup',
): ChatMember {
  const user = membership.user as unknown as TelegramUser;
  const { status, permissions, untilDate } = membership;

  switch (status) {
    case 'creator': {
      return { status: 'creator', user, is_anonymous: permissions.is_anonymous ?? false };
    }

    case 'administrator': {
      // can_manage_tags is scoped to groups/supergroups; the other three are channel-only.
      const chatScopedFields =
        chatType === 'channel'
          ? { can_post_messages: false, can_edit_messages: false, can_manage_direct_messages: false }
          : { can_manage_tags: false };

      return { ...makeChatMember(user, 'administrator', {}), ...chatScopedFields, can_be_edited: true, ...permissions } as ChatMember;
    }

    case 'member': {
      return { status: 'member', user };
    }

    case 'restricted': {
      return { ...makeChatMember(user, 'restricted', {}, untilDate), ...permissions } as ChatMember;
    }

    case 'left': {
      return { status: 'left', user };
    }

    case 'kicked': {
      return { status: 'kicked', user, until_date: untilDate ?? 0 };
    }

    default: {
      throw new Error(`Unknown membership status: ${String(status)}`);
    }
  }
}

export interface DispatchPollStateOptions {
  /** Override the auto-generated update_id. */
  updateId?: number;
}

const MESSAGE_METHODS_GUARD = {
  sendMessage: true,
  sendPhoto: true,
  sendDocument: true,
  sendVideo: true,
  sendAudio: true,
  sendVoice: true,
  sendVideoNote: true,
  sendAnimation: true,
  sendSticker: true,
  sendLocation: true,
  sendContact: true,
  sendVenue: true,
  sendPoll: true,
  sendDice: true,
  sendLivePhoto: true,
  sendRichMessage: true,
  sendMediaGroup: true,
  copyMessage: true,
  forwardMessage: true,
} satisfies Partial<Record<keyof RawApi, true>>;

const MESSAGE_METHODS = new Set(Object.keys(MESSAGE_METHODS_GUARD));

const CHAT_ACTION_METHODS_GUARD = {
  sendChatAction: true,
} satisfies Partial<Record<keyof RawApi, true>>;

const CHAT_ACTION_METHODS = new Set(Object.keys(CHAT_ACTION_METHODS_GUARD));

const EDIT_METHODS_GUARD = {
  editMessageText: true,
  editMessageCaption: true,
  editMessageMedia: true,
} satisfies Partial<Record<keyof RawApi, true>>;

const EDIT_METHODS = new Set(Object.keys(EDIT_METHODS_GUARD));

const DELETE_METHODS_GUARD = {
  deleteMessage: true,
} satisfies Partial<Record<keyof RawApi, true>>;

const DELETE_METHODS = new Set(Object.keys(DELETE_METHODS_GUARD));

const DRAFT_METHODS_GUARD = {
  sendMessageDraft: true,
  sendRichMessageDraft: true,
} satisfies Partial<Record<keyof RawApi, true>>;

const DRAFT_METHODS = new Set(Object.keys(DRAFT_METHODS_GUARD));

const REACTION_REMOVAL_METHODS_GUARD = {
  deleteMessageReaction: true,
  deleteAllMessageReactions: true,
} satisfies Partial<Record<keyof RawApi, true>>;

const REACTION_REMOVAL_METHODS = new Set(Object.keys(REACTION_REMOVAL_METHODS_GUARD));

const REACTION_CHANGE_METHODS_GUARD = {
  setMessageReaction: true,
} satisfies Partial<Record<keyof RawApi, true>>;

const REACTION_CHANGE_METHODS = new Set(Object.keys(REACTION_CHANGE_METHODS_GUARD));

const MODERATION_METHODS_GUARD = {
  banChatMember: true,
  unbanChatMember: true,
  restrictChatMember: true,
  promoteChatMember: true,
} satisfies Partial<Record<keyof RawApi, true>>;

const MODERATION_METHODS = new Set(Object.keys(MODERATION_METHODS_GUARD));

/**
 * Per-user inbox: filtered view of messages directed at this user.
 */
export class RepliesInbox<TContext extends Context = Context> {
  private readonly items: Reply<TContext>[] = [];

  /**
   * Appends a reply to the inbox.
   * @param reply - The reply to append.
   */
  push(reply: Reply<TContext>): void {
    this.items.push(reply);
  }

  /**
   * Number of replies in the inbox.
   * @returns The count of captured replies.
   */
  get length(): number {
    return this.items.length;
  }

  /**
   * The most recently pushed reply, or `undefined` if the inbox is empty.
   * @returns The last reply, or `undefined`.
   */
  get last(): Reply<TContext> | undefined {
    return this.items.at(-1);
  }

  /**
   * Read-only view of all replies in the inbox in dispatch order.
   * @returns A read-only array of all captured replies.
   */
  get all(): readonly Reply<TContext>[] {
    return this.items;
  }

  /**
   * Returns the last reply or throws if the inbox is empty.
   * @returns The last `Reply<TContext>`.
   * @throws {Error} When the inbox is empty.
   */
  lastOrThrow(): Reply<TContext> {
    const last = this.items.at(-1);

    if (last === undefined) {
      throw new Error('Expected a reply but the reply collection is empty');
    }

    return last;
  }

  /**
   * Returns the first reply whose text matches `matcher`, or `undefined` if none match.
   * @param matcher - A string for exact match or a `RegExp` for pattern match.
   * @returns The first matching reply, or `undefined`.
   */
  byText(matcher: RegExp | string): Reply<TContext> | undefined {
    return this.items.find((reply) => {
      if (reply.text === undefined) {
        return false;
      }

      return typeof matcher === 'string' ? reply.text === matcher : matcher.test(reply.text);
    });
  }

  /** Removes all replies from the inbox. */
  clear(): void {
    this.items.length = 0;
  }
}

interface UserEntry<TContext extends Context = Context> {
  user: User<TContext>;
  replies: RepliesInbox<TContext>;
  actions: ActionsLog;
  edits: EditsLog;
  drafts: DraftsLog;
  privateChat?: PrivateChat<TContext>;
}

interface MessageAuthor {
  userId: number | undefined;
  messageThreadId: number | undefined;
}

interface BotRef<TContext extends Context> {
  readonly bot: Bot<TContext> | undefined;
}

/**
 * Wraps a `BotRef` in a Proxy so that `User` can hold a stable `Bot` reference even
 * though the bot is assigned to `Chats` after the user is constructed.
 * The proxy forwards all property reads to `ref.bot` at call time, relying on
 * `Chats.attachBot` running before any user verb is invoked.
 * @param ref - An object whose `bot` property will be resolved at each access.
 * @returns A `Bot` proxy that always delegates to the current `ref.bot` value.
 */
function undefinedSafeBot<TContext extends Context>(ref: BotRef<TContext>): Bot<TContext> {
  return new Proxy({} as Bot<TContext>, {
    get(_, prop) {
      const target = ref.bot as unknown as Record<string | symbol, unknown>;

      return target[prop];
    },
  });
}

/** Telegram chat ID — either a numeric ID or a `@username` string. */
type ChatId = number | string;

/** A non-private chat actor — the kinds that track members and moderation state. */
type GroupLikeChat<TContext extends Context> = Channel<TContext> | Group<TContext> | Supergroup<TContext>;

/**
 * The orchestrator returned from every entry point's `chats` field.
 * Mints users and chats, exposes the v0.1 capture surface
 * (`outgoing`, `idle`), and derives high-level views (`user.replies`,
 * `chat.messages`) from each captured outgoing call.
 */
export class Chats<TContext extends Context = Context> {
  readonly idle: () => Promise<void>;

  private readonly ids = new IdGenerator();

  private readonly users = new Map<number, UserEntry<TContext>>();

  private readonly chats = new Map<number, AnyChat<TContext>>();

  /** click->user+chat association for the user.replies filter rule. */
  private readonly clickers = new Map<string, { userId: number; chatId: number }>();

  /** chatId->messageId->Reply registry for reply.replyingTo and mutation resolution. */
  private readonly messageIdToReply = new Map<number, Map<number, Reply<TContext>>>();

  /** chatId->messageId->author registry for the user.replies reply-to-author rule. */
  private readonly messageAuthors = new Map<number, Map<number, MessageAuthor>>();

  /** chatId->DeletionsLog registry for deleteMessage routing. */
  private readonly chatDeletions = new Map<number, DeletionsLog<TContext>>();

  /** Orchestrator-wide log of captured `deleteMessageReaction` / `deleteAllMessageReactions` calls. */
  readonly reactionRemovals = new ReactionRemovalsLog();

  /** Orchestrator-wide log of captured `setMessageReaction` calls. */
  readonly reactionChanges = new ReactionChangesLog<TContext>();

  /** guest_query_id->User registry, populated by `user.sendGuestMessage`, for answer correlation. */
  private readonly guestQueryToUser = new Map<string, User<TContext>>();

  /**
   * Membership transitions queued at capture time for in-flight moderation calls,
   * applied by `settleFromCapture` only when the mocked response succeeds.
   */
  private readonly pendingModerationTransitions = new WeakMap<Request, () => void>();

  /** Message requests awaiting a successful mocked result whose message ID may differ. */
  private pendingMessageReplies = new WeakMap<Request, { chatId: number; reply: Reply<TContext> }>();

  /** The Reply created by the most recent message-method `onCapture` call. Read by the default response resolvers. */
  private lastCapturedReply: Reply<TContext> | undefined;

  /** @internal */
  bot: Bot<TContext> | undefined;

  defaultGroup?: Supergroup<TContext>;

  private readonly warnOnUnregisteredChats: boolean;

  /**
   * Creates a new `Chats` orchestrator.
   * @param outgoing - Captures all outgoing Telegram API calls made by the bot.
   * @param idleTracker - Resolves the `idle()` promise when the bot's middleware queue drains.
   * @param warnOnUnregisteredChats - Emit a console.warn when an API call targets an unregistered chat (default `true`).
   */
  constructor(
    public readonly outgoing: OutgoingRequests,
    idleTracker: IdleTracker,
    warnOnUnregisteredChats = true,
  ) {
    this.idle = () => idleTracker.idle();
    this.warnOnUnregisteredChats = warnOnUnregisteredChats;
  }

  /**
   * Resets all captured log state in one call. Clears outgoing requests, per-user
   * replies/actions/edits, per-chat messages and deletions logs, and routing registries.
   * User/chat registries and membership records are preserved.
   */
  clear(): void {
    this.outgoing.clear();

    for (const entry of this.users.values()) {
      entry.replies.clear();
      entry.actions.clear();
      entry.edits.clear();
      entry.drafts.clear();
    }

    for (const chat of this.chats.values()) {
      chat.messages.clear();
      chat.reactionChanges.clear();

      if (chat.type !== 'private') {
        chat.moderation.clear();
      }

      if (chat.type === 'supergroup') {
        for (const topic of chat.allTopics) {
          topic.messages.clear();
        }
      }
    }

    for (const log of this.chatDeletions.values()) {
      log.clear();
    }

    this.reactionRemovals.clear();
    this.reactionChanges.clear();
    this.guestQueryToUser.clear();
    this.messageIdToReply.clear();
    this.messageAuthors.clear();
    this.clickers.clear();
    this.pendingMessageReplies = new WeakMap<Request, { chatId: number; reply: Reply<TContext> }>();
    this.lastCapturedReply = undefined;
  }

  /**
   * Wires the grammY bot instance into every chat that has been registered so far,
   * and stores it for future chat registrations.
   * @param bot - The grammY `Bot` instance to attach.
   * @internal
   */
  attachBot(bot: Bot<TContext>): void {
    this.bot = bot;

    for (const chat of this.chats.values()) {
      chat[setBotRef](bot);
    }
  }

  /**
   * Mints a new synthetic user with an auto-generated ID.
   * @param profile - Optional profile overrides (id, first_name, last_name, username).
   * @returns The new `User` instance.
   * @throws {Error} When an explicit `id` is already minted for another user in this
   *   orchestrator — the registry entry (and with it reply routing) would silently switch
   *   to the new actor otherwise.
   */
  newUser(profile: UserProfile = {}): User<TContext> {
    const id = profile.id ?? this.nextUnregisteredId(() => this.ids.nextUserId());

    if (this.users.has(id)) {
      throw new Error(
        `[grammy-testing] User ID ${String(id)} is already minted in this orchestrator. ` +
          'Minting a second user with the same ID would silently take over reply routing for that ID. ' +
          'Reuse the existing User object, or pick a different id.',
      );
    }

    // A private chat at this ID with no users-registry entry was registered for a user
    // object from another orchestrator; private reply routing matches numeric IDs, so a
    // local user minted over it would silently receive that chat's replies.
    if (this.chats.get(id)?.type === 'private') {
      throw new Error(
        `[grammy-testing] User ID ${String(id)} is already registered to a private chat owned by a different user actor. ` +
          'Minting a user with the same ID would silently take over reply routing for that chat. ' +
          'Reuse the original user object, or pick a different id.',
      );
    }

    const inbox = new RepliesInbox<TContext>();
    const drafts = new DraftsLog();

    // Two-phase: declare `user` so closures capture it by reference,
    // then assign before any closure can fire.
    let user!: User<TContext>;

    user = new User<TContext>(
      id,
      profile.first_name ?? `User${String(id)}`,
      profile.last_name,
      profile.username,
      {
        bot: undefinedSafeBot(this),
        ids: this.ids,
        defaultPrivateChat: () => this.privateChatFor(user).toTelegramChat(),
        resolveChatToTelegram: (chat) => chat.toTelegramChat(),
        updateMembership: (chat, who, mode) => {
          this.applyMembershipTransition(chat, who, mode);
        },
        replies: inbox,
        drafts,
        recordGuestQuery: (queryId, who) => {
          this.guestQueryToUser.set(queryId, who);
        },
        recordMessageAuthor: (message) => {
          if (message.sender_chat !== undefined) {
            this.recordMessageAuthor(message);
          } else if (message.from?.id === user.id) {
            this.recordMessageAuthor(message, user.id);
          }
        },
      },
      (chat: AnyChat<TContext>) => this.readMembership(user, chat),
    );

    this.users.set(id, { user, replies: inbox, actions: new ActionsLog(), edits: new EditsLog(), drafts });

    return user;
  }

  /**
   * Creates a new user and promotes them to administrator in the default supergroup.
   * The default supergroup is lazily created on the first call.
   * @param profile - Optional user profile overrides.
   * @param permissions - Optional permission flags for the admin role.
   * @returns The newly created administrator `User` instance.
   */
  newAdmin(profile: UserProfile = {}, permissions: PromotePermissions = {}): User<TContext> {
    const user = this.newUser(profile);

    this.defaultGroup ??= this.newSupergroup('default-group');
    this.defaultGroup.promote(user, permissions);

    return user;
  }

  /**
   * Creates a new user and designates them as the creator of the default supergroup.
   * The default supergroup is lazily created on the first call, exactly as `newAdmin()` does.
   * @param profile - Optional user profile overrides.
   * @returns The newly created owner `User` instance.
   */
  newOwner(profile: UserProfile = {}): User<TContext> {
    const user = this.newUser(profile);

    this.defaultGroup ??= this.newSupergroup('default-group');
    this.defaultGroup.own(user);

    return user;
  }

  /**
   * Returns (or lazily creates) the private chat associated with `user`.
   * @param user - The user whose private chat to retrieve.
   * @returns The `PrivateChat` instance for `user`.
   */
  newPrivateChat(user: User<TContext>): PrivateChat<TContext> {
    return this.privateChatFor(user);
  }

  /**
   * Iterate over every chat minted by this orchestrator (read-only view).
   * @returns An iterator over all registered chats.
   */
  get allChats(): IterableIterator<AnyChat<TContext>> {
    return this.chats.values();
  }

  /**
   * Iterate over every user minted by this orchestrator (read-only view).
   * @returns An iterator over all registered users.
   */
  get allUsers(): IterableIterator<User<TContext>> {
    const entries = [...this.users.values()];

    return entries.map((entry) => entry.user)[Symbol.iterator]();
  }

  /**
   * Creates a new group chat.
   * @param profile - Optional title string, or an object with `id` and/or `title`. When `id`
   *   is supplied the auto-ID counter is skipped; any integer is accepted. Title defaults to
   *   `Group<abs(id)>` when omitted.
   * @returns The new `Group` instance.
   * @throws {Error} When `id` is already registered to another chat in this orchestrator.
   */
  newGroup(profile?: ChatProfile | string): Group<TContext> {
    const { id, title } = resolveChatProfile(
      profile,
      () => this.nextUnregisteredId(() => this.ids.nextGroupId()),
      (chatId) => `Group${String(Math.abs(chatId))}`,
    );

    const group = new Group<TContext>(id, title, this.ids);

    this.registerChat(group);

    return group;
  }

  /**
   * Creates a new supergroup chat.
   * @param profile - Optional title string, or an object with `id`, `title`, and/or `isForum`.
   *   When `id` is supplied the auto-ID counter is skipped; any integer is accepted. Title
   *   defaults to `Supergroup<abs(id)>` when omitted. Pass `isForum: true` to mint a forum
   *   supergroup that can register topics via `supergroup.newTopic(...)`.
   * @returns The new `Supergroup` instance.
   * @throws {Error} When `id` is already registered to another chat in this orchestrator.
   */
  newSupergroup(profile?: SupergroupProfile | string): Supergroup<TContext> {
    const { id, title } = resolveChatProfile(
      profile,
      () => this.nextUnregisteredId(() => this.ids.nextSupergroupId()),
      (chatId) => `Supergroup${String(Math.abs(chatId))}`,
    );

    const isForum = typeof profile === 'object' ? (profile.isForum ?? false) : false;

    const supergroup = new Supergroup<TContext>(id, title, this.ids, isForum);

    this.registerChat(supergroup);

    return supergroup;
  }

  /**
   * Creates a new channel.
   * @param profile - Optional title string, or an object with `id` and/or `title`. When `id`
   *   is supplied the auto-ID counter is skipped; any integer is accepted. Title defaults to
   *   `Channel<abs(id)>` when omitted.
   * @returns The new `Channel` instance.
   * @throws {Error} When `id` is already registered to another chat in this orchestrator.
   */
  newChannel(profile?: ChatProfile | string): Channel<TContext> {
    const { id, title } = resolveChatProfile(
      profile,
      () => this.nextUnregisteredId(() => this.ids.nextChannelId()),
      (chatId) => `Channel${String(Math.abs(chatId))}`,
    );

    const channel = new Channel<TContext>(id, title, this.ids);

    this.registerChat(channel);

    return channel;
  }

  /**
   * Mints a `BusinessAccount` actor for the given user. The connection ID is
   * auto-generated as `biz-<n>`.
   * @param user - The user actor to associate with the business account.
   * @returns The new `BusinessAccount` instance.
   */
  newBusinessAccount(user: User<TContext>): BusinessAccount<TContext> {
    const connectionId = `biz-${String(this.ids.nextMessageId())}`;

    return new BusinessAccount<TContext>(user, connectionId, {
      bot: undefinedSafeBot(this),
      ids: this.ids,
    });
  }

  /**
   * Dispatches a `poll` update with the supplied `Poll` object. Use this to
   * simulate autonomous server-side poll state events.
   * @param poll - A `Poll` object describing the current poll state.
   * @param options - Optional overrides such as a custom `update_id`.
   */
  async dispatchPollState(poll: Poll, options: DispatchPollStateOptions = {}): Promise<void> {
    if (!this.bot) {
      throw new Error('Bot not attached — call prepareBot() first');
    }

    await this.bot.handleUpdate({
      update_id: options.updateId ?? this.ids.nextUpdateId(),
      poll,
    } as Update);
  }

  /**
   * Builds default `Responses` entries for all message-sending methods. Each resolver reads
   * `lastCapturedReply` at call time (after `onCapture` has fired) to return a `Message`-shaped
   * result carrying the synthetic `messageId`. User-supplied `responses` entries take precedence.
   * @returns A `Responses` map with dynamic resolvers for every message-sending method.
   * @internal
   */
  buildDefaultResponses(): Responses {
    const syntheticMessage = (): Partial<Message> => {
      const reply = this.lastCapturedReply;

      if (reply === undefined) {
        return true as unknown as Partial<Message>;
      }

      return {
        message_id: reply.messageId,
        date: Math.floor(Date.now() / 1000),
        chat: reply.chat?.toTelegramChat() ?? ({ id: 0, type: 'private' } as Message['chat']),
        ...(reply.messageThreadId !== undefined && { message_thread_id: reply.messageThreadId, is_topic_message: true }),
      };
    };

    const syntheticMediaGroup = (payload: Record<string, unknown>): unknown[] => {
      const reply = this.lastCapturedReply;

      if (reply === undefined) {
        return [];
      }

      const now = Math.floor(Date.now() / 1000);
      const media = payload.media as unknown[] | undefined;
      const count = media?.length ?? 1;
      const mediaGroupId = this.ids.nextMediaGroupId();
      const chat = reply.chat?.toTelegramChat() ?? ({ id: 0, type: 'private' } as Message['chat']);

      const topicFields = reply.messageThreadId === undefined ? {} : { message_thread_id: reply.messageThreadId, is_topic_message: true };

      const messages: Partial<Message>[] = [{ message_id: reply.messageId, date: now, chat, media_group_id: mediaGroupId, ...topicFields }];

      for (let index = 1; index < count; index += 1) {
        messages.push({ message_id: this.ids.nextMessageId(), date: now, chat, media_group_id: mediaGroupId, ...topicFields });
      }

      return messages;
    };

    const syntheticMessageId = () => {
      const messageId = this.lastCapturedReply?.messageId;

      if (messageId === undefined) {
        return true as unknown as { message_id: number };
      }

      return { message_id: messageId };
    };

    interface GetChatMemberResolverPayload {
      chat_id: ChatId;
      user_id: number;
    }

    const getChatMemberResolver = (payload: GetChatMemberResolverPayload): ChatMember => {
      const chat = this.findChatByTelegramId(Number(payload.chat_id));

      if (!chat || !('members' in chat)) {
        return true as unknown as ChatMember;
      }

      const membership = chat.members.get(payload.user_id);

      if (membership) {
        return membershipToChatMember(membership, chat.type);
      }

      const userEntry = this.users.get(payload.user_id);
      const fallbackUser = (userEntry?.user ?? { id: payload.user_id, is_bot: false, first_name: 'Unknown' }) as unknown as TelegramUser;

      return { status: 'left', user: fallbackUser };
    };

    interface GetChatAdministratorsResolverPayload {
      chat_id: ChatId;
      return_bots?: boolean;
    }

    const getChatAdministratorsResolver = (payload: GetChatAdministratorsResolverPayload): ChatMember[] => {
      const chat = this.findChatByTelegramId(Number(payload.chat_id));

      if (!chat || !('members' in chat)) {
        return [];
      }

      const admins = [...chat.members.values()]
        .filter((membership) => membership.status === 'creator' || membership.status === 'administrator')
        .map((membership) => membershipToChatMember(membership, chat.type));

      // Bot API 10.0: return_bots: false excludes bot administrators.
      if (payload.return_bots === false) {
        return admins.filter((member) => !member.user.is_bot);
      }

      return admins;
    };

    interface GetChatResolverPayload {
      chat_id: ChatId;
    }

    const getChatResolver = (payload: GetChatResolverPayload) => {
      const chat = this.findChatByTelegramId(Number(payload.chat_id));

      if (!chat) {
        return true;
      }

      return { ...chat.toTelegramChat(), invite_link: '' };
    };

    return {
      sendMessage: syntheticMessage,
      sendPhoto: syntheticMessage,
      sendDocument: syntheticMessage,
      sendVideo: syntheticMessage,
      sendAudio: syntheticMessage,
      sendVoice: syntheticMessage,
      sendVideoNote: syntheticMessage,
      sendAnimation: syntheticMessage,
      sendSticker: syntheticMessage,
      sendLocation: syntheticMessage,
      sendContact: syntheticMessage,
      sendVenue: syntheticMessage,
      sendPoll: syntheticMessage,
      sendDice: syntheticMessage,
      sendLivePhoto: syntheticMessage as never,
      sendRichMessage: syntheticMessage as never,
      sendMediaGroup: syntheticMediaGroup as never,
      copyMessage: syntheticMessageId as never,
      forwardMessage: syntheticMessage,
      getChatMember: getChatMemberResolver as never,
      getChatAdministrators: getChatAdministratorsResolver as never,
      getChat: getChatResolver as never,
      getFile: () => ({
        file_id: 'test_file_id',
        file_unique_id: 'test_file_unique_id',
        file_size: 1024,
        file_path: 'documents/test_file.pdf',
      }),
      // Bot API 10.0: answerGuestQuery is an inline-style answer returning a SentGuestMessage.
      answerGuestQuery: () => ({ inline_message_id: `igm-${String(this.ids.nextMessageId())}` }),
      getManagedBotAccessSettings: () => ({ is_access_restricted: false }),
      setManagedBotAccessSettings: () => true,
      getManagedBotToken: (() => `managed-bot-token-${String(this.ids.nextMessageId())}`) as never,
      replaceManagedBotToken: (() => `managed-bot-token-${String(this.ids.nextMessageId())}`) as never,
      getUserPersonalChatMessages: () => [],
    };
  }

  /**
   * Processes a captured outgoing API call. Derives `chat.messages` and
   * `user.replies` projections.
   * @param request - The captured outgoing API request.
   * @internal
   */
  deriveFromCapture(request: Request): void {
    const payload = request.payload as Record<string, unknown>;

    if (CHAT_ACTION_METHODS.has(request.method)) {
      this.deriveChatAction(payload);

      return;
    }

    if (EDIT_METHODS.has(request.method)) {
      this.deriveEdit(payload);

      return;
    }

    if (DELETE_METHODS.has(request.method)) {
      this.deriveDelete(payload);

      return;
    }

    if (DRAFT_METHODS.has(request.method)) {
      this.deriveDraft(request.method, payload);

      return;
    }

    if (REACTION_REMOVAL_METHODS.has(request.method)) {
      this.deriveReactionRemoval(request.method, payload);

      return;
    }

    if (REACTION_CHANGE_METHODS.has(request.method)) {
      this.deriveReactionChange(payload);

      return;
    }

    if (MODERATION_METHODS.has(request.method)) {
      this.deriveModeration(request, payload);

      return;
    }

    if (!MESSAGE_METHODS.has(request.method)) {
      return;
    }

    // Reset so the response resolver sees undefined for unregistered chats.
    this.lastCapturedReply = undefined;

    const chatId = payload.chat_id as ChatId | undefined;

    if (chatId === undefined) {
      return;
    }

    const chat = this.findChatByTelegramId(Number(chatId));

    if (!chat) {
      this.warnUnregisteredChat(request.method, chatId);

      return;
    }

    const { bot } = this;

    if (!bot) {
      return;
    }

    const replyParameters = payload.reply_parameters as { chat_id?: ChatId } | undefined;
    const referencedChatId = replyParameters?.chat_id === undefined ? chat.id : Number(replyParameters.chat_id);

    const reply = new Reply<TContext>(payload, chat, {
      bot,
      ids: this.ids,
      recordClick: (callbackData, byUserId, byChatId) => {
        this.clickers.set(callbackData, { userId: byUserId, chatId: byChatId });
      },
      resolveReply: (messageId) => this.messageIdToReply.get(referencedChatId)?.get(messageId),
    });

    this.lastCapturedReply = reply;

    this.setReplyForChat(chat.id, reply);
    this.pendingMessageReplies.set(request, { chatId: chat.id, reply });

    chat.messages.push(reply);
    reply.topic?.messages.push(reply);

    for (const entry of this.users.values()) {
      if (this.userReceivesReply(entry, chat, reply)) {
        entry.replies.push(reply);
      }
    }
  }

  /**
   * Routes a captured `sendChatAction` payload to all matching user action logs.
   * @param payload - The raw outgoing API payload.
   */
  private deriveChatAction(payload: Record<string, unknown>): void {
    const chatId = payload.chat_id as ChatId | undefined;
    const action = payload.action as string | undefined;

    if (chatId === undefined || action === undefined) {
      return;
    }

    const chat = this.findChatByTelegramId(Number(chatId));

    if (!chat) {
      this.warnUnregisteredChat('sendChatAction', chatId);

      return;
    }

    for (const entry of this.users.values()) {
      if (this.userIsInChat(entry, chat)) {
        entry.actions.push(action);
      }
    }
  }

  /**
   * Routes a captured `editMessage*` payload to all matching user edit logs.
   * Looks up the original reply via `messageIdToReply`; silently skips if not found.
   * @param payload - The raw outgoing API payload.
   */
  private deriveEdit(payload: Record<string, unknown>): void {
    const chatId = payload.chat_id as ChatId | undefined;
    const messageId = payload.message_id as number | undefined;

    if (chatId === undefined || messageId === undefined) {
      return;
    }

    const originalReply = this.messageIdToReply.get(Number(chatId))?.get(messageId);

    if (!originalReply?.chat) {
      return; // edit targets a message not captured during this test — skip silently
    }

    const { chat } = originalReply;
    const text = (payload.text ?? payload.caption) as string | undefined;
    const edit: Edit = { text, editedMessageId: messageId, raw: payload };

    for (const entry of this.users.values()) {
      if (this.userIsInChat(entry, chat)) {
        entry.edits.push(edit);
      }
    }
  }

  /**
   * Routes a captured `deleteMessage` payload to the matching chat deletion log.
   * Resolves the deleted Reply via `messageIdToReply` if it was captured during this test.
   * @param payload - The raw outgoing API payload.
   */
  private deriveDelete(payload: Record<string, unknown>): void {
    const chatId = payload.chat_id as ChatId | undefined;
    const messageId = payload.message_id as number | undefined;

    if (chatId === undefined || messageId === undefined) {
      return;
    }

    const log = this.chatDeletions.get(Number(chatId));

    if (!log) {
      this.warnUnregisteredChat('deleteMessage', chatId);

      return;
    }

    const reply = this.messageIdToReply.get(Number(chatId))?.get(messageId);
    const deletion: Deletion<TContext> = { messageId, reply, raw: payload };

    log.push(deletion);
  }

  /**
   * Routes a captured `sendMessageDraft` / `sendRichMessageDraft` payload to the target user's
   * drafts log. Draft sends return `true` and do not produce a `Message`, so they are not added
   * to `chat.messages` / `user.replies`. The draft's `chat_id` is a private chat whose id equals
   * the user's id (Telegram convention).
   * @param method - The draft-sending method name.
   * @param payload - The raw outgoing API payload.
   */
  private deriveDraft(method: string, payload: Record<string, unknown>): void {
    const chatId = payload.chat_id as number | undefined;

    if (chatId === undefined) {
      return;
    }

    const entry = this.users.get(chatId);

    if (!entry) {
      this.warnUnregisteredChat(method, chatId);

      return;
    }

    entry.drafts.push({ method, chatId, payload });
  }

  /**
   * Routes a captured `deleteMessageReaction` / `deleteAllMessageReactions` payload to the
   * orchestrator-wide reactions-removed log.
   * @param method - The reaction-removal method name.
   * @param payload - The raw outgoing API payload.
   */
  private deriveReactionRemoval(method: string, payload: Record<string, unknown>): void {
    const chatId = payload.chat_id as ChatId | undefined;

    if (chatId === undefined) {
      return;
    }

    // deleteMessageReaction carries message_id; deleteAllMessageReactions does not.
    const messageId = payload.message_id as number | undefined;

    this.reactionRemovals.push({ method, chatId, messageId, raw: payload });
  }

  /**
   * Routes a captured `setMessageReaction` payload to the orchestrator-wide log and,
   * when the target chat is registered, that chat's scoped log.
   * @param payload - The raw outgoing API payload.
   */
  private deriveReactionChange(payload: Record<string, unknown>): void {
    const chatId = payload.chat_id as ChatId | undefined;
    const messageId = payload.message_id as number | undefined;

    if (chatId === undefined || messageId === undefined) {
      return;
    }

    const numericChatId = Number(chatId);
    const chat = this.findChatByTelegramId(numericChatId);

    const change: ReactionChange<TContext> = {
      chatId,
      messageId,
      reaction: (payload.reaction as ReactionChange<TContext>['reaction'] | undefined) ?? [],
      isBig: payload.is_big as boolean | undefined,
      reply: this.messageIdToReply.get(numericChatId)?.get(messageId),
      raw: payload,
    };

    this.reactionChanges.push(change);

    if (!chat) {
      this.warnUnregisteredChat('setMessageReaction', chatId);

      return;
    }

    chat.reactionChanges.push(change);
  }

  /**
   * Routes a captured `banChatMember` / `unbanChatMember` / `restrictChatMember` /
   * `promoteChatMember` payload to the target chat's moderation log and queues the
   * membership transition so `user.in(chat)` and the `getChatMember` resolver reflect
   * the bot's own moderation calls. The log records the attempt immediately (matching
   * `chat.messages` semantics), but the members-map mutation is deferred until the
   * mocked response settles successfully — a `failNext`/`failAll` override or a raw
   * non-OK response means Telegram performed no action, so state must not change.
   * No `chat_member` update is dispatched — captures only mutate state
   * (auto-dispatching would re-enter the bot's own handlers); compose with
   * `chat.dispatchMemberUpdate(...)` to drive `chat_member` handlers.
   * @param request - The captured outgoing API request.
   * @param payload - The raw outgoing API payload.
   */
  private deriveModeration(request: Request, payload: Record<string, unknown>): void {
    const { method } = request;
    const chatId = payload.chat_id as ChatId | undefined;
    const userId = payload.user_id as number | undefined;

    if (chatId === undefined || userId === undefined) {
      return;
    }

    const chat = this.findChatByTelegramId(Number(chatId));

    if (!chat) {
      this.warnUnregisteredChat(method, chatId);

      return;
    }

    if (chat.type === 'private') {
      return; // moderation methods target groups/supergroups/channels; real Telegram rejects private chats
    }

    const user = this.users.get(userId)?.user;
    const action = this.buildModerationAction(method, payload, chatId, userId, user, chat.type);

    chat.moderation.push(action);

    if (user !== undefined) {
      this.pendingModerationTransitions.set(request, () => {
        this.applyModerationTransition(chat, user, action);
      });
    }
  }

  /**
   * Called when a captured request's mocked response settles. Registers the
   * message ID returned by a successful mocked send against its captured reply,
   * and applies queued moderation transitions only when the call succeeded.
   * @param request - The captured outgoing API request that settled.
   * @param ok - Whether the call resolved with an `ok: true` envelope.
   * @param result - The successful envelope's result, or `undefined` on failure.
   * @internal
   */
  settleFromCapture(request: Request, ok: boolean, result: unknown): void {
    const pendingReply = this.pendingMessageReplies.get(request);

    this.pendingMessageReplies.delete(request);

    if (ok && pendingReply !== undefined) {
      this.registerReturnedMessageIds(pendingReply.chatId, pendingReply.reply, result);
    }

    const transition = this.pendingModerationTransitions.get(request);

    if (transition === undefined) {
      return;
    }

    this.pendingModerationTransitions.delete(request);

    if (ok) {
      transition();
    }
  }

  /**
   * Normalises a moderation payload into a `ModerationAction` record.
   * @param method - The moderation method name.
   * @param payload - The raw outgoing API payload.
   * @param chatId - The target chat ID from the payload.
   * @param userId - The target user ID from the payload.
   * @param user - The resolved `User` actor, when minted by this orchestrator.
   * @param chatType - The target chat's type, for chat-type-specific flag defaults.
   * @returns The normalised action.
   */
  private buildModerationAction(
    method: string,
    payload: Record<string, unknown>,
    chatId: ChatId,
    userId: number,
    user: User<TContext> | undefined,
    chatType: GroupLikeChat<TContext>['type'],
  ): ModerationAction<TContext> {
    const base = { method, chatId, userId, user, raw: payload };

    switch (method) {
      case 'banChatMember': {
        return {
          ...base,
          kind: 'ban',
          untilDate: payload.until_date as number | undefined,
          revokeMessages: payload.revoke_messages as boolean | undefined,
        };
      }

      case 'unbanChatMember': {
        return { ...base, kind: 'unban', onlyIfBanned: payload.only_if_banned as boolean | undefined };
      }

      case 'restrictChatMember': {
        const permissions = expandChatPermissions(
          (payload.permissions ?? {}) as ChatPermissions,
          payload.use_independent_chat_permissions as boolean | undefined,
        );

        return { ...base, kind: 'restrict', permissions, untilDate: payload.until_date as number | undefined };
      }

      default: {
        // promoteChatMember: all-false/absent boolean rights demote (per the Bot API docs).
        const flags = extractPromoteFlags(payload);

        // For backward compatibility, can_restrict_members defaults to true for
        // promotions of channel administrators (Bot API docs).
        if (chatType === 'channel') {
          flags.can_restrict_members ??= true;
        }

        const hasGrantedRight = Object.values(flags).includes(true);

        if (!hasGrantedRight) {
          return { ...base, kind: 'demote', permissions: {} };
        }

        // can_manage_chat is documented as implied by any other administrator privilege,
        // so it wins over an explicit false in the payload.
        return { ...base, kind: 'promote', permissions: { ...flags, can_manage_chat: true } };
      }
    }
  }

  /**
   * Applies a captured moderation action to the chat's `members` map, mirroring real
   * Telegram semantics: bans set `'kicked'` (with `until_date` clamped to forever when
   * under 30 seconds or over 366 days away, and ignored in basic groups), unbans set
   * `'left'` (removing an active member unless `only_if_banned` guards it), restricts
   * set `'restricted'` (or lift back to `'member'` when every permission is granted),
   * and promotes set `'administrator'` (all-false demotes an administrator back to
   * `'member'`). Creators are never mutated — real Telegram rejects moderating the owner.
   * @param chat - The group, supergroup, or channel the action targets.
   * @param user - The minted target user.
   * @param action - The normalised moderation action.
   */
  private applyModerationTransition(chat: GroupLikeChat<TContext>, user: User<TContext>, action: ModerationAction<TContext>): void {
    const current = chat.members.get(user.id);

    if (current?.status === 'creator') {
      return;
    }

    // Real Telegram rejects banning, unbanning (removing), or restricting an
    // administrator until they are demoted — only promoteChatMember (promote/demote)
    // may rewrite an administrator record.
    if (current?.status === 'administrator' && action.kind !== 'promote' && action.kind !== 'demote') {
      return;
    }

    const next = this.nextModerationMembership(chat, user, current, action);

    if (next !== undefined) {
      chat.members.set(user.id, next);
    }
  }

  /**
   * Computes the membership record a moderation action transitions the target to,
   * or `undefined` when the action leaves the current state untouched (an
   * `only_if_banned` unban of a non-banned user, or a demotion of a non-administrator).
   * @param chat - The group, supergroup, or channel the action targets.
   * @param user - The minted target user.
   * @param current - The target's current membership record, if any.
   * @param action - The normalised moderation action.
   * @returns The next membership record, or `undefined` for no change.
   */
  private nextModerationMembership(
    chat: GroupLikeChat<TContext>,
    user: User<TContext>,
    current: Membership<TContext> | undefined,
    action: ModerationAction<TContext>,
  ): Membership<TContext> | undefined {
    const now = Math.floor(Date.now() / 1000);

    switch (action.kind) {
      case 'ban': {
        // until_date is applied for supergroups and channels only (Bot API docs).
        const untilDate = chat.type === 'group' ? undefined : clampUntilDate(action.untilDate, now);

        return { user, chat, status: 'kicked', permissions: {}, untilDate };
      }

      case 'unban': {
        // unbanChatMember is supported in supergroups and channels only (Bot API docs).
        if (chat.type === 'group') {
          return undefined;
        }

        if (action.onlyIfBanned === true && current?.status !== 'kicked') {
          return undefined;
        }

        return { user, chat, status: 'left', permissions: {} };
      }

      case 'restrict': {
        return this.nextRestrictMembership(chat, user, action, now);
      }

      case 'demote': {
        // promoteChatMember is supported in supergroups and channels only (Bot API docs).
        if (chat.type === 'group') {
          return undefined;
        }

        return current?.status === 'administrator' ? { user, chat, status: 'member', permissions: {} } : undefined;
      }

      case 'promote': {
        // promoteChatMember is supported in supergroups and channels only (Bot API docs).
        if (chat.type === 'group') {
          return undefined;
        }

        return { user, chat, status: 'administrator', permissions: action.permissions ?? {} };
      }

      default: {
        throw new Error(`Unknown moderation action kind: ${String(action.kind)}`);
      }
    }
  }

  /**
   * Computes the membership record a captured `restrictChatMember` call transitions the
   * target to. The method is supported in supergroups only (Bot API docs) — real
   * Telegram rejects it elsewhere, so no state changes for other chat types. Granting
   * every permission lifts the restriction back to `'member'`.
   * @param chat - The group, supergroup, or channel the action targets.
   * @param user - The minted target user.
   * @param action - The normalised restrict action.
   * @param now - The current Unix timestamp in seconds, for `until_date` clamping.
   * @returns The next membership record, or `undefined` for no change.
   */
  private nextRestrictMembership(
    chat: GroupLikeChat<TContext>,
    user: User<TContext>,
    action: ModerationAction<TContext>,
    now: number,
  ): Membership<TContext> | undefined {
    if (chat.type !== 'supergroup') {
      return undefined;
    }

    // Restricting a user who is not currently in the chat keeps them out:
    // real Telegram stores the restriction with is_member: false, and lifting
    // it leaves them 'left' rather than making them a member.
    const current = chat.members.get(user.id);
    const isMember = current?.status === 'member' || (current?.status === 'restricted' && current.permissions.is_member !== false);

    const permissions = action.permissions ?? {};

    if (liftsAllRestrictions(permissions)) {
      return isMember ? { user, chat, status: 'member', permissions: {} } : { user, chat, status: 'left', permissions: {} };
    }

    return {
      user,
      chat,
      status: 'restricted',
      permissions: { ...permissions, is_member: isMember },
      untilDate: clampUntilDate(action.untilDate, now),
    };
  }

  /**
   * Returns `true` if `entry`'s user should receive `reply` in their inbox.
   * @param entry - The user entry to evaluate.
   * @param chat - The chat the reply was sent to.
   * @param reply - The reply to evaluate.
   * @returns `true` if the user should receive the reply.
   */
  private userReceivesReply(entry: UserEntry<TContext>, chat: AnyChat<TContext>, reply: Reply<TContext>): boolean {
    // Rule 1: chat is private with this user
    if (chat.type === 'private' && chat.id === entry.user.id) {
      return true;
    }

    // Rule 1 cont'd: user must be an *active* participant of the
    // group/supergroup/channel. 'left' and 'kicked' are NOT participants.
    if (chat.type !== 'private') {
      if (!('members' in chat)) {
        return false;
      }

      const status = chat.members.get(entry.user.id)?.status;

      if (status === undefined || status === 'left' || status === 'kicked') {
        return false;
      }
    }

    // Rule 2: reply_to_message points at a message authored by this user in this chat.
    if (this.replyAddressesUser(entry.user.id, chat, reply)) {
      return true;
    }

    // Rule 3: mention of @user.username
    if (entry.user.username && reply.mentionUsernames.has(entry.user.username)) {
      return true;
    }

    // Rule 4: response after a clickButton by this user in this chat
    for (const [, { userId: byUserId, chatId: byChatId }] of this.clickers) {
      if (byUserId === entry.user.id && byChatId === chat.id) {
        return true;
      }
    }

    return false;
  }

  /**
   * Tests whether a reply targets a message authored by a user in the same chat/topic.
   * @param userId - The candidate addressee's Telegram user ID.
   * @param chat - The destination chat of the bot reply.
   * @param reply - The captured bot reply.
   * @returns Whether the reply-to-author rule addresses this user.
   */
  private replyAddressesUser(userId: number, chat: AnyChat<TContext>, reply: Reply<TContext>): boolean {
    if (reply.replyToMessageId === undefined) {
      return false;
    }

    const replyParameters = reply.raw.reply_parameters as { chat_id?: ChatId } | undefined;
    const referencedChatId = replyParameters?.chat_id;

    // Cross-chat ReplyParameters describe an external reply and do not address the author
    // through the destination chat's inbox.
    if (referencedChatId !== undefined && Number(referencedChatId) !== chat.id) {
      return false;
    }

    const author = this.messageAuthors.get(chat.id)?.get(reply.replyToMessageId);

    const isSameTopic = author?.messageThreadId === reply.messageThreadId;

    return author?.userId === userId && isSameTopic;
  }

  /**
   * Records a synthetic user-authored message before its middleware dispatch begins.
   * @param message - The synthetic incoming message.
   * @param userId - The authoring user actor's Telegram ID, or undefined for chat-authored messages.
   */
  private recordMessageAuthor(message: Message, userId?: number): void {
    let authors = this.messageAuthors.get(message.chat.id);

    if (!authors) {
      authors = new Map<number, MessageAuthor>();
      this.messageAuthors.set(message.chat.id, authors);
    }

    const existingAuthor = authors.get(message.message_id);

    if (existingAuthor) {
      // An edited_message keeps the original message's author and forum topic. Preserve
      // both when the synthetic edit helper is given only its chat and message ID.
      if (message.message_thread_id === undefined && existingAuthor.messageThreadId !== undefined) {
        message.message_thread_id = existingAuthor.messageThreadId;
        message.is_topic_message = true;
      }

      return;
    }

    authors.set(message.message_id, { userId, messageThreadId: message.message_thread_id });
  }

  /**
   * Registers every Telegram message identity from a successful mocked send result.
   * Media-group sends return multiple messages that all represent the same captured reply.
   * @param chatId - The destination chat's Telegram ID.
   * @param reply - The captured bot reply.
   * @param result - The mocked API result, either one message-like object or an array.
   */
  private registerReturnedMessageIds(chatId: number, reply: Reply<TContext>, result: unknown): void {
    const returnedMessages: unknown[] = Array.isArray(result) ? (result as unknown[]) : [result];

    for (const returnedMessage of returnedMessages) {
      if (typeof returnedMessage === 'object' && returnedMessage !== null && 'message_id' in returnedMessage) {
        const messageId = returnedMessage.message_id;

        if (typeof messageId === 'number') {
          this.setReplyForChat(chatId, reply, messageId);
          this.backfillReactionReply(chatId, messageId, reply);
        }
      }
    }
  }

  /**
   * Resolves reaction attempts captured while an asynchronous send response was still pending.
   * Checks both independently clearable projections; when both retain a change they share the
   * same object, so the second pass is a no-op.
   * @param chatId - The destination chat's Telegram ID.
   * @param messageId - The message identity returned by the mocked send.
   * @param reply - The captured bot reply associated with that identity.
   */
  private backfillReactionReply(chatId: number, messageId: number, reply: Reply<TContext>): void {
    this.backfillReactionLog(this.reactionChanges.all, chatId, messageId, reply);

    const chat = this.findChatByTelegramId(chatId);

    if (chat !== undefined) {
      this.backfillReactionLog(chat.reactionChanges.all, chatId, messageId, reply);
    }
  }

  /**
   * Backfills one reaction-log projection for a newly resolved message identity.
   * @param changes - The global or per-chat reaction records to inspect.
   * @param chatId - The destination chat's Telegram ID.
   * @param messageId - The message identity returned by the mocked send.
   * @param reply - The captured bot reply associated with that identity.
   */
  private backfillReactionLog(
    changes: readonly ReactionChange<TContext>[],
    chatId: number,
    messageId: number,
    reply: Reply<TContext>,
  ): void {
    for (const change of changes) {
      if (change.reply === undefined && Number(change.chatId) === chatId && change.messageId === messageId) {
        change.reply = reply;
      }
    }
  }

  /**
   * Registers a captured bot reply under its chat-scoped Telegram message identity.
   * @param chatId - The destination chat's Telegram ID.
   * @param reply - The captured bot reply.
   * @param messageId - The Telegram message ID to register; defaults to the reply's synthetic ID.
   */
  private setReplyForChat(chatId: number, reply: Reply<TContext>, messageId = reply.messageId): void {
    let replies = this.messageIdToReply.get(chatId);

    if (!replies) {
      replies = new Map<number, Reply<TContext>>();
      this.messageIdToReply.set(chatId, replies);
    }

    replies.set(messageId, reply);
  }

  /**
   * Returns the existing private chat for `user`, or creates and registers a new one.
   * @param user - The user whose private chat to retrieve or create.
   * @returns The `PrivateChat` instance for `user`.
   * @throws {Error} When `user.id` is already registered to a non-private chat, or to a
   *   private chat owned by a different user actor. Repeated calls for the same user object
   *   keep returning the same instance — private-chat IDs always mirror the owning user's ID,
   *   so routing is unchanged in that case.
   */
  private privateChatFor(user: User<TContext>): PrivateChat<TContext> {
    const entry = this.users.get(user.id);

    if (entry?.privateChat && entry.user === user) {
      return entry.privateChat;
    }

    // A registry entry owned by a different user object means another actor is minted at
    // this ID; registering a private chat for this object would route that actor's private
    // replies (matched by numeric ID) to the wrong inbox.
    if (entry !== undefined && entry.user !== user) {
      throw new Error(
        `[grammy-testing] Cannot register a private chat for user ${String(user.id)}: ` +
          'a different user actor with that ID is minted in this orchestrator. ' +
          'Reuse the minted User object, or pick a different user id.',
      );
    }

    const existing = this.chats.get(user.id);

    if (existing !== undefined) {
      if (existing.type !== 'private') {
        throw new Error(
          `[grammy-testing] Cannot register a private chat for user ${String(user.id)}: ` +
            `that ID is already registered to a ${existing.type} ("${existing.title}"). ` +
            'Registering the private chat would silently take over message routing for that ID. ' +
            'Pick a different user id, or a different chat id.',
        );
      }

      // Same owning user object: reuse the registered chat (and its messages log)
      // instead of re-registering a fresh instance over it.
      if (existing.user === user) {
        if (entry?.user === user) {
          entry.privateChat = existing;
        }

        return existing;
      }

      throw new Error(
        `[grammy-testing] Cannot register a private chat for user ${String(user.id)}: ` +
          'that ID is already registered to a private chat owned by a different user actor. ' +
          'Registering the private chat would silently take over message routing for that ID. ' +
          'Reuse the original user object, or pick a different user id.',
      );
    }

    const chat = new PrivateChat<TContext>(user);

    if (entry?.user === user) {
      entry.privateChat = chat;
    }

    this.chats.set(chat.id, chat);
    this.chatDeletions.set(chat.id, new DeletionsLog<TContext>());
    chat.reactionChanges = new ReactionChangesLog<TContext>();

    if (this.bot) {
      chat[setBotRef](this.bot);
    }

    return chat;
  }

  /**
   * Draws IDs from `nextId` until one is found that no registered user or chat occupies.
   * Explicit IDs may claim values inside an auto-generated range; the generated paths skip
   * them instead of colliding with the duplicate-registration guards.
   * @param nextId - Counter function that yields candidate IDs.
   * @returns The first unoccupied auto-generated ID.
   */
  private nextUnregisteredId(nextId: () => number): number {
    let id = nextId();

    while (this.chats.has(id) || this.users.has(id)) {
      id = nextId();
    }

    return id;
  }

  /**
   * Registers a newly created chat, initialises its messages log, and wires the bot if attached.
   * @param chat - The channel, group, or supergroup to register.
   * @throws {Error} When `chat.id` is already registered to a different actor. Allowing the
   *   registration would silently re-route captured messages, deletions, and `getChat`-style
   *   resolvers to the new actor while the original actor's logs stay empty.
   */
  private registerChat(chat: GroupLikeChat<TContext>): void {
    const existing = this.chats.get(chat.id);

    if (existing !== undefined) {
      const existingLabel = existing.type === 'private' ? `a private chat` : `a ${existing.type} ("${existing.title}")`;

      throw new Error(
        `[grammy-testing] Chat ID ${String(chat.id)} is already registered to ${existingLabel}. ` +
          'Registering a second chat with the same ID would silently take over message routing for that ID. ' +
          'Reuse the existing chat object, or pick a different id.',
      );
    }

    chat.messages = new MessagesLog<TContext>();
    chat.moderation = new ModerationLog<TContext>();
    chat.reactionChanges = new ReactionChangesLog<TContext>();
    this.chats.set(chat.id, chat);
    this.chatDeletions.set(chat.id, new DeletionsLog<TContext>());

    if (this.bot) {
      chat[setBotRef](this.bot);
    }
  }

  /**
   * Looks up a registered chat by its Telegram integer ID.
   * @param id - The Telegram chat ID to look up.
   * @returns The matching chat, or `undefined` if not registered.
   */
  private findChatByTelegramId(id: number): AnyChat<TContext> | undefined {
    return this.chats.get(id);
  }

  /**
   * Emits a console.warn when an API call targets a chat not registered with this orchestrator.
   * @param method - The API method name.
   * @param chatId - The unregistered chat ID.
   */
  private warnUnregisteredChat(method: string, chatId: ChatId): void {
    if (this.warnOnUnregisteredChats) {
      // eslint-disable-next-line no-console -- intentional developer warning
      console.warn(
        `[grammy-testing] Bot called ${method} to unregistered chat ${String(chatId)}. ` +
          `Register it with chats.newChannel() / newSupergroup() / newGroup(), or pass { warnOnUnregisteredChats: false } to suppress.`,
      );
    }
  }

  /**
   * Reads the membership record for `user` in `chat`, or `undefined` for private chats.
   * @param user - The user whose membership to read.
   * @param chat - The chat to read membership from.
   * @returns The `Membership` record, or `undefined` for private chats.
   */
  private readMembership(user: User<TContext>, chat: AnyChat<TContext>): Membership<TContext> | undefined {
    if (chat.type === 'private') {
      return undefined;
    }

    return chat.members.get(user.id);
  }

  /**
   * Applies a membership status transition after a service message dispatches.
   * `'join'` preserves higher privilege; `'leave'` always sets `status: 'left'`.
   * @param chat - The group or supergroup chat.
   * @param user - The member whose status is changing.
   * @param mode - Whether the user is joining or leaving.
   * @internal
   */
  private applyMembershipTransition(chat: Group<TContext> | Supergroup<TContext>, user: User<TContext>, mode: 'join' | 'leave'): void {
    if (mode === 'leave') {
      chat.members.set(user.id, {
        user,
        chat,
        status: 'left',
        permissions: {},
      });

      return;
    }

    // mode === 'join': don't downgrade existing privileged status.
    const current = chat.members.get(user.id);

    if (
      current &&
      (current.status === 'creator' || current.status === 'administrator' || current.status === 'restricted' || current.status === 'member')
    ) {
      return;
    }

    chat.members.set(user.id, {
      user,
      chat,
      status: 'member',
      permissions: {},
    });
  }

  /**
   * Returns `true` if `entry`'s user is an active participant of `chat`.
   * For private chats this matches by user ID; for group chats it checks active membership.
   * @param entry - The user entry to evaluate.
   * @param chat - The chat to check.
   * @returns `true` if the user is an active participant.
   */
  private userIsInChat(entry: UserEntry<TContext>, chat: AnyChat<TContext>): boolean {
    if (chat.type === 'private') {
      return chat.id === entry.user.id;
    }

    if (!('members' in chat)) {
      return false;
    }

    const status = chat.members.get(entry.user.id)?.status;

    return status !== undefined && status !== 'left' && status !== 'kicked';
  }

  /**
   * Access the per-user replies inbox.
   * @param user - The user whose inbox to retrieve.
   * @returns The `RepliesInbox` for `user`.
   */
  repliesFor(user: User<TContext>): RepliesInbox<TContext> {
    const entry = this.users.get(user.id);

    if (!entry) {
      throw new Error(`User ${String(user.id)} was not minted by this Chats instance`);
    }

    return entry.replies;
  }

  /**
   * Access the per-user chat-action log.
   * @param user - The user whose action log to retrieve.
   * @returns The `ActionsLog` for `user`.
   */
  actionsFor(user: User<TContext>): ActionsLog {
    const entry = this.users.get(user.id);

    if (!entry) {
      throw new Error(`User ${String(user.id)} was not minted by this Chats instance`);
    }

    return entry.actions;
  }

  /**
   * Access the per-user edit log.
   * @param user - The user whose edit log to retrieve.
   * @returns The `EditsLog` for `user`.
   */
  editsFor(user: User<TContext>): EditsLog {
    const entry = this.users.get(user.id);

    if (!entry) {
      throw new Error(`User ${String(user.id)} was not minted by this Chats instance`);
    }

    return entry.edits;
  }

  /**
   * Access the per-user drafts log (`sendMessageDraft` / `sendRichMessageDraft` captures).
   * @param user - The user whose drafts log to retrieve.
   * @returns The `DraftsLog` for `user`.
   */
  draftsFor(user: User<TContext>): DraftsLog {
    const entry = this.users.get(user.id);

    if (!entry) {
      throw new Error(`User ${String(user.id)} was not minted by this Chats instance`);
    }

    return entry.drafts;
  }

  /**
   * Resolves the `User` that originated a guest query via `user.sendGuestMessage`.
   * Use this to assert that the bot's captured `answerGuestQuery` call targeted the right guest.
   * @param guestQueryId - The `guest_query_id` returned by `user.sendGuestMessage`.
   * @returns The originating `User`, or `undefined` if the query id is unknown.
   */
  guestQueryUser(guestQueryId: string): User<TContext> | undefined {
    return this.guestQueryToUser.get(guestQueryId);
  }

  /**
   * Access the per-chat deletion log.
   * @param chat - The chat whose deletion log to retrieve.
   * @returns The `DeletionsLog` for `chat`.
   */
  deletionsFor(chat: AnyChat<TContext>): DeletionsLog<TContext> {
    const log = this.chatDeletions.get(chat.id);

    if (!log) {
      throw new Error(`Chat ${String(chat.id)} was not registered with this Chats instance`);
    }

    return log;
  }
}
