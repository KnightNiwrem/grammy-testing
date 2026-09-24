import type { ChatDomainEvent } from '../types/chat_domain_event.ts';
import type { InlineKeyboard } from '../types/inline_keyboard.ts';
import type {
  BotMessageReplyMarkup,
  ReplyInterface,
  ReplyInterfaceMarkup,
  ReplyKeyboard,
} from '../types/reply_interface.ts';
import type { VirtualAccount } from '../types/virtual_account.ts';
import type { VirtualBot } from '../types/virtual_bot.ts';
import type {
  ChatAction,
  PrivateConversation,
  PrivateConversationKey,
  PrivateConversationRole,
} from '../types/virtual_chat.ts';
import type {
  CanonicalMessageId,
  MessageContent,
  PrivateMessage,
  TextEntity,
} from '../types/virtual_message.ts';
import {
  type AccountMessageContent,
  type AccountMessageEdit,
  checkBotMessageEdit,
  type ContentNormalizationFailure,
  type ContentReplacement,
  type FileUploadStore,
  hasOnlyValidCallbackData,
  isSameMessageContent,
  type NormalizedOutgoingContent,
  normalizeOutgoingContent,
  type OutgoingContentNormalization,
  type OutgoingMessageContent,
  replaceAccountMessageContent,
  replaceMessageCaption,
  replaceMessageText,
  type SpecifiedCaption,
  storeOutgoingContent,
  type TextInvalidFailure,
  toOutgoingAccountContent,
} from './message_content.ts';

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
  readonly content: AccountMessageContent;
  /** The ID, in the bot's message box, of the chat's message to reply to; omitted for no reply. */
  readonly replyToBotMessageId?: number;
}

export type SendAccountMessageFailureReason =
  | 'account_not_found'
  | 'bot_not_found'
  | 'bot_blocked'
  | 'message_text_empty'
  | 'reply_message_not_found';

export type SendAccountMessageResult =
  | {
    readonly sent: true;
    readonly message: PrivateMessage;
  }
  | (
    & { readonly sent: false }
    & (
      | { readonly reason: SendAccountMessageFailureReason }
      | ContentNormalizationFailure
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

export type SendBotMessageInput = BotMessageReplyMarkup & {
  readonly fromBotId: number;
  readonly to: BotPrivateChat;
  readonly content: OutgoingMessageContent;
  /** Omitted for a message that replies to none. */
  readonly replyTo?: BotMessageReplyTarget;
  /** Protects the message from forwarding and saving; omitted for an unprotected message. */
  readonly isContentProtected?: boolean;
};

export type SendBotMessageFailureReason =
  | 'bot_not_found'
  | 'message_text_empty'
  | 'account_not_found'
  | 'conversation_not_started'
  | 'reply_message_not_found'
  | 'callback_data_invalid'
  | 'bot_blocked';

export type SendBotMessageResult =
  | {
    readonly sent: true;
    readonly message: PrivateMessage;
  }
  | (
    & { readonly sent: false }
    & (
      | { readonly reason: SendBotMessageFailureReason }
      | ContentNormalizationFailure
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

export type EditBotMessageCaptionInput = EditBotMessageTarget & SpecifiedCaption & {
  /** Whether a photo shows its caption above itself; a document ignores it. */
  readonly showsCaptionAboveMedia: boolean;
  /** The keyboard the edited message shows; omitting it removes the message's keyboard. */
  readonly inlineKeyboard?: InlineKeyboard;
};

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
  | 'message_has_no_text'
  | 'message_text_too_long';

export type EditBotMessageCaptionFailureReason =
  | EditBotMessageInlineKeyboardFailureReason
  | 'message_has_no_caption'
  | 'caption_too_long';

export type PrivateMessageEditResult<FailureReason extends string> =
  | {
    readonly edited: true;
    readonly message: PrivateMessage;
  }
  | {
    readonly edited: false;
    readonly reason: FailureReason;
  };

export type EditBotMessageTextResult =
  | PrivateMessageEditResult<EditBotMessageTextFailureReason>
  | ({ readonly edited: false } & TextInvalidFailure);

export type EditBotMessageCaptionResult =
  | PrivateMessageEditResult<EditBotMessageCaptionFailureReason>
  | ({ readonly edited: false } & TextInvalidFailure);

export interface EditAccountMessageInput {
  readonly fromAccountId: number;
  readonly chat: {
    readonly type: 'private';
    readonly botId: number;
  };
  /** The message's ID in the bot's message box. */
  readonly botMessageId: number;
  readonly edit: AccountMessageEdit;
}

export type EditAccountMessageFailureReason =
  | 'account_not_found'
  | 'bot_not_found'
  | 'message_not_found'
  | 'message_not_editable'
  | 'message_text_empty'
  | 'message_has_no_text'
  | 'message_text_too_long'
  | 'message_has_no_caption'
  | 'caption_too_long'
  | 'message_not_modified';

export type EditAccountMessageResult =
  | PrivateMessageEditResult<EditAccountMessageFailureReason>
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
    readonly reason:
      | 'bot_not_found'
      | 'account_not_found'
      | 'conversation_not_started'
      | 'bot_blocked';
  };

/** The message whose reply interface an account's client shows, with that interface. */
export interface ShownReplyInterface {
  readonly message: PrivateMessage;
  readonly replyInterface: ReplyInterface;
}

export type GetPrivateChatReplyInterfaceResult =
  | {
    readonly found: true;
    /** Omitted when the client shows its usual input. */
    readonly shownReplyInterface?: ShownReplyInterface;
  }
  | { readonly found: false; readonly reason: 'account_not_found' | 'bot_not_found' };

export interface PressReplyKeyboardButtonInput {
  readonly fromAccountId: number;
  readonly chat: {
    readonly type: 'private';
    readonly botId: number;
  };
  /** The text of the button to press. */
  readonly text: string;
}

export type PressReplyKeyboardButtonResult =
  | SendAccountMessageResult
  | { readonly sent: false; readonly reason: 'reply_keyboard_button_not_found' };

export interface GetPrivateMessageHistoryInput {
  readonly accountId: number;
  readonly botId: number;
}

export type GetPrivateMessageHistoryResult =
  | {
    readonly found: true;
    readonly messages: readonly PrivateMessage[];
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
  getReplyInterfaceMessageId(key: PrivateConversationKey): CanonicalMessageId | undefined;
  setReplyInterfaceMessageId(
    key: PrivateConversationKey,
    messageId: CanonicalMessageId | undefined,
  ): void;
}

interface PrivateMessageStore {
  addPrivateMessage(input: {
    readonly conversation: PrivateConversationKey;
    readonly authorRole: PrivateConversationRole;
    readonly sentAtUnixSeconds: number;
    readonly content: MessageContent;
    readonly replyToMessageId?: CanonicalMessageId;
    readonly inlineKeyboard?: InlineKeyboard;
    readonly replyInterface?: ReplyInterface;
    readonly isContentProtected?: boolean;
  }): PrivateMessage;
  getPrivateMessage(messageId: CanonicalMessageId): PrivateMessage | undefined;
  editPrivateMessage(messageId: CanonicalMessageId, edit: {
    readonly content: MessageContent;
    readonly inlineKeyboard: InlineKeyboard | undefined;
    readonly contentEditedAtUnixSeconds: number | undefined;
  }): PrivateMessage;
  deletePrivateMessage(messageId: CanonicalMessageId): void;
  getPrivateConversationMessages(
    conversation: PrivateConversationKey,
  ): readonly PrivateMessage[];
}

interface MessageBoxStore {
  assignMessageId(ownerId: number, canonicalMessageId: CanonicalMessageId): number;
  getCanonicalMessageId(ownerId: number, messageId: number): CanonicalMessageId | undefined;
}

interface BlockedUserLookup {
  isBlocked(accountId: number, userId: number): boolean;
}

interface ChatDomainEventSink {
  publish(event: ChatDomainEvent): void;
}

interface PrivateMessagingServiceDependencies {
  readonly accounts: AccountLookup;
  readonly bots: BotLookup;
  readonly privateConversations: PrivateConversationStore;
  readonly messages: PrivateMessageStore;
  readonly files: FileUploadStore;
  readonly messageBoxes: MessageBoxStore;
  readonly blockedUsers: BlockedUserLookup;
  readonly events: ChatDomainEventSink;
  readonly currentUnixTimeSeconds: () => number;
}

/**
 * Carries out exchanges of text, photos, and documents between an account and a bot in their
 * private conversation, and commits each accepted message: its upload stored, the message stored,
 * numbered for both participants, then published. Bots can attach inline keyboards to their
 * messages, edit them afterward, and delete messages of their chats. A bot's message can also
 * change the reply interface the account's client shows, such as a reply keyboard whose buttons
 * the account presses. An account edits the text or caption of its messages.
 *
 * While an account blocks a bot, neither can write to the other, as on Telegram, where the bot's
 * sends fail and a client asks the user to unblock the bot before writing to it.
 *
 * Results carry canonical messages; presenting them to an observer, such as through the Bot API,
 * is left to the caller.
 */
export class PrivateMessagingService {
  readonly #accounts: AccountLookup;
  readonly #bots: BotLookup;
  readonly #privateConversations: PrivateConversationStore;
  readonly #messages: PrivateMessageStore;
  readonly #files: FileUploadStore;
  readonly #messageBoxes: MessageBoxStore;
  readonly #blockedUsers: BlockedUserLookup;
  readonly #events: ChatDomainEventSink;
  readonly #currentUnixTimeSeconds: () => number;

  constructor(
    {
      accounts,
      bots,
      privateConversations,
      messages,
      files,
      messageBoxes,
      blockedUsers,
      events,
      currentUnixTimeSeconds,
    }: PrivateMessagingServiceDependencies,
  ) {
    this.#accounts = accounts;
    this.#bots = bots;
    this.#privateConversations = privateConversations;
    this.#messages = messages;
    this.#files = files;
    this.#messageBoxes = messageBoxes;
    this.#blockedUsers = blockedUsers;
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
    if (this.#blockedUsers.isBlocked(account.profile.id, bot.profile.id)) {
      return { sent: false, reason: 'bot_blocked' };
    }
    if (input.content.kind === 'text' && input.content.text.length === 0) {
      return { sent: false, reason: 'message_text_empty' };
    }
    const contentNormalization = this.#normalizeContent(
      toOutgoingAccountContent(input.content),
      'account',
    );
    if (!contentNormalization.normalized) {
      return { sent: false, ...contentNormalization.failure };
    }
    const conversation: PrivateConversationKey = {
      accountId: account.profile.id,
      botId: bot.profile.id,
    };
    const repliedMessage = input.replyToBotMessageId === undefined
      ? undefined
      : this.getPrivateMessageByBotMessageId(conversation, input.replyToBotMessageId);
    if (input.replyToBotMessageId !== undefined && repliedMessage === undefined) {
      return { sent: false, reason: 'reply_message_not_found' };
    }

    this.#privateConversations.getOrCreatePrivateConversation(conversation);
    return {
      sent: true,
      message: this.#storePrivateMessage({
        account,
        bot,
        authorRole: 'account',
        content: contentNormalization.content,
        replyToMessageId: repliedMessage?.id,
      }),
    };
  }

  /**
   * Sends text, a photo, or a document from a bot to an account. As on Telegram, a bot cannot
   * initiate a private conversation, so the account must have started one with the bot.
   *
   * Checks follow Telegram's order: text is checked for emptiness before the recipient is
   * resolved, and the replied message is looked up after it; the text or caption is then
   * normalized with its entities, and the result is checked for length. Callback data is checked
   * next. A block by the account is checked last, as Telegram's servers refuse the message only
   * after the Bot API server has checked everything it can.
   */
  sendBotMessage(input: SendBotMessageInput): SendBotMessageResult {
    const bot = this.#bots.getById(input.fromBotId);
    if (bot === undefined) {
      return { sent: false, reason: 'bot_not_found' };
    }
    if (input.content.kind === 'text' && input.content.text.length === 0) {
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
    const contentNormalization = this.#normalizeContent(input.content, 'bot');
    if (!contentNormalization.normalized) {
      return { sent: false, ...contentNormalization.failure };
    }
    if (input.inlineKeyboard !== undefined && !hasOnlyValidCallbackData(input.inlineKeyboard)) {
      return { sent: false, reason: 'callback_data_invalid' };
    }
    if (this.#blockedUsers.isBlocked(account.profile.id, bot.profile.id)) {
      return { sent: false, reason: 'bot_blocked' };
    }

    return {
      sent: true,
      message: this.#storePrivateMessage({
        account,
        bot,
        authorRole: 'bot',
        content: contentNormalization.content,
        replyToMessageId: replyResolution.repliedMessage?.id,
        inlineKeyboard: input.inlineKeyboard,
        replyInterfaceMarkup: input.replyInterfaceMarkup,
        isContentProtected: input.isContentProtected,
      }),
    };
  }

  /**
   * Replaces the text, entities, and inline keyboard of a text message the bot sent. Only changed
   * text or entities date the edit. As on Telegram, the bot receives no update for its own edit.
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
    const { message } = resolution;
    return this.#editBotMessageContent(
      message,
      replaceMessageText(message.content, input, this.#textFixingContext),
      input.inlineKeyboard,
    );
  }

  /**
   * Replaces the caption, its entities, and the inline keyboard of a photo or document the bot
   * sent; an empty caption removes it. Only a changed caption dates the edit. As on Telegram, the
   * bot receives no update for its own edit.
   */
  editBotMessageCaption(input: EditBotMessageCaptionInput): EditBotMessageCaptionResult {
    if (this.#bots.getById(input.fromBotId) === undefined) {
      return { edited: false, reason: 'bot_not_found' };
    }
    const resolution = this.#resolveEditableBotMessage(input);
    if (!resolution.resolved) {
      return { edited: false, reason: resolution.reason };
    }
    const { message } = resolution;
    return this.#editBotMessageContent(
      message,
      replaceMessageCaption(message.content, input, 'bot', this.#textFixingContext),
      input.inlineKeyboard,
    );
  }

  /**
   * Replaces the inline keyboard of a message the bot sent, leaving its content and edit date as
   * they are. As on Telegram, the bot receives no update for its own edit.
   */
  editBotMessageInlineKeyboard(
    input: EditBotMessageInlineKeyboardInput,
  ): PrivateMessageEditResult<EditBotMessageInlineKeyboardFailureReason> {
    if (this.#bots.getById(input.fromBotId) === undefined) {
      return { edited: false, reason: 'bot_not_found' };
    }
    const resolution = this.#resolveEditableBotMessage(input);
    if (!resolution.resolved) {
      return { edited: false, reason: resolution.reason };
    }

    const { message } = resolution;
    return this.#editBotMessage(message, {
      content: message.content,
      inlineKeyboard: input.inlineKeyboard,
      contentEditedAtUnixSeconds: message.contentEditedAtUnixSeconds,
    });
  }

  /**
   * Replaces the text or caption of a message the account wrote to the bot, which, unlike a bot's
   * own edit, sends the bot an `edited_message` update. As when sending, the text is normalized as
   * a Telegram client does, which marks bot commands again.
   */
  editAccountMessage(input: EditAccountMessageInput): EditAccountMessageResult {
    if (this.#accounts.getById(input.fromAccountId) === undefined) {
      return { edited: false, reason: 'account_not_found' };
    }
    if (this.#bots.getById(input.chat.botId) === undefined) {
      return { edited: false, reason: 'bot_not_found' };
    }
    const message = this.getPrivateMessageByBotMessageId(
      { accountId: input.fromAccountId, botId: input.chat.botId },
      input.botMessageId,
    );
    if (message === undefined) {
      return { edited: false, reason: 'message_not_found' };
    }
    if (message.authorRole !== 'account') {
      return { edited: false, reason: 'message_not_editable' };
    }
    const replacement = replaceAccountMessageContent(
      message.content,
      input.edit,
      this.#textFixingContext,
    );
    if (!replacement.replaced) {
      return { edited: false, ...replacement.failure };
    }
    if (isSameMessageContent(replacement.content, message.content)) {
      return { edited: false, reason: 'message_not_modified' };
    }

    const editedMessage = this.#messages.editPrivateMessage(message.id, {
      content: replacement.content,
      inlineKeyboard: message.inlineKeyboard,
      contentEditedAtUnixSeconds: this.#currentUnixTimeSeconds(),
    });
    this.#events.publish({ type: 'message_edited', message: editedMessage });
    return { edited: true, message: editedMessage };
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
      const message = this.getPrivateMessageByBotMessageId(conversation, botMessageId);
      if (message === undefined) {
        continue;
      }
      // As TDLib does, deleting the message whose reply interface the client shows removes it.
      if (this.#privateConversations.getReplyInterfaceMessageId(conversation) === message.id) {
        this.#privateConversations.setReplyInterfaceMessageId(conversation, undefined);
      }
      this.#messages.deletePrivateMessage(message.id);
      deletedMessageCount++;
    }
    return { deleted: true, deletedMessageCount };
  }

  /**
   * Shows a chat action, such as typing, from a bot to an account. As for messages, the account
   * must have started a conversation with the bot and not block it. Telegram shows the action in
   * the account's client for a few seconds; the emulator only checks that the bot may send it.
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
    if (conversation === undefined) {
      return { sent: false, reason: 'conversation_not_started' };
    }
    return this.#blockedUsers.isBlocked(to.accountId, fromBotId)
      ? { sent: false, reason: 'bot_blocked' }
      : { sent: true };
  }

  /**
   * Finds a message of a private conversation by its ID in the bot's message box. A bot numbers
   * the messages of all its chats in one box, so an ID from another chat finds nothing.
   */
  getPrivateMessageByBotMessageId(
    conversation: PrivateConversationKey,
    botMessageId: number,
  ): PrivateMessage | undefined {
    const canonicalMessageId = this.#messageBoxes.getCanonicalMessageId(
      conversation.botId,
      botMessageId,
    );
    const message = canonicalMessageId === undefined
      ? undefined
      : this.#messages.getPrivateMessage(canonicalMessageId);
    if (
      message === undefined ||
      message.conversation.accountId !== conversation.accountId ||
      message.conversation.botId !== conversation.botId
    ) {
      return undefined;
    }
    return message;
  }

  /**
   * Returns the reply interface the account's client shows in its private chat with the bot: the
   * one the latest message that set it asked for, unless a later message removed it or that
   * message was deleted.
   */
  getPrivateChatReplyInterface(
    { accountId, botId }: PrivateConversationKey,
  ): GetPrivateChatReplyInterfaceResult {
    if (this.#accounts.getById(accountId) === undefined) {
      return { found: false, reason: 'account_not_found' };
    }
    if (this.#bots.getById(botId) === undefined) {
      return { found: false, reason: 'bot_not_found' };
    }
    const shownReplyInterface = this.#findShownReplyInterface({ accountId, botId });
    return shownReplyInterface === undefined
      ? { found: true }
      : { found: true, shownReplyInterface };
  }

  /**
   * Presses a button of the reply keyboard the account's client shows, which, as on Telegram,
   * sends the button's text to the bot as the account's message. The keyboard stays shown, even a
   * one-time keyboard, which Telegram clients only hide until the user shows it again.
   */
  pressReplyKeyboardButton(input: PressReplyKeyboardButtonInput): PressReplyKeyboardButtonResult {
    if (this.#accounts.getById(input.fromAccountId) === undefined) {
      return { sent: false, reason: 'account_not_found' };
    }
    if (this.#bots.getById(input.chat.botId) === undefined) {
      return { sent: false, reason: 'bot_not_found' };
    }
    const replyInterface = this.#findShownReplyInterface({
      accountId: input.fromAccountId,
      botId: input.chat.botId,
    })?.replyInterface;
    if (replyInterface?.kind !== 'reply_keyboard' || !hasButton(replyInterface, input.text)) {
      return { sent: false, reason: 'reply_keyboard_button_not_found' };
    }

    return this.sendAccountMessage({
      fromAccountId: input.fromAccountId,
      to: input.chat,
      content: { kind: 'text', text: input.text },
    });
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
    | { readonly resolved: true; readonly repliedMessage?: PrivateMessage }
    | { readonly resolved: false } {
    if (replyTo === undefined) {
      return { resolved: true };
    }
    const repliedMessage = this.getPrivateMessageByBotMessageId(
      conversation,
      replyTo.botMessageId,
    );
    if (repliedMessage !== undefined) {
      return { resolved: true, repliedMessage };
    }
    return replyTo.allowSendingWithoutReply ? { resolved: true } : { resolved: false };
  }

  #findShownReplyInterface(conversation: PrivateConversationKey): ShownReplyInterface | undefined {
    const messageId = this.#privateConversations.getReplyInterfaceMessageId(conversation);
    if (messageId === undefined) {
      return undefined;
    }
    const message = this.#messages.getPrivateMessage(messageId);
    if (message?.replyInterface === undefined) {
      throw new Error(`Reply interface message ${messageId} has no stored reply interface`);
    }
    return { message, replyInterface: message.replyInterface };
  }

  /** Resolves the bot message an edit targets, which only the bot that sent it can edit. */
  #resolveEditableBotMessage(
    { fromBotId, chat, botMessageId }: EditBotMessageTarget,
  ):
    | { readonly resolved: true; readonly message: PrivateMessage }
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
    const message = this.getPrivateMessageByBotMessageId(conversation, botMessageId);
    if (message === undefined) {
      return { resolved: false, reason: 'message_not_found' };
    }
    if (message.authorRole !== 'bot') {
      return { resolved: false, reason: 'message_not_editable' };
    }
    return { resolved: true, message };
  }

  /**
   * Applies a bot's replacement of its message's content with the given keyboard; only changed
   * content dates the edit.
   */
  #editBotMessageContent<FailureReason extends string>(
    message: PrivateMessage,
    replacement: ContentReplacement<FailureReason>,
    inlineKeyboard: InlineKeyboard | undefined,
  ):
    | PrivateMessageEditResult<FailureReason | 'callback_data_invalid' | 'message_not_modified'>
    | ({ readonly edited: false } & TextInvalidFailure) {
    if (!replacement.replaced) {
      return { edited: false, ...replacement.failure };
    }
    return this.#editBotMessage(message, {
      content: replacement.content,
      inlineKeyboard,
      contentEditedAtUnixSeconds: isSameMessageContent(replacement.content, message.content)
        ? message.contentEditedAtUnixSeconds
        : this.#currentUnixTimeSeconds(),
    });
  }

  /**
   * Validates, stores, and publishes a bot's edit of its message, which must change the message.
   */
  #editBotMessage(
    message: PrivateMessage,
    edit: {
      readonly content: MessageContent;
      readonly inlineKeyboard: InlineKeyboard | undefined;
      readonly contentEditedAtUnixSeconds: number | undefined;
    },
  ): PrivateMessageEditResult<'callback_data_invalid' | 'message_not_modified'> {
    const editFailure = checkBotMessageEdit(message, edit);
    if (editFailure !== undefined) {
      return { edited: false, reason: editFailure };
    }

    const editedMessage = this.#messages.editPrivateMessage(message.id, edit);
    this.#events.publish({ type: 'message_edited', message: editedMessage });
    return { edited: true, message: editedMessage };
  }

  /** A text mention may name any user of the session. */
  get #textFixingContext() {
    return {
      isMentionableUser: (userId: number) =>
        this.#accounts.getById(userId) !== undefined || this.#bots.getById(userId) !== undefined,
    };
  }

  /**
   * Normalizes the text or caption of new content, with the entities its sender specified, as
   * Telegram does, and checks its length.
   */
  #normalizeContent(
    content: OutgoingMessageContent,
    sender: PrivateConversationRole,
  ): OutgoingContentNormalization {
    return normalizeOutgoingContent(content, sender, this.#textFixingContext);
  }

  /**
   * Stores normalized content written by one participant of an existing private conversation with
   * its upload, numbers it in both participants' message boxes, applies its change of the
   * account's reply interface, and publishes its creation.
   */
  #storePrivateMessage(
    {
      account,
      bot,
      authorRole,
      content,
      replyToMessageId,
      inlineKeyboard,
      replyInterfaceMarkup,
      isContentProtected,
    }: {
      readonly account: VirtualAccount;
      readonly bot: VirtualBot;
      readonly authorRole: PrivateConversationRole;
      readonly content: NormalizedOutgoingContent;
      readonly replyToMessageId?: CanonicalMessageId;
      readonly inlineKeyboard?: InlineKeyboard;
      readonly replyInterfaceMarkup?: ReplyInterfaceMarkup;
      readonly isContentProtected?: boolean;
    },
  ): PrivateMessage {
    const conversation: PrivateConversationKey = {
      accountId: account.profile.id,
      botId: bot.profile.id,
    };
    const storedMessage = this.#messages.addPrivateMessage({
      conversation,
      authorRole,
      sentAtUnixSeconds: this.#currentUnixTimeSeconds(),
      content: storeOutgoingContent(content, this.#files),
      replyToMessageId,
      inlineKeyboard,
      replyInterface: replyInterfaceMarkup?.kind === 'reply_keyboard_removal'
        ? undefined
        : replyInterfaceMarkup,
      isContentProtected,
    });
    // Telegram numbers a private message in each participant's message box. Only the bot's
    // numbering is projected today; the account's keeps the stored model faithful to Telegram.
    this.#messageBoxes.assignMessageId(account.profile.id, storedMessage.id);
    this.#messageBoxes.assignMessageId(bot.profile.id, storedMessage.id);
    // As TDLib does for a private chat: a keyboard or forced reply replaces what the client shows,
    // and a removal clears it.
    if (replyInterfaceMarkup !== undefined) {
      this.#privateConversations.setReplyInterfaceMessageId(
        conversation,
        replyInterfaceMarkup.kind === 'reply_keyboard_removal' ? undefined : storedMessage.id,
      );
    }
    this.#events.publish({ type: 'message_created', message: storedMessage });

    return storedMessage;
  }
}

function hasButton(replyKeyboard: ReplyKeyboard, text: string): boolean {
  return replyKeyboard.rows.some((row) => row.some((button) => button.text === text));
}
