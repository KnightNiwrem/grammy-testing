import {
  projectBotAsUser,
  projectBotBlockChangeForBot,
  projectCallbackQueryForBot,
  projectPrivateTextMessageForBot,
} from '../projections/bot_api_message.ts';
import type {
  BotApiCallbackQuery,
  BotApiMyChatMemberUpdated,
  BotApiPrivateTextMessage,
  BotApiRepliedPrivateTextMessage,
  BotApiUser,
} from '../types/bot_api.ts';
import type { CallbackQuery } from '../types/callback_query.ts';
import type { BotBlockChangedEvent } from '../types/chat_domain_event.ts';
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

interface PrivateMessageLookup {
  getPrivateTextMessage(messageId: CanonicalMessageId): PrivateTextMessage | undefined;
}

interface BotMessageViewServiceDependencies {
  readonly accounts: AccountLookup;
  readonly bots: BotLookup;
  readonly userMessageBoxes: MessageIdLookup;
  readonly messages: PrivateMessageLookup;
}

/**
 * Presents committed canonical messages, callback queries on them, and changes of a bot's
 * membership in its private chats, as the Bot API shows them to an observing bot.
 *
 * It reads the participants' profiles and the observer's message numbering; it never creates
 * messages or decides whether sending one is permitted.
 */
export class BotMessageViewService {
  readonly #accounts: AccountLookup;
  readonly #bots: BotLookup;
  readonly #userMessageBoxes: MessageIdLookup;
  readonly #messages: PrivateMessageLookup;

  constructor({ accounts, bots, userMessageBoxes, messages }: BotMessageViewServiceDependencies) {
    this.#accounts = accounts;
    this.#bots = bots;
    this.#userMessageBoxes = userMessageBoxes;
    this.#messages = messages;
  }

  /**
   * Returns a private text message as the bot of its conversation sees it, with the current state
   * of the message it replies to unless that message was deleted. The message must be committed:
   * its participants exist and it is numbered in the bot's message box.
   */
  viewPrivateTextMessageForBot(message: PrivateTextMessage): BotApiPrivateTextMessage {
    const repliedMessage = message.replyToMessageId === undefined
      ? undefined
      : this.#messages.getPrivateTextMessage(message.replyToMessageId);
    return this.#viewPrivateTextMessage(
      message,
      repliedMessage === undefined ? undefined : this.#viewPrivateTextMessage(repliedMessage),
    );
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

  /** Returns an account's block or unblock of a bot as the blocked bot receives it. */
  viewBotBlockChangeForBot(event: BotBlockChangedEvent): BotApiMyChatMemberUpdated {
    const account = this.#accounts.getById(event.accountId);
    if (account === undefined) {
      throw new Error(`Account ${event.accountId} that changed a bot block does not exist`);
    }
    const bot = this.#bots.getById(event.botId);
    if (bot === undefined) {
      throw new Error(`Bot ${event.botId} whose block changed does not exist`);
    }
    return projectBotBlockChangeForBot({ event, account: account.profile, bot: bot.profile });
  }

  /** Projects a message with the given view of the message it replies to, if any. */
  #viewPrivateTextMessage(
    message: PrivateTextMessage,
    repliedMessage?: BotApiRepliedPrivateTextMessage,
  ): BotApiPrivateTextMessage {
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
      mentionedUsers: this.#findMentionedUsers(message),
      repliedMessage,
    });
  }

  /** Looks up the users a message mentions, which sending the message verified exist. */
  #findMentionedUsers(message: PrivateTextMessage): ReadonlyMap<number, BotApiUser> {
    const mentionedUsers = new Map<number, BotApiUser>();
    for (const entity of message.entities) {
      if (entity.type !== 'text_mention') {
        continue;
      }
      const account = this.#accounts.getById(entity.userId);
      const bot = account === undefined ? this.#bots.getById(entity.userId) : undefined;
      const user = account?.profile ??
        (bot === undefined ? undefined : projectBotAsUser(bot.profile));
      if (user === undefined) {
        throw new Error(`User ${entity.userId} mentioned in message ${message.id} does not exist`);
      }
      mentionedUsers.set(entity.userId, user);
    }
    return mentionedUsers;
  }
}
