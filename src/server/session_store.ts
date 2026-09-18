/**
 * In-memory state of every isolated test session: the bots, users, and chats a tester has
 * declared, and the messages exchanged in those chats.
 */
import type { Chat, Message, User, UserFromGetMe } from 'grammy/types';

/** Raised when a tester's entity definition is inconsistent with the session's current state. */
export class SessionValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SessionValidationError';
  }
}

export interface BotRecord {
  token: string;
  user: UserFromGetMe;
}

/** A chat together with the state Telegram keeps about it but never exposes on the `Chat` object. */
export interface ChatRecord {
  chat: Chat;
  /** Identifiers of every user and bot currently in the chat. */
  memberIds: Set<number>;
  /** Messages in send order; `message_id` is sequential within the chat. */
  messages: Message[];
  nextMessageId: number;
}

export interface CreateBotDefinition {
  username: string;
  first_name: string;
}

export interface CreateUserDefinition {
  first_name: string;
  last_name?: string;
  username?: string;
}

export interface CreatePrivateChatDefinition {
  userId: number;
  memberIds: number[];
}

/** Telegram identifiers use at most 52 significant bits. */
const TELEGRAM_ID_BITS = 52;
const BOT_TOKEN_SECRET_LENGTH = 35;
const BOT_TOKEN_SECRET_ALPHABET =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-';

export class Session {
  /** Bots keyed by token. Every bot's user object is also present in `users`. */
  readonly bots = new Map<string, BotRecord>();
  /** Users and bots keyed by identifier. */
  readonly users = new Map<number, User>();
  readonly chats = new Map<number, ChatRecord>();

  constructor(readonly id: string) {}

  createBot(definition: CreateBotDefinition): BotRecord {
    const user: UserFromGetMe = {
      id: this.allocateUserId(),
      is_bot: true,
      first_name: definition.first_name,
      username: definition.username,
      can_join_groups: true,
      can_read_all_group_messages: false,
      supports_inline_queries: false,
      can_connect_to_business: false,
      has_main_web_app: false,
      has_topics_enabled: false,
      allows_users_to_create_topics: false,
      can_manage_bots: false,
      supports_join_request_queries: false,
    };
    const record: BotRecord = { token: `${user.id}:${randomBotTokenSecret()}`, user };
    this.users.set(user.id, user);
    this.bots.set(record.token, record);
    return record;
  }

  createUser(definition: CreateUserDefinition): User {
    const user: User = {
      id: this.allocateUserId(),
      is_bot: false,
      first_name: definition.first_name,
      ...(definition.last_name !== undefined && { last_name: definition.last_name }),
      ...(definition.username !== undefined && { username: definition.username }),
    };
    this.users.set(user.id, user);
    return user;
  }

  /**
   * Declares a private chat between `userId` and whichever members are listed. The chat id is
   * drawn independently of the user id: Telegram does not guarantee they match, so tests must not
   * rely on it.
   */
  createPrivateChat(definition: CreatePrivateChatDefinition): ChatRecord {
    const user = this.users.get(definition.userId);
    if (user === undefined) {
      throw new SessionValidationError(`user ${definition.userId} does not exist`);
    }
    if (user.is_bot) {
      throw new SessionValidationError(
        `user ${definition.userId} is a bot; a private chat needs a human party`,
      );
    }
    if (!definition.memberIds.includes(user.id)) {
      throw new SessionValidationError(
        `member_ids must include the private chat's user ${user.id}`,
      );
    }
    for (const memberId of definition.memberIds) {
      if (!this.users.has(memberId)) {
        throw new SessionValidationError(`member ${memberId} does not exist`);
      }
    }
    const chat: Chat.PrivateChat = {
      id: this.allocateChatId(),
      type: 'private',
      first_name: user.first_name,
      ...(user.last_name !== undefined && { last_name: user.last_name }),
      ...(user.username !== undefined && { username: user.username }),
    };
    const record: ChatRecord = {
      chat,
      memberIds: new Set(definition.memberIds),
      messages: [],
      nextMessageId: 1,
    };
    this.chats.set(chat.id, record);
    return record;
  }

  findBotByToken(token: string): BotRecord | undefined {
    return this.bots.get(token);
  }

  appendTextMessage(chat: ChatRecord, from: User, text: string): Message {
    const message: Message = {
      message_id: chat.nextMessageId,
      from,
      chat: chat.chat,
      date: Math.floor(Date.now() / 1000),
      text,
    };
    chat.nextMessageId += 1;
    chat.messages.push(message);
    return message;
  }

  private allocateUserId(): number {
    return allocateUnusedId(this.users);
  }

  private allocateChatId(): number {
    return allocateUnusedId(this.chats);
  }
}

export class SessionStore {
  private readonly sessions = new Map<string, Session>();

  create(): Session {
    const session = new Session(crypto.randomUUID());
    this.sessions.set(session.id, session);
    return session;
  }

  get(sessionId: string): Session | undefined {
    return this.sessions.get(sessionId);
  }

  delete(sessionId: string): boolean {
    return this.sessions.delete(sessionId);
  }
}

function allocateUnusedId(taken: ReadonlyMap<number, unknown>): number {
  let candidate = randomTelegramId();
  while (taken.has(candidate)) candidate = randomTelegramId();
  return candidate;
}

/** A uniformly random integer in `1 .. 2^52 - 1`. */
function randomTelegramId(): number {
  const bytes = new Uint8Array(Math.ceil(TELEGRAM_ID_BITS / 8));
  do {
    crypto.getRandomValues(bytes);
    const surplusBits = bytes.length * 8 - TELEGRAM_ID_BITS;
    bytes[0] &= 0xff >> surplusBits;
    let value = 0;
    for (const byte of bytes) value = value * 256 + byte;
    if (value !== 0) return value;
  } while (true);
}

function randomBotTokenSecret(): string {
  const indices = crypto.getRandomValues(new Uint8Array(BOT_TOKEN_SECRET_LENGTH));
  let secret = '';
  for (const index of indices) {
    secret += BOT_TOKEN_SECRET_ALPHABET[index % BOT_TOKEN_SECRET_ALPHABET.length];
  }
  return secret;
}
