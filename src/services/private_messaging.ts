import { projectPrivateTextMessageForBot } from '../projections/bot_api_message.ts';
import { findBotCommandEntities } from '../text_entities/bot_command.ts';
import type { BotApiPrivateTextMessage } from '../types/bot_api.ts';
import type { ChatDomainEvent } from '../types/chat_domain_event.ts';
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
    readonly message: BotApiPrivateTextMessage;
  }
  | {
    readonly sent: false;
    readonly reason: SendAccountMessageFailureReason;
  };

export interface SendBotMessageInput {
  readonly fromBotId: number;
  readonly to: {
    readonly type: 'private';
    readonly accountId: number;
  };
  readonly text: string;
}

export type SendBotMessageFailureReason =
  | 'bot_not_found'
  | 'message_text_empty'
  | 'account_not_found'
  | 'conversation_not_started'
  | 'message_text_too_long';

export type SendBotMessageResult =
  | {
    readonly sent: true;
    readonly message: BotApiPrivateTextMessage;
  }
  | {
    readonly sent: false;
    readonly reason: SendBotMessageFailureReason;
  };

export interface GetPrivateMessageHistoryInput {
  readonly accountId: number;
  readonly botId: number;
}

export type GetPrivateMessageHistoryResult =
  | {
    readonly found: true;
    readonly messages: readonly BotApiPrivateTextMessage[];
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
  }): PrivateTextMessage;
  getPrivateConversationMessages(
    conversation: PrivateConversationKey,
  ): readonly PrivateTextMessage[];
}

interface UserMessageBoxStore {
  assignMessageId(ownerId: number, canonicalMessageId: CanonicalMessageId): number;
  getMessageId(ownerId: number, canonicalMessageId: CanonicalMessageId): number | undefined;
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
 * commits each accepted message: stored, numbered for both participants, then published.
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
   * resolved, and for length afterward.
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

    return {
      sent: true,
      message: this.#storePrivateTextMessage({ account, bot, authorRole: 'bot', text: input.text }),
    };
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

    const messages = this.#messages.getPrivateConversationMessages(input).map((message) =>
      this.#projectPrivateTextMessageForBot(message, account, bot)
    );
    return { found: true, messages };
  }

  /**
   * Stores validated text written by one participant of an existing private conversation, numbers
   * it in both participants' message boxes, and publishes its creation.
   */
  #storePrivateTextMessage(
    { account, bot, authorRole, text }: {
      readonly account: VirtualAccount;
      readonly bot: VirtualBot;
      readonly authorRole: PrivateConversationRole;
      readonly text: string;
    },
  ): BotApiPrivateTextMessage {
    const storedMessage = this.#messages.addPrivateTextMessage({
      conversation: { accountId: account.profile.id, botId: bot.profile.id },
      authorRole,
      sentAtUnixSeconds: this.#currentUnixTimeSeconds(),
      text,
      // Telegram marks bot commands in text sent in private chats with bots, which every private
      // conversation here is, whichever participant writes it. Other entity types are not detected.
      entities: findBotCommandEntities(text),
    });
    // Telegram numbers a private message in each participant's message box. Only the bot's
    // numbering is projected today; the account's keeps the stored model faithful to Telegram.
    this.#userMessageBoxes.assignMessageId(account.profile.id, storedMessage.id);
    this.#userMessageBoxes.assignMessageId(bot.profile.id, storedMessage.id);
    this.#events.publish({ type: 'message_created', message: storedMessage });

    return this.#projectPrivateTextMessageForBot(storedMessage, account, bot);
  }

  #projectPrivateTextMessageForBot(
    message: PrivateTextMessage,
    account: VirtualAccount,
    bot: VirtualBot,
  ): BotApiPrivateTextMessage {
    const observerMessageId = this.#userMessageBoxes.getMessageId(bot.profile.id, message.id);
    if (observerMessageId === undefined) {
      throw new Error(`Private message ${message.id} was not delivered to bot ${bot.profile.id}`);
    }
    return projectPrivateTextMessageForBot({
      message,
      account: account.profile,
      bot: bot.profile,
      observerMessageId,
    });
  }
}
