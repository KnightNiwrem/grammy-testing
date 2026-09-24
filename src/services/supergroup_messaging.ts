import type { ChatDomainEvent } from '../types/chat_domain_event.ts';
import {
  type ChatMembership,
  type FormerChatMemberStatus,
  type FormerSupergroupMemberFailureReason,
  getSupergroupNonMemberFailureReason,
} from '../types/chat_membership.ts';
import type { InlineKeyboard } from '../types/inline_keyboard.ts';
import type { VirtualAccount } from '../types/virtual_account.ts';
import type { VirtualBot } from '../types/virtual_bot.ts';
import type { ChatAction, SharedChat, Supergroup } from '../types/virtual_chat.ts';
import {
  type CanonicalMessageId,
  isSupergroupContentMessage,
  type MembershipServiceContent,
  type MessageContent,
  type SupergroupContentMessage,
  type SupergroupMessage,
  type SupergroupMessageAuthor,
  type SupergroupMessageContent,
  type TextEntity,
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

/**
 * Why a bot cannot act in a supergroup: one it never joined is unknown to it, as on Telegram,
 * whereas one it left or was removed from turns it away.
 */
type SupergroupBotAccessFailureReason =
  | 'chat_not_found'
  | FormerSupergroupMemberFailureReason;

export interface SendSupergroupAccountMessageInput {
  readonly fromAccountId: number;
  readonly chatId: number;
  readonly content: AccountMessageContent;
  /** The supergroup's ID of the message to reply to; omitted for no reply. */
  readonly replyToMessageId?: number;
}

export type SendSupergroupAccountMessageFailureReason =
  | 'account_not_found'
  | 'chat_not_found'
  | 'not_a_member'
  | 'message_text_empty'
  | 'reply_message_not_found';

export type SendSupergroupAccountMessageResult =
  | { readonly sent: true; readonly message: SupergroupMessage }
  | (
    & { readonly sent: false }
    & ({ readonly reason: SendSupergroupAccountMessageFailureReason } | ContentNormalizationFailure)
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
  readonly content: OutgoingMessageContent;
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
  | SupergroupBotAccessFailureReason
  | 'reply_message_not_found'
  | 'callback_data_invalid';

export type SendSupergroupBotMessageResult =
  | { readonly sent: true; readonly message: SupergroupMessage }
  | (
    & { readonly sent: false }
    & ({ readonly reason: SendSupergroupBotMessageFailureReason } | ContentNormalizationFailure)
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

export type EditSupergroupBotMessageCaptionInput =
  & EditSupergroupBotMessageTarget
  & SpecifiedCaption
  & {
    /** Whether a photo shows its caption above itself; a document ignores it. */
    readonly showsCaptionAboveMedia: boolean;
    /** The keyboard the edited message shows; omitting it removes the message's keyboard. */
    readonly inlineKeyboard?: InlineKeyboard;
  };

export interface EditSupergroupBotMessageInlineKeyboardInput
  extends EditSupergroupBotMessageTarget {
  /** The keyboard the edited message shows; omitting it removes the message's keyboard. */
  readonly inlineKeyboard?: InlineKeyboard;
}

export type EditSupergroupBotMessageInlineKeyboardFailureReason =
  | 'bot_not_found'
  | SupergroupBotAccessFailureReason
  | 'message_not_found'
  | 'message_not_editable'
  | 'callback_data_invalid'
  | 'message_not_modified';

export type EditSupergroupBotMessageTextFailureReason =
  | EditSupergroupBotMessageInlineKeyboardFailureReason
  | 'message_text_empty'
  | 'message_has_no_text'
  | 'message_text_too_long';

export type EditSupergroupBotMessageCaptionFailureReason =
  | EditSupergroupBotMessageInlineKeyboardFailureReason
  | 'message_has_no_caption'
  | 'caption_too_long';

export type SupergroupMessageEditResult<FailureReason extends string> =
  | { readonly edited: true; readonly message: SupergroupMessage }
  | { readonly edited: false; readonly reason: FailureReason };

export type EditSupergroupBotMessageTextResult =
  | SupergroupMessageEditResult<EditSupergroupBotMessageTextFailureReason>
  | ({ readonly edited: false } & TextInvalidFailure);

export type EditSupergroupBotMessageCaptionResult =
  | SupergroupMessageEditResult<EditSupergroupBotMessageCaptionFailureReason>
  | ({ readonly edited: false } & TextInvalidFailure);

export interface EditSupergroupAccountMessageInput {
  readonly fromAccountId: number;
  readonly chatId: number;
  /** The supergroup's ID of the message. */
  readonly messageId: number;
  readonly edit: AccountMessageEdit;
}

export type EditSupergroupAccountMessageFailureReason =
  | 'account_not_found'
  | 'chat_not_found'
  | 'not_a_member'
  | 'message_not_found'
  | 'message_not_editable'
  | 'message_text_empty'
  | 'message_has_no_text'
  | 'message_text_too_long'
  | 'message_has_no_caption'
  | 'caption_too_long'
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
    readonly reason: 'bot_not_found' | SupergroupBotAccessFailureReason | 'message_not_deletable';
  };

export interface SendSupergroupBotChatActionInput {
  readonly fromBotId: number;
  readonly chatId: number;
  readonly action: ChatAction;
}

export type SendSupergroupBotChatActionResult =
  | { readonly sent: true }
  | { readonly sent: false; readonly reason: 'bot_not_found' | SupergroupBotAccessFailureReason };

export interface RecordSupergroupMembershipChangeInput {
  readonly chatId: number;
  /** The member who made the change: the one who added members, left, or removed a member. */
  readonly author: SupergroupMessageAuthor;
  readonly content: MembershipServiceContent;
  readonly changedAtUnixSeconds: number;
}

export interface GetSupergroupMessageHistoryInput {
  readonly accountId: number;
  readonly chatId: number;
}

export type GetSupergroupMessageHistoryResult =
  | { readonly found: true; readonly messages: readonly SupergroupMessage[] }
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
  getFormerMemberStatus(chatId: number, identityId: number): FormerChatMemberStatus | undefined;
}

/** A message to store, before the store gives it an identity. */
interface NewSupergroupMessage {
  readonly chatId: number;
  readonly author: SupergroupMessageAuthor;
  readonly sentAtUnixSeconds: number;
  readonly content: SupergroupMessageContent;
  readonly replyToMessageId?: CanonicalMessageId;
  readonly inlineKeyboard?: InlineKeyboard;
  readonly isContentProtected?: boolean;
}

interface SupergroupMessageStore {
  addSupergroupMessage(input: NewSupergroupMessage): SupergroupMessage;
  getSupergroupMessage(messageId: CanonicalMessageId): SupergroupMessage | undefined;
  editSupergroupMessage(messageId: CanonicalMessageId, edit: {
    readonly content: MessageContent;
    readonly inlineKeyboard: InlineKeyboard | undefined;
    readonly contentEditedAtUnixSeconds: number | undefined;
  }): SupergroupMessage;
  deleteSupergroupMessage(messageId: CanonicalMessageId): void;
  getSupergroupMessages(chatId: number): readonly SupergroupMessage[];
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
  readonly files: FileUploadStore;
  readonly messageBoxes: MessageBoxStore;
  readonly events: ChatDomainEventSink;
  readonly currentUnixTimeSeconds: () => number;
}

/**
 * Carries out exchanges of text, photos, and documents among the members of a supergroup,
 * accounts and bots alike, and commits each accepted message: its upload stored, the message
 * stored, numbered once in the supergroup's own message box, then published. Only members write to
 * a supergroup or read its messages.
 *
 * Bots attach inline keyboards, edit their own messages, and delete them; as on Telegram, a bot
 * that is no administrator cannot delete other members' messages. Accounts edit the text or
 * caption of their own messages. Reply keyboards and forced replies, which Telegram shows to chosen members of a
 * group, are not supported.
 *
 * Results carry canonical messages; presenting them to an observer is left to the caller.
 */
export class SupergroupMessagingService {
  readonly #accounts: AccountLookup;
  readonly #bots: BotLookup;
  readonly #sharedChats: SupergroupMembershipLookup;
  readonly #messages: SupergroupMessageStore;
  readonly #files: FileUploadStore;
  readonly #messageBoxes: MessageBoxStore;
  readonly #events: ChatDomainEventSink;
  readonly #currentUnixTimeSeconds: () => number;

  constructor(
    { accounts, bots, sharedChats, messages, files, messageBoxes, events, currentUnixTimeSeconds }:
      SupergroupMessagingServiceDependencies,
  ) {
    this.#accounts = accounts;
    this.#bots = bots;
    this.#sharedChats = sharedChats;
    this.#messages = messages;
    this.#files = files;
    this.#messageBoxes = messageBoxes;
    this.#events = events;
    this.#currentUnixTimeSeconds = currentUnixTimeSeconds;
  }

  /**
   * Sends text, a photo, or a document from an account to a supergroup it is a member of. As a
   * Telegram client does, the text or caption is normalized, which marks bot commands.
   */
  sendAccountMessage(input: SendSupergroupAccountMessageInput): SendSupergroupAccountMessageResult {
    const memberResolution = this.#resolveAccountMember(input.fromAccountId, input.chatId);
    if (!memberResolution.resolved) {
      return { sent: false, reason: memberResolution.reason };
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
        content: contentNormalization.content,
        replyToMessageId: repliedMessage?.id,
      }),
    };
  }

  /**
   * Sends text, a photo, or a document from a bot to a supergroup it is a member of. A supergroup
   * the bot is not a member of is unknown to it, as on Telegram.
   *
   * Checks follow Telegram's order: text is checked for emptiness before the chat is resolved, and
   * the replied message is looked up after it; the text or caption is then normalized with its
   * entities, and the result is checked for length. Callback data is checked last.
   */
  sendBotMessage(input: SendSupergroupBotMessageInput): SendSupergroupBotMessageResult {
    if (this.#bots.getById(input.fromBotId) === undefined) {
      return { sent: false, reason: 'bot_not_found' };
    }
    if (input.content.kind === 'text' && input.content.text.length === 0) {
      return { sent: false, reason: 'message_text_empty' };
    }
    const accessFailure = this.#checkBotAccess(input.fromBotId, input.chatId);
    if (accessFailure !== undefined) {
      return { sent: false, reason: accessFailure };
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
    const contentNormalization = this.#normalizeContent(input.content, 'bot');
    if (!contentNormalization.normalized) {
      return { sent: false, ...contentNormalization.failure };
    }
    if (input.inlineKeyboard !== undefined && !hasOnlyValidCallbackData(input.inlineKeyboard)) {
      return { sent: false, reason: 'callback_data_invalid' };
    }

    return {
      sent: true,
      message: this.#storeMessage({
        chatId: input.chatId,
        author: { kind: 'bot', botId: input.fromBotId },
        content: contentNormalization.content,
        replyToMessageId: repliedMessage?.id,
        inlineKeyboard: input.inlineKeyboard,
        isContentProtected: input.isContentProtected,
      }),
    };
  }

  /**
   * Replaces the text, entities, and inline keyboard of a text message the bot sent. Only changed
   * text or entities date the edit. As on Telegram, no bot receives an update for a bot's edit.
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
    const { message } = resolution;
    return this.#editBotMessageContent(
      message,
      replaceMessageText(message.content, input, this.#textFixingContext),
      input.inlineKeyboard,
    );
  }

  /**
   * Replaces the caption, its entities, and the inline keyboard of a photo or document the bot
   * sent; an empty caption removes it. Only a changed caption dates the edit. As on Telegram, no
   * bot receives an update for a bot's edit.
   */
  editBotMessageCaption(
    input: EditSupergroupBotMessageCaptionInput,
  ): EditSupergroupBotMessageCaptionResult {
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

  /** Replaces the inline keyboard of a message the bot sent, leaving its content as it is. */
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
      content: message.content,
      inlineKeyboard: input.inlineKeyboard,
      contentEditedAtUnixSeconds: message.contentEditedAtUnixSeconds,
    });
  }

  /**
   * Replaces the text or caption of a message the account wrote to the supergroup, which the
   * supergroup's bots may receive as an `edited_message` update. As when sending, the text is
   * normalized as a Telegram client does.
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
    if (
      !isSupergroupContentMessage(message) || message.author.kind !== 'account' ||
      message.author.accountId !== input.fromAccountId
    ) {
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

    const editedMessage = this.#messages.editSupergroupMessage(message.id, {
      content: replacement.content,
      inlineKeyboard: message.inlineKeyboard,
      contentEditedAtUnixSeconds: this.#currentUnixTimeSeconds(),
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
    const accessFailure = this.#checkBotAccess(input.fromBotId, input.chatId);
    if (accessFailure !== undefined) {
      return { deleted: false, reason: accessFailure };
    }

    const messages = new Map<CanonicalMessageId, SupergroupMessage>();
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
      this.#messages.deleteSupergroupMessage(messageId);
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
    const accessFailure = this.#checkBotAccess(fromBotId, chatId);
    return accessFailure === undefined ? { sent: true } : { sent: false, reason: accessFailure };
  }

  /**
   * Records a change of a supergroup's members, which the caller has made, as a service message of
   * the member who made it. As on Telegram, the service message is numbered like any message.
   */
  recordMembershipChange(
    { chatId, author, content, changedAtUnixSeconds }: RecordSupergroupMembershipChangeInput,
  ): SupergroupMessage {
    return this.#commitMessage({
      chatId,
      author,
      sentAtUnixSeconds: changedAtUnixSeconds,
      content,
    });
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
  ): SupergroupMessage | undefined {
    const canonicalMessageId = this.#messageBoxes.getCanonicalMessageId(chatId, messageId);
    return canonicalMessageId === undefined
      ? undefined
      : this.#messages.getSupergroupMessage(canonicalMessageId);
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

  /** Checks that the bot is a member of the supergroup, which it needs to act there. */
  #checkBotAccess(botId: number, chatId: number): SupergroupBotAccessFailureReason | undefined {
    if (this.#sharedChats.getSharedChat(chatId)?.kind !== 'supergroup') {
      return 'chat_not_found';
    }
    return this.#sharedChats.getChatMembership(chatId, botId) === undefined
      ? getSupergroupNonMemberFailureReason(this.#sharedChats.getFormerMemberStatus(chatId, botId))
      : undefined;
  }

  /**
   * Resolves the bot message an edit targets, which only the bot that sent it can edit. A service
   * message has no content to edit.
   */
  #resolveEditableBotMessage(
    { fromBotId, chatId, messageId }: EditSupergroupBotMessageTarget,
  ):
    | { readonly resolved: true; readonly message: SupergroupContentMessage }
    | {
      readonly resolved: false;
      readonly reason:
        | SupergroupBotAccessFailureReason
        | 'message_not_found'
        | 'message_not_editable';
    } {
    const accessFailure = this.#checkBotAccess(fromBotId, chatId);
    if (accessFailure !== undefined) {
      return { resolved: false, reason: accessFailure };
    }
    const message = this.getMessageByChatMessageId(chatId, messageId);
    if (message === undefined) {
      return { resolved: false, reason: 'message_not_found' };
    }
    if (
      !isSupergroupContentMessage(message) || message.author.kind !== 'bot' ||
      message.author.botId !== fromBotId
    ) {
      return { resolved: false, reason: 'message_not_editable' };
    }
    return { resolved: true, message };
  }

  /**
   * Applies a bot's replacement of its message's content with the given keyboard; only changed
   * content dates the edit.
   */
  #editBotMessageContent<FailureReason extends string>(
    message: SupergroupContentMessage,
    replacement: ContentReplacement<FailureReason>,
    inlineKeyboard: InlineKeyboard | undefined,
  ):
    | SupergroupMessageEditResult<FailureReason | 'callback_data_invalid' | 'message_not_modified'>
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

  /** Validates, stores, and publishes a bot's edit of its message, which must change it. */
  #editBotMessage(
    message: SupergroupContentMessage,
    edit: {
      readonly content: MessageContent;
      readonly inlineKeyboard: InlineKeyboard | undefined;
      readonly contentEditedAtUnixSeconds: number | undefined;
    },
  ): SupergroupMessageEditResult<'callback_data_invalid' | 'message_not_modified'> {
    const editFailure = checkBotMessageEdit(message, edit);
    if (editFailure !== undefined) {
      return { edited: false, reason: editFailure };
    }

    const editedMessage = this.#messages.editSupergroupMessage(message.id, edit);
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
    sender: SupergroupMessageAuthor['kind'],
  ): OutgoingContentNormalization {
    return normalizeOutgoingContent(content, sender, this.#textFixingContext);
  }

  /**
   * Stores normalized content with its upload, numbers the message in the supergroup's box, and
   * publishes it.
   */
  #storeMessage(
    { chatId, author, content, replyToMessageId, inlineKeyboard, isContentProtected }: {
      readonly chatId: number;
      readonly author: SupergroupMessageAuthor;
      readonly content: NormalizedOutgoingContent;
      readonly replyToMessageId?: CanonicalMessageId;
      readonly inlineKeyboard?: InlineKeyboard;
      readonly isContentProtected?: boolean;
    },
  ): SupergroupMessage {
    return this.#commitMessage({
      chatId,
      author,
      sentAtUnixSeconds: this.#currentUnixTimeSeconds(),
      content: storeOutgoingContent(content, this.#files),
      replyToMessageId,
      inlineKeyboard,
      isContentProtected,
    });
  }

  /** Stores a message, numbers it in the supergroup's box, and publishes it. */
  #commitMessage(message: NewSupergroupMessage): SupergroupMessage {
    const storedMessage = this.#messages.addSupergroupMessage(message);
    this.#messageBoxes.assignMessageId(message.chatId, storedMessage.id);
    this.#events.publish({ type: 'message_created', message: storedMessage });
    return storedMessage;
  }
}
