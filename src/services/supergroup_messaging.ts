import type { ChatDomainEvent } from '../types/chat_domain_event.ts';
import {
  holdsSupergroupAdministratorRight,
  resolveSupergroupBotMembership,
  type SupergroupBotAccessFailureReason,
  type SupergroupMembershipLookup,
} from '../types/chat_membership.ts';
import type { InlineKeyboard } from '../types/inline_keyboard.ts';
import type { ExternalReplyTarget } from '../types/message_reply.ts';
import type { MessageForward } from '../types/message_forward.ts';
import type { VirtualAccount } from '../types/virtual_account.ts';
import type { VirtualBot } from '../types/virtual_bot.ts';
import type { ChatAction, Supergroup } from '../types/virtual_chat.ts';
import {
  canBotEditMessage,
  type CanonicalMessageId,
  type ChatMessage,
  type ExternalReply,
  type InlineMessageId,
  isSupergroupContentMessage,
  type MembershipServiceContent,
  type MessageContent,
  type MessageForwardInfo,
  type SupergroupContentMessage,
  type SupergroupMessage,
  type SupergroupMessageAuthor,
  type SupergroupMessageContent,
  type TextEntity,
  type TextQuote,
} from '../types/virtual_message.ts';
import {
  type AccountMessageContent,
  type AccountMessageEdit,
  checkBotMessageEdit,
  type ContentNormalizationFailure,
  type ContentReplacement,
  type FileUploadStore,
  getReplyQuoteSource,
  hasOnlyValidCallbackData,
  isSameMessageContent,
  type NormalizedOutgoingContent,
  normalizeOutgoingContent,
  type OutgoingContentNormalization,
  type OutgoingMessageContent,
  replaceAccountMessageContent,
  replaceMessageCaption,
  replaceMessageText,
  resolveReplyQuote,
  type SpecifiedCaption,
  type SpecifiedQuote,
  storeOutgoingContent,
  type TextInvalidFailure,
  toOutgoingAccountContent,
} from './message_content.ts';

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

/**
 * An inline query result that an account sends to a supergroup it is a member of, through the
 * inline bot that offered it, which need not be a member.
 */
export interface SendSupergroupAccountInlineResultInput {
  readonly fromAccountId: number;
  readonly chatId: number;
  readonly viaBotId: number;
  /** Content the inline bot's answer holds, which Telegram checked when the bot answered. */
  readonly content: MessageContent;
  /** Omitted when the result sends no inline keyboard. */
  readonly inlineKeyboard?: InlineKeyboard;
}

export type SendSupergroupAccountInlineResultResult =
  | { readonly sent: true; readonly message: SupergroupMessage }
  | {
    readonly sent: false;
    readonly reason: 'account_not_found' | 'chat_not_found' | 'not_a_member';
  };

/** A forward that an account sends to a supergroup it is a member of. */
export interface SendSupergroupAccountForwardInput {
  readonly fromAccountId: number;
  readonly chatId: number;
  readonly forward: MessageForward;
}

export type SendSupergroupAccountForwardResult = SendSupergroupAccountInlineResultResult;

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
  /** The message of the supergroup it replies to; omitted for a message that replies to none. */
  readonly replyTo?: SupergroupBotMessageReplyTarget;
  /**
   * The message of another chat it replies to, which the caller resolved; omitted for a message
   * that replies to none there.
   */
  readonly externalReply?: ExternalReplyTarget;
  /** The quote the bot chose from the message it replies to; omitted for none. */
  readonly quote?: SpecifiedQuote;
  /** Protects the message from forwarding and saving; omitted for an unprotected message. */
  readonly isContentProtected?: boolean;
  /** Notifies the members without sound; omitted for a message that notifies with sound. */
  readonly isSilent?: boolean;
  /** Where the content first appeared, for a forward; omitted for other messages. */
  readonly forwardInfo?: MessageForwardInfo;
  /**
   * The message effect the bot asks for; omitted for none. Telegram allows message effects only in
   * private chats, so a message with one is not sent.
   */
  readonly messageEffectId?: string;
}

export type SendSupergroupBotMessageFailureReason =
  | 'bot_not_found'
  | 'message_text_empty'
  | SupergroupBotAccessFailureReason
  | 'reply_message_not_found'
  | 'message_effect_not_allowed_in_chat'
  | 'callback_data_invalid'
  | 'quote_invalid';

export type SendSupergroupBotMessageResult =
  | { readonly sent: true; readonly message: SupergroupMessage }
  | (
    & { readonly sent: false }
    & ({ readonly reason: SendSupergroupBotMessageFailureReason } | ContentNormalizationFailure)
  );

/**
 * The message a bot edits: one it sent to a supergroup, or one an account sent to a supergroup
 * through the bot's inline mode, which the bot addresses without being a member.
 */
type EditSupergroupBotMessageTarget =
  | {
    readonly fromBotId: number;
    readonly chatId: number;
    /** The supergroup's ID of the message. */
    readonly messageId: number;
  }
  | {
    readonly fromBotId: number;
    readonly inlineMessageId: InlineMessageId;
  };

export type EditSupergroupBotMessageTextInput = EditSupergroupBotMessageTarget & {
  readonly text: string;
  /** Formatting the bot specified, which Telegram validates and normalizes; omitted for none. */
  readonly entities?: readonly TextEntity[];
  /** The keyboard the edited message shows; omitting it removes the message's keyboard. */
  readonly inlineKeyboard?: InlineKeyboard;
};

export type EditSupergroupBotMessageCaptionInput =
  & EditSupergroupBotMessageTarget
  & SpecifiedCaption
  & {
    /** Whether a photo shows its caption above itself; a document ignores it. */
    readonly showsCaptionAboveMedia: boolean;
    /** The keyboard the edited message shows; omitting it removes the message's keyboard. */
    readonly inlineKeyboard?: InlineKeyboard;
  };

export type EditSupergroupBotMessageInlineKeyboardInput = EditSupergroupBotMessageTarget & {
  /** The keyboard the edited message shows; omitting it removes the message's keyboard. */
  readonly inlineKeyboard?: InlineKeyboard;
};

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

export interface GetSupergroupMessageForBotInput {
  readonly botId: number;
  readonly chatId: number;
  /** The supergroup's ID of the message. */
  readonly messageId: number;
}

export type GetSupergroupMessageForBotResult =
  | { readonly found: true; readonly message: SupergroupMessage }
  | {
    readonly found: false;
    readonly reason: 'bot_not_found' | SupergroupBotAccessFailureReason | 'message_not_found';
  };

export interface GetSupergroupMessageForAccountInput {
  readonly accountId: number;
  readonly chatId: number;
  /** The supergroup's ID of the message. */
  readonly messageId: number;
}

export type GetSupergroupMessageForAccountResult =
  | { readonly found: true; readonly message: SupergroupMessage }
  | {
    readonly found: false;
    readonly reason: 'account_not_found' | 'chat_not_found' | 'not_a_member' | 'message_not_found';
  };

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

/** A message to store, before the store gives it an identity. */
interface NewSupergroupMessage {
  readonly chatId: number;
  readonly author: SupergroupMessageAuthor;
  readonly sentAtUnixSeconds: number;
  readonly content: SupergroupMessageContent;
  readonly replyToMessageId?: CanonicalMessageId;
  readonly externalReply?: ExternalReply;
  readonly quote?: TextQuote;
  readonly inlineKeyboard?: InlineKeyboard;
  readonly viaBotId?: number;
  readonly forwardInfo?: MessageForwardInfo;
  readonly isContentProtected?: boolean;
  readonly isSilent?: boolean;
}

interface SupergroupMessageStore {
  addSupergroupMessage(input: NewSupergroupMessage): SupergroupMessage;
  getSupergroupMessage(messageId: CanonicalMessageId): SupergroupMessage | undefined;
  getMessageByInlineMessageId(inlineMessageId: InlineMessageId): ChatMessage | undefined;
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
 * accounts and bots alike, including forwards by members and copies by bots, and commits each
 * accepted message: its upload stored, the message stored, numbered once in the supergroup's own
 * message box, then published. Only members write to a supergroup or read its messages.
 *
 * Bots attach inline keyboards, edit their own messages, and delete them; as on Telegram, only an
 * administrator bot with the right to delete messages deletes other members'. Accounts edit the text or
 * caption of their own messages, and send inline query results through inline bots, which edit the
 * messages sent through them without being members. Reply keyboards and forced replies, which
 * Telegram shows to chosen members of a group, are not supported.
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
   * Sends an inline query result from an account to a supergroup it is a member of, as the
   * account's message sent through the inline bot.
   */
  sendAccountInlineResult(
    input: SendSupergroupAccountInlineResultInput,
  ): SendSupergroupAccountInlineResultResult {
    const memberResolution = this.#resolveAccountMember(input.fromAccountId, input.chatId);
    if (!memberResolution.resolved) {
      return { sent: false, reason: memberResolution.reason };
    }
    return {
      sent: true,
      message: this.#commitMessage({
        chatId: input.chatId,
        author: { kind: 'account', accountId: input.fromAccountId },
        sentAtUnixSeconds: this.#currentUnixTimeSeconds(),
        content: input.content,
        inlineKeyboard: input.inlineKeyboard,
        viaBotId: input.viaBotId,
      }),
    };
  }

  /**
   * Sends a forward from an account to a supergroup it is a member of, as the account's message.
   */
  sendAccountForward(
    { fromAccountId, chatId, forward }: SendSupergroupAccountForwardInput,
  ): SendSupergroupAccountForwardResult {
    const memberResolution = this.#resolveAccountMember(fromAccountId, chatId);
    if (!memberResolution.resolved) {
      return { sent: false, reason: memberResolution.reason };
    }
    return {
      sent: true,
      message: this.#commitMessage({
        ...forward,
        chatId,
        author: { kind: 'account', accountId: fromAccountId },
        sentAtUnixSeconds: this.#currentUnixTimeSeconds(),
      }),
    };
  }

  /**
   * Sends text, a photo, or a document from a bot to a supergroup it is a member of, or the content
   * of an existing message as a forward or copy of it. A supergroup the bot is not a member of is
   * unknown to it, as on Telegram.
   *
   * Checks follow Telegram's order: text is checked for emptiness before the chat is resolved, and
   * the replied message is looked up after it; a message effect is then refused, as TDLib's
   * `MessageSendOptions::get_message_send_options` refuses it outside private chats. The text or
   * caption is normalized with its entities next, and the result is checked for length. Callback
   * data is checked next, and a quote last, as Telegram's servers check it.
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
    if (input.messageEffectId !== undefined) {
      return { sent: false, reason: 'message_effect_not_allowed_in_chat' };
    }
    const contentNormalization = this.#normalizeContent(input.content, 'bot');
    if (!contentNormalization.normalized) {
      return { sent: false, ...contentNormalization.failure };
    }
    if (input.inlineKeyboard !== undefined && !hasOnlyValidCallbackData(input.inlineKeyboard)) {
      return { sent: false, reason: 'callback_data_invalid' };
    }
    const quoteResolution = resolveReplyQuote(
      getReplyQuoteSource(repliedMessage, input.externalReply),
      input.quote,
      this.#textFixingContext,
    );
    if (!quoteResolution.resolved) {
      return { sent: false, reason: quoteResolution.reason };
    }

    return {
      sent: true,
      message: this.#storeMessage({
        chatId: input.chatId,
        author: { kind: 'bot', botId: input.fromBotId },
        content: contentNormalization.content,
        replyToMessageId: repliedMessage?.id,
        externalReply: input.externalReply?.externalReply,
        quote: quoteResolution.quote,
        inlineKeyboard: input.inlineKeyboard,
        forwardInfo: input.forwardInfo,
        isContentProtected: input.isContentProtected,
        isSilent: input.isSilent,
      }),
    };
  }

  /**
   * Replaces the text, entities, and inline keyboard of a text message the bot sent, or that was
   * sent through its inline mode. Only changed text or entities date the edit. As on Telegram, no
   * bot receives an update for a bot's message's edit; an edit of an account's message sent
   * through a bot reaches the supergroup's bots as the account's edited message.
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
   * sent, or that was sent through its inline mode; an empty caption removes it. Only a changed
   * caption dates the edit. Updates follow `editBotMessageText`.
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

  /**
   * Replaces the inline keyboard of a message the bot sent, or that was sent through its inline
   * mode, leaving its content as it is.
   */
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
    // As in TDLib, only the inline bot edits a message sent through it, and no one edits a forward.
    if (
      !isSupergroupContentMessage(message) || message.author.kind !== 'account' ||
      message.author.accountId !== input.fromAccountId || message.viaBot !== undefined ||
      message.forwardInfo !== undefined
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
   * Deletes messages of a supergroup for every member. IDs that identify no message of the
   * supergroup, including messages already deleted, are skipped. As on Telegram, a bot deletes its
   * own messages, and any message, service messages included, as an administrator with the
   * `can_delete_messages` right; otherwise a message of another member cannot be deleted, and then
   * none is.
   */
  deleteMessagesByBot(
    input: DeleteSupergroupMessagesByBotInput,
  ): DeleteSupergroupMessagesByBotResult {
    if (this.#bots.getById(input.fromBotId) === undefined) {
      return { deleted: false, reason: 'bot_not_found' };
    }
    const botMembership = resolveSupergroupBotMembership(
      this.#sharedChats,
      input.fromBotId,
      input.chatId,
    );
    if (!botMembership.resolved) {
      return { deleted: false, reason: botMembership.reason };
    }
    const deletesAnyMessage = holdsSupergroupAdministratorRight(
      botMembership.membership,
      'can_delete_messages',
    );

    const messages = new Map<CanonicalMessageId, SupergroupMessage>();
    for (const messageId of input.messageIds) {
      const message = this.getMessageByChatMessageId(input.chatId, messageId);
      if (message === undefined) {
        continue;
      }
      const isOwnMessage = message.author.kind === 'bot' &&
        message.author.botId === input.fromBotId;
      if (!isOwnMessage && !deletesAnyMessage) {
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
   * Shows a chat action, such as typing, from a bot to a supergroup it is a member of. This checks
   * only that the bot may send it; the caller records the action members' clients show.
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

  /**
   * Finds a message of a supergroup the bot is a member of, as the bot addresses a message it
   * forwards or copies.
   */
  getMessageForBot(
    { botId, chatId, messageId }: GetSupergroupMessageForBotInput,
  ): GetSupergroupMessageForBotResult {
    if (this.#bots.getById(botId) === undefined) {
      return { found: false, reason: 'bot_not_found' };
    }
    const accessFailure = this.#checkBotAccess(botId, chatId);
    if (accessFailure !== undefined) {
      return { found: false, reason: accessFailure };
    }
    const message = this.getMessageByChatMessageId(chatId, messageId);
    return message === undefined
      ? { found: false, reason: 'message_not_found' }
      : { found: true, message };
  }

  /**
   * Finds a message of a supergroup the account is a member of, as the account addresses a message
   * it forwards.
   */
  getMessageForAccount(
    { accountId, chatId, messageId }: GetSupergroupMessageForAccountInput,
  ): GetSupergroupMessageForAccountResult {
    const memberResolution = this.#resolveAccountMember(accountId, chatId);
    if (!memberResolution.resolved) {
      return { found: false, reason: memberResolution.reason };
    }
    const message = this.getMessageByChatMessageId(chatId, messageId);
    return message === undefined
      ? { found: false, reason: 'message_not_found' }
      : { found: true, message };
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
    const resolution = resolveSupergroupBotMembership(this.#sharedChats, botId, chatId);
    return resolution.resolved ? undefined : resolution.reason;
  }

  /**
   * Resolves the message an edit targets, found as `#findBotEditTarget` does, which the bot must
   * be allowed to edit. A service message has no content to edit.
   */
  #resolveEditableBotMessage(
    target: EditSupergroupBotMessageTarget,
  ):
    | { readonly resolved: true; readonly message: SupergroupContentMessage }
    | {
      readonly resolved: false;
      readonly reason:
        | SupergroupBotAccessFailureReason
        | 'message_not_found'
        | 'message_not_editable';
    } {
    const lookup = this.#findBotEditTarget(target);
    if (!lookup.resolved) {
      return lookup;
    }
    const { message } = lookup;
    return isSupergroupContentMessage(message) && canBotEditMessage(message, target.fromBotId)
      ? { resolved: true, message }
      : { resolved: false, reason: 'message_not_editable' };
  }

  /**
   * Finds the message an edit targets: a message of a supergroup the bot is a member of, or a
   * message sent through the bot's inline mode, which only that bot finds by its inline message
   * identifier, even outside its chats.
   */
  #findBotEditTarget(
    target: EditSupergroupBotMessageTarget,
  ):
    | { readonly resolved: true; readonly message: SupergroupMessage }
    | {
      readonly resolved: false;
      readonly reason: SupergroupBotAccessFailureReason | 'message_not_found';
    } {
    if ('inlineMessageId' in target) {
      const message = this.#messages.getMessageByInlineMessageId(target.inlineMessageId);
      return message?.kind === 'supergroup_message' && message.viaBot?.botId === target.fromBotId
        ? { resolved: true, message }
        : { resolved: false, reason: 'message_not_found' };
    }
    const { fromBotId, chatId, messageId } = target;
    const accessFailure = this.#checkBotAccess(fromBotId, chatId);
    if (accessFailure !== undefined) {
      return { resolved: false, reason: accessFailure };
    }
    const message = this.getMessageByChatMessageId(chatId, messageId);
    return message === undefined
      ? { resolved: false, reason: 'message_not_found' }
      : { resolved: true, message };
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
    { content, ...message }: Omit<NewSupergroupMessage, 'sentAtUnixSeconds' | 'content'> & {
      readonly content: NormalizedOutgoingContent;
    },
  ): SupergroupMessage {
    return this.#commitMessage({
      ...message,
      sentAtUnixSeconds: this.#currentUnixTimeSeconds(),
      content: storeOutgoingContent(content, this.#files),
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
