import {
  projectBotAsUser,
  projectBotBlockChangeForBot,
  projectBotJoinedGroupForBot,
  projectCallbackQueryForBot,
  projectPrivateTextMessageForBot,
  projectSupergroupTextMessage,
} from '../projections/bot_api_message.ts';
import type {
  BotApiCallbackQuery,
  BotApiMyChatMemberUpdated,
  BotApiPrivateTextMessage,
  BotApiRepliedPrivateTextMessage,
  BotApiRepliedSupergroupTextMessage,
  BotApiSupergroupTextMessage,
  BotApiTextMessage,
  BotApiUser,
} from '../types/bot_api.ts';
import type { CallbackQuery } from '../types/callback_query.ts';
import type { BotBlockChangedEvent, ChatMemberAddedEvent } from '../types/chat_domain_event.ts';
import type { VirtualAccount } from '../types/virtual_account.ts';
import type { VirtualBot } from '../types/virtual_bot.ts';
import type { SharedChat } from '../types/virtual_chat.ts';
import type {
  CanonicalMessageId,
  PrivateTextMessage,
  SupergroupMessageAuthor,
  SupergroupTextMessage,
  TextMessage,
} from '../types/virtual_message.ts';

interface AccountLookup {
  getById(accountId: number): VirtualAccount | undefined;
}

interface BotLookup {
  getById(botId: number): VirtualBot | undefined;
}

interface MessageIdLookup {
  getMessageId(ownerId: number, canonicalMessageId: CanonicalMessageId): number | undefined;
}

interface MessageLookup {
  getPrivateTextMessage(messageId: CanonicalMessageId): PrivateTextMessage | undefined;
  getSupergroupTextMessage(messageId: CanonicalMessageId): SupergroupTextMessage | undefined;
}

interface SharedChatLookup {
  getSharedChat(chatId: number): SharedChat | undefined;
}

interface BotMessageViewServiceDependencies {
  readonly accounts: AccountLookup;
  readonly bots: BotLookup;
  readonly sharedChats: SharedChatLookup;
  readonly messageBoxes: MessageIdLookup;
  readonly messages: MessageLookup;
}

/**
 * Presents committed canonical messages, callback queries on them, and changes of a bot's
 * membership in its chats, as the Bot API shows them to an observing bot.
 *
 * It reads the participants' profiles, the chats, and the observer's message numbering; it never
 * creates messages or decides whether sending one is permitted.
 */
export class BotMessageViewService {
  readonly #accounts: AccountLookup;
  readonly #bots: BotLookup;
  readonly #sharedChats: SharedChatLookup;
  readonly #messageBoxes: MessageIdLookup;
  readonly #messages: MessageLookup;

  constructor(
    { accounts, bots, sharedChats, messageBoxes, messages }: BotMessageViewServiceDependencies,
  ) {
    this.#accounts = accounts;
    this.#bots = bots;
    this.#sharedChats = sharedChats;
    this.#messageBoxes = messageBoxes;
    this.#messages = messages;
  }

  /** Returns a committed message of any chat as a bot of that chat sees it. */
  viewTextMessageForBot(message: TextMessage): BotApiTextMessage {
    switch (message.kind) {
      case 'private_text':
        return this.viewPrivateTextMessageForBot(message);
      case 'supergroup_text':
        return this.viewSupergroupTextMessage(message);
      default: {
        const unhandledMessage: never = message;
        throw new Error(`Unhandled message: ${JSON.stringify(unhandledMessage)}`);
      }
    }
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
   * Returns a supergroup text message, with the current state of the message it replies to unless
   * that message was deleted. Every member, bot or account, sees the same message. The message
   * must be committed: its supergroup and author exist and it is numbered in the supergroup's box.
   */
  viewSupergroupTextMessage(message: SupergroupTextMessage): BotApiSupergroupTextMessage {
    const repliedMessage = message.replyToMessageId === undefined
      ? undefined
      : this.#messages.getSupergroupTextMessage(message.replyToMessageId);
    return this.#viewSupergroupTextMessage(
      message,
      repliedMessage === undefined ? undefined : this.#viewSupergroupTextMessage(repliedMessage),
    );
  }

  /**
   * Returns a callback query as the bot that owns the pressed button receives it, carrying the
   * given state of the button's message.
   */
  viewCallbackQueryForBot(
    callbackQuery: CallbackQuery,
    message: TextMessage,
  ): BotApiCallbackQuery {
    const { accountId } = callbackQuery;
    const account = this.#accounts.getById(accountId);
    if (account === undefined) {
      throw new Error(`Account ${accountId} of callback query ${callbackQuery.id} does not exist`);
    }

    return projectCallbackQueryForBot({
      callbackQuery,
      account: account.profile,
      message: this.viewTextMessageForBot(message),
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

  /**
   * Returns an account's addition of a bot to a group as the added bot receives it. The added
   * member must be a bot, and the chat a basic group or a supergroup.
   */
  viewBotJoinedGroupForBot(event: ChatMemberAddedEvent): BotApiMyChatMemberUpdated {
    const { chat } = event;
    if (chat.kind === 'channel') {
      throw new Error(`Bot ${event.memberId} cannot join channel ${chat.id}`);
    }
    const account = this.#accounts.getById(event.actorAccountId);
    if (account === undefined) {
      throw new Error(`Account ${event.actorAccountId} that added a member does not exist`);
    }
    const bot = this.#bots.getById(event.memberId);
    if (bot === undefined) {
      throw new Error(`Added member ${event.memberId} is no bot`);
    }
    return projectBotJoinedGroupForBot({ event, chat, account: account.profile, bot: bot.profile });
  }

  /** Projects a supergroup message with the given view of the message it replies to, if any. */
  #viewSupergroupTextMessage(
    message: SupergroupTextMessage,
    repliedMessage?: BotApiRepliedSupergroupTextMessage,
  ): BotApiSupergroupTextMessage {
    const supergroup = this.#sharedChats.getSharedChat(message.chatId);
    if (supergroup?.kind !== 'supergroup') {
      throw new Error(`Supergroup ${message.chatId} of message ${message.id} does not exist`);
    }
    const messageId = this.#messageBoxes.getMessageId(message.chatId, message.id);
    if (messageId === undefined) {
      throw new Error(`Supergroup message ${message.id} is not numbered in its supergroup`);
    }

    return projectSupergroupTextMessage({
      message,
      supergroup,
      author: this.#findSupergroupMessageAuthor(message.author, message.id),
      messageId,
      mentionedUsers: this.#findMentionedUsers(message),
      repliedMessage,
    });
  }

  #findSupergroupMessageAuthor(
    author: SupergroupMessageAuthor,
    messageId: CanonicalMessageId,
  ): BotApiUser {
    const user = author.kind === 'account'
      ? this.#accounts.getById(author.accountId)?.profile
      : this.#findBotUser(author.botId);
    if (user === undefined) {
      throw new Error(`Author of message ${messageId} does not exist`);
    }
    return user;
  }

  #findBotUser(botId: number): BotApiUser | undefined {
    const bot = this.#bots.getById(botId);
    return bot === undefined ? undefined : projectBotAsUser(bot.profile);
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
    const observerMessageId = this.#messageBoxes.getMessageId(observingBotId, message.id);
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
  #findMentionedUsers(message: TextMessage): ReadonlyMap<number, BotApiUser> {
    const mentionedUsers = new Map<number, BotApiUser>();
    for (const entity of message.entities) {
      if (entity.type !== 'text_mention') {
        continue;
      }
      const user = this.#accounts.getById(entity.userId)?.profile ??
        this.#findBotUser(entity.userId);
      if (user === undefined) {
        throw new Error(`User ${entity.userId} mentioned in message ${message.id} does not exist`);
      }
      mentionedUsers.set(entity.userId, user);
    }
    return mentionedUsers;
  }
}
