import type { Bot, Context } from 'grammy';
import type { Chat, Message, ReactionCount, Update, User as TelegramUser } from 'grammy/types';

import { type ChatRefHolder, setBotRef } from './chat';
import { dispatchMyChatMember, makeChannelBotUser } from './dispatch';
import type { Group } from './group';
import type { IdGenerator } from './id-generator';
import type { MessagesLog } from './messages-log';
import type { ModerationLog } from './moderation-log';
import type { Supergroup } from './supergroup';
import type { DispatchReactionCountOptions, Membership, MemberStatusTransition, SendSystemMessageOptions } from './types';
import type { User } from './user';

const CHANNEL_ADMIN_RIGHTS = {
  is_anonymous: false,
  can_be_edited: false,
  can_manage_chat: true,
  can_post_messages: true,
  can_edit_messages: true,
  can_delete_messages: true,
  can_invite_users: true,
  can_restrict_members: true,
  can_promote_members: false,
  can_change_info: false,
  can_pin_messages: true,
  can_post_stories: false,
  can_edit_stories: false,
  can_delete_stories: false,
} as const;

/**
 * Channel actor. `post` dispatches a `channel_post` update in the channel
 * itself, `postMessageTo` dispatches a message to a target group with
 * `sender_chat = this`, and `editPost` dispatches `edited_channel_post`.
 */
export class Channel<TContext extends Context = Context> implements ChatRefHolder<TContext> {
  readonly type = 'channel' as const;

  /** @internal */
  messages!: MessagesLog<TContext>;

  /**
   * Channel members (subscribers + admins). Tracked for membership-roles
   * spec parity with Group/Supergroup; populated only when a test
   * explicitly promotes/restricts a user in the channel.
   */
  readonly members = new Map<number, Membership<TContext>>();

  /**
   * Captured moderation calls (`banChatMember` / `unbanChatMember` /
   * `promoteChatMember`) targeting this channel, with per-kind views
   * such as `moderation.bans.byUser(user)`.
   */
  moderation!: ModerationLog<TContext>;

  /** @internal */
  bot!: Bot<TContext>;

  /**
   * Creates a `Channel` actor with the given ID and title.
   * @param id - Telegram chat ID (negative integer).
   * @param title - Display title of the channel.
   * @param ids - Shared ID generator for this `Chats` instance.
   */
  constructor(
    public readonly id: number,
    public readonly title: string,
    private readonly ids: IdGenerator,
  ) {}

  /**
   * Wires the grammY `Bot` instance so dispatch methods can call `handleUpdate`.
   * @param bot - The `Bot` instance to attach.
   */
  [setBotRef](bot: Bot<TContext>): void {
    this.bot = bot;
  }

  /**
   * Returns this channel as a Telegram `Chat.ChannelChat` object.
   * @returns A plain `Chat.ChannelChat` suitable for embedding in updates.
   */
  toTelegramChat(): Chat.ChannelChat {
    return { id: this.id, type: 'channel', title: this.title };
  }

  /**
   * Dispatches a `channel_post` update — the channel posting a text message in itself.
   *
   * The synthetic message matches real Bot API payloads: it carries no `from` field
   * (the Bot API documents `from` as "may be empty for messages sent to channels")
   * and sets `sender_chat` to the channel itself. Pass `author_signature` to simulate
   * a channel with "Sign messages" enabled.
   *
   * To also simulate Telegram auto-forwarding the post into a linked discussion group,
   * compose this verb with `supergroup.postRelayMessage` — each verb dispatches exactly
   * one update.
   * @param text - The post text.
   * @param options - Optional overrides.
   * @param options.messageId - Optional message ID to assign instead of auto-generating one.
   * @param options.author_signature - Post author signature, present when the channel signs messages.
   * @param options.reply_to_message - Optional earlier channel post this post replies to. Accepts a
   *   full `Message` or a partial shape `{ message_id: number, ...rest }`. `date` and `chat` are
   *   auto-filled from context when absent.
   * @returns The synthetic `Message` that was dispatched.
   */
  async post(text: string, options: ChannelPostOptions = {}): Promise<Message> {
    const messageId = options.messageId ?? this.ids.nextMessageId();

    const replyToMessage = options.reply_to_message
      ? ({ date: Math.floor(Date.now() / 1000), chat: this.toTelegramChat(), ...options.reply_to_message } as Message)
      : undefined;

    const message: Message = {
      message_id: messageId,
      date: Math.floor(Date.now() / 1000),
      chat: this.toTelegramChat(),
      sender_chat: this.toTelegramChat(),
      text,
      ...(options.author_signature !== undefined && { author_signature: options.author_signature }),
      ...(replyToMessage !== undefined && { reply_to_message: replyToMessage }),
    } as Message;

    const update: Update = {
      update_id: this.ids.nextUpdateId(),
      channel_post: message,
    } as Update;

    await this.bot.handleUpdate(update);

    return message;
  }

  /**
   * Posts a text message from this channel into `target`, simulating a linked-channel post.
   * @param target - The group or supergroup to post the message into.
   * @param text - The message text.
   * @param options - Optional overrides.
   * @param options.messageId - Optional message ID to assign instead of auto-generating one.
   * @param options.reply_to_message - Optional message this post replies to. Accepts a full
   *   `Message` or a partial shape `{ message_id: number, ...rest }`. `date` and `chat` are
   *   auto-filled from context when absent.
   * @returns The synthetic `Message` that was dispatched.
   */
  async postMessageTo<TC extends Context = TContext>(
    target: Group<TC> | Supergroup<TC>,
    text: string,
    options: { messageId?: number; reply_to_message?: Partial<Message> & { message_id: number } } = {},
  ): Promise<Message> {
    const messageId = options.messageId ?? this.ids.nextMessageId();

    const replyToMessage = options.reply_to_message
      ? ({ date: Math.floor(Date.now() / 1000), chat: target.toTelegramChat(), ...options.reply_to_message } as Message)
      : undefined;

    const message: Message = {
      message_id: messageId,
      date: Math.floor(Date.now() / 1000),
      chat: target.toTelegramChat(),
      from: makeChannelBotUser(),
      sender_chat: this.toTelegramChat(),
      text,
      ...(replyToMessage !== undefined && { reply_to_message: replyToMessage }),
    } as Message;

    const update: Update = {
      update_id: this.ids.nextUpdateId(),
      message,
    } as Update;

    await this.bot.handleUpdate(update);

    return message;
  }

  /**
   * Dispatches a `my_chat_member` update and updates the in-memory bot membership record.
   * @param user - The actor who triggered the membership change (populates `from`).
   * @param transition - The status transition to apply to the bot. Permissions default to `CHANNEL_ADMIN_RIGHTS`.
   */
  async changeMemberStatus(user: User<TContext>, transition: MemberStatusTransition): Promise<void> {
    const botUser = this.bot.botInfo as TelegramUser;
    const current = this.members.get(botUser.id);
    const fromStatus = transition.from ?? current?.status ?? 'left';
    const permissions = { ...CHANNEL_ADMIN_RIGHTS, ...transition.permissions };

    await dispatchMyChatMember(this.bot, {
      chat: this.toTelegramChat(),
      user,
      botUser,
      fromStatus,
      toStatus: transition.to,
      permissions,
      untilDate: transition.untilDate,
      updateId: this.ids.nextUpdateId(),
    });

    this.members.set(botUser.id, {
      user: botUser as unknown as User<TContext>,
      chat: this,
      status: transition.to,
      permissions,
      untilDate: transition.untilDate,
    });
  }

  /**
   * Dispatches an `edited_channel_post` update — simulating a channel post
   * being edited. `messageId` is the `message_id` of the original channel post.
   * Like real payloads, the edited post carries `sender_chat` set to the channel
   * itself and no `from` field.
   * @param messageId - The `message_id` of the original channel post.
   * @param newText - The replacement text for the post.
   * @param options - Optional overrides for the original post timestamp and author signature.
   */
  async editPost(messageId: number, newText: string, options: EditPostOptions = {}): Promise<void> {
    const now = Math.floor(Date.now() / 1000);

    const update: Update = {
      update_id: this.ids.nextUpdateId(),
      edited_channel_post: {
        message_id: messageId,
        date: options.date ?? now,
        edit_date: now,
        chat: this.toTelegramChat(),
        sender_chat: this.toTelegramChat(),
        text: newText,
        ...(options.author_signature !== undefined && { author_signature: options.author_signature }),
      },
    } as Update;

    await this.bot.handleUpdate(update);
  }

  /**
   * Dispatches a `message_reaction_count` update — aggregate anonymous
   * reactions on a message in this channel.
   * @param messageId - The `message_id` of the message that received reactions.
   * @param reactions - Array of `ReactionCount` objects describing reaction totals.
   * @param options - Optional overrides for the update timestamp.
   */
  async dispatchReactionCount(messageId: number, reactions: ReactionCount[], options: DispatchReactionCountOptions = {}): Promise<void> {
    await this.bot.handleUpdate({
      update_id: this.ids.nextUpdateId(),
      message_reaction_count: {
        chat: this.toTelegramChat(),
        message_id: messageId,
        date: options.date ?? Math.floor(Date.now() / 1000),
        reactions,
      },
    } as Update);
  }

  /**
   * Dispatches a `message` update with no `from` field, simulating a Telegram system or
   * service message that carries no sender identity.
   * @param text - The message text.
   * @param options - Optional `messageId` override; auto-generated when omitted.
   * @deprecated Real Telegram never delivers `message` updates with a channel-typed
   * `chat` — everything a channel emits arrives as `channel_post` (or
   * `edited_channel_post`). Use {@link Channel.post} to drive `bot.on('channel_post')`
   * handlers with a realistic payload. This verb is kept for backwards compatibility
   * and still dispatches the historical (invented) `message`-update shape.
   */
  async sendSystemMessage(text: string, options: SendSystemMessageOptions = {}): Promise<void> {
    await this.bot.handleUpdate({
      update_id: this.ids.nextUpdateId(),
      message: {
        message_id: options.messageId ?? this.ids.nextMessageId(),
        date: Math.floor(Date.now() / 1000),
        chat: this.toTelegramChat(),
        text,
      },
    } as Update);
  }
}

export interface EditPostOptions {
  /** Override the original `date` timestamp of the channel post. */
  date?: number;
  /** Post author signature, present when the channel has "Sign messages" enabled. */
  author_signature?: string;
}

export interface ChannelPostOptionsReplyToMessage {
  message_id: number;
}

export interface ChannelPostOptions {
  /** Override the auto-generated `message_id` for the dispatched post. */
  messageId?: number;
  /** Post author signature, present when the channel has "Sign messages" enabled. */
  author_signature?: string;
  /**
   * Earlier channel post this post replies to. Accepts a full `Message` or a partial
   * shape `{ message_id: number, ...rest }`; `date` and `chat` are auto-filled when absent.
   */
  reply_to_message?: Partial<Message> & ChannelPostOptionsReplyToMessage;
}

// Re-export so callers can import from 'channel' directly if needed.
