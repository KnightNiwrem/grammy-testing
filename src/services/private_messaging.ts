import { findBotCommandEntities } from '../text_entities/bot_command.ts';
import type { ChatDomainEvent } from '../types/chat_domain_event.ts';
import { type InlineKeyboard, MAX_CALLBACK_DATA_BYTES } from '../types/inline_keyboard.ts';
import type { VirtualAccount } from '../types/virtual_account.ts';
import type { VirtualBot } from '../types/virtual_bot.ts';
import type {
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
}

export type SendAccountMessageFailureReason =
  | 'account_not_found'
  | 'bot_not_found'
  | 'message_text_empty'
  | 'message_text_too_long';

export type SendAccountMessageResult =
  | {
    readonly sent: true;
    readonly message: PrivateTextMessage;
  }
  | {
    readonly sent: false;
    readonly reason: SendAccountMessageFailureReason;
  };

/** A bot's private chat, identified by the account at its other end. */
export interface BotPrivateChat {
  readonly type: 'private';
  readonly accountId: number;
}

export interface SendBotMessageInput {
  readonly fromBotId: number;
  readonly to: BotPrivateChat;
  readonly text: string;
  readonly inlineKeyboard?: InlineKeyboard;
}

export type SendBotMessageFailureReason =
  | 'bot_not_found'
  | 'message_text_empty'
  | 'account_not_found'
  | 'conversation_not_started'
  | 'message_text_too_long'
  | 'callback_data_invalid';

export type SendBotMessageResult =
  | {
    readonly sent: true;
    readonly message: PrivateTextMessage;
  }
  | {
    readonly sent: false;
    readonly reason: SendBotMessageFailureReason;
  };

interface EditBotMessageTarget {
  readonly fromBotId: number;
  readonly chat: BotPrivateChat;
  /** The message's ID in the bot's message box. */
  readonly botMessageId: number;
}

export interface EditBotMessageTextInput extends EditBotMessageTarget {
  readonly text: string;
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
    readonly inlineKeyboard?: InlineKeyboard;
  }): PrivateTextMessage;
  getPrivateTextMessage(messageId: CanonicalMessageId): PrivateTextMessage | undefined;
  editPrivateTextMessage(messageId: CanonicalMessageId, edit: {
    readonly text: string;
    readonly entities: readonly TextEntity[];
    readonly inlineKeyboard: InlineKeyboard | undefined;
    readonly textEditedAtUnixSeconds: number | undefined;
  }): PrivateTextMessage;
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
 * attach inline keyboards to their messages and edit them afterward.
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
    if (input.text.length > MAX_TEXT_MESSAGE_LENGTH) {
      return { sent: false, reason: 'message_text_too_long' };
    }

    this.#privateConversations.getOrCreatePrivateConversation({
      accountId: account.profile.id,
      botId: bot.profile.id,
    });
    return {
      sent: true,
      message: this.#storePrivateTextMessage({
        account,
        bot,
        authorRole: 'account',
        text: input.text,
      }),
    };
  }

  /**
   * Sends text from a bot to an account. As on Telegram, a bot cannot initiate a private
   * conversation, so the account must have started one with the bot.
   *
   * Checks follow Telegram's order: the text is checked for emptiness before the recipient is
   * resolved, and for length and callback data afterward.
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
    if (input.text.length > MAX_TEXT_MESSAGE_LENGTH) {
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
        text: input.text,
        inlineKeyboard: input.inlineKeyboard,
      }),
    };
  }

  /**
   * Replaces the text and inline keyboard of a message the bot sent. Only a changed text dates the
   * edit. As on Telegram, the bot receives no update for its own edit.
   *
   * Checks follow Telegram's order: the text is checked for emptiness before the message is
   * resolved, and for length afterward.
   */
  editBotMessageText(
    input: EditBotMessageTextInput,
  ): EditBotMessageResult<EditBotMessageTextFailureReason> {
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
    if (input.text.length > MAX_TEXT_MESSAGE_LENGTH) {
      return { edited: false, reason: 'message_text_too_long' };
    }

    const { message } = resolution;
    return this.#editBotMessage(message, {
      text: input.text,
      entities: findBotCommandEntities(input.text),
      inlineKeyboard: input.inlineKeyboard,
      textEditedAtUnixSeconds: input.text === message.text
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
    // Entities follow from the text, so comparing the text compares them too.
    if (
      edit.text === message.text &&
      areInlineKeyboardsEqual(edit.inlineKeyboard, message.inlineKeyboard)
    ) {
      return { edited: false, reason: 'message_not_modified' };
    }

    return { edited: true, message: this.#messages.editPrivateTextMessage(message.id, edit) };
  }

  /**
   * Stores validated text written by one participant of an existing private conversation, numbers
   * it in both participants' message boxes, and publishes its creation.
   */
  #storePrivateTextMessage(
    { account, bot, authorRole, text, inlineKeyboard }: {
      readonly account: VirtualAccount;
      readonly bot: VirtualBot;
      readonly authorRole: PrivateConversationRole;
      readonly text: string;
      readonly inlineKeyboard?: InlineKeyboard;
    },
  ): PrivateTextMessage {
    const storedMessage = this.#messages.addPrivateTextMessage({
      conversation: { accountId: account.profile.id, botId: bot.profile.id },
      authorRole,
      sentAtUnixSeconds: this.#currentUnixTimeSeconds(),
      text,
      // Telegram marks bot commands in text sent in private chats with bots, which every private
      // conversation here is, whichever participant writes it. Other entity types are not detected.
      entities: findBotCommandEntities(text),
      inlineKeyboard,
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
