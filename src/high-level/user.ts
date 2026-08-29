import type { Bot, Context } from 'grammy';
import type {
  Chat,
  Message,
  MessageEntity,
  MessageOrigin,
  ReactionType,
  ShippingAddress,
  Update,
  User as TelegramUser,
} from 'grammy/types';

import type { AnyChat } from './chat';
import type { RepliesInbox } from './chats';
import { dispatchEditedMessage, dispatchServiceMessage, dispatchTextMessage } from './dispatch';
import type { DraftsLog } from './drafts-log';
import type { ForumTopic } from './forum-topic';
import type { Group } from './group';
import type { IdGenerator } from './id-generator';
import {
  makeAnimationStub,
  makeAudioStub,
  makeDocumentStub,
  makePhotoSizeStub,
  makeStickerStub,
  makeVideoNoteStub,
  makeVideoStub,
  makeVoiceStub,
} from './media-stubs';
import type { Reply } from './reply';
import type { Supergroup } from './supergroup';
import type { Membership } from './types';

export interface UserProfile {
  id?: number;
  first_name?: string;
  last_name?: string;
  username?: string;
}

/**
 * The synthetic "Group Anonymous Bot" user that Telegram inserts as `from` when a group admin
 * posts using the "Send as Group" (anonymous admin) feature. Distinct from `Channel_Bot`
 * (`id: 136_817_688`) which is used for channel posts into linked groups.
 *
 * Import this constant to assert on the `from` field without hard-coding the magic number.
 */
export const GROUP_ANONYMOUS_BOT = {
  id: 1_087_968_824,
  // Intentional: Telegram sends is_bot: false for this identity, matching real update payloads.
  // Same as Channel_Bot (id: 136_817_688) — both are pseudo-users, not actual bots.
  is_bot: false,
  first_name: 'Group',
  username: 'GroupAnonymousBot',
} as const;

export interface SendTextOptionsReplyParameter {
  message_id: number;
}

export interface SendTextOptionsReplyToMessage {
  message_id: number;
}

/**
 * Options shared by the user message-send verbs (`sendText`, `sendCommand`, the media
 * verbs through `sendDice`, and `sendMediaGroup`'s shared options; `sendForwarded`,
 * `sendWebAppData`, and `sendSuccessfulPayment` keep narrower options). All dispatched
 * `message` updates support the same message-level metadata in real Telegram — target
 * chat, reply context, GroupAnonymousBot identity, and forum-topic targeting — regardless
 * of the message content kind.
 */
export interface UserSendOptions<TContext extends Context = Context> {
  chat?: AnyChat<TContext>;
  /**
   * Reply target by `message_id`. Synthesizes a minimal `reply_to_message` stub on the
   * dispatched message — in real Telegram a reply update always carries `reply_to_message`.
   * Ignored when `reply_to_message` is also provided (the richer shape wins).
   */
  reply_parameters?: SendTextOptionsReplyParameter;
  /** Quoted message embedded as `reply_to_message` on the dispatched message. */
  reply_to_message?: Partial<Message> & SendTextOptionsReplyToMessage;
  /**
   * When `true`, replaces `message.from` with the GroupAnonymousBot identity and sets
   * `message.sender_chat` to the target group. Requires `options.chat` to be a `Group` or
   * `Supergroup` — Telegram only sends this shape in group contexts.
   */
  anonymous?: boolean;
  /**
   * Target forum topic. Must be a topic minted via `forum.newTopic(...)`. The dispatched
   * message carries the topic's `message_thread_id` and `is_topic_message: true`. When
   * `options.chat` is omitted, the topic's parent forum is used as the target chat; when
   * supplied, it must be the same forum instance the topic was registered on.
   */
  topic?: ForumTopic<TContext>;
}

export interface SendTextOptions<TContext extends Context = Context> extends UserSendOptions<TContext> {
  entities?: MessageEntity[];
  parse_mode?: 'HTML' | 'Markdown' | 'MarkdownV2';
}

export interface SendForwardedOptions<TContext extends Context = Context> {
  forwardOrigin: MessageOrigin;
  chat?: AnyChat<TContext>;
}

export interface SendPhotoOptions<TContext extends Context = Context> extends UserSendOptions<TContext> {
  caption?: string;
}

export interface SendDocumentOptions<TContext extends Context = Context> extends UserSendOptions<TContext> {
  caption?: string;
}

export interface SendVideoOptions<TContext extends Context = Context> extends UserSendOptions<TContext> {
  caption?: string;
}

export interface SendAudioOptions<TContext extends Context = Context> extends UserSendOptions<TContext> {
  caption?: string;
}

export interface SendVoiceOptions<TContext extends Context = Context> extends UserSendOptions<TContext> {
  caption?: string;
}

export type SendVideoNoteOptions<TContext extends Context = Context> = UserSendOptions<TContext>;

export interface SendAnimationOptions<TContext extends Context = Context> extends UserSendOptions<TContext> {
  caption?: string;
}

export type SendStickerOptions<TContext extends Context = Context> = UserSendOptions<TContext>;

export type SendLocationOptions<TContext extends Context = Context> = UserSendOptions<TContext>;

export interface SendContactOptions<TContext extends Context = Context> extends UserSendOptions<TContext> {
  lastName?: string;
}

export type SendVenueOptions<TContext extends Context = Context> = UserSendOptions<TContext>;

export type SendPollOptions<TContext extends Context = Context> = UserSendOptions<TContext>;

export type SendDiceOptions<TContext extends Context = Context> = UserSendOptions<TContext>;

export interface SendWebAppDataOptions<TContext extends Context = Context> {
  chat?: AnyChat<TContext>;
}

export interface SendSuccessfulPaymentOptions<TContext extends Context = Context> {
  chat?: AnyChat<TContext>;
}

export interface SendInlineQueryOptions {
  chatType?: 'channel' | 'group' | 'private' | 'sender' | 'supergroup';
}

export interface ReactToOptions {
  date?: number;
}

export interface AnswerPollOptions {
  voterChat?: Chat;
}

export interface RequestJoinOptions {
  bio?: string;
}

export interface GuestMessageOptions {
  /** Override the auto-generated update_id. */
  updateId?: number;
}

export interface BoostChatOptions {
  expirationDays?: number;
}

export interface RemoveBoostOptions {
  removeDate?: number;
}

export interface ManageBotOptions {
  /** Override the auto-generated update_id. */
  updateId?: number;
}

export interface PurchasePaidMediaOptions {
  /** Override the auto-generated update_id. */
  updateId?: number;
}

export interface SendCallbackQueryOptionsMessage {
  message_id?: number;
}

export interface SendCallbackQueryOptions<TContext extends Context = Context> {
  /**
   * Optional message context embedded in `callback_query.message`. When absent, a minimal
   * private-chat stub is synthesized so grammY filters like `chatType('private')` evaluate
   * correctly without any test boilerplate.
   */
  message?: Partial<Message> & SendCallbackQueryOptionsMessage;
  /**
   * Convenience override for `callback_query.message.chat`. Ignored when
   * `options.message.chat` is explicitly set.
   */
  chat?: AnyChat<TContext>;
  /**
   * Target forum topic for the embedded `callback_query.message`. Must be a topic minted
   * via `forum.newTopic(...)`. The synthesized message carries the topic's
   * `message_thread_id` and `is_topic_message: true` (explicit `options.message` fields
   * win). When `options.chat` is omitted, the topic's parent forum is used as the chat.
   */
  topic?: ForumTopic<TContext>;
}

/** Minimal bot user profile for `user.manageBot`. */
export interface BotUserProfile {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
}

interface UserContext<TContext extends Context = Context> {
  bot: Bot<TContext>;
  ids: IdGenerator;
  defaultPrivateChat: () => Chat.PrivateChat;
  resolveChatToTelegram: (chat: AnyChat<TContext>) => Chat;
  /**
   * Update the membership map on join / leave. Chats owns the
   * "don't-downgrade-on-join" / "always-set-left" logic.
   */
  updateMembership: (chat: Group<TContext> | Supergroup<TContext>, user: User<TContext>, mode: 'join' | 'leave') => void;
  /** Live inbox of replies addressed to this user. */
  replies: RepliesInbox<TContext>;
  /** Live log of message drafts the bot sent to this user. */
  drafts: DraftsLog;
  /** Records a guest_query_id → user association so `answerGuestQuery` can be correlated. */
  recordGuestQuery: (guestQueryId: string, user: User<TContext>) => void;
}

export interface UserSendMediaGroupItem<TContext extends Context = Context> {
  caption?: string;
  photo?: string | null;
  video?: string | null;
  document?: string | null;
  chat?: AnyChat<TContext>;
}

export interface UserResolveSendTargetReturn {
  targetChat: Chat;
  from: TelegramUser;
  senderChat?: Chat;
  messageThreadId?: number;
  replyToMessage?: Message;
}

/**
 * High-level participant actor. Verbs (`sendText`, `sendCommand`,
 * `sendMediaGroup`) construct synthetic updates and dispatch them
 * via `bot.handleUpdate`.
 *
 * `User` carries no per-chat permissions — those live on the chat's
 * `Membership` record, not the user. See `user.in(chat)`.
 */
export class User<TContext extends Context = Context> {
  /** @internal */
  readonly is_bot = false;

  readonly first_name: string;

  readonly last_name: string | undefined;

  /**
   * Creates a `User` actor wired to the provided `Chats` context.
   * @param id - Telegram user ID.
   * @param firstName - User's first name.
   * @param lastName - User's last name, if any.
   * @param username - Telegram username without `@`, if any.
   * @param ctx - Internal context wiring provided by `Chats`.
   * @param membershipReader - Reads the user's membership record for a given chat.
   */
  constructor(
    public readonly id: number,
    firstName: string,
    lastName: string | undefined,
    public readonly username: string | undefined,
    /** @internal */
    private readonly ctx: UserContext<TContext>,
    /** @internal */
    private readonly membershipReader: (chat: AnyChat<TContext>) => Membership<TContext> | undefined,
  ) {
    this.first_name = firstName;
    this.last_name = lastName;
  }

  /**
   * Returns the user's membership record in the given chat, or `undefined` if the user is not a member.
   * @param chat - The chat to look up membership for.
   * @returns The user's `Membership` in the chat, or `undefined`.
   */
  in(chat: AnyChat<TContext>): Membership<TContext> | undefined {
    return this.membershipReader(chat);
  }

  /**
   * Live inbox of all replies addressed to this user.
   * Equivalent to `chats.repliesFor(this)` — same reference.
   * @returns The `RepliesInbox` for this user.
   */
  get replies(): RepliesInbox<TContext> {
    return this.ctx.replies;
  }

  /**
   * Live log of message drafts (`sendMessageDraft` / `sendRichMessageDraft`) the bot sent to
   * this user. Equivalent to `chats.draftsFor(this)` — same reference.
   * @returns The `DraftsLog` for this user.
   */
  get drafts(): DraftsLog {
    return this.ctx.drafts;
  }

  /**
   * Builds this user's Telegram identity object for use as `message.from`.
   * @returns The `TelegramUser` shape for this actor.
   */
  private toTelegramUser(): TelegramUser {
    return {
      id: this.id,
      is_bot: false,
      first_name: this.first_name,
      last_name: this.last_name,
      username: this.username,
    };
  }

  /**
   * Validates and resolves the shared send options (`chat`, `topic`, `anonymous`,
   * `reply_to_message`) into the concrete dispatch target. Owns the topic-registration and
   * forum-identity validation as well as the GroupAnonymousBot precondition, so every send
   * verb enforces identical semantics.
   * @param verb - The calling verb name, used to prefix validation error messages.
   * @param options - The shared send options to resolve.
   * @returns The resolved target chat, `from` identity, and optional `sender_chat`,
   *   `message_thread_id`, and quoted `reply_to_message` values.
   * @throws {Error} When the topic is not registered on its forum, when `options.chat` is
   *   not the topic's parent forum, or when `anonymous` is used outside a group context.
   */
  private resolveSendTarget(verb: string, options: UserSendOptions<TContext>): UserResolveSendTargetReturn {
    if (options.topic) {
      if (options.topic.forum.topicByThreadId(options.topic.messageThreadId) !== options.topic) {
        throw new Error(
          `${verb}: topic "${options.topic.name}" is not registered on forum "${options.topic.forum.title}" — ` +
            'mint topics with forum.newTopic(...) on a forum supergroup',
        );
      }

      // Identity comparison: a different chat object with the same numeric ID is still the wrong target.
      if (options.chat && options.chat !== (options.topic.forum as AnyChat<TContext>)) {
        throw new Error(
          `${verb}: topic "${options.topic.name}" belongs to forum ${String(options.topic.forum.id)}, ` +
            `but options.chat is a different chat (${String(options.chat.id)}) — pass the topic's parent forum or omit options.chat`,
        );
      }
    }

    const chatActor = options.chat ?? options.topic?.forum;
    const targetChat: Chat = chatActor ? this.ctx.resolveChatToTelegram(chatActor) : this.ctx.defaultPrivateChat();

    if (options.anonymous) {
      const chatType = (chatActor as { type?: string } | undefined)?.type;

      if (!chatActor || (chatType !== 'group' && chatType !== 'supergroup')) {
        throw new Error(
          `${verb}: anonymous: true requires options.chat to be a Group or Supergroup — ` +
            'GroupAnonymousBot only exists in group contexts',
        );
      }
    }

    // `reply_parameters` alone synthesizes a minimal quoted message — in real Telegram a
    // reply update always carries `reply_to_message`. An explicit `reply_to_message` wins.
    const replySource = options.reply_to_message ?? options.reply_parameters;

    const replyToMessage = replySource ? ({ date: Math.floor(Date.now() / 1000), chat: targetChat, ...replySource } as Message) : undefined;

    return {
      targetChat,
      from: options.anonymous ? { ...GROUP_ANONYMOUS_BOT } : this.toTelegramUser(),
      senderChat: options.anonymous ? targetChat : undefined,
      messageThreadId: options.topic?.messageThreadId,
      replyToMessage,
    };
  }

  /**
   * Assembles and dispatches a `message` update carrying the given content fields plus the
   * message-level metadata resolved from the shared send options. Every media/message verb
   * funnels through here so `topic` / `reply` / `anonymous` handling lives in one place.
   * @param verb - The calling verb name, used to prefix validation error messages.
   * @param options - The shared send options.
   * @param content - Content-specific `Message` fields (e.g. `photo`, `caption`, `dice`).
   * @returns The dispatched synthetic `Message`.
   */
  private async dispatchUserMessage(verb: string, options: UserSendOptions<TContext>, content: Partial<Message>): Promise<Message> {
    const target = this.resolveSendTarget(verb, options);

    const message: Message = {
      message_id: this.ctx.ids.nextMessageId(),
      date: Math.floor(Date.now() / 1000),
      chat: target.targetChat,
      from: target.from,
      ...content,
      ...(target.replyToMessage !== undefined && { reply_to_message: target.replyToMessage }),
      ...(target.senderChat !== undefined && { sender_chat: target.senderChat }),
      ...(target.messageThreadId !== undefined && { message_thread_id: target.messageThreadId, is_topic_message: true }),
    } as Message;

    await this.ctx.bot.handleUpdate({
      update_id: this.ctx.ids.nextUpdateId(),
      message,
    } as Update);

    return message;
  }

  /**
   * Dispatches a text message update from this user.
   * @param text - The message text.
   * @param options - Optional target chat, entities, parse mode, reply parameters,
   *   anonymous mode (GroupAnonymousBot identity), and forum topic.
   * @returns The dispatched synthetic `Message`.
   */
  async sendText(text: string, options: SendTextOptions<TContext> = {}): Promise<Message> {
    const target = this.resolveSendTarget('sendText', options);

    return dispatchTextMessage({
      bot: this.ctx.bot,
      user: this,
      chat: target.targetChat,
      text,
      messageId: this.ctx.ids.nextMessageId(),
      updateId: this.ctx.ids.nextUpdateId(),
      entities: options.entities,
      replyToMessageId: options.reply_parameters?.message_id,
      replyToMessage: target.replyToMessage,
      messageThreadId: target.messageThreadId,
      ...(options.anonymous && {
        fromOverride: target.from,
        senderChat: target.senderChat,
      }),
    });
  }

  /**
   * Alias for `sendText`. Dispatches a text message update from this user.
   * @param text - The message text.
   * @param options - Optional target chat and text options.
   * @returns A promise that resolves when the update is handled.
   */
  async sendMessage(text: string, options: SendTextOptions<TContext> = {}): Promise<Message> {
    return this.sendText(text, options);
  }

  /**
   * Dispatches a forwarded text message update from this user.
   * @param text - The original message text.
   * @param options - Required `forwardOrigin` and optional target chat.
   * @returns The dispatched synthetic `Message`.
   */
  async sendForwarded(text: string, options: SendForwardedOptions<TContext>): Promise<Message> {
    const targetChat: Chat = options.chat ? this.ctx.resolveChatToTelegram(options.chat) : this.ctx.defaultPrivateChat();

    return dispatchTextMessage({
      bot: this.ctx.bot,
      user: this,
      chat: targetChat,
      text,
      messageId: this.ctx.ids.nextMessageId(),
      updateId: this.ctx.ids.nextUpdateId(),
      forwardOrigin: options.forwardOrigin,
    });
  }

  /**
   * Dispatches an `edited_message` update from this user.
   * @param messageId - The ID of the message being edited.
   * @param text - The new message text.
   * @param options - Optional target chat override.
   * @param options.chat - The target chat (defaults to the private chat with this user).
   */
  async editMessage(messageId: number, text: string, options: { chat?: AnyChat<TContext> } = {}): Promise<void> {
    const targetChat: Chat = options.chat ? this.ctx.resolveChatToTelegram(options.chat) : this.ctx.defaultPrivateChat();

    await dispatchEditedMessage({
      bot: this.ctx.bot,
      user: this,
      chat: targetChat,
      messageId,
      text,
      updateId: this.ctx.ids.nextUpdateId(),
    });
  }

  /**
   * Dispatches a `new_chat_members` service message, simulating this user joining the chat.
   * @param chat - The group or supergroup to join.
   */
  async joinChat(chat: Group<TContext> | Supergroup<TContext>): Promise<void> {
    const chatWithType = chat as { type: string };

    if (chatWithType.type !== 'group' && chatWithType.type !== 'supergroup') {
      throw new Error(
        `joinChat: target chat type "${chatWithType.type}" does not support new_chat_members service messages — only groups and supergroups do`,
      );
    }

    await dispatchServiceMessage({
      bot: this.ctx.bot,
      kind: 'new_chat_members',
      user: this,
      chat: chat.toTelegramChat(),
      messageId: this.ctx.ids.nextMessageId(),
      updateId: this.ctx.ids.nextUpdateId(),
    });

    this.ctx.updateMembership(chat, this, 'join');
  }

  /**
   * Dispatches a `left_chat_member` service message, simulating this user leaving the chat.
   * @param chat - The group or supergroup to leave.
   */
  async leaveChat(chat: Group<TContext> | Supergroup<TContext>): Promise<void> {
    const chatWithType = chat as { type: string };

    if (chatWithType.type !== 'group' && chatWithType.type !== 'supergroup') {
      throw new Error(
        `leaveChat: target chat type "${chatWithType.type}" does not support left_chat_member service messages — only groups and supergroups do`,
      );
    }

    await dispatchServiceMessage({
      bot: this.ctx.bot,
      kind: 'left_chat_member',
      user: this,
      chat: chat.toTelegramChat(),
      messageId: this.ctx.ids.nextMessageId(),
      updateId: this.ctx.ids.nextUpdateId(),
    });

    this.ctx.updateMembership(chat, this, 'leave');
  }

  /**
   * Dispatches a bot command message from this user. A leading `/` is added if absent.
   * @param command - The command name (with or without a leading `/`).
   * @param args - Optional arguments appended after the command.
   * @param options - Optional target chat override, reply context, anonymous flag, and forum topic.
   * @param options.chat - The target chat (defaults to the private chat with this user).
   * @param options.anonymous - When `true`, dispatches as GroupAnonymousBot (see `sendText`).
   * @param options.topic - Target forum topic (see `sendText`).
   * @returns A promise that resolves when the update is handled.
   */
  async sendCommand(command: string, args?: string, options: UserSendOptions<TContext> = {}): Promise<Message> {
    const normalized = command.startsWith('/') ? command : `/${command}`;
    const text = args ? `${normalized} ${args}` : normalized;

    const entities: MessageEntity[] = [{ type: 'bot_command', offset: 0, length: normalized.length }];

    return this.sendText(text, { ...options, entities });
  }

  /**
   * Dispatches a photo message from this user.
   * @param file - Optional file ID; a stub is generated when omitted.
   * @param options - Optional caption, target chat, reply context, anonymous flag, and forum topic.
   * @returns The dispatched synthetic `Message`.
   */
  async sendPhoto(file?: string, options: SendPhotoOptions<TContext> = {}): Promise<Message> {
    const fileId = file ?? this.ctx.ids.nextFileId();

    return this.dispatchUserMessage('sendPhoto', options, { photo: [makePhotoSizeStub(fileId)], caption: options.caption });
  }

  /**
   * Dispatches a document message from this user.
   * @param file - Optional file ID; a stub is generated when omitted.
   * @param options - Optional caption, target chat, reply context, anonymous flag, and forum topic.
   * @returns The dispatched synthetic `Message`.
   */
  async sendDocument(file?: string, options: SendDocumentOptions<TContext> = {}): Promise<Message> {
    const fileId = file ?? this.ctx.ids.nextFileId();

    return this.dispatchUserMessage('sendDocument', options, { document: makeDocumentStub(fileId), caption: options.caption });
  }

  /**
   * Dispatches a video message from this user.
   * @param file - Optional file ID; a stub is generated when omitted.
   * @param options - Optional caption, target chat, reply context, anonymous flag, and forum topic.
   * @returns The dispatched synthetic `Message`.
   */
  async sendVideo(file?: string, options: SendVideoOptions<TContext> = {}): Promise<Message> {
    const fileId = file ?? this.ctx.ids.nextFileId();

    return this.dispatchUserMessage('sendVideo', options, { video: makeVideoStub(fileId), caption: options.caption });
  }

  /**
   * Dispatches an audio message from this user.
   * @param file - Optional file ID; a stub is generated when omitted.
   * @param options - Optional caption, target chat, reply context, anonymous flag, and forum topic.
   * @returns The dispatched synthetic `Message`.
   */
  async sendAudio(file?: string, options: SendAudioOptions<TContext> = {}): Promise<Message> {
    const fileId = file ?? this.ctx.ids.nextFileId();

    return this.dispatchUserMessage('sendAudio', options, { audio: makeAudioStub(fileId), caption: options.caption });
  }

  /**
   * Dispatches a voice message from this user.
   * @param file - Optional file ID; a stub is generated when omitted.
   * @param options - Optional caption, target chat, reply context, anonymous flag, and forum topic.
   * @returns The dispatched synthetic `Message`.
   */
  async sendVoice(file?: string, options: SendVoiceOptions<TContext> = {}): Promise<Message> {
    const fileId = file ?? this.ctx.ids.nextFileId();

    return this.dispatchUserMessage('sendVoice', options, { voice: makeVoiceStub(fileId), caption: options.caption });
  }

  /**
   * Dispatches a video note (round video) message from this user.
   * @param file - Optional file ID; a stub is generated when omitted.
   * @param options - Optional target chat, reply context, anonymous flag, and forum topic.
   * @returns The dispatched synthetic `Message`.
   */
  async sendVideoNote(file?: string, options: SendVideoNoteOptions<TContext> = {}): Promise<Message> {
    const fileId = file ?? this.ctx.ids.nextFileId();

    return this.dispatchUserMessage('sendVideoNote', options, { video_note: makeVideoNoteStub(fileId) });
  }

  /**
   * Dispatches an animation (GIF) message from this user.
   * @param file - Optional file ID; a stub is generated when omitted.
   * @param options - Optional caption, target chat, reply context, anonymous flag, and forum topic.
   * @returns The dispatched synthetic `Message`.
   */
  async sendAnimation(file?: string, options: SendAnimationOptions<TContext> = {}): Promise<Message> {
    const fileId = file ?? this.ctx.ids.nextFileId();

    return this.dispatchUserMessage('sendAnimation', options, { animation: makeAnimationStub(fileId), caption: options.caption });
  }

  /**
   * Dispatches a sticker message from this user.
   * @param file - Optional file ID; a stub is generated when omitted.
   * @param options - Optional target chat, reply context, anonymous flag, and forum topic.
   * @returns The dispatched synthetic `Message`.
   */
  async sendSticker(file?: string, options: SendStickerOptions<TContext> = {}): Promise<Message> {
    const fileId = file ?? this.ctx.ids.nextFileId();

    return this.dispatchUserMessage('sendSticker', options, { sticker: makeStickerStub(fileId) });
  }

  /**
   * Dispatches a location message from this user.
   * @param latitude - Geographic latitude in degrees.
   * @param longitude - Geographic longitude in degrees.
   * @param options - Optional target chat, reply context, anonymous flag, and forum topic.
   * @returns The dispatched synthetic `Message`.
   */
  async sendLocation(latitude: number, longitude: number, options: SendLocationOptions<TContext> = {}): Promise<Message> {
    return this.dispatchUserMessage('sendLocation', options, { location: { latitude, longitude } });
  }

  /**
   * Dispatches a contact message from this user.
   * @param phoneNumber - The contact's phone number.
   * @param firstName - The contact's first name.
   * @param options - Optional last name, target chat, reply context, anonymous flag, and forum topic.
   * @returns The dispatched synthetic `Message`.
   */
  async sendContact(phoneNumber: string, firstName: string, options: SendContactOptions<TContext> = {}): Promise<Message> {
    return this.dispatchUserMessage('sendContact', options, {
      contact: { phone_number: phoneNumber, first_name: firstName, last_name: options.lastName },
    });
  }

  /**
   * Dispatches a venue message from this user.
   * @param latitude - Geographic latitude of the venue.
   * @param longitude - Geographic longitude of the venue.
   * @param title - Name of the venue.
   * @param address - Address of the venue.
   * @param options - Optional target chat, reply context, anonymous flag, and forum topic.
   * @returns The dispatched synthetic `Message`.
   */
  async sendVenue(
    latitude: number,
    longitude: number,
    title: string,
    address: string,
    options: SendVenueOptions<TContext> = {},
  ): Promise<Message> {
    return this.dispatchUserMessage('sendVenue', options, { venue: { location: { latitude, longitude }, title, address } });
  }

  /**
   * Dispatches a poll message from this user.
   * @param question - The poll question text.
   * @param answerOptions - Array of answer option strings.
   * @param options - Optional target chat, reply context, anonymous flag, and forum topic.
   * @returns The dispatched synthetic `Message`.
   */
  async sendPoll(question: string, answerOptions: string[], options: SendPollOptions<TContext> = {}): Promise<Message> {
    return this.dispatchUserMessage('sendPoll', options, {
      poll: {
        id: `poll-${String(this.ctx.ids.nextMessageId())}`,
        question,
        options: answerOptions.map((text) => ({ text, voter_count: 0 })),
        total_voter_count: 0,
        is_closed: false,
        is_anonymous: true,
        type: 'regular',
        allows_multiple_answers: false,
        allows_revoting: false,
      } as Message['poll'],
    });
  }

  /**
   * Dispatches a dice message from this user.
   * @param emoji - The dice emoji to use (default `🎲`).
   * @param options - Optional target chat, reply context, anonymous flag, and forum topic.
   * @returns The dispatched synthetic `Message`.
   */
  async sendDice(emoji = '🎲', options: SendDiceOptions<TContext> = {}): Promise<Message> {
    return this.dispatchUserMessage('sendDice', options, { dice: { emoji, value: 1 } });
  }

  /**
   * Dispatches a `web_app_data` message from this user.
   * @param webAppData - The data string submitted by the Web App.
   * @param buttonText - The text of the keyboard button that opened the Web App.
   * @param options - Optional target chat.
   * @returns The dispatched synthetic `Message`.
   */
  async sendWebAppData(webAppData: string, buttonText: string, options: SendWebAppDataOptions<TContext> = {}): Promise<Message> {
    const targetChat: Chat = options.chat ? this.ctx.resolveChatToTelegram(options.chat) : this.ctx.defaultPrivateChat();

    const message: Message = {
      message_id: this.ctx.ids.nextMessageId(),
      date: Math.floor(Date.now() / 1000),
      chat: targetChat,
      from: { id: this.id, is_bot: false, first_name: this.first_name, last_name: this.last_name, username: this.username },
      web_app_data: { data: webAppData, button_text: buttonText },
    } as Message;

    await this.ctx.bot.handleUpdate({ update_id: this.ctx.ids.nextUpdateId(), message } as Update);

    return message;
  }

  /**
   * Dispatches a `successful_payment` message from this user.
   * @param invoicePayload - The bot-specified invoice payload.
   * @param currency - Three-letter ISO 4217 currency code.
   * @param totalAmount - Total price in the smallest currency unit.
   * @param options - Optional target chat.
   * @returns The dispatched synthetic `Message`.
   */
  async sendSuccessfulPayment(
    invoicePayload: string,
    currency: string,
    totalAmount: number,
    options: SendSuccessfulPaymentOptions<TContext> = {},
  ): Promise<Message> {
    const targetChat: Chat = options.chat ? this.ctx.resolveChatToTelegram(options.chat) : this.ctx.defaultPrivateChat();

    const message: Message = {
      message_id: this.ctx.ids.nextMessageId(),
      date: Math.floor(Date.now() / 1000),
      chat: targetChat,
      from: { id: this.id, is_bot: false, first_name: this.first_name, last_name: this.last_name, username: this.username },
      successful_payment: {
        currency,
        total_amount: totalAmount,
        invoice_payload: invoicePayload,
        telegram_payment_charge_id: 'charge-tg-stub',
        provider_payment_charge_id: 'charge-provider-stub',
      },
    } as Message;

    await this.ctx.bot.handleUpdate({ update_id: this.ctx.ids.nextUpdateId(), message } as Update);

    return message;
  }

  /**
   * Dispatches a `callback_query` update from this user without requiring a prior captured reply.
   * @param callbackData - The callback payload string (`callback_query.data`).
   * @param options - Optional message context, chat override, and forum topic for the embedded message.
   */
  async sendCallbackQuery(callbackData: string, options: SendCallbackQueryOptions<TContext> = {}): Promise<void> {
    // Reuses the shared topic validation; `from` / reply / anonymous fields are unused here
    // because callback queries always originate from the real user account.
    const target = this.resolveSendTarget('sendCallbackQuery', { chat: options.chat, topic: options.topic });
    const messageId = options.message?.message_id ?? this.ctx.ids.nextMessageId();

    const message: Message = {
      date: Math.floor(Date.now() / 1000),
      chat: target.targetChat,
      ...(target.messageThreadId !== undefined && { message_thread_id: target.messageThreadId, is_topic_message: true }),
      ...options.message,
      message_id: messageId,
    } as Message;

    const update: Update = {
      update_id: this.ctx.ids.nextUpdateId(),
      callback_query: {
        id: `cbq-${String(this.ctx.ids.nextMessageId())}`,
        from: {
          id: this.id,
          is_bot: false,
          first_name: this.first_name,
          last_name: this.last_name,
          username: this.username,
        },
        chat_instance: `inst-${String(this.ctx.ids.nextMessageId())}`,
        message,
        data: callbackData,
      },
    } as Update;

    await this.ctx.bot.handleUpdate(update);
  }

  /**
   * Dispatches an `inline_query` update from this user.
   * @param query - The inline query string.
   * @param options - Optional chat type hint.
   */
  async sendInlineQuery(query: string, options: SendInlineQueryOptions = {}): Promise<void> {
    const update: Update = {
      update_id: this.ctx.ids.nextUpdateId(),
      inline_query: {
        id: `iq-${String(this.ctx.ids.nextMessageId())}`,
        from: { id: this.id, is_bot: false, first_name: this.first_name, last_name: this.last_name, username: this.username },
        query,
        offset: '',
        chat_type: options.chatType ?? 'sender',
      },
    } as Update;

    await this.ctx.bot.handleUpdate(update);
  }

  /**
   * Dispatches a `chosen_inline_result` update from this user.
   * @param resultId - The result ID that was chosen.
   * @param query - The inline query string that produced this result.
   */
  async sendChosenInlineResult(resultId: string, query: string): Promise<void> {
    const update: Update = {
      update_id: this.ctx.ids.nextUpdateId(),
      chosen_inline_result: {
        result_id: resultId,
        from: { id: this.id, is_bot: false, first_name: this.first_name, last_name: this.last_name, username: this.username },
        query,
      },
    } as Update;

    await this.ctx.bot.handleUpdate(update);
  }

  /**
   * Dispatches a `pre_checkout_query` update from this user.
   * @param invoicePayload - The bot-specified invoice payload.
   * @param currency - Three-letter ISO 4217 currency code.
   * @param totalAmount - Total price in the smallest currency unit.
   */
  async sendPreCheckoutQuery(invoicePayload: string, currency: string, totalAmount: number): Promise<void> {
    const update: Update = {
      update_id: this.ctx.ids.nextUpdateId(),
      pre_checkout_query: {
        id: `pcq-${String(this.ctx.ids.nextMessageId())}`,
        from: { id: this.id, is_bot: false, first_name: this.first_name, last_name: this.last_name, username: this.username },
        currency,
        total_amount: totalAmount,
        invoice_payload: invoicePayload,
      },
    } as Update;

    await this.ctx.bot.handleUpdate(update);
  }

  /**
   * Dispatches a `shipping_query` update from this user.
   * @param invoicePayload - The bot-specified invoice payload.
   * @param shippingAddress - The shipping address provided by the user.
   */
  async sendShippingQuery(invoicePayload: string, shippingAddress: ShippingAddress): Promise<void> {
    const update: Update = {
      update_id: this.ctx.ids.nextUpdateId(),
      shipping_query: {
        id: `shq-${String(this.ctx.ids.nextMessageId())}`,
        from: { id: this.id, is_bot: false, first_name: this.first_name, last_name: this.last_name, username: this.username },
        invoice_payload: invoicePayload,
        shipping_address: shippingAddress,
      },
    } as Update;

    await this.ctx.bot.handleUpdate(update);
  }

  /**
   * Dispatches a series of media group updates from this user, one per item.
   *
   * The shared options (`topic`, `reply_to_message`, `anonymous`) apply to every dispatched
   * message — matching real Telegram, where these are message-level fields carried by each
   * message of an album. An item's `chat` override is resolved with the same validation and
   * metadata rules as `sharedOptions.chat`, so `reply_to_message.chat`, `sender_chat`, and
   * the anonymous group precondition always reflect the item's effective target. Every item
   * is resolved before anything is dispatched, so invalid input can never leave a partially
   * dispatched album in the bot's and chats' logs.
   * @param items - Array of media items (photo, video, or document) to send as a group.
   * @param sharedOptions - Optional default target chat, reply context, anonymous flag, and
   *   forum topic applied to every item; items may override the chat individually.
   * @returns The dispatched synthetic `Message` objects, one per item in dispatch order.
   */
  async sendMediaGroup(items: UserSendMediaGroupItem<TContext>[], sharedOptions: UserSendOptions<TContext> = {}): Promise<Message[]> {
    const mediaGroupId = this.ctx.ids.nextMediaGroupId();

    const sharedTarget = this.resolveSendTarget('sendMediaGroup', sharedOptions);

    // Resolve (and thereby validate) every item's effective target before the dispatch loop.
    const dispatchPlan = items.map((item) => ({
      item,
      target: item.chat ? this.resolveSendTarget('sendMediaGroup', { ...sharedOptions, chat: item.chat }) : sharedTarget,
    }));

    const messages: Message[] = [];

    for (const { item, target } of dispatchPlan) {
      const message: Message = {
        message_id: this.ctx.ids.nextMessageId(),
        date: Math.floor(Date.now() / 1000),
        chat: target.targetChat,
        from: target.from,
        media_group_id: mediaGroupId,
        caption: item.caption,
        photo: item.photo ? [makePhotoSizeStub(item.photo)] : undefined,
        document: item.document ? makeDocumentStub(item.document) : undefined,
        video: item.video ? makeVideoStub(item.video) : undefined,
        ...(target.replyToMessage !== undefined && { reply_to_message: target.replyToMessage }),
        ...(target.senderChat !== undefined && { sender_chat: target.senderChat }),
        ...(target.messageThreadId !== undefined && { message_thread_id: target.messageThreadId, is_topic_message: true }),
      } as Message;

      const update: Update = {
        update_id: this.ctx.ids.nextUpdateId(),
        message,
      } as Update;

      // eslint-disable-next-line no-await-in-loop -- preserve dispatch order
      await this.ctx.bot.handleUpdate(update);
      messages.push(message);
    }

    return messages;
  }

  /**
   * Dispatches a `message_reaction` update — the user reacting to a bot reply.
   * `reaction` may be a `ReactionType` object or a plain emoji string
   * (auto-wrapped as `{ type: 'emoji', emoji }`).
   * @param reply - The captured bot reply the user is reacting to.
   * @param reaction - The reaction to apply: a `ReactionType` object or a plain emoji string.
   * @param options - Optional overrides such as a custom reaction timestamp.
   */
  async reactTo(reply: Reply<TContext>, reaction: ReactionType | string, options: ReactToOptions = {}): Promise<void> {
    const normalizedReaction: ReactionType = typeof reaction === 'string' ? ({ type: 'emoji', emoji: reaction } as ReactionType) : reaction;

    const chat = reply.chat ? reply.chat.toTelegramChat() : this.ctx.defaultPrivateChat();

    await this.ctx.bot.handleUpdate({
      update_id: this.ctx.ids.nextUpdateId(),
      message_reaction: {
        chat,
        message_id: reply.messageId,
        user: {
          id: this.id,
          is_bot: false,
          first_name: this.first_name,
          last_name: this.last_name,
          username: this.username,
        },
        date: options.date ?? Math.floor(Date.now() / 1000),
        old_reaction: [],
        new_reaction: [normalizedReaction],
      },
    } as Update);
  }

  /**
   * Dispatches a `poll_answer` update — the user voting in a poll.
   * `reply` must be a captured bot reply for a `sendPoll` / `replyWithPoll`
   * call. Because the Telegram Bot API assigns `poll.id` server-side,
   * the outgoing request payload does not contain it; a synthetic id
   * (`poll-reply-<messageId>`) is generated automatically when the reply
   * looks like a `sendPoll` call (has a `question` field). Throws if the
   * reply cannot be identified as a poll.
   *
   * Pass `options.voterChat` to simulate an anonymous poll vote from a chat.
   * @param reply - The captured bot reply containing the poll.
   * @param optionIndices - Zero-based indices of the poll options the user selects.
   * @param options - Optional overrides such as a `voterChat` for anonymous votes.
   */
  async answerPoll(reply: Reply<TContext>, optionIndices: number[], options: AnswerPollOptions = {}): Promise<void> {
    const poll = reply.raw.poll as { id?: string } | undefined;

    // The Telegram API assigns poll.id server-side; outgoing sendPoll
    // request payloads don't include it. Fall back to a synthetic id when
    // the reply has a `question` field (discriminator for sendPoll calls).
    const pollId = poll?.id ?? (reply.raw.question === undefined ? undefined : `poll-reply-${String(reply.messageId)}`);

    if (!pollId) {
      throw new Error('answerPoll: reply does not contain a poll — reply.raw.poll.id is missing');
    }

    const fromUser = options.voterChat
      ? undefined
      : {
          id: this.id,
          is_bot: false,
          first_name: this.first_name,
          last_name: this.last_name,
          username: this.username,
        };

    await this.ctx.bot.handleUpdate({
      update_id: this.ctx.ids.nextUpdateId(),
      poll_answer: {
        poll_id: pollId,
        voter_chat: options.voterChat,
        user: fromUser,
        option_ids: optionIndices,
        option_persistent_ids: [],
      },
    } as Update);
  }

  /**
   * Dispatches a `chat_join_request` update — the user requesting to join a
   * group or supergroup. Returns the generated `query_id` (Bot API 10.1) so callers can
   * correlate the bot's answer to the join-request query.
   * @param group - The group or supergroup the user wants to join.
   * @param options - Optional overrides such as a custom `bio` string.
   * @returns The generated `chat_join_request.query_id` string.
   */
  async requestJoin(group: Group<TContext> | Supergroup<TContext>, options: RequestJoinOptions = {}): Promise<string> {
    const queryId = `cjrq-${String(this.ctx.ids.nextMessageId())}`;

    await this.ctx.bot.handleUpdate({
      update_id: this.ctx.ids.nextUpdateId(),
      chat_join_request: {
        chat: group.toTelegramChat(),
        from: {
          id: this.id,
          is_bot: false,
          first_name: this.first_name,
          last_name: this.last_name,
          username: this.username,
        },
        user_chat_id: this.id,
        date: Math.floor(Date.now() / 1000),
        bio: options.bio,
        query_id: queryId,
      },
    } as Update);

    return queryId;
  }

  /**
   * Dispatches a `chat_boost` update — the user boosting a chat.
   * Returns the generated `boost_id` so callers can pass it to
   * `removeBoost`.
   * @param chat - The chat the user is boosting.
   * @param options - Optional overrides such as a custom expiration duration.
   * @returns The generated `boost_id` string for use with `removeBoost`.
   */
  async boostChat(chat: AnyChat<TContext>, options: BoostChatOptions = {}): Promise<string> {
    const boostId = `boost-${String(this.ctx.ids.nextMessageId())}`;
    const now = Math.floor(Date.now() / 1000);
    const expirationDays = options.expirationDays ?? 30;

    await this.ctx.bot.handleUpdate({
      update_id: this.ctx.ids.nextUpdateId(),
      chat_boost: {
        chat: chat.toTelegramChat(),
        boost: {
          boost_id: boostId,
          add_date: now,
          expiration_date: now + expirationDays * 86_400,
          source: {
            source: 'premium',
            user: {
              id: this.id,
              is_bot: false,
              first_name: this.first_name,
              last_name: this.last_name,
              username: this.username,
            },
          },
        },
      },
    } as Update);

    return boostId;
  }

  /**
   * Dispatches a `removed_chat_boost` update — the user removing a boost from
   * a chat. Pass the `boost_id` returned by `boostChat`.
   * @param chat - The chat from which the boost is being removed.
   * @param boostId - The `boost_id` returned by a prior `boostChat` call.
   * @param options - Optional overrides such as a custom removal timestamp.
   */
  async removeBoost(chat: AnyChat<TContext>, boostId: string, options: RemoveBoostOptions = {}): Promise<void> {
    const now = Math.floor(Date.now() / 1000);

    await this.ctx.bot.handleUpdate({
      update_id: this.ctx.ids.nextUpdateId(),
      removed_chat_boost: {
        chat: chat.toTelegramChat(),
        boost_id: boostId,
        remove_date: options.removeDate ?? now,
        source: {
          source: 'premium',
          user: {
            id: this.id,
            is_bot: false,
            first_name: this.first_name,
            last_name: this.last_name,
            username: this.username,
          },
        },
      },
    } as Update);
  }

  /**
   * Dispatches a `managed_bot` update — the user managing a bot they own.
   * `botUser` is a plain profile object with at minimum `id` and `first_name`.
   * @param botUser - The bot profile being managed (requires at minimum `id` and `first_name`).
   * @param options - Optional overrides such as a custom `update_id`.
   */
  async manageBot(botUser: BotUserProfile, options: ManageBotOptions = {}): Promise<void> {
    await this.ctx.bot.handleUpdate({
      update_id: options.updateId ?? this.ctx.ids.nextUpdateId(),
      managed_bot: {
        user: {
          id: this.id,
          is_bot: false,
          first_name: this.first_name,
          last_name: this.last_name,
          username: this.username,
        },
        bot: {
          id: botUser.id,
          is_bot: true,
          first_name: botUser.first_name,
          last_name: botUser.last_name,
          username: botUser.username,
        },
      },
    } as Update);
  }

  /**
   * Dispatches a `purchased_paid_media` update — the user purchasing paid
   * media from the bot. `payload` is the bot-specified paid media payload.
   * @param payload - The bot-specified paid media payload string.
   * @param options - Optional overrides such as a custom `update_id`.
   */
  async purchasePaidMedia(payload: string, options: PurchasePaidMediaOptions = {}): Promise<void> {
    await this.ctx.bot.handleUpdate({
      update_id: options.updateId ?? this.ctx.ids.nextUpdateId(),
      purchased_paid_media: {
        from: {
          id: this.id,
          is_bot: false,
          first_name: this.first_name,
          last_name: this.last_name,
          username: this.username,
        },
        paid_media_payload: payload,
      },
    } as Update);
  }

  /**
   * Dispatches a `guest_message` update — the user messaging the bot as a guest in a chat the
   * bot is not a member of (Bot API 10.0 guest mode). The synthesized `guest_message` is a
   * `Message` carrying a generated `guest_query_id`; the bot replies with `answerGuestQuery`.
   * Returns the `guest_query_id` so callers can correlate the bot's answer.
   * @param chat - The chat the guest message targets.
   * @param text - Optional message text.
   * @param options - Optional overrides such as a custom `update_id`.
   * @returns The generated `guest_query_id` string.
   */
  async sendGuestMessage(chat: AnyChat<TContext>, text?: string, options: GuestMessageOptions = {}): Promise<string> {
    const guestQueryId = `gq-${String(this.ctx.ids.nextMessageId())}`;
    const targetChat: Chat = this.ctx.resolveChatToTelegram(chat);

    this.ctx.recordGuestQuery(guestQueryId, this);

    await this.ctx.bot.handleUpdate({
      update_id: options.updateId ?? this.ctx.ids.nextUpdateId(),
      guest_message: {
        message_id: this.ctx.ids.nextMessageId(),
        date: Math.floor(Date.now() / 1000),
        chat: targetChat,
        from: {
          id: this.id,
          is_bot: false,
          first_name: this.first_name,
          last_name: this.last_name,
          username: this.username,
        },
        text,
        guest_query_id: guestQueryId,
      },
    } as Update);

    return guestQueryId;
  }
}
