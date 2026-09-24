import type { ChatDomainEvent } from '../types/chat_domain_event.ts';
import type { ChatMembership } from '../types/chat_membership.ts';
import type { InlineKeyboard } from '../types/inline_keyboard.ts';
import type { VirtualAccount } from '../types/virtual_account.ts';
import type { VirtualBot } from '../types/virtual_bot.ts';
import type { ChatAction, SharedChat, Supergroup } from '../types/virtual_chat.ts';
import {
  type CanonicalMessageId,
  type SupergroupMessageAuthor,
  type SupergroupTextMessage,
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

export interface SendSupergroupAccountMessageInput {
  readonly fromAccountId: number;
  readonly chatId: number;
  readonly text: string;
  /** The supergroup's ID of the message to reply to; omitted for no reply. */
  readonly replyToMessageId?: number;
}

export type SendSupergroupAccountMessageFailureReason =
  | 'account_not_found'
  | 'chat_not_found'
  | 'not_a_member'
  | 'message_text_empty'
  | 'message_text_too_long'
  | 'reply_message_not_found';

export type SendSupergroupAccountMessageResult =
  | { readonly sent: true; readonly message: SupergroupTextMessage }
  | (
    & { readonly sent: false }
    & ({ readonly reason: SendSupergroupAccountMessageFailureReason } | TextInvalidFailure)
  );

/** The message of the supergroup that a bot's message replies to. */
export interface SupergroupBotMessageReplyTarget {
  /** The supergroup's ID of the message. */
  readonly messageId: number;
  /** Sends the message as no reply, rather than failing, when the target is not found. */
  readonly allowSendingWithoutReply: boolean;
}

export interface SendSupergroupBotMessageInput {
  readonly fromBotId: number;
  readonly chatId: number;
  readonly text: string;
  /** Formatting the bot specified, which Telegram validates and normalizes; omitted for none. */
  readonly entities?: readonly TextEntity[];
  /** Omitted when the message has no inline keyboard. */
  readonly inlineKeyboard?: InlineKeyboard;
  /** Omitted for a message that replies to none. */
  readonly replyTo?: SupergroupBotMessageReplyTarget;
  /** Protects the message from forwarding and saving; omitted for an unprotected message. */
  readonly isContentProtected?: boolean;
}

export type SendSupergroupBotMessageFailureReason =
  | 'bot_not_found'
  | 'message_text_empty'
  | 'chat_not_found'
  | 'reply_message_not_found'
  | 'message_text_too_long'
  | 'callback_data_invalid';

export type SendSupergroupBotMessageResult =
  | { readonly sent: true; readonly message: SupergroupTextMessage }
  | (
    & { readonly sent: false }
    & ({ readonly reason: SendSupergroupBotMessageFailureReason } | TextInvalidFailure)
  );

interface EditSupergroupBotMessageTarget {
  readonly fromBotId: number;
  readonly chatId: number;
  /** The supergroup's ID of the message. */
  readonly messageId: number;
}

export interface EditSupergroupBotMessageTextInput extends EditSupergroupBotMessageTarget {
  readonly text: string;
  /** Formatting the bot specified, which Telegram validates and normalizes; omitted for none. */
  readonly entities?: readonly TextEntity[];
  /** The keyboard the edited message shows; omitting it removes the message's keyboard. */
  readonly inlineKeyboard?: InlineKeyboard;
}

export interface EditSupergroupBotMessageInlineKeyboardInput
  extends EditSupergroupBotMessageTarget {
  /** The keyboard the edited message shows; omitting it removes the message's keyboard. */
  readonly inlineKeyboard?: InlineKeyboard;
}

export type EditSupergroupBotMessageInlineKeyboardFailureReason =
  | 'bot_not_found'
  | 'chat_not_found'
  | 'message_not_found'
  | 'message_not_editable'
  | 'callback_data_invalid'
  | 'message_not_modified';

export type EditSupergroupBotMessageTextFailureReason =
  | EditSupergroupBotMessageInlineKeyboardFailureReason
  | 'message_text_empty'
  | 'message_text_too_long';

export type SupergroupMessageEditResult<FailureReason extends string> =
  | { readonly edited: true; readonly message: SupergroupTextMessage }
  | { readonly edited: false; readonly reason: FailureReason };

export type EditSupergroupBotMessageTextResult =
  | SupergroupMessageEditResult<EditSupergroupBotMessageTextFailureReason>
  | ({ readonly edited: false } & TextInvalidFailure);

export interface EditSupergroupAccountMessageInput {
  readonly fromAccountId: number;
  readonly chatId: number;
  /** The supergroup's ID of the message. */
  readonly messageId: number;
  readonly text: string;
}

export type EditSupergroupAccountMessageFailureReason =
  | 'account_not_found'
  | 'chat_not_found'
  | 'not_a_member'
  | 'message_not_found'
  | 'message_not_editable'
  | 'message_text_empty'
  | 'message_text_too_long'
  | 'message_not_modified';

export type EditSupergroupAccountMessageResult =
  | SupergroupMessageEditResult<EditSupergroupAccountMessageFailureReason>
  | ({ readonly edited: false } & TextInvalidFailure);

export interface DeleteSupergroupMessagesByBotInput {
  readonly fromBotId: number;
  readonly chatId: number;
  /** The supergroup's IDs of the messages. */
  readonly messageIds: readonly number[];
}

export type DeleteSupergroupMessagesByBotResult =
  | {
    readonly deleted: true;
    /** How many of the IDs identified a message of the supergroup, each deleted once. */
    readonly deletedMessageCount: number;
  }
  | {
    readonly deleted: false;
    readonly reason: 'bot_not_found' | 'chat_not_found' | 'message_not_deletable';
  };

export interface SendSupergroupBotChatActionInput {
  readonly fromBotId: number;
  readonly chatId: number;
  readonly action: ChatAction;
}

export type SendSupergroupBotChatActionResult =
  | { readonly sent: true }
  | { readonly sent: false; readonly reason: 'bot_not_found' | 'chat_not_found' };

export interface GetSupergroupMessageHistoryInput {
  readonly accountId: number;
  readonly chatId: number;
}

export type GetSupergroupMessageHistoryResult =
  | { readonly found: true; readonly messages: readonly SupergroupTextMessage[] }
  | {
    readonly found: false;
    readonly reason: 'account_not_found' | 'chat_not_found' | 'not_a_member';
  };

interface AccountLookup {
  getById(accountId: number): VirtualAccount | undefined;
}

interface BotLookup {
  getById(botId: number): VirtualBot | undefined;
}

interface SupergroupMembershipLookup {
  getSharedChat(chatId: number): SharedChat | undefined;
  getChatMembership(chatId: number, identityId: number): ChatMembership | undefined;
}

interface SupergroupMessageStore {
  addSupergroupTextMessage(input: {
    readonly chatId: number;
    readonly author: SupergroupMessageAuthor;
    readonly sentAtUnixSeconds: number;
    readonly text: string;
    readonly entities: readonly TextEntity[];
    readonly replyToMessageId?: CanonicalMessageId;
    readonly inlineKeyboard?: InlineKeyboard;
    readonly isContentProtected?: boolean;
  }): SupergroupTextMessage;
  getSupergroupTextMessage(messageId: CanonicalMessageId): SupergroupTextMessage | undefined;
  editSupergroupTextMessage(messageId: CanonicalMessageId, edit: {
    readonly text: string;
    readonly entities: readonly TextEntity[];
    readonly inlineKeyboard: InlineKeyboard | undefined;
    readonly textEditedAtUnixSeconds: number | undefined;
  }): SupergroupTextMessage;
  deleteSupergroupTextMessage(messageId: CanonicalMessageId): void;
  getSupergroupMessages(chatId: number): readonly SupergroupTextMessage[];
}

interface MessageBoxStore {
  assignMessageId(ownerId: number, canonicalMessageId: CanonicalMessageId): number;
  getCanonicalMessageId(ownerId: number, messageId: number): CanonicalMessageId | undefined;
}

interface ChatDomainEventSink {
  publish(event: ChatDomainEvent): void;
}

interface SupergroupMessagingServiceDependencies {
  readonly accounts: AccountLookup;
  readonly bots: BotLookup;
  readonly sharedChats: SupergroupMembershipLookup;
  readonly messages: SupergroupMessageStore;
  readonly messageBoxes: MessageBoxStore;
  readonly events: ChatDomainEventSink;
  readonly currentUnixTimeSeconds: () => number;
}

/**
 * Carries out text exchanges among the members of a supergroup, accounts and bots alike, and
 * commits each accepted message: stored, numbered once in the supergroup's own message box, then
 * published. Only members write to a supergroup or read its messages.
 *
 * Bots attach inline keyboards, edit their own messages, and delete them; as on Telegram, a bot
 * that is no administrator cannot delete other members' messages. Accounts edit the text of their
 * own messages. Reply keyboards and forced replies, which Telegram shows to chosen members of a
 * group, are not supported.
 *
 * Results carry canonical messages; presenting them to an observer is left to the caller.
 */
export class SupergroupMessagingService {
  readonly #accounts: AccountLookup;
  readonly #bots: BotLookup;
  readonly #sharedChats: SupergroupMembershipLookup;
  readonly #messages: SupergroupMessageStore;
  readonly #messageBoxes: MessageBoxStore;
  readonly #events: ChatDomainEventSink;
  readonly #currentUnixTimeSeconds: () => number;

  constructor(
    { accounts, bots, sharedChats, messages, messageBoxes, events, currentUnixTimeSeconds }:
      SupergroupMessagingServiceDependencies,
  ) {
    this.#accounts = accounts;
    this.#bots = bots;
    this.#sharedChats = sharedChats;
    this.#messages = messages;
    this.#messageBoxes = messageBoxes;
    this.#events = events;
    this.#currentUnixTimeSeconds = currentUnixTimeSeconds;
  }

  /**
   * Sends text from an account to a supergroup it is a member of. As a Telegram client does, the
   * text is normalized, which marks bot commands.
   */
  sendAccountMessage(input: SendSupergroupAccountMessageInput): SendSupergroupAccountMessageResult {
    const memberResolution = this.#resolveAccountMember(input.fromAccountId, input.chatId);
    if (!memberResolution.resolved) {
      return { sent: false, reason: memberResolution.reason };
    }
    if (input.text.length === 0) {
      return { sent: false, reason: 'message_text_empty' };
    }
    const textNormalization = this.#normalizeText(input.text, []);
    if (!textNormalization.normalized) {
      return { sent: false, ...textNormalization.failure };
    }
    const repliedMessage = input.replyToMessageId === undefined
      ? undefined
      : this.getMessageByChatMessageId(input.chatId, input.replyToMessageId);
    if (input.replyToMessageId !== undefined && repliedMessage === undefined) {
      return { sent: false, reason: 'reply_message_not_found' };
    }

    return {
      sent: true,
      message: this.#storeMessage({
        chatId: input.chatId,
        author: { kind: 'account', accountId: input.fromAccountId },
        sentAtUnixSeconds: this.#currentUnixTimeSeconds(),
        ...textNormalization.formattedText,
        replyToMessageId: repliedMessage?.id,
      }),
    };
  }

  /**
   * Sends text from a bot to a supergroup it is a member of. A supergroup the bot is not a member
   * of is unknown to it, as on Telegram.
   *
   * Checks follow Telegram's order: the text is checked for emptiness before the chat is resolved,
   * and the replied message is looked up after it; the text is then normalized with its entities,
   * and the result is checked for length. Callback data is checked last.
   */
  sendBotMessage(input: SendSupergroupBotMessageInput): SendSupergroupBotMessageResult {
    if (this.#bots.getById(input.fromBotId) === undefined) {
      return { sent: false, reason: 'bot_not_found' };
    }
    if (input.text.length === 0) {
      return { sent: false, reason: 'message_text_empty' };
    }
    if (this.#findBotSupergroup(input.fromBotId, input.chatId) === undefined) {
      return { sent: false, reason: 'chat_not_found' };
    }
    const repliedMessage = input.replyTo === undefined
      ? undefined
      : this.getMessageByChatMessageId(input.chatId, input.replyTo.messageId);
    if (
      input.replyTo !== undefined && repliedMessage === undefined &&
      !input.replyTo.allowSendingWithoutReply
    ) {
      return { sent: false, reason: 'reply_message_not_found' };
    }
    const textNormalization = this.#normalizeText(input.text, input.entities ?? []);
    if (!textNormalization.normalized) {
      return { sent: false, ...textNormalization.failure };
    }
    if (input.inlineKeyboard !== undefined && !hasOnlyValidCallbackData(input.inlineKeyboard)) {
      return { sent: false, reason: 'callback_data_invalid' };
    }

    return {
      sent: true,
      message: this.#storeMessage({
        chatId: input.chatId,
        author: { kind: 'bot', botId: input.fromBotId },
        sentAtUnixSeconds: this.#currentUnixTimeSeconds(),
        ...textNormalization.formattedText,
        replyToMessageId: repliedMessage?.id,
        inlineKeyboard: input.inlineKeyboard,
        isContentProtected: input.isContentProtected,
      }),
    };
  }

  /**
   * Replaces the text, entities, and inline keyboard of a message the bot sent. Only changed text
   * or entities date the edit. As on Telegram, no bot receives an update for a bot's edit.
   */
  editBotMessageText(input: EditSupergroupBotMessageTextInput): EditSupergroupBotMessageTextResult {
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
      ...formattedText,
      inlineKeyboard: input.inlineKeyboard,
      textEditedAtUnixSeconds: isSameFormattedText(formattedText, message)
        ? message.textEditedAtUnixSeconds
        : this.#currentUnixTimeSeconds(),
    });
  }

  /** Replaces the inline keyboard of a message the bot sent, leaving its text as it is. */
  editBotMessageInlineKeyboard(
    input: EditSupergroupBotMessageInlineKeyboardInput,
  ): SupergroupMessageEditResult<EditSupergroupBotMessageInlineKeyboardFailureReason> {
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
   * Replaces the text of a message the account wrote to the supergroup, which the supergroup's
   * bots may receive as an `edited_message` update. As when sending, the text is normalized as a
   * Telegram client does.
   */
  editAccountMessage(input: EditSupergroupAccountMessageInput): EditSupergroupAccountMessageResult {
    const memberResolution = this.#resolveAccountMember(input.fromAccountId, input.chatId);
    if (!memberResolution.resolved) {
      return { edited: false, reason: memberResolution.reason };
    }
    const message = this.getMessageByChatMessageId(input.chatId, input.messageId);
    if (message === undefined) {
      return { edited: false, reason: 'message_not_found' };
    }
    if (message.author.kind !== 'account' || message.author.accountId !== input.fromAccountId) {
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

    const editedMessage = this.#messages.editSupergroupTextMessage(message.id, {
      ...formattedText,
      inlineKeyboard: message.inlineKeyboard,
      textEditedAtUnixSeconds: this.#currentUnixTimeSeconds(),
    });
    this.#events.publish({ type: 'message_edited', message: editedMessage });
    return { edited: true, message: editedMessage };
  }

  /**
   * Deletes messages the bot sent to a supergroup, for every member. IDs that identify no message
   * of the supergroup, including messages already deleted, are skipped. As on Telegram, a bot that
   * is no administrator cannot delete another member's message, and then deletes none.
   */
  deleteMessagesByBot(
    input: DeleteSupergroupMessagesByBotInput,
  ): DeleteSupergroupMessagesByBotResult {
    if (this.#bots.getById(input.fromBotId) === undefined) {
      return { deleted: false, reason: 'bot_not_found' };
    }
    if (this.#findBotSupergroup(input.fromBotId, input.chatId) === undefined) {
      return { deleted: false, reason: 'chat_not_found' };
    }

    const messages = new Map<CanonicalMessageId, SupergroupTextMessage>();
    for (const messageId of input.messageIds) {
      const message = this.getMessageByChatMessageId(input.chatId, messageId);
      if (message === undefined) {
        continue;
      }
      if (message.author.kind !== 'bot' || message.author.botId !== input.fromBotId) {
        return { deleted: false, reason: 'message_not_deletable' };
      }
      messages.set(message.id, message);
    }
    for (const messageId of messages.keys()) {
      this.#messages.deleteSupergroupTextMessage(messageId);
    }
    return { deleted: true, deletedMessageCount: messages.size };
  }

  /**
   * Shows a chat action, such as typing, from a bot to a supergroup it is a member of. The emulator
   * only checks that the bot may send it.
   */
  sendBotChatAction(
    { fromBotId, chatId }: SendSupergroupBotChatActionInput,
  ): SendSupergroupBotChatActionResult {
    if (this.#bots.getById(fromBotId) === undefined) {
      return { sent: false, reason: 'bot_not_found' };
    }
    return this.#findBotSupergroup(fromBotId, chatId) === undefined
      ? { sent: false, reason: 'chat_not_found' }
      : { sent: true };
  }

  /** Returns the supergroup's messages, oldest first, to an account that is a member of it. */
  getMessageHistory(
    { accountId, chatId }: GetSupergroupMessageHistoryInput,
  ): GetSupergroupMessageHistoryResult {
    const memberResolution = this.#resolveAccountMember(accountId, chatId);
    if (!memberResolution.resolved) {
      return { found: false, reason: memberResolution.reason };
    }
    return { found: true, messages: this.#messages.getSupergroupMessages(chatId) };
  }

  /** Finds a message of a supergroup by the ID the supergroup's message box gave it. */
  getMessageByChatMessageId(
    chatId: number,
    messageId: number,
  ): SupergroupTextMessage | undefined {
    const canonicalMessageId = this.#messageBoxes.getCanonicalMessageId(chatId, messageId);
    return canonicalMessageId === undefined
      ? undefined
      : this.#messages.getSupergroupTextMessage(canonicalMessageId);
  }

  #resolveAccountMember(
    accountId: number,
    chatId: number,
  ):
    | { readonly resolved: true; readonly supergroup: Supergroup }
    | {
      readonly resolved: false;
      readonly reason: 'account_not_found' | 'chat_not_found' | 'not_a_member';
    } {
    if (this.#accounts.getById(accountId) === undefined) {
      return { resolved: false, reason: 'account_not_found' };
    }
    const chat = this.#sharedChats.getSharedChat(chatId);
    if (chat?.kind !== 'supergroup') {
      return { resolved: false, reason: 'chat_not_found' };
    }
    if (this.#sharedChats.getChatMembership(chatId, accountId) === undefined) {
      return { resolved: false, reason: 'not_a_member' };
    }
    return { resolved: true, supergroup: chat };
  }

  /** Returns the supergroup if the bot is a member of it; otherwise the bot cannot know it. */
  #findBotSupergroup(botId: number, chatId: number): Supergroup | undefined {
    const chat = this.#sharedChats.getSharedChat(chatId);
    return chat?.kind === 'supergroup' &&
        this.#sharedChats.getChatMembership(chatId, botId) !== undefined
      ? chat
      : undefined;
  }

  /** Resolves the bot message an edit targets, which only the bot that sent it can edit. */
  #resolveEditableBotMessage(
    { fromBotId, chatId, messageId }: EditSupergroupBotMessageTarget,
  ):
    | { readonly resolved: true; readonly message: SupergroupTextMessage }
    | {
      readonly resolved: false;
      readonly reason: 'chat_not_found' | 'message_not_found' | 'message_not_editable';
    } {
    if (this.#findBotSupergroup(fromBotId, chatId) === undefined) {
      return { resolved: false, reason: 'chat_not_found' };
    }
    const message = this.getMessageByChatMessageId(chatId, messageId);
    if (message === undefined) {
      return { resolved: false, reason: 'message_not_found' };
    }
    if (message.author.kind !== 'bot' || message.author.botId !== fromBotId) {
      return { resolved: false, reason: 'message_not_editable' };
    }
    return { resolved: true, message };
  }

  /** Validates, stores, and publishes a bot's edit of its message, which must change it. */
  #editBotMessage(
    message: SupergroupTextMessage,
    edit: {
      readonly text: string;
      readonly entities: readonly TextEntity[];
      readonly inlineKeyboard: InlineKeyboard | undefined;
      readonly textEditedAtUnixSeconds: number | undefined;
    },
  ): SupergroupMessageEditResult<'callback_data_invalid' | 'message_not_modified'> {
    const editFailure = checkBotMessageEdit(message, edit);
    if (editFailure !== undefined) {
      return { edited: false, reason: editFailure };
    }

    const editedMessage = this.#messages.editSupergroupTextMessage(message.id, edit);
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

  /** Stores a normalized message, numbers it in the supergroup's box, and publishes it. */
  #storeMessage(
    input: Parameters<SupergroupMessageStore['addSupergroupTextMessage']>[0],
  ): SupergroupTextMessage {
    const storedMessage = this.#messages.addSupergroupTextMessage(input);
    this.#messageBoxes.assignMessageId(input.chatId, storedMessage.id);
    this.#events.publish({ type: 'message_created', message: storedMessage });
    return storedMessage;
  }
}
