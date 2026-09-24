import type { FormattedText } from '../text_entities/formatted_text.ts';
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
import {
  type CanonicalMessageId,
  type PrivateTextMessage,
  type TextEntity,
} from '../types/virtual_message.ts';
import {
  checkBotMessageEdit,
  hasOnlyValidCallbackData,
  isSameFormattedText,
  type MessageTextNormalization,
  normalizeMessageText,
  type TextInvalidFailure,
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
  readonly text: string;
  /** The ID, in the bot's message box, of the chat's message to reply to; omitted for no reply. */
  readonly replyToBotMessageId?: number;
}

export type SendAccountMessageFailureReason =
  | 'account_not_found'
  | 'bot_not_found'
  | 'bot_blocked'
  | 'message_text_empty'
  | 'message_text_too_long'
  | 'reply_message_not_found';

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

export type SendBotMessageInput = BotMessageReplyMarkup & {
  readonly fromBotId: number;
  readonly to: BotPrivateChat;
  readonly text: string;
  /** Formatting the bot specified, which Telegram validates and normalizes; omitted for none. */
  readonly entities?: readonly TextEntity[];
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
  | 'message_text_too_long'
  | 'callback_data_invalid'
  | 'bot_blocked';

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

export type PrivateMessageEditResult<FailureReason extends string> =
  | {
    readonly edited: true;
    readonly message: PrivateTextMessage;
  }
  | {
    readonly edited: false;
    readonly reason: FailureReason;
  };

export type EditBotMessageTextResult =
  | PrivateMessageEditResult<EditBotMessageTextFailureReason>
  | ({ readonly edited: false } & TextInvalidFailure);

export interface EditAccountMessageInput {
  readonly fromAccountId: number;
  readonly chat: {
    readonly type: 'private';
    readonly botId: number;
  };
  /** The message's ID in the bot's message box. */
  readonly botMessageId: number;
  readonly text: string;
}

export type EditAccountMessageFailureReason =
  | 'account_not_found'
  | 'bot_not_found'
  | 'message_not_found'
  | 'message_not_editable'
  | 'message_text_empty'
  | 'message_text_too_long'
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
  readonly message: PrivateTextMessage;
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
  getReplyInterfaceMessageId(key: PrivateConversationKey): CanonicalMessageId | undefined;
  setReplyInterfaceMessageId(
    key: PrivateConversationKey,
    messageId: CanonicalMessageId | undefined,
  ): void;
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
    readonly replyInterface?: ReplyInterface;
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
  readonly messageBoxes: MessageBoxStore;
  readonly blockedUsers: BlockedUserLookup;
  readonly events: ChatDomainEventSink;
  readonly currentUnixTimeSeconds: () => number;
}

/**
 * Carries out text exchanges between an account and a bot in their private conversation, and
 * commits each accepted message: stored, numbered for both participants, then published. Bots can
 * attach inline keyboards to their messages, edit them afterward, and delete messages of their
 * chats. A bot's message can also change the reply interface the account's client shows, such as
 * a reply keyboard whose buttons the account presses. An account edits the text of its messages.
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
    if (input.text.length === 0) {
      return { sent: false, reason: 'message_text_empty' };
    }
    const textNormalization = this.#normalizeText(input.text, []);
    if (!textNormalization.normalized) {
      return { sent: false, ...textNormalization.failure };
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
        formattedText: textNormalization.formattedText,
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
   * entities, and the result is checked for length. Callback data is checked next. A block by the
   * account is checked last, as Telegram's servers refuse the message only after the Bot API
   * server has checked everything it can.
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
    const textNormalization = this.#normalizeText(input.text, input.entities ?? []);
    if (!textNormalization.normalized) {
      return { sent: false, ...textNormalization.failure };
    }
    if (input.inlineKeyboard !== undefined && !hasOnlyValidCallbackData(input.inlineKeyboard)) {
      return { sent: false, reason: 'callback_data_invalid' };
    }
    if (this.#blockedUsers.isBlocked(account.profile.id, bot.profile.id)) {
      return { sent: false, reason: 'bot_blocked' };
    }

    return {
      sent: true,
      message: this.#storePrivateTextMessage({
        account,
        bot,
        authorRole: 'bot',
        formattedText: textNormalization.formattedText,
        replyToMessageId: replyResolution.repliedMessage?.id,
        inlineKeyboard: input.inlineKeyboard,
        replyInterfaceMarkup: input.replyInterfaceMarkup,
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
    const textNormalization = this.#normalizeText(input.text, input.entities ?? []);
    if (!textNormalization.normalized) {
      return { edited: false, ...textNormalization.failure };
    }
    const { formattedText } = textNormalization;

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
      text: message.text,
      entities: message.entities,
      inlineKeyboard: input.inlineKeyboard,
      textEditedAtUnixSeconds: message.textEditedAtUnixSeconds,
    });
  }

  /**
   * Replaces the text of a message the account wrote to the bot, which, unlike a bot's own edit,
   * sends the bot an `edited_message` update. As when sending, the text is normalized as a
   * Telegram client does, which marks bot commands again.
   */
  editAccountMessage(input: EditAccountMessageInput): EditAccountMessageResult {
    if (this.#accounts.getById(input.fromAccountId) === undefined) {
      return { edited: false, reason: 'account_not_found' };
    }
    if (this.#bots.getById(input.chat.botId) === undefined) {
      return { edited: false, reason: 'bot_not_found' };
    }
    const message = this.getPrivateTextMessageByBotMessageId(
      { accountId: input.fromAccountId, botId: input.chat.botId },
      input.botMessageId,
    );
    if (message === undefined) {
      return { edited: false, reason: 'message_not_found' };
    }
    if (message.authorRole !== 'account') {
      return { edited: false, reason: 'message_not_editable' };
    }
    if (input.text.length === 0) {
      return { edited: false, reason: 'message_text_empty' };
    }
    const textNormalization = this.#normalizeText(input.text, []);
    if (!textNormalization.normalized) {
      return { edited: false, ...textNormalization.failure };
    }
    const { formattedText } = textNormalization;
    if (isSameFormattedText(formattedText, message)) {
      return { edited: false, reason: 'message_not_modified' };
    }

    const editedMessage = this.#messages.editPrivateTextMessage(message.id, {
      text: formattedText.text,
      entities: formattedText.entities,
      inlineKeyboard: message.inlineKeyboard,
      textEditedAtUnixSeconds: this.#currentUnixTimeSeconds(),
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
      const message = this.getPrivateTextMessageByBotMessageId(conversation, botMessageId);
      if (message === undefined) {
        continue;
      }
      // As TDLib does, deleting the message whose reply interface the client shows removes it.
      if (this.#privateConversations.getReplyInterfaceMessageId(conversation) === message.id) {
        this.#privateConversations.setReplyInterfaceMessageId(conversation, undefined);
      }
      this.#messages.deletePrivateTextMessage(message.id);
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
  getPrivateTextMessageByBotMessageId(
    conversation: PrivateConversationKey,
    botMessageId: number,
  ): PrivateTextMessage | undefined {
    const canonicalMessageId = this.#messageBoxes.getCanonicalMessageId(
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
      text: input.text,
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

  #findShownReplyInterface(conversation: PrivateConversationKey): ShownReplyInterface | undefined {
    const messageId = this.#privateConversations.getReplyInterfaceMessageId(conversation);
    if (messageId === undefined) {
      return undefined;
    }
    const message = this.#messages.getPrivateTextMessage(messageId);
    if (message?.replyInterface === undefined) {
      throw new Error(`Reply interface message ${messageId} has no stored reply interface`);
    }
    return { message, replyInterface: message.replyInterface };
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

  /**
   * Validates, stores, and publishes a bot's edit of its message, which must change the message.
   */
  #editBotMessage(
    message: PrivateTextMessage,
    edit: {
      readonly text: string;
      readonly entities: readonly TextEntity[];
      readonly inlineKeyboard: InlineKeyboard | undefined;
      readonly textEditedAtUnixSeconds: number | undefined;
    },
  ): PrivateMessageEditResult<'callback_data_invalid' | 'message_not_modified'> {
    const editFailure = checkBotMessageEdit(message, edit);
    if (editFailure !== undefined) {
      return { edited: false, reason: editFailure };
    }

    const editedMessage = this.#messages.editPrivateTextMessage(message.id, edit);
    this.#events.publish({ type: 'message_edited', message: editedMessage });
    return { edited: true, message: editedMessage };
  }

  /**
   * Normalizes text and the entities its sender specified as Telegram does, and checks its length.
   * A text mention may name any user of the session.
   */
  #normalizeText(text: string, entities: readonly TextEntity[]): MessageTextNormalization {
    return normalizeMessageText(text, entities, {
      isMentionableUser: (userId) =>
        this.#accounts.getById(userId) !== undefined || this.#bots.getById(userId) !== undefined,
    });
  }

  /**
   * Stores normalized text written by one participant of an existing private conversation, numbers
   * it in both participants' message boxes, applies its change of the account's reply interface,
   * and publishes its creation.
   */
  #storePrivateTextMessage(
    {
      account,
      bot,
      authorRole,
      formattedText,
      replyToMessageId,
      inlineKeyboard,
      replyInterfaceMarkup,
      isContentProtected,
    }: {
      readonly account: VirtualAccount;
      readonly bot: VirtualBot;
      readonly authorRole: PrivateConversationRole;
      readonly formattedText: FormattedText;
      readonly replyToMessageId?: CanonicalMessageId;
      readonly inlineKeyboard?: InlineKeyboard;
      readonly replyInterfaceMarkup?: ReplyInterfaceMarkup;
      readonly isContentProtected?: boolean;
    },
  ): PrivateTextMessage {
    const conversation: PrivateConversationKey = {
      accountId: account.profile.id,
      botId: bot.profile.id,
    };
    const storedMessage = this.#messages.addPrivateTextMessage({
      conversation,
      authorRole,
      sentAtUnixSeconds: this.#currentUnixTimeSeconds(),
      text: formattedText.text,
      entities: formattedText.entities,
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
