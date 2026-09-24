import {
  projectCallbackQueryForBot,
  projectPrivateTextMessageForBot,
} from '../projections/bot_api_message.ts';
import type { BotApiCallbackQuery, BotApiPrivateTextMessage } from '../types/bot_api.ts';
import type { CallbackQuery } from '../types/callback_query.ts';
import type { VirtualAccount } from '../types/virtual_account.ts';
import type { VirtualBot } from '../types/virtual_bot.ts';
import type { CanonicalMessageId, PrivateTextMessage } from '../types/virtual_message.ts';

interface AccountLookup {
  getById(accountId: number): VirtualAccount | undefined;
}

interface BotLookup {
  getById(botId: number): VirtualBot | undefined;
}

interface MessageIdLookup {
  getMessageId(ownerId: number, canonicalMessageId: CanonicalMessageId): number | undefined;
}

interface BotMessageViewServiceDependencies {
  readonly accounts: AccountLookup;
  readonly bots: BotLookup;
  readonly userMessageBoxes: MessageIdLookup;
}

/**
 * Presents committed canonical messages, and callback queries on them, as the Bot API shows them
 * to an observing bot.
 *
 * It reads the participants' profiles and the observer's message numbering; it never creates
 * messages or decides whether sending one is permitted.
 */
export class BotMessageViewService {
  readonly #accounts: AccountLookup;
  readonly #bots: BotLookup;
  readonly #userMessageBoxes: MessageIdLookup;

  constructor({ accounts, bots, userMessageBoxes }: BotMessageViewServiceDependencies) {
    this.#accounts = accounts;
    this.#bots = bots;
    this.#userMessageBoxes = userMessageBoxes;
  }

  /**
   * Returns a private text message as the bot of its conversation sees it. The message must be
   * committed: its participants exist and it is numbered in the bot's message box.
   */
  viewPrivateTextMessageForBot(message: PrivateTextMessage): BotApiPrivateTextMessage {
    const { accountId, botId: observingBotId } = message.conversation;
    const account = this.#accounts.getById(accountId);
    if (account === undefined) {
      throw new Error(`Account ${accountId} of message ${message.id} does not exist`);
    }
    const bot = this.#bots.getById(observingBotId);
    if (bot === undefined) {
      throw new Error(`Bot ${observingBotId} of message ${message.id} does not exist`);
    }
    const observerMessageId = this.#userMessageBoxes.getMessageId(observingBotId, message.id);
    if (observerMessageId === undefined) {
      throw new Error(`Private message ${message.id} was not delivered to bot ${observingBotId}`);
    }

    return projectPrivateTextMessageForBot({
      message,
      account: account.profile,
      bot: bot.profile,
      observerMessageId,
    });
  }

  /**
   * Returns a callback query as the bot that owns the pressed button receives it, carrying the
   * given state of the button's message.
   */
  viewCallbackQueryForBot(
    callbackQuery: CallbackQuery,
    message: PrivateTextMessage,
  ): BotApiCallbackQuery {
    const { accountId } = callbackQuery.conversation;
    const account = this.#accounts.getById(accountId);
    if (account === undefined) {
      throw new Error(`Account ${accountId} of callback query ${callbackQuery.id} does not exist`);
    }

    return projectCallbackQueryForBot({
      callbackQuery,
      account: account.profile,
      message: this.viewPrivateTextMessageForBot(message),
    });
  }
}
