import {
  fixFormattedText,
  type FormattedText,
  type FormattedTextFixing,
} from '../text_entities/formatted_text.ts';
import { areTextEntitiesEqual } from '../text_entities/text_entity_equality.ts';
import type { ChatDomainEvent } from '../types/chat_domain_event.ts';
import { type InlineKeyboard, MAX_CALLBACK_DATA_BYTES } from '../types/inline_keyboard.ts';
import type { VirtualAccount } from '../types/virtual_account.ts';
import type { VirtualBot } from '../types/virtual_bot.ts';
import type {
  ChatAction,
  PrivateConversation,
  PrivateConversationKey,
  PrivateConversationRole,
} from '../types/virtual_chat.ts';
import {
  type CanonicalMessageId,
  MAX_TEXT_MESSAGE_LENGTH,
  type PrivateTextMessage,
  type TextEntity,
} from '../types/virtual_message.ts';

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

export interface SendAccountMessageInput {
  readonly fromAccountId: number;
  readonly to: {
    readonly type: 'private';
    readonly botId: number;
  };
  readonly text: string;
  /** The ID, in the bot's message box, of the chat's message to reply to; omitted for no reply. */
  readonly replyToBotMessageId?: number;
}

export type SendAccountMessageFailureReason =
  | 'account_not_found'
  | 'bot_not_found'
  | 'message_text_empty'
  | 'message_text_too_long'
  | 'reply_message_not_found';

/**
 * Telegram rejected the text or its entities while normalizing them, for example because only
 * whitespace remains or an entity ends past the text. `textError` is TDLib's own description.
 */
export interface TextInvalidFailure {
  readonly reason: 'text_invalid';
  readonly textError: string;
}

export type SendAccountMessageResult =
  | {
    readonly sent: true;
    readonly message: PrivateTextMessage;
  }
  | (
    & { readonly sent: false }
    & (
      | { readonly reason: SendAccountMessageFailureReason }
      | TextInvalidFailure
    )
  );

/** A bot's private chat, identified by the account at its other end. */
export interface BotPrivateChat {
  readonly type: 'private';
  readonly accountId: number;
}

/** The message of the chat that a bot's message replies to. */
export interface BotMessageReplyTarget {
  /** The message's ID in the bot's message box. */
  readonly botMessageId: number;
  /** Sends the message as no reply, rather than failing, when the target is not found. */
  readonly allowSendingWithoutReply: boolean;
}

export interface SendBotMessageInput {
  readonly fromBotId: number;
  readonly to: BotPrivateChat;
  readonly text: string;
  /** Formatting the bot specified, which Telegram validates and normalizes; omitted for none. */
  readonly entities?: readonly TextEntity[];
  /** Omitted for a message that replies to none. */
  readonly replyTo?: BotMessageReplyTarget;
  readonly inlineKeyboard?: InlineKeyboard;
  /** Protects the message from forwarding and saving; omitted for an unprotected message. */
  readonly isContentProtected?: boolean;
}

export type SendBotMessageFailureReason =
  | 'bot_not_found'
  | 'message_text_empty'
  | 'account_not_found'
  | 'conversation_not_started'
  | 'reply_message_not_found'
  | 'message_text_too_long'
  | 'callback_data_invalid';

export type SendBotMessageResult =
  | {
    readonly sent: true;
    readonly message: PrivateTextMessage;
  }
  | (
    & { readonly sent: false }
    & (
      | { readonly reason: SendBotMessageFailureReason }
      | TextInvalidFailure
    )
  );

interface EditBotMessageTarget {
  readonly fromBotId: number;
  readonly chat: BotPrivateChat;
  /** The message's ID in the bot's message box. */
  readonly botMessageId: number;
}

export interface EditBotMessageTextInput extends EditBotMessageTarget {
  readonly text: string;
  /** Formatting the bot specified, which Telegram validates and normalizes; omitted for none. */
  readonly entities?: readonly TextEntity[];
  /** The keyboard the edited message shows; omitting it removes the message's keyboard. */
  readonly inlineKeyboard?: InlineKeyboard;
}

export interface EditBotMessageInlineKeyboardInput extends EditBotMessageTarget {
  /** The keyboard the edited message shows; omitting it removes the message's keyboard. */
  readonly inlineKeyboard?: InlineKeyboard;
}

export type EditBotMessageInlineKeyboardFailureReason =
  | 'bot_not_found'
  | 'account_not_found'
  | 'conversation_not_started'
  | 'message_not_found'
  | 'message_not_editable'
  | 'callback_data_invalid'
  | 'message_not_modified';

export type EditBotMessageTextFailureReason =
  | EditBotMessageInlineKeyboardFailureReason
  | 'message_text_empty'
  | 'message_text_too_long';

export type EditBotMessageResult<FailureReason extends string> =
  | {
    readonly edited: true;
    readonly message: PrivateTextMessage;
  }
  | {
    readonly edited: false;
    readonly reason: FailureReason;
  };

export type EditBotMessageTextResult =
  | EditBotMessageResult<EditBotMessageTextFailureReason>
  | ({ readonly edited: false } & TextInvalidFailure);

export interface DeleteMessagesByBotInput {
  readonly fromBotId: number;
  readonly chat: BotPrivateChat;
  /** The messages' IDs in the bot's message box. */
  readonly botMessageIds: readonly number[];
}

export type DeleteMessagesByBotFailureReason =
  | 'bot_not_found'
  | 'account_not_found'
  | 'conversation_not_started';

export type DeleteMessagesByBotResult =
  | {
    readonly deleted: true;
    /** How many of the IDs identified a message of the chat, each deleted once. */
    readonly deletedMessageCount: number;
  }
  | {
    readonly deleted: false;
    readonly reason: DeleteMessagesByBotFailureReason;
  };

export interface SendBotChatActionInput {
  readonly fromBotId: number;
  readonly to: BotPrivateChat;
  readonly action: ChatAction;
}

export type SendBotChatActionResult =
  | { readonly sent: true }
  | {
    readonly sent: false;
    readonly reason: 'bot_not_found' | 'account_not_found' | 'conversation_not_started';
  };

export interface GetPrivateMessageHistoryInput {
  readonly accountId: number;
  readonly botId: number;
}

export type GetPrivateMessageHistoryResult =
  | {
    readonly found: true;
    readonly messages: readonly PrivateTextMessage[];
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

interface PrivateMessageStore {
  addPrivateTextMessage(input: {
    readonly conversation: PrivateConversationKey;
    readonly authorRole: PrivateConversationRole;
    readonly sentAtUnixSeconds: number;
    readonly text: string;
    readonly entities: readonly TextEntity[];
    readonly replyToMessageId?: CanonicalMessageId;
    readonly inlineKeyboard?: InlineKeyboard;
    readonly isContentProtected?: boolean;
  }): PrivateTextMessage;
  getPrivateTextMessage(messageId: CanonicalMessageId): PrivateTextMessage | undefined;
  editPrivateTextMessage(messageId: CanonicalMessageId, edit: {
    readonly text: string;
    readonly entities: readonly TextEntity[];
    readonly inlineKeyboard: InlineKeyboard | undefined;
    readonly textEditedAtUnixSeconds: number | undefined;
  }): PrivateTextMessage;
  deletePrivateTextMessage(messageId: CanonicalMessageId): void;
  getPrivateConversationMessages(
    conversation: PrivateConversationKey,
  ): readonly PrivateTextMessage[];
}

interface UserMessageBoxStore {
  assignMessageId(ownerId: number, canonicalMessageId: CanonicalMessageId): number;
  getCanonicalMessageId(ownerId: number, messageId: number): CanonicalMessageId | undefined;
}

interface ChatDomainEventSink {
  publish(event: ChatDomainEvent): void;
}

interface PrivateMessagingServiceDependencies {
  readonly accounts: AccountLookup;
  readonly bots: BotLookup;
  readonly privateConversations: PrivateConversationStore;
  readonly messages: PrivateMessageStore;
  readonly userMessageBoxes: UserMessageBoxStore;
  readonly events: ChatDomainEventSink;
  readonly currentUnixTimeSeconds: () => number;
}

/**
 * Carries out text exchanges between an account and a bot in their private conversation, and
 * commits each accepted message: stored, numbered for both participants, then published. Bots can
 * attach inline keyboards to their messages, edit them afterward, and delete messages of their
 * chats.
 *
 * Results carry canonical messages; presenting them to an observer, such as through the Bot API,
 * is left to the caller.
 */
export class PrivateMessagingService {
  readonly #accounts: AccountLookup;
  readonly #bots: BotLookup;
  readonly #privateConversations: PrivateConversationStore;
  readonly #messages: PrivateMessageStore;
  readonly #userMessageBoxes: UserMessageBoxStore;
  readonly #events: ChatDomainEventSink;
  readonly #currentUnixTimeSeconds: () => number;

  constructor(
    {
      accounts,
      bots,
      privateConversations,
      messages,
      userMessageBoxes,
      events,
      currentUnixTimeSeconds,
    }: PrivateMessagingServiceDependencies,
  ) {
    this.#accounts = accounts;
    this.#bots = bots;
    this.#privateConversations = privateConversations;
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
      conversation: this.#privateConversations.getOrCreatePrivateConversation(input),
    };
  }

  sendAccountMessage(input: SendAccountMessageInput): SendAccountMessageResult {
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
    const textFixing = this.#fixFormattedText(input.text, []);
    if (!textFixing.fixed) {
      return { sent: false, reason: 'text_invalid', textError: textFixing.error };
    }
    if (textFixing.formattedText.text.length > MAX_TEXT_MESSAGE_LENGTH) {
      return { sent: false, reason: 'message_text_too_long' };
    }
    const conversation: PrivateConversationKey = {
      accountId: account.profile.id,
      botId: bot.profile.id,
    };
    const repliedMessage = input.replyToBotMessageId === undefined
      ? undefined
      : this.getPrivateTextMessageByBotMessageId(conversation, input.replyToBotMessageId);
    if (input.replyToBotMessageId !== undefined && repliedMessage === undefined) {
      return { sent: false, reason: 'reply_message_not_found' };
    }

    this.#privateConversations.getOrCreatePrivateConversation(conversation);
    return {
      sent: true,
      message: this.#storePrivateTextMessage({
        account,
        bot,
        authorRole: 'account',
        formattedText: textFixing.formattedText,
        replyToMessageId: repliedMessage?.id,
      }),
    };
  }

  /**
   * Sends text from a bot to an account. As on Telegram, a bot cannot initiate a private
   * conversation, so the account must have started one with the bot.
   *
   * Checks follow Telegram's order: the text is checked for emptiness before the recipient is
   * resolved, and the replied message is looked up after it; the text is then normalized with its
   * entities, and the result is checked for length. Callback data is checked last.
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
    const conversation = this.#privateConversations.getPrivateConversation({
      accountId: account.profile.id,
      botId: bot.profile.id,
    });
    if (conversation === undefined) {
      return { sent: false, reason: 'conversation_not_started' };
    }
    const replyResolution = this.#resolveBotMessageReplyTarget(conversation, input.replyTo);
    if (!replyResolution.resolved) {
      return { sent: false, reason: 'reply_message_not_found' };
    }
    const textFixing = this.#fixFormattedText(input.text, input.entities ?? []);
    if (!textFixing.fixed) {
      return { sent: false, reason: 'text_invalid', textError: textFixing.error };
    }
    if (textFixing.formattedText.text.length > MAX_TEXT_MESSAGE_LENGTH) {
      return { sent: false, reason: 'message_text_too_long' };
    }
    if (input.inlineKeyboard !== undefined && !hasOnlyValidCallbackData(input.inlineKeyboard)) {
      return { sent: false, reason: 'callback_data_invalid' };
    }

    return {
      sent: true,
      message: this.#storePrivateTextMessage({
        account,
        bot,
        authorRole: 'bot',
        formattedText: textFixing.formattedText,
        replyToMessageId: replyResolution.repliedMessage?.id,
        inlineKeyboard: input.inlineKeyboard,
        isContentProtected: input.isContentProtected,
      }),
    };
  }

  /**
   * Replaces the text, entities, and inline keyboard of a message the bot sent. Only changed text
   * or entities date the edit. As on Telegram, the bot receives no update for its own edit.
   *
   * Checks follow Telegram's order: the text is checked for emptiness before the message is
   * resolved; it is then normalized with its entities, and the result is checked for length.
   */
  editBotMessageText(input: EditBotMessageTextInput): EditBotMessageTextResult {
    if (this.#bots.getById(input.fromBotId) === undefined) {
      return { edited: false, reason: 'bot_not_found' };
    }
    if (input.text.length === 0) {
      return { edited: false, reason: 'message_text_empty' };
    }
    const resolution = this.#resolveEditableBotMessage(input);
    if (!resolution.resolved) {
      return { edited: false, reason: resolution.reason };
    }
    const textFixing = this.#fixFormattedText(input.text, input.entities ?? []);
    if (!textFixing.fixed) {
      return { edited: false, reason: 'text_invalid', textError: textFixing.error };
    }
    const { formattedText } = textFixing;
    if (formattedText.text.length > MAX_TEXT_MESSAGE_LENGTH) {
      return { edited: false, reason: 'message_text_too_long' };
    }

    const { message } = resolution;
    return this.#editBotMessage(message, {
      text: formattedText.text,
      entities: formattedText.entities,
      inlineKeyboard: input.inlineKeyboard,
      textEditedAtUnixSeconds: isSameFormattedText(formattedText, message)
        ? message.textEditedAtUnixSeconds
        : this.#currentUnixTimeSeconds(),
    });
  }

  /**
   * Replaces the inline keyboard of a message the bot sent, leaving its text and edit date as they
   * are. As on Telegram, the bot receives no update for its own edit.
   */
  editBotMessageInlineKeyboard(
    input: EditBotMessageInlineKeyboardInput,
  ): EditBotMessageResult<EditBotMessageInlineKeyboardFailureReason> {
    if (this.#bots.getById(input.fromBotId) === undefined) {
      return { edited: false, reason: 'bot_not_found' };
    }
    const resolution = this.#resolveEditableBotMessage(input);
    if (!resolution.resolved) {
      return { edited: false, reason: resolution.reason };
    }

    const { message } = resolution;
    return this.#editBotMessage(message, {
      text: message.text,
      entities: message.entities,
      inlineKeyboard: input.inlineKeyboard,
      textEditedAtUnixSeconds: message.textEditedAtUnixSeconds,
    });
  }

  /**
   * Deletes messages of the bot's private chat for both participants. As on Telegram, a bot can
   * delete messages either participant wrote, and receives no update for the deletion. IDs that
   * identify no message of the chat, including messages already deleted, are skipped.
   *
   * A deleted message keeps its ID in each message box, because Telegram never reuses message IDs.
   * The emulator does not age messages, so Telegram's 48-hour deletion limit never applies.
   */
  deleteMessagesByBot(input: DeleteMessagesByBotInput): DeleteMessagesByBotResult {
    if (this.#bots.getById(input.fromBotId) === undefined) {
      return { deleted: false, reason: 'bot_not_found' };
    }
    if (this.#accounts.getById(input.chat.accountId) === undefined) {
      return { deleted: false, reason: 'account_not_found' };
    }
    const conversation: PrivateConversationKey = {
      accountId: input.chat.accountId,
      botId: input.fromBotId,
    };
    if (this.#privateConversations.getPrivateConversation(conversation) === undefined) {
      return { deleted: false, reason: 'conversation_not_started' };
    }

    let deletedMessageCount = 0;
    for (const botMessageId of input.botMessageIds) {
      const message = this.getPrivateTextMessageByBotMessageId(conversation, botMessageId);
      if (message !== undefined) {
        this.#messages.deletePrivateTextMessage(message.id);
        deletedMessageCount++;
      }
    }
    return { deleted: true, deletedMessageCount };
  }

  /**
   * Shows a chat action, such as typing, from a bot to an account. As for messages, the account
   * must have started a conversation with the bot. Telegram shows the action in the account's
   * client for a few seconds; the emulator only checks that the bot may send it.
   */
  sendBotChatAction({ fromBotId, to }: SendBotChatActionInput): SendBotChatActionResult {
    if (this.#bots.getById(fromBotId) === undefined) {
      return { sent: false, reason: 'bot_not_found' };
    }
    if (this.#accounts.getById(to.accountId) === undefined) {
      return { sent: false, reason: 'account_not_found' };
    }
    const conversation = this.#privateConversations.getPrivateConversation({
      accountId: to.accountId,
      botId: fromBotId,
    });
    return conversation === undefined
      ? { sent: false, reason: 'conversation_not_started' }
      : { sent: true };
  }

  /**
   * Finds a message of a private conversation by its ID in the bot's message box. A bot numbers
   * the messages of all its chats in one box, so an ID from another chat finds nothing.
   */
  getPrivateTextMessageByBotMessageId(
    conversation: PrivateConversationKey,
    botMessageId: number,
  ): PrivateTextMessage | undefined {
    const canonicalMessageId = this.#userMessageBoxes.getCanonicalMessageId(
      conversation.botId,
      botMessageId,
    );
    const message = canonicalMessageId === undefined
      ? undefined
      : this.#messages.getPrivateTextMessage(canonicalMessageId);
    if (
      message === undefined ||
      message.conversation.accountId !== conversation.accountId ||
      message.conversation.botId !== conversation.botId
    ) {
      return undefined;
    }
    return message;
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

    return { found: true, messages: this.#messages.getPrivateConversationMessages(input) };
  }

  /**
   * Finds the message a bot's message replies to. As on Telegram, a target that is not found,
   * such as a deleted message, fails the send unless the bot allowed sending without a reply.
   */
  #resolveBotMessageReplyTarget(
    conversation: PrivateConversationKey,
    replyTo: BotMessageReplyTarget | undefined,
  ):
    | { readonly resolved: true; readonly repliedMessage?: PrivateTextMessage }
    | { readonly resolved: false } {
    if (replyTo === undefined) {
      return { resolved: true };
    }
    const repliedMessage = this.getPrivateTextMessageByBotMessageId(
      conversation,
      replyTo.botMessageId,
    );
    if (repliedMessage !== undefined) {
      return { resolved: true, repliedMessage };
    }
    return replyTo.allowSendingWithoutReply ? { resolved: true } : { resolved: false };
  }

  /** Resolves the bot message an edit targets, which only the bot that sent it can edit. */
  #resolveEditableBotMessage(
    { fromBotId, chat, botMessageId }: EditBotMessageTarget,
  ):
    | { readonly resolved: true; readonly message: PrivateTextMessage }
    | {
      readonly resolved: false;
      readonly reason:
        | 'account_not_found'
        | 'conversation_not_started'
        | 'message_not_found'
        | 'message_not_editable';
    } {
    if (this.#accounts.getById(chat.accountId) === undefined) {
      return { resolved: false, reason: 'account_not_found' };
    }
    const conversation: PrivateConversationKey = { accountId: chat.accountId, botId: fromBotId };
    if (this.#privateConversations.getPrivateConversation(conversation) === undefined) {
      return { resolved: false, reason: 'conversation_not_started' };
    }
    const message = this.getPrivateTextMessageByBotMessageId(conversation, botMessageId);
    if (message === undefined) {
      return { resolved: false, reason: 'message_not_found' };
    }
    if (message.authorRole !== 'bot') {
      return { resolved: false, reason: 'message_not_editable' };
    }
    return { resolved: true, message };
  }

  /** Validates and stores a bot's edit of its message, which must change the message. */
  #editBotMessage(
    message: PrivateTextMessage,
    edit: {
      readonly text: string;
      readonly entities: readonly TextEntity[];
      readonly inlineKeyboard: InlineKeyboard | undefined;
      readonly textEditedAtUnixSeconds: number | undefined;
    },
  ): EditBotMessageResult<'callback_data_invalid' | 'message_not_modified'> {
    if (edit.inlineKeyboard !== undefined && !hasOnlyValidCallbackData(edit.inlineKeyboard)) {
      return { edited: false, reason: 'callback_data_invalid' };
    }
    if (
      isSameFormattedText(edit, message) &&
      areInlineKeyboardsEqual(edit.inlineKeyboard, message.inlineKeyboard)
    ) {
      return { edited: false, reason: 'message_not_modified' };
    }

    return { edited: true, message: this.#messages.editPrivateTextMessage(message.id, edit) };
  }

  /**
   * Normalizes text and the entities its sender specified as Telegram does, which also marks bot
   * commands. A text mention may name any user of the session.
   */
  #fixFormattedText(text: string, entities: readonly TextEntity[]): FormattedTextFixing {
    return fixFormattedText(text, entities, {
      isMentionableUser: (userId) =>
        this.#accounts.getById(userId) !== undefined || this.#bots.getById(userId) !== undefined,
    });
  }

  /**
   * Stores normalized text written by one participant of an existing private conversation, numbers
   * it in both participants' message boxes, and publishes its creation.
   */
  #storePrivateTextMessage(
    {
      account,
      bot,
      authorRole,
      formattedText,
      replyToMessageId,
      inlineKeyboard,
      isContentProtected,
    }: {
      readonly account: VirtualAccount;
      readonly bot: VirtualBot;
      readonly authorRole: PrivateConversationRole;
      readonly formattedText: FormattedText;
      readonly replyToMessageId?: CanonicalMessageId;
      readonly inlineKeyboard?: InlineKeyboard;
      readonly isContentProtected?: boolean;
    },
  ): PrivateTextMessage {
    const storedMessage = this.#messages.addPrivateTextMessage({
      conversation: { accountId: account.profile.id, botId: bot.profile.id },
      authorRole,
      sentAtUnixSeconds: this.#currentUnixTimeSeconds(),
      text: formattedText.text,
      entities: formattedText.entities,
      replyToMessageId,
      inlineKeyboard,
      isContentProtected,
    });
    // Telegram numbers a private message in each participant's message box. Only the bot's
    // numbering is projected today; the account's keeps the stored model faithful to Telegram.
    this.#userMessageBoxes.assignMessageId(account.profile.id, storedMessage.id);
    this.#userMessageBoxes.assignMessageId(bot.profile.id, storedMessage.id);
    this.#events.publish({ type: 'message_created', message: storedMessage });

    return storedMessage;
  }
}

const utf8Encoder = new TextEncoder();

/** Telegram rejects a keyboard whose callback data exceeds its byte limit when UTF-8 encoded. */
function hasOnlyValidCallbackData(inlineKeyboard: InlineKeyboard): boolean {
  return inlineKeyboard.every((row) =>
    row.every((button) =>
      button.kind !== 'callback' ||
      utf8Encoder.encode(button.callbackData).length <= MAX_CALLBACK_DATA_BYTES
    )
  );
}

function isSameFormattedText(first: FormattedText, second: FormattedText): boolean {
  return first.text === second.text && areTextEntitiesEqual(first.entities, second.entities);
}

function areInlineKeyboardsEqual(
  first: InlineKeyboard | undefined,
  second: InlineKeyboard | undefined,
): boolean {
  if (first === undefined || second === undefined) {
    return first === second;
  }
  return first.length === second.length && first.every((firstRow, rowIndex) => {
    const secondRow = second[rowIndex];
    return firstRow.length === secondRow.length && firstRow.every((firstButton, buttonIndex) => {
      const secondButton = secondRow[buttonIndex];
      switch (firstButton.kind) {
        case 'callback':
          return secondButton.kind === 'callback' && firstButton.text === secondButton.text &&
            firstButton.callbackData === secondButton.callbackData;
        case 'url':
          return secondButton.kind === 'url' && firstButton.text === secondButton.text &&
            firstButton.url === secondButton.url;
        default: {
          const unhandledButton: never = firstButton;
          throw new Error(`Unhandled inline keyboard button: ${JSON.stringify(unhandledButton)}`);
        }
      }
    });
  });
}
