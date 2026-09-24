import {
  type ObservedFile,
  projectBotAsUser,
  projectBotBlockChangeForBot,
  projectBotJoinedGroupForBot,
  projectCallbackQueryForBot,
  projectPrivateMessageForBot,
  projectSupergroupMessage,
} from '../projections/bot_api_message.ts';
import type {
  BotApiCallbackQuery,
  BotApiMessage,
  BotApiMyChatMemberUpdated,
  BotApiPrivateMessage,
  BotApiRepliedPrivateMessage,
  BotApiRepliedSupergroupMessage,
  BotApiSupergroupMessage,
  BotApiUser,
} from '../types/bot_api.ts';
import type { CallbackQuery } from '../types/callback_query.ts';
import type { StoredFile, StoredFileId } from '../types/stored_file.ts';
import type { BotBlockChangedEvent, ChatMemberAddedEvent } from '../types/chat_domain_event.ts';
import type { VirtualAccount } from '../types/virtual_account.ts';
import type { VirtualBot } from '../types/virtual_bot.ts';
import type { SharedChat } from '../types/virtual_chat.ts';
import {
  type CanonicalMessageId,
  type ChatMessage,
  getContentText,
  type PrivateMessage,
  type SupergroupMessage,
  type SupergroupMessageAuthor,
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
  getPrivateMessage(messageId: CanonicalMessageId): PrivateMessage | undefined;
  getSupergroupMessage(messageId: CanonicalMessageId): SupergroupMessage | undefined;
}

interface SharedChatLookup {
  getSharedChat(chatId: number): SharedChat | undefined;
}

interface ObserverFileIdentities {
  getFile(fileId: StoredFileId): StoredFile | undefined;
  getOrAssignObserverFileId(observerId: number, fileId: StoredFileId): string;
}

interface BotMessageViewServiceDependencies {
  readonly accounts: AccountLookup;
  readonly bots: BotLookup;
  readonly sharedChats: SharedChatLookup;
  readonly messageBoxes: MessageIdLookup;
  readonly messages: MessageLookup;
  readonly files: ObserverFileIdentities;
}

/**
 * Presents committed canonical messages, callback queries on them, and changes of a bot's
 * membership in its chats, as the Bot API shows them to an observing bot.
 *
 * It reads the participants' profiles, the chats, and the observer's message numbering; it never
 * creates messages or decides whether sending one is permitted. As on Telegram, each observer
 * knows a file by a `file_id` of its own, which a view assigns when the observer first sees it.
 */
export class BotMessageViewService {
  readonly #accounts: AccountLookup;
  readonly #bots: BotLookup;
  readonly #sharedChats: SharedChatLookup;
  readonly #messageBoxes: MessageIdLookup;
  readonly #messages: MessageLookup;
  readonly #files: ObserverFileIdentities;

  constructor(
    { accounts, bots, sharedChats, messageBoxes, messages, files }:
      BotMessageViewServiceDependencies,
  ) {
    this.#accounts = accounts;
    this.#bots = bots;
    this.#sharedChats = sharedChats;
    this.#messageBoxes = messageBoxes;
    this.#messages = messages;
    this.#files = files;
  }

  /**
   * Returns a committed message of any chat as a bot of that chat sees it: in a private chat, the
   * bot of its conversation.
   */
  viewMessageForBot(message: ChatMessage, botId: number): BotApiMessage {
    switch (message.kind) {
      case 'private_message':
        return this.viewPrivateMessageForBot(message);
      case 'supergroup_message':
        return this.viewSupergroupMessage(message, botId);
      default: {
        const unhandledMessage: never = message;
        throw new Error(`Unhandled message: ${JSON.stringify(unhandledMessage)}`);
      }
    }
  }

  /**
   * Returns a private message as the bot of its conversation sees it, with the current state
   * of the message it replies to unless that message was deleted. The message must be committed:
   * its participants exist and it is numbered in the bot's message box.
   */
  viewPrivateMessageForBot(message: PrivateMessage): BotApiPrivateMessage {
    const repliedMessage = message.replyToMessageId === undefined
      ? undefined
      : this.#messages.getPrivateMessage(message.replyToMessageId);
    return this.#viewPrivateMessage(
      message,
      repliedMessage === undefined ? undefined : this.#viewPrivateMessage(repliedMessage),
    );
  }

  /**
   * Returns a supergroup message as a member, bot or account, sees it, with the current state of
   * the message it replies to unless that message was deleted. Members see the same message, apart
   * from the `file_id` of its file. The message must be committed: its supergroup and author exist
   * and it is numbered in the supergroup's box.
   */
  viewSupergroupMessage(message: SupergroupMessage, observerId: number): BotApiSupergroupMessage {
    const repliedMessage = message.replyToMessageId === undefined
      ? undefined
      : this.#messages.getSupergroupMessage(message.replyToMessageId);
    return this.#viewSupergroupMessage(
      message,
      observerId,
      repliedMessage === undefined
        ? undefined
        : this.#viewSupergroupMessage(repliedMessage, observerId),
    );
  }

  /**
   * Returns a callback query as the bot that owns the pressed button receives it, carrying the
   * given state of the button's message.
   */
  viewCallbackQueryForBot(
    callbackQuery: CallbackQuery,
    message: ChatMessage,
  ): BotApiCallbackQuery {
    const { accountId } = callbackQuery;
    const account = this.#accounts.getById(accountId);
    if (account === undefined) {
      throw new Error(`Account ${accountId} of callback query ${callbackQuery.id} does not exist`);
    }

    return projectCallbackQueryForBot({
      callbackQuery,
      account: account.profile,
      message: this.viewMessageForBot(message, callbackQuery.botId),
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
  #viewSupergroupMessage(
    message: SupergroupMessage,
    observerId: number,
    repliedMessage?: BotApiRepliedSupergroupMessage,
  ): BotApiSupergroupMessage {
    const supergroup = this.#sharedChats.getSharedChat(message.chatId);
    if (supergroup?.kind !== 'supergroup') {
      throw new Error(`Supergroup ${message.chatId} of message ${message.id} does not exist`);
    }
    const messageId = this.#messageBoxes.getMessageId(message.chatId, message.id);
    if (messageId === undefined) {
      throw new Error(`Supergroup message ${message.id} is not numbered in its supergroup`);
    }

    return projectSupergroupMessage({
      message,
      supergroup,
      author: this.#findSupergroupMessageAuthor(message.author, message.id),
      messageId,
      context: this.#resolveProjectionContext(message, observerId),
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
  #viewPrivateMessage(
    message: PrivateMessage,
    repliedMessage?: BotApiRepliedPrivateMessage,
  ): BotApiPrivateMessage {
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

    return projectPrivateMessageForBot({
      message,
      account: account.profile,
      bot: bot.profile,
      observerMessageId,
      context: this.#resolveProjectionContext(message, observingBotId),
      repliedMessage,
    });
  }

  /** Resolves the users a message mentions and its file, as the observer sees them. */
  #resolveProjectionContext(message: ChatMessage, observerId: number) {
    const { content } = message;
    return {
      mentionedUsers: this.#findMentionedUsers(message),
      ...(content.kind === 'text'
        ? {}
        : { contentFile: this.#observeFile(content.fileId, observerId, message.id) }),
    };
  }

  #observeFile(
    fileId: StoredFileId,
    observerId: number,
    messageId: CanonicalMessageId,
  ): ObservedFile {
    const file = this.#files.getFile(fileId);
    if (file === undefined) {
      throw new Error(`File ${fileId} of message ${messageId} does not exist`);
    }
    return { file, observerFileId: this.#files.getOrAssignObserverFileId(observerId, fileId) };
  }

  /** Looks up the users a message mentions, which sending the message verified exist. */
  #findMentionedUsers(message: ChatMessage): ReadonlyMap<number, BotApiUser> {
    const mentionedUsers = new Map<number, BotApiUser>();
    for (const entity of getContentText(message.content).entities) {
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
