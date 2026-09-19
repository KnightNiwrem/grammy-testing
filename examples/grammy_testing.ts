/**
 * The intended public surface of the grammy-testing library.
 *
 * This module is a design sketch, not an implementation: the types are the contract that the
 * example tests in this folder compile against, and the two entry functions throw
 * `NotImplementedError`. Nothing here is speculative — every export exists because a numbered
 * example in this folder needs it. When the real library is built, this file is the checklist of
 * what its `mod.ts` must provide, and the examples become its acceptance tests.
 *
 * Design principles the examples converged on:
 *
 * - **Actors act, chats observe.** Simulated humans (`TestUser`) perform actions that synthesize
 *   Telegram updates for the bot under test. Chat handles (`TestChat`) are addresses plus
 *   observation surfaces; they never act.
 * - **Every action returns its artifact.** Sending a message returns the stored `Message`, tapping
 *   a button returns the pending callback query. Waits anchor on these artifacts (`after`, `of`),
 *   which makes tests race-free without sleeps: a wait resolves correctly whether the awaited
 *   event has already happened or is yet to come.
 * - **Telegram shapes, not parallel shapes.** Everything observable is a plain object from
 *   `grammy/types` (`Message`, `User`, `ChatMember`), so assertions read like the Bot API docs.
 * - **grammY coupling only at the edges.** The emulator speaks the wire-level Bot API; only the
 *   `startBot` convenience helper takes a grammY `Bot`.
 */
import type { Bot, Context } from 'grammy';
import type { ChatMember, Message, User } from 'grammy/types';

/** Thrown by every sketched entry point; the library is not implemented yet. */
export class NotImplementedError extends Error {
  constructor(what: string) {
    super(`${what} is a design sketch and is not implemented yet`);
    this.name = 'NotImplementedError';
  }
}

/** How a test reaches an already-running emulation server. */
export interface ConnectOptions {
  serverUrl: string;
}

/** Connection to an emulation server; the factory for isolated sessions. */
export interface EmulatorConnection {
  createSession(): Promise<TestSession>;
}

export function connect(_options: ConnectOptions): EmulatorConnection {
  throw new NotImplementedError('connect');
}

/**
 * One isolated simulated world. Sessions share nothing: identifiers, usernames, and chats in one
 * session are meaningless in another. Disposal destroys every entity in the session and completes
 * any Bot API long poll still held by the server, so a test never hangs on cleanup.
 */
export interface TestSession extends AsyncDisposable {
  /** Value for grammY's `client.apiRoot` option; routes the bot under test into this session. */
  readonly apiRoot: string;
  createBot(profile?: BotProfile): Promise<TestBotAccount>;
  createUser(profile?: UserProfile): Promise<TestUser>;
  createGroup(options: GroupOptions): Promise<TestGroupChat>;
  /**
   * Every Bot API call the session has served for bots in this session, oldest first, including
   * calls that failed. This is the introspection surface for asserting *how* the bot called the
   * API (payload fields such as `parse_mode` or `reply_markup`) rather than what got stored.
   */
  apiCalls(filter?: ApiCallFilter): Promise<RecordedApiCall[]>;
  destroy(): Promise<void>;
}

export interface BotProfile {
  username?: string;
  firstName?: string;
}

export interface UserProfile {
  firstName?: string;
  lastName?: string;
  username?: string;
  languageCode?: string;
}

/** A group is created with its owner; further parties join or are added afterwards. */
export interface GroupOptions {
  title: string;
  owner: TestUser;
}

/** A bot identity registered in the session: the account the bot under test logs in as. */
export interface TestBotAccount {
  readonly id: number;
  /** Telegram-shaped `<id>:<secret>` token to pass to `new Bot(...)`. */
  readonly token: string;
  readonly username: string;
  readonly botUser: User;
}

/**
 * A simulated human. All world-changing behavior in a test is phrased as an action of some user,
 * because that is what produces updates for the bot under test.
 */
export interface TestUser {
  readonly id: number;
  readonly user: User;
  /**
   * Starts (or returns) this user's private conversation with the given bot. A private
   * conversation exists per (user, bot) pair and only the user can bring it into existence,
   * exactly as on Telegram; calling this twice yields the same chat. Until a user has opened the
   * conversation, the bot cannot message them (`403: bot can't initiate conversation with a
   * user`).
   */
  openPrivateChat(bot: TestBotAccount): Promise<TestPrivateChat>;
  /** Sends a text message to a chat this user belongs to; returns the stored message. */
  sendText(chat: TestChat, text: string): Promise<Message>;
  /**
   * Presses an inline keyboard button on a message this user can see, selected by visible label
   * or by `callback_data`. Synthesizes a `callback_query` update for the bot that owns the
   * message's keyboard.
   */
  tapInlineButton(message: Message, button: InlineButtonSelector): Promise<PendingCallbackQuery>;
  /** Blocks the bot: its next send answers `403: bot was blocked by the user`. */
  block(bot: TestBotAccount): Promise<void>;
  unblock(bot: TestBotAccount): Promise<void>;
  /** Joins a group; returns the service message announcing the join. */
  joinGroup(group: TestGroupChat): Promise<Message>;
  /** Adds another user or a bot to a group this user belongs to; returns the service message. */
  addToGroup(group: TestGroupChat, member: TestUser | TestBotAccount): Promise<Message>;
  /** Promotes a group member to administrator with the given rights; requires ownership. */
  promote(
    group: TestGroupChat,
    member: TestUser | TestBotAccount,
    rights: PromotionRights,
  ): Promise<void>;
}

export type InlineButtonSelector = { label: string } | { callbackData: string };

/**
 * Administrator rights granted on promotion; names mirror `promoteChatMember` capabilities.
 * Only the rights an example exercises are listed; the remaining capabilities join this
 * interface when an example needs them.
 */
export interface PromotionRights {
  canDeleteMessages?: boolean;
  canRestrictMembers?: boolean;
}

/** Handle on a tapped button: lets the test await the bot's `answerCallbackQuery`. */
export interface PendingCallbackQuery {
  readonly queryId: string;
  /** Resolves when the bot answers the query; rejects on timeout. */
  answered(options?: WaitOptions): Promise<CallbackQueryAnswer>;
}

export interface CallbackQueryAnswer {
  text?: string;
  showAlert: boolean;
}

/** Observation surface shared by every chat kind. */
export interface TestChat {
  readonly id: number;
  /** Full stored history of the chat, oldest first, regardless of sender. */
  messages(filter?: MessageFilter): Promise<Message[]>;
  /**
   * Resolves with the first message matching the filter. With `after`, only messages later than
   * the anchor count, so the wait is correct even if the message arrived before the call.
   */
  waitForMessage(wait: MessageWait): Promise<Message>;
  /** Resolves with the edited form of `of` once its text or markup changes past the snapshot. */
  waitForEdit(wait: EditWait): Promise<Message>;
}

/** A private conversation; exists only as the (user, bot) pair that owns it. */
export interface TestPrivateChat extends TestChat {
  readonly user: TestUser;
  readonly bot: TestBotAccount;
}

export interface TestGroupChat extends TestChat {
  readonly title: string;
  getMember(who: TestUser | TestBotAccount): Promise<ChatMember>;
  /** Resolves once the member's status equals `status`; correct if it already does. */
  waitForMemberStatus(wait: MemberStatusWait): Promise<ChatMember>;
}

export interface MessageFilter {
  from?: TestUser | TestBotAccount;
}

export interface MessageWait {
  from?: TestUser | TestBotAccount;
  after?: Message;
  timeoutMs?: number;
}

export interface EditWait {
  of: Message;
  timeoutMs?: number;
}

export interface MemberStatusWait {
  member: TestUser | TestBotAccount;
  status: ChatMember['status'];
  timeoutMs?: number;
}

export interface WaitOptions {
  timeoutMs?: number;
}

export interface ApiCallFilter {
  method?: string;
  bot?: TestBotAccount;
}

/** One Bot API call served for a bot in this session, with its outcome. */
export interface RecordedApiCall {
  readonly method: string;
  readonly payload: Record<string, unknown>;
  readonly outcome: ApiCallOutcome;
}

export type ApiCallOutcome =
  | { ok: true }
  | { ok: false; errorCode: number; description: string };

/** A started grammY bot whose polling loop is cleanly stopped on disposal. */
export interface RunningBot extends AsyncDisposable {
  stop(): Promise<void>;
}

/**
 * Starts long polling for a grammY bot and resolves once the bot is initialized and its first
 * `getUpdates` poll is armed, so the test knows the bot is live before acting. Updates produced
 * before or between polls are queued by the emulator, as Telegram queues them, so this is a
 * convenience for readable sequencing, not a correctness requirement.
 */
export function startBot<C extends Context>(_bot: Bot<C>): Promise<RunningBot> {
  throw new NotImplementedError('startBot');
}
