import {
  type ObservedFile,
  projectBotAsUser,
  projectBotBlockChangeForBot,
  projectBotMembershipChangeForBot,
  projectCallbackQueryForBot,
  projectChatMember,
  projectChatMemberChange,
  projectChosenInlineResultForBot,
  projectInlineQueryForBot,
  projectPrivateMessageForBot,
  projectSupergroupMessage,
} from '../projections/bot_api_message.ts';
import type {
  BotApiBotUser,
  BotApiCallbackQuery,
  BotApiChatMember,
  BotApiChatMemberUpdated,
  BotApiChosenInlineResult,
  BotApiInlineQuery,
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
import type {
  BotBlockChangedEvent,
  ChatMemberStatusChangedEvent,
  InlineQueryResultChosenEvent,
} from '../types/chat_domain_event.ts';
import type { ChatMemberStatus } from '../types/chat_membership.ts';
import type { InlineQuery } from '../types/inline_query.ts';
import type { VirtualAccount } from '../types/virtual_account.ts';
import type { VirtualBot } from '../types/virtual_bot.ts';
import type { SharedChat } from '../types/virtual_chat.ts';
import {
  type CanonicalMessageId,
  type ChatMessage,
  getContentText,
  type MessageForwardInfo,
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
 * Presents committed canonical messages, callback queries on them, inline queries and the results
 * sent from their answers, the standing of users in groups, and changes of a bot's membership in
 * its chats, as the Bot API shows them to an observing bot.
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
   * given state of the button's message, unless the bot knows it only as an inline message.
   */
  viewCallbackQueryForBot(
    callbackQuery: CallbackQuery,
    message: ChatMessage,
  ): BotApiCallbackQuery {
    return projectCallbackQueryForBot({
      callbackQuery,
      account: this.#findAccountProfile(
        callbackQuery.accountId,
        `callback query ${callbackQuery.id}`,
      ),
      ...(callbackQuery.inlineMessageId === undefined
        ? { message: this.viewMessageForBot(message, callbackQuery.botId) }
        : {}),
    });
  }

  /** Returns an inline query as the inline bot receives it. */
  viewInlineQueryForBot(inlineQuery: InlineQuery): BotApiInlineQuery {
    return projectInlineQueryForBot(
      inlineQuery,
      this.#findAccountProfile(inlineQuery.accountId, `inline query ${inlineQuery.id}`),
    );
  }

  /** Returns an account's choice of an inline query result as the inline bot receives it. */
  viewChosenInlineResultForBot(event: InlineQueryResultChosenEvent): BotApiChosenInlineResult {
    const { inlineQuery } = event;
    return projectChosenInlineResultForBot(
      event,
      this.#findAccountProfile(inlineQuery.accountId, `inline query ${inlineQuery.id}`),
    );
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
   * Returns a change of a bot's standing in a group as the bot receives it. The member must be a
   * bot, and the chat a basic group or a supergroup.
   */
  viewBotMembershipChangeForBot(event: ChatMemberStatusChangedEvent): BotApiMyChatMemberUpdated {
    const { chat } = event;
    if (chat.kind === 'channel') {
      throw new Error(`Bot ${event.memberId} cannot be a member of channel ${chat.id}`);
    }
    const actor = this.#findUser(event.actorId);
    if (actor === undefined) {
      throw new Error(`User ${event.actorId} that changed a membership does not exist`);
    }
    const bot = this.#bots.getById(event.memberId);
    if (bot === undefined) {
      throw new Error(`Member ${event.memberId} whose membership changed is no bot`);
    }
    return projectBotMembershipChangeForBot({ event, chat, actor, bot: bot.profile });
  }

  /**
   * Returns a change of a user's standing in a group as administrator bots observe it. The chat
   * must be a basic group or a supergroup.
   */
  viewChatMemberChange(event: ChatMemberStatusChangedEvent): BotApiChatMemberUpdated {
    const { chat } = event;
    if (chat.kind === 'channel') {
      throw new Error(`Channel ${chat.id} has no chat member updates`);
    }
    const actor = this.#findUser(event.actorId);
    if (actor === undefined) {
      throw new Error(`User ${event.actorId} that changed a membership does not exist`);
    }
    const member = this.#findUser(event.memberId);
    if (member === undefined) {
      throw new Error(`Member ${event.memberId} whose membership changed does not exist`);
    }
    return projectChatMemberChange({ event, chat, actor, member });
  }

  /**
   * Returns a user's standing in a group as the Bot API shows it, or `undefined` for a user the
   * session does not know.
   */
  viewChatMember(userId: number, status: ChatMemberStatus): BotApiChatMember | undefined {
    const user = this.#findUser(userId);
    return user === undefined ? undefined : projectChatMember(user, status);
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
    const user = this.#findUser(author.kind === 'account' ? author.accountId : author.botId);
    if (user === undefined) {
      throw new Error(`Author of message ${messageId} does not exist`);
    }
    return user;
  }

  /** Looks up the account a query names, which exists as long as the session does. */
  #findAccountProfile(accountId: number, queryDescription: string) {
    const account = this.#accounts.getById(accountId);
    if (account === undefined) {
      throw new Error(`Account ${accountId} of ${queryDescription} does not exist`);
    }
    return account.profile;
  }

  /** Shows an account or a bot as messages show users. */
  #findUser(userId: number): BotApiUser | undefined {
    const account = this.#accounts.getById(userId);
    if (account !== undefined) {
      return account.profile;
    }
    const bot = this.#bots.getById(userId);
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

  /**
   * Resolves the users a message mentions, the bot it was sent through, a forward's original
   * sender, its file, and the members a service message names, as the observer sees them.
   */
  #resolveProjectionContext(message: ChatMessage, observerId: number) {
    const context = {
      observerId,
      mentionedUsers: this.#findMentionedUsers(message),
      ...this.#resolveProvenance(message),
    };
    const { content } = message;
    switch (content.kind) {
      case 'text':
        return context;
      case 'photo':
      case 'document':
        return {
          ...context,
          contentFile: this.#observeFile(content.fileId, observerId, message.id),
        };
      case 'members_joined':
        return { ...context, changedMembers: this.#findChangedMembers(content.memberIds, message) };
      case 'member_left':
        return {
          ...context,
          changedMembers: this.#findChangedMembers([content.memberId], message),
        };
      default: {
        const unhandledContent: never = content;
        throw new Error(`Unhandled message content: ${JSON.stringify(unhandledContent)}`);
      }
    }
  }

  /**
   * Looks up where a message came from: the inline bot that it, or a forward's original, was sent
   * through, and the original sender of a forward.
   */
  #resolveProvenance(
    message: ChatMessage,
  ): { readonly viaBot?: BotApiBotUser; readonly forwardSender?: BotApiUser } {
    const viaBotId = message.viaBot?.botId ?? message.forwardInfo?.viaBotId;
    return {
      ...(viaBotId === undefined ? {} : { viaBot: this.#findViaBot(viaBotId, message) }),
      ...(message.forwardInfo === undefined
        ? {}
        : { forwardSender: this.#findForwardSender(message.forwardInfo, message) }),
    };
  }

  /** Looks up the inline bot a message was sent through, which exists as long as the session does. */
  #findViaBot(botId: number, message: ChatMessage): BotApiBotUser {
    const bot = this.#bots.getById(botId);
    if (bot === undefined) {
      throw new Error(`Inline bot ${botId} of message ${message.id} does not exist`);
    }
    return projectBotAsUser(bot.profile);
  }

  /** Looks up the sender of a forward's original, which exists as long as the session does. */
  #findForwardSender(
    { originalSenderId }: MessageForwardInfo,
    message: ChatMessage,
  ): BotApiUser {
    const sender = this.#findUser(originalSenderId);
    if (sender === undefined) {
      throw new Error(
        `Original sender ${originalSenderId} of forward ${message.id} does not exist`,
      );
    }
    return sender;
  }

  /** Looks up the members a service message names, which exist as long as the session does. */
  #findChangedMembers(memberIds: readonly number[], message: ChatMessage): BotApiUser[] {
    return memberIds.map((memberId) => {
      const user = this.#findUser(memberId);
      if (user === undefined) {
        throw new Error(`Member ${memberId} named by message ${message.id} does not exist`);
      }
      return user;
    });
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
      const user = this.#findUser(entity.userId);
      if (user === undefined) {
        throw new Error(`User ${entity.userId} mentioned in message ${message.id} does not exist`);
      }
      mentionedUsers.set(entity.userId, user);
    }
    return mentionedUsers;
  }
}
