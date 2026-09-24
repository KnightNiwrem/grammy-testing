import type {
  CallbackQuery,
  CallbackQueryAnswer,
  CallbackQueryId,
} from '../types/callback_query.ts';
import type { ChatDomainEvent } from '../types/chat_domain_event.ts';
import type { VirtualAccount } from '../types/virtual_account.ts';
import type { VirtualBot } from '../types/virtual_bot.ts';
import type { PrivateConversation, PrivateConversationKey } from '../types/virtual_chat.ts';
import type { CanonicalMessageId, PrivateTextMessage } from '../types/virtual_message.ts';

export interface PressCallbackButtonInput {
  readonly fromAccountId: number;
  readonly chat: {
    readonly type: 'private';
    readonly botId: number;
  };
  /** The ID of the message carrying the button, in the bot's message box. */
  readonly botMessageId: number;
  readonly callbackData: string;
}

export type PressCallbackButtonFailureReason =
  | 'account_not_found'
  | 'bot_not_found'
  | 'message_not_found'
  | 'callback_button_not_found';

export type PressCallbackButtonResult =
  | { readonly pressed: true; readonly callbackQuery: CallbackQuery }
  | { readonly pressed: false; readonly reason: PressCallbackButtonFailureReason };

export interface BotCallbackQueryAnswerInput {
  readonly fromBotId: number;
  readonly callbackQueryId: CallbackQueryId;
  /** Empty text shows no notification, as omitted text does. */
  readonly text?: string;
  readonly showAlert: boolean;
  readonly cacheTimeSeconds: number;
}

export type BotCallbackQueryAnswerResult =
  | { readonly answered: true; readonly callbackQuery: CallbackQuery }
  | { readonly answered: false; readonly reason: 'callback_query_not_answerable' };

export interface GetAccountCallbackQueryInput {
  readonly accountId: number;
  readonly callbackQueryId: CallbackQueryId;
}

interface AccountLookup {
  getById(accountId: number): VirtualAccount | undefined;
}

interface BotLookup {
  getById(botId: number): VirtualBot | undefined;
}

interface PrivateConversationLookup {
  getPrivateConversation(key: PrivateConversationKey): PrivateConversation | undefined;
}

interface PrivateMessageLookup {
  getPrivateTextMessageByBotMessageId(
    conversation: PrivateConversationKey,
    botMessageId: number,
  ): PrivateTextMessage | undefined;
}

interface CallbackQueryStore {
  addCallbackQuery(input: {
    readonly conversation: PrivateConversationKey;
    readonly messageId: CanonicalMessageId;
    readonly chatInstance: string;
    readonly callbackData: string;
  }): CallbackQuery;
  getCallbackQuery(callbackQueryId: CallbackQueryId): CallbackQuery | undefined;
  recordAnswer(callbackQueryId: CallbackQueryId, answer: CallbackQueryAnswer): CallbackQuery;
}

interface ChatDomainEventSink {
  publish(event: ChatDomainEvent): void;
}

interface CallbackQueryServiceDependencies {
  readonly accounts: AccountLookup;
  readonly bots: BotLookup;
  readonly privateConversations: PrivateConversationLookup;
  readonly privateMessages: PrivateMessageLookup;
  readonly callbackQueries: CallbackQueryStore;
  readonly events: ChatDomainEventSink;
}

/**
 * Carries out callback queries: an account presses a callback button on a bot's message, and the
 * bot answers once with an optional notification for the account.
 */
export class CallbackQueryService {
  readonly #accounts: AccountLookup;
  readonly #bots: BotLookup;
  readonly #privateConversations: PrivateConversationLookup;
  readonly #privateMessages: PrivateMessageLookup;
  readonly #callbackQueries: CallbackQueryStore;
  readonly #events: ChatDomainEventSink;

  constructor(
    { accounts, bots, privateConversations, privateMessages, callbackQueries, events }:
      CallbackQueryServiceDependencies,
  ) {
    this.#accounts = accounts;
    this.#bots = bots;
    this.#privateConversations = privateConversations;
    this.#privateMessages = privateMessages;
    this.#callbackQueries = callbackQueries;
    this.#events = events;
  }

  /**
   * Presses the callback button with the given data on a message in the account's private chat
   * with the bot, and publishes the resulting callback query for the bot.
   */
  pressCallbackButton(input: PressCallbackButtonInput): PressCallbackButtonResult {
    if (this.#accounts.getById(input.fromAccountId) === undefined) {
      return { pressed: false, reason: 'account_not_found' };
    }
    if (this.#bots.getById(input.chat.botId) === undefined) {
      return { pressed: false, reason: 'bot_not_found' };
    }
    const conversationKey: PrivateConversationKey = {
      accountId: input.fromAccountId,
      botId: input.chat.botId,
    };
    const conversation = this.#privateConversations.getPrivateConversation(conversationKey);
    const message = conversation === undefined
      ? undefined
      : this.#privateMessages.getPrivateTextMessageByBotMessageId(
        conversationKey,
        input.botMessageId,
      );
    if (conversation === undefined || message === undefined) {
      return { pressed: false, reason: 'message_not_found' };
    }
    const hasPressedButton =
      message.inlineKeyboard?.some((row) =>
        row.some((button) =>
          button.kind === 'callback' && button.callbackData === input.callbackData
        )
      ) ?? false;
    if (!hasPressedButton) {
      return { pressed: false, reason: 'callback_button_not_found' };
    }

    const callbackQuery = this.#callbackQueries.addCallbackQuery({
      conversation: conversationKey,
      messageId: message.id,
      chatInstance: conversation.chatInstance,
      callbackData: input.callbackData,
    });
    this.#events.publish({ type: 'callback_query_created', callbackQuery, message });
    return { pressed: true, callbackQuery };
  }

  /**
   * Records the bot's answer to a callback query it received. As on Telegram, a query that does
   * not exist, belongs to another bot, or is already answered cannot be answered.
   */
  answerCallbackQuery(input: BotCallbackQueryAnswerInput): BotCallbackQueryAnswerResult {
    const callbackQuery = this.#callbackQueries.getCallbackQuery(input.callbackQueryId);
    if (
      callbackQuery === undefined ||
      callbackQuery.conversation.botId !== input.fromBotId ||
      callbackQuery.answer !== undefined
    ) {
      return { answered: false, reason: 'callback_query_not_answerable' };
    }

    return {
      answered: true,
      callbackQuery: this.#callbackQueries.recordAnswer(callbackQuery.id, {
        ...(input.text === undefined || input.text.length === 0 ? {} : { text: input.text }),
        showAlert: input.showAlert,
        cacheTimeSeconds: input.cacheTimeSeconds,
      }),
    };
  }

  /** Returns a callback query the account created, or `undefined` for any other query. */
  getAccountCallbackQuery(
    { accountId, callbackQueryId }: GetAccountCallbackQueryInput,
  ): CallbackQuery | undefined {
    const callbackQuery = this.#callbackQueries.getCallbackQuery(callbackQueryId);
    return callbackQuery?.conversation.accountId === accountId ? callbackQuery : undefined;
  }
}
