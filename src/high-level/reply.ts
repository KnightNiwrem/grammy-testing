import type { Bot, Context } from 'grammy';
import type { InlineKeyboardButton, InputRichMessage, Invoice, Message, MessageEntity, ParseMode, Update } from 'grammy/types';

import { callbackChatInstance, type CallbackQueryHandle } from './callback-query';
import type { AnyChat } from './chat';
import type { ForumTopic } from './forum-topic';
import type { IdGenerator } from './id-generator';
import type { User } from './user';

export type MediaType = 'animation' | 'audio' | 'document' | 'photo' | 'sticker' | 'video' | 'video_note' | 'voice';

export interface ReplyMedia {
  type: MediaType;
  fileId: string;
}

// Exhaustive guard: adding a new MediaType member without updating this object is a compile error.
const MEDIA_FIELDS_GUARD: Record<MediaType, true> = {
  animation: true,
  audio: true,
  document: true,
  photo: true,
  sticker: true,
  video: true,
  video_note: true,
  voice: true,
};

const MEDIA_FIELDS = Object.keys(MEDIA_FIELDS_GUARD) as MediaType[];

export interface ReplyButton {
  text: string;
  callbackData?: string;
  url?: string;
  raw: InlineKeyboardButton;
}

/**
 * Normalized view of the `InputRichMessage` a bot sent via `sendRichMessage` /
 * `sendRichMessageDraft`. Carries every field of the grammY `InputRichMessage` (so it stays in
 * sync with `@grammyjs/types`) plus a `plainText` convenience.
 */
export interface ReplyRichMessage extends InputRichMessage {
  /**
   * Best-effort plain text: the `html ?? markdown` content with tags / emphasis markup stripped,
   * for simple assertions. It does not decode HTML entities or parse links — assert on `html` /
   * `markdown` directly when you need the exact authored content. Empty string when neither is set.
   */
  plainText: string;
}

/**
 * Strips HTML tags from a string (e.g. `<b>hello</b>` → `hello`).
 * @param value - The HTML-formatted string.
 * @returns The text with all `<...>` tags removed.
 */
function stripHtml(value: string): string {
  let result = '';
  let isInsideTag = false;

  for (const char of value) {
    if (char === '<') {
      isInsideTag = true;
    } else if (char === '>') {
      isInsideTag = false;
    } else if (!isInsideTag) {
      result += char;
    }
  }

  return result;
}

/**
 * Strips common Markdown emphasis/code markup from a string (e.g. `**hello**` → `hello`).
 * @param value - The Markdown-formatted string.
 * @returns The text with emphasis/code markers removed.
 */
function stripMarkdown(value: string): string {
  return value.replaceAll(/\*\*|__|[*_~`]/g, '');
}

/**
 * Derives the {@link ReplyRichMessage} view from a raw outgoing payload's `rich_message` field.
 * @param payload - The raw outgoing API payload.
 * @returns A {@link ReplyRichMessage}, or `undefined` if the payload carries no rich message.
 */
function deriveRichMessage(payload: Record<string, unknown>): ReplyRichMessage | undefined {
  const rich = payload.rich_message as InputRichMessage | undefined;

  if (rich === undefined) {
    return undefined;
  }

  let plainText = '';

  if (rich.html) {
    plainText = stripHtml(rich.html);
  } else if (rich.markdown) {
    plainText = stripMarkdown(rich.markdown);
  }

  return { ...rich, plainText };
}

/**
 * Derives the public Bot API `Invoice` view from a captured `sendInvoice`
 * payload. The private bot payload intentionally remains available only as
 * `reply.raw.payload`, matching Telegram's returned `Invoice` object.
 * @param payload - Raw captured outgoing API payload.
 * @returns A public invoice view, or `undefined` for non-invoice replies.
 */
function deriveInvoice(payload: Record<string, unknown>): Invoice | undefined {
  const { title, description, currency, prices } = payload;

  if (typeof title !== 'string' || typeof description !== 'string' || typeof currency !== 'string' || !Array.isArray(prices)) {
    return undefined;
  }

  if (currency === 'XTR' && prices.length !== 1) {
    return undefined;
  }

  let totalAmount = 0;

  for (const price of prices) {
    if (typeof price !== 'object' || price === null) {
      return undefined;
    }

    const { amount } = price as { amount?: unknown };

    if (typeof amount !== 'number' || !Number.isSafeInteger(amount)) {
      return undefined;
    }

    totalAmount += amount;

    if (!Number.isSafeInteger(totalAmount)) {
      return undefined;
    }
  }

  return {
    title,
    description,
    start_parameter: typeof payload.start_parameter === 'string' ? payload.start_parameter : '',
    currency,
    total_amount: totalAmount,
  };
}

interface ReplyDeps<TContext extends Context = Context> {
  bot: Bot<TContext>;
  ids: IdGenerator;
  /** Rejects users minted by another Chats orchestrator before query registration. */
  assertClicker: (user: User<TContext>) => void;
  /** Creates a live callback-query handle before the update is dispatched. */
  createCallbackQuery: (id: string, callbackData: string) => CallbackQueryHandle;
  /** Runs the update within a clicker-scoped reply-routing context. */
  runWithClicker: (user: User<TContext>, chatId: number, dispatch: () => Promise<void>) => Promise<void>;
  /** Looks up an earlier captured Reply by its synthetic messageId. */
  resolveReply: (messageId: number) => Reply<TContext> | undefined;
}

export interface ReplyClickButtonMatcher {
  callbackData: string;
}

export interface ReplyClickButtonOptions<TContext extends Context = Context> {
  /**
   * User who clicks the button. Optional in private chats, where the participant
   * is inferred; required for group, supergroup, and channel replies.
   */
  by?: User<TContext>;
}

interface FindButtonMatcher {
  callbackData: string;
}

/**
 * Extracts a media file ID from the raw outgoing payload.
 * @param payload - The raw outgoing API payload.
 * @returns A {@link ReplyMedia} describing the media type and file ID, or `undefined` if none found.
 */
function deriveMedia(payload: Record<string, unknown>): ReplyMedia | undefined {
  for (const type of MEDIA_FIELDS) {
    const value = payload[type];

    if (value !== undefined) {
      return { type, fileId: typeof value === 'string' ? value : '[non-string-file]' };
    }
  }

  return undefined;
}

/**
 * Reads the reply-to message ID from a raw outgoing payload.
 * Supports both the legacy `reply_to_message_id` scalar and the modern
 * `reply_parameters.message_id` shape.
 * @param payload - The raw outgoing API payload.
 * @returns The referenced message ID, or `undefined` if not present.
 */
function readReplyToMessageId(payload: Record<string, unknown>): number | undefined {
  if (typeof payload.reply_to_message_id === 'number') {
    return payload.reply_to_message_id;
  }

  const params = payload.reply_parameters as { message_id?: number } | undefined;

  return params?.message_id;
}

/**
 * Collects all `@mention` usernames from an entity-annotated text string.
 * @param text - The message text, or `undefined` for non-text messages.
 * @param entities - The message entity array, or `undefined`.
 * @returns A `Set` of usernames without the leading `@`.
 */
function collectMentionUsernames(text: string | undefined, entities: MessageEntity[] | undefined): Set<string> {
  const usernames = new Set<string>();

  if (text === undefined || entities === undefined) {
    return usernames;
  }

  for (const entity of entities) {
    if (entity.type === 'mention') {
      const slice = text.slice(entity.offset, entity.offset + entity.length);

      if (slice.startsWith('@')) {
        usernames.add(slice.slice(1));
      }
    }
  }

  return usernames;
}

/**
 * Parses the inline keyboard from a raw outgoing payload into a flat button list.
 * @param payload - The raw outgoing API payload.
 * @returns An array of {@link ReplyButton} objects, empty if no inline keyboard is present.
 */
function collectButtons(payload: Record<string, unknown>): ReplyButton[] {
  const replyMarkup = payload.reply_markup as { inline_keyboard?: InlineKeyboardButton[][] } | undefined;

  if (!replyMarkup?.inline_keyboard) {
    return [];
  }

  const buttons: ReplyButton[] = [];

  for (const row of replyMarkup.inline_keyboard) {
    for (const raw of row) {
      buttons.push({
        text: raw.text,
        callbackData: 'callback_data' in raw ? raw.callback_data : undefined,
        url: 'url' in raw ? raw.url : undefined,
        raw,
      });
    }
  }

  return buttons;
}

/**
 * Finds the first button in a list matching the given text or callback-data matcher.
 * @param buttons - The button list to search.
 * @param matcher - Either a button text string or a `{ callbackData }` matcher object.
 * @returns The matching {@link ReplyButton}, or `undefined` if none found.
 */
function findButton(buttons: ReplyButton[], matcher: FindButtonMatcher | string): ReplyButton | undefined {
  if (typeof matcher === 'string') {
    return buttons.find((button) => button.text === matcher);
  }

  return buttons.find((button) => button.callbackData === matcher.callbackData);
}

/**
 * Infers the clicker identity from a private-chat context.
 * Returns `undefined` for group/channel chats where the clicker cannot be identified.
 * @param chat - The chat associated with the reply.
 * @returns The private-chat user actor, or `undefined`.
 */
function inferClicker<TContext extends Context>(chat: AnyChat<TContext> | undefined): User<TContext> | undefined {
  if (!chat) {
    return undefined;
  }

  if (chat.type === 'private') {
    return chat.user;
  }

  return undefined;
}

/**
 * Normalized view of a captured outgoing message-shape API call.
 * `Reply` instances are plain values (not proxies), safe to snapshot
 * and pass around.
 */
export class Reply<TContext extends Context = Context> {
  readonly text: string | undefined;

  readonly parseMode: ParseMode | undefined;

  readonly entities: MessageEntity[] | undefined;

  readonly buttons: ReplyButton[];

  readonly media: ReplyMedia | undefined;

  /** The sent `InputRichMessage` for `sendRichMessage` / `sendRichMessageDraft` calls, else `undefined`. */
  readonly richMessage: ReplyRichMessage | undefined;

  /** Public invoice fields returned by Telegram for `sendInvoice`, else `undefined`. */
  readonly invoice: Invoice | undefined;

  readonly replyMarkup: Record<string, unknown> | undefined;

  readonly replyingTo: Reply<TContext> | undefined;

  readonly chat: AnyChat<TContext> | undefined;

  /**
   * The `message_thread_id` the bot targeted, or `undefined` for non-topic sends.
   * Stays inspectable even when the ID matches no registered topic (`topic` is
   * `undefined` in that case).
   */
  readonly messageThreadId: number | undefined;

  /**
   * The registered `ForumTopic` this reply targeted, resolved via the chat's topic
   * registry. `undefined` for non-topic sends, non-forum chats, and unregistered
   * thread IDs (inspect `messageThreadId` for the raw value in that case).
   */
  readonly topic: ForumTopic<TContext> | undefined;

  /** The synthetic message_id assigned to this captured reply. */
  readonly messageId: number;

  /** The original captured outgoing-API payload (escape hatch). */
  readonly raw: Record<string, unknown>;

  /** Recorded for `user.replies` filter rule. */
  readonly replyToMessageId: number | undefined;

  /** Recorded for `user.replies` filter rule. */
  readonly mentionUsernames: ReadonlySet<string>;

  /**
   * Constructs a `Reply` from a captured outgoing API payload, deriving text, buttons, media, and mention metadata.
   * @param rawPayload - The raw captured outgoing API payload.
   * @param chat - The chat associated with this reply, or `undefined` if not resolved.
   * @param deps - Internal dependencies (bot, ids, callback correlation, click routing, reply resolution).
   */
  constructor(
    rawPayload: Record<string, unknown>,
    chat: AnyChat<TContext> | undefined,
    private readonly deps: ReplyDeps<TContext>,
  ) {
    this.raw = rawPayload;
    this.chat = chat;
    this.messageId = deps.ids.nextMessageId();

    const text = (rawPayload.text ?? rawPayload.caption) as string | undefined;

    this.text = text;
    this.parseMode = rawPayload.parse_mode as ParseMode | undefined;

    this.entities = (rawPayload.entities ?? rawPayload.caption_entities) as MessageEntity[] | undefined;

    this.replyToMessageId = readReplyToMessageId(rawPayload);
    this.mentionUsernames = collectMentionUsernames(text, this.entities);
    this.buttons = collectButtons(rawPayload);
    this.media = deriveMedia(rawPayload);
    this.richMessage = deriveRichMessage(rawPayload);
    this.invoice = deriveInvoice(rawPayload);
    this.replyMarkup = rawPayload.reply_markup as Record<string, unknown> | undefined;

    this.messageThreadId = typeof rawPayload.message_thread_id === 'number' ? rawPayload.message_thread_id : undefined;

    this.topic = chat?.type === 'supergroup' && this.messageThreadId !== undefined ? chat.topicByThreadId(this.messageThreadId) : undefined;

    this.replyingTo = this.replyToMessageId === undefined ? undefined : deps.resolveReply(this.replyToMessageId);
  }

  /**
   * Simulates a user clicking an inline keyboard button on this reply.
   * @param matcher - A button text string or a `{ callbackData }` matcher to identify the button.
   * @param options - Optional explicit clicker. Required outside private chats.
   * @returns A live handle whose `answer` is correlated by callback-query ID.
   */
  async clickButton(
    matcher: ReplyClickButtonMatcher | string,
    options: ReplyClickButtonOptions<TContext> = {},
  ): Promise<CallbackQueryHandle> {
    const button = findButton(this.buttons, matcher);

    if (!button) {
      throw new Error(`clickButton: no button matching ${JSON.stringify(matcher)}`);
    }

    if (button.url !== undefined && button.callbackData === undefined) {
      throw new Error(`clickButton: button "${button.text}" has only a url; URL buttons do not produce callback_query updates`);
    }

    if (button.callbackData === undefined) {
      throw new Error(`clickButton: button "${button.text}" has no callback data; only callback-data buttons produce callback_query.data`);
    }

    if (!this.chat) {
      throw new Error('clickButton: the captured reply has no registered chat');
    }

    if (this.chat.type === 'private' && options.by !== undefined && options.by !== this.chat.user) {
      throw new Error("clickButton: a private-chat button can only be clicked by that chat's user");
    }

    const { callbackData } = button;
    const clicker = options.by ?? inferClicker(this.chat);

    if (!clicker) {
      throw new Error('clickButton: options.by is required for group, supergroup, and channel replies');
    }

    this.deps.assertClicker(clicker);

    const id = `cbq-${String(this.deps.ids.nextMessageId())}`;
    const query = this.deps.createCallbackQuery(id, callbackData);

    const update: Update = {
      update_id: this.deps.ids.nextUpdateId(),
      callback_query: {
        id,
        from: {
          id: clicker.id,
          is_bot: false,
          first_name: clicker.first_name,
          last_name: clicker.last_name,
          username: clicker.username,
        },
        chat_instance: callbackChatInstance(this.chat.id),
        message: this.toCapturedMessage(),
        data: callbackData,
      },
    } as Update;

    await this.deps.runWithClicker(clicker, this.chat.id, () => this.deps.bot.handleUpdate(update));

    return query;
  }

  /**
   * Constructs a minimal `Message` object from this reply's captured data for use in `callback_query` updates.
   * @returns A synthesised `Message` suitable for embedding in a `callback_query`.
   */
  private toCapturedMessage(): Message {
    return {
      message_id: this.messageId,
      date: Math.floor(Date.now() / 1000),
      chat: this.chat ? this.chat.toTelegramChat() : ({ id: 0, type: 'private' } as Message['chat']),
      text: this.text,
      entities: this.entities,
      ...(this.invoice !== undefined && { invoice: this.invoice }),
      ...(this.messageThreadId !== undefined && { message_thread_id: this.messageThreadId, is_topic_message: true }),
      ...(this.replyMarkup !== undefined && { reply_markup: this.replyMarkup }),
    } as Message;
  }
}
