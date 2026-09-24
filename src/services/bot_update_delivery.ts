import type {
  BotApiCallbackQuery,
  BotApiMyChatMemberUpdated,
  BotApiPrivateTextMessage,
  BotApiSupergroupTextMessage,
  BotApiTextMessage,
  BotApiUpdateType,
} from '../types/bot_api.ts';
import type { CallbackQuery } from '../types/callback_query.ts';
import type {
  BotBlockChangedEvent,
  CallbackQueryCreatedEvent,
  ChatDomainEvent,
  ChatMemberAddedEvent,
} from '../types/chat_domain_event.ts';
import type { VirtualBot, VirtualBotProfile } from '../types/virtual_bot.ts';
import type {
  CanonicalMessageId,
  PrivateTextMessage,
  SupergroupTextMessage,
  TextMessage,
} from '../types/virtual_message.ts';

interface BotMessageViews {
  viewPrivateTextMessageForBot(message: PrivateTextMessage): BotApiPrivateTextMessage;
  viewSupergroupTextMessage(message: SupergroupTextMessage): BotApiSupergroupTextMessage;
  viewCallbackQueryForBot(
    callbackQuery: CallbackQuery,
    message: TextMessage,
  ): BotApiCallbackQuery;
  viewBotBlockChangeForBot(event: BotBlockChangedEvent): BotApiMyChatMemberUpdated;
  viewBotJoinedGroupForBot(event: ChatMemberAddedEvent): BotApiMyChatMemberUpdated;
}

interface BotUpdateMailboxes {
  enqueueMessageUpdate(botId: number, message: BotApiTextMessage): void;
  enqueueEditedMessageUpdate(botId: number, editedMessage: BotApiTextMessage): void;
  enqueueCallbackQueryUpdate(botId: number, callbackQuery: BotApiCallbackQuery): void;
  enqueueMyChatMemberUpdate(botId: number, myChatMember: BotApiMyChatMemberUpdated): void;
}

interface BotUpdateSubscriptionLookup {
  getAllowedUpdateTypes(botId: number): ReadonlySet<BotApiUpdateType>;
}

interface BotLookup {
  getById(botId: number): VirtualBot | undefined;
}

interface ChatMemberLookup {
  getChatMemberIds(chatId: number): readonly number[];
}

interface SupergroupMessageLookup {
  getSupergroupTextMessage(messageId: CanonicalMessageId): SupergroupTextMessage | undefined;
}

interface BotUpdateDeliveryServiceDependencies {
  readonly botMessageViews: BotMessageViews;
  readonly botUpdates: BotUpdateMailboxes;
  readonly updateSubscriptions: BotUpdateSubscriptionLookup;
  readonly bots: BotLookup;
  readonly sharedChats: ChatMemberLookup;
  readonly messages: SupergroupMessageLookup;
}

/** What a bot receives of a message: a new message, or an edit of one. */
type MessageUpdateType = Extract<BotApiUpdateType, 'message' | 'edited_message'>;

/**
 * Turns chat domain events into Bot API updates.
 *
 * It selects the bots that observe each event, projects the event for each of them, and appends
 * the resulting update to that bot's mailbox. A bot that has not subscribed to the update's type
 * never receives it, as Telegram drops such updates when they are created; the underlying chat
 * state is unaffected.
 */
export class BotUpdateDeliveryService {
  readonly #botMessageViews: BotMessageViews;
  readonly #botUpdates: BotUpdateMailboxes;
  readonly #updateSubscriptions: BotUpdateSubscriptionLookup;
  readonly #bots: BotLookup;
  readonly #sharedChats: ChatMemberLookup;
  readonly #messages: SupergroupMessageLookup;

  constructor(
    { botMessageViews, botUpdates, updateSubscriptions, bots, sharedChats, messages }:
      BotUpdateDeliveryServiceDependencies,
  ) {
    this.#botMessageViews = botMessageViews;
    this.#botUpdates = botUpdates;
    this.#updateSubscriptions = updateSubscriptions;
    this.#bots = bots;
    this.#sharedChats = sharedChats;
    this.#messages = messages;
  }

  publish(event: ChatDomainEvent): void {
    switch (event.type) {
      case 'message_created':
        this.#deliverMessage(event.message, 'message');
        return;
      case 'message_edited':
        this.#deliverMessage(event.message, 'edited_message');
        return;
      case 'callback_query_created':
        this.#deliverCallbackQuery(event);
        return;
      case 'bot_block_changed':
        this.#deliverBotBlockChange(event);
        return;
      case 'chat_member_added':
        this.#deliverChatMemberAddition(event);
        return;
      default: {
        const unhandledEvent: never = event;
        throw new Error(`Unhandled chat domain event: ${JSON.stringify(unhandledEvent)}`);
      }
    }
  }

  #deliverMessage(message: TextMessage, updateType: MessageUpdateType): void {
    switch (message.kind) {
      case 'private_text':
        this.#deliverPrivateTextMessage(message, updateType);
        return;
      case 'supergroup_text':
        this.#deliverSupergroupTextMessage(message, updateType);
        return;
      default: {
        const unhandledMessage: never = message;
        throw new Error(`Unhandled message: ${JSON.stringify(unhandledMessage)}`);
      }
    }
  }

  /**
   * A private message, and each edit of it, is observed only by the bot of its conversation,
   * which, as on Telegram, receives no update for its own message or edit.
   */
  #deliverPrivateTextMessage(message: PrivateTextMessage, updateType: MessageUpdateType): void {
    const observingBotId = message.conversation.botId;
    if (message.authorRole === 'bot' || !this.#isSubscribed(observingBotId, updateType)) {
      return;
    }

    this.#enqueueMessage(
      observingBotId,
      updateType,
      this.#botMessageViews.viewPrivateTextMessageForBot(message),
    );
  }

  /**
   * A supergroup message, and each edit of it, is observed by the supergroup's bots that can read
   * it. As on Telegram, bots never observe messages of bots, their own included, and a bot in
   * privacy mode observes only messages addressed to it.
   */
  #deliverSupergroupTextMessage(
    message: SupergroupTextMessage,
    updateType: MessageUpdateType,
  ): void {
    if (message.author.kind === 'bot') {
      return;
    }
    const repliedMessage = message.replyToMessageId === undefined
      ? undefined
      : this.#messages.getSupergroupTextMessage(message.replyToMessageId);
    let view: BotApiSupergroupTextMessage | undefined;
    for (const memberId of this.#sharedChats.getChatMemberIds(message.chatId)) {
      const bot = this.#bots.getById(memberId)?.profile;
      if (
        bot === undefined || !this.#isSubscribed(bot.id, updateType) ||
        !(bot.can_read_all_group_messages || isAddressedToBot(message, repliedMessage, bot))
      ) {
        continue;
      }
      view ??= this.#botMessageViews.viewSupergroupTextMessage(message);
      this.#enqueueMessage(bot.id, updateType, view);
    }
  }

  #enqueueMessage(botId: number, updateType: MessageUpdateType, message: BotApiTextMessage): void {
    if (updateType === 'message') {
      this.#botUpdates.enqueueMessageUpdate(botId, message);
    } else {
      this.#botUpdates.enqueueEditedMessageUpdate(botId, message);
    }
  }

  /** A callback query is observed only by the bot whose message carries the pressed button. */
  #deliverCallbackQuery({ callbackQuery, message }: CallbackQueryCreatedEvent): void {
    const observingBotId = callbackQuery.botId;
    if (!this.#isSubscribed(observingBotId, 'callback_query')) {
      return;
    }

    this.#botUpdates.enqueueCallbackQueryUpdate(
      observingBotId,
      this.#botMessageViews.viewCallbackQueryForBot(callbackQuery, message),
    );
  }

  /** A block or unblock is observed only by the bot whose membership in the chat changed. */
  #deliverBotBlockChange(event: BotBlockChangedEvent): void {
    if (!this.#isSubscribed(event.botId, 'my_chat_member')) {
      return;
    }

    this.#botUpdates.enqueueMyChatMemberUpdate(
      event.botId,
      this.#botMessageViews.viewBotBlockChangeForBot(event),
    );
  }

  /**
   * A bot's addition to a group is observed by the added bot. Telegram also shows every addition
   * to the group's bots as a service message, which the emulator does not produce.
   */
  #deliverChatMemberAddition(event: ChatMemberAddedEvent): void {
    if (
      this.#bots.getById(event.memberId) === undefined ||
      !this.#isSubscribed(event.memberId, 'my_chat_member')
    ) {
      return;
    }

    this.#botUpdates.enqueueMyChatMemberUpdate(
      event.memberId,
      this.#botMessageViews.viewBotJoinedGroupForBot(event),
    );
  }

  #isSubscribed(botId: number, updateType: BotApiUpdateType): boolean {
    return this.#updateSubscriptions.getAllowedUpdateTypes(botId).has(updateType);
  }
}

/**
 * Whether an account's supergroup message is addressed to a bot in privacy mode, which then
 * receives it: a command at the start of the text that is not addressed to another bot, a reply
 * to one of the bot's messages, or a mention of the bot.
 *
 * Telegram documents that a command without a bot's username reaches only the bot that last wrote
 * to the group; the emulator delivers it to every bot in privacy mode.
 */
function isAddressedToBot(
  message: SupergroupTextMessage,
  repliedMessage: SupergroupTextMessage | undefined,
  bot: VirtualBotProfile,
): boolean {
  const isReplyToBot = repliedMessage?.author.kind === 'bot' &&
    repliedMessage.author.botId === bot.id;
  return isReplyToBot || startsWithCommandForBot(message, bot) || mentionsBot(message, bot);
}

function startsWithCommandForBot(message: SupergroupTextMessage, bot: VirtualBotProfile): boolean {
  const leadingCommand = message.entities.find((entity) =>
    entity.type === 'bot_command' && entity.offset === 0
  );
  if (leadingCommand === undefined) {
    return false;
  }
  const [, addressedUsername] = message.text.slice(0, leadingCommand.length).split('@');
  return addressedUsername === undefined ||
    addressedUsername.toLowerCase() === bot.username.toLowerCase();
}

/** Mentions by username are matched as Telegram clients mark them, ignoring letter case. */
function mentionsBot(message: SupergroupTextMessage, bot: VirtualBotProfile): boolean {
  const mentionsById = message.entities.some((entity) =>
    entity.type === 'text_mention' && entity.userId === bot.id
  );
  // Usernames consist of letters, digits, and underscores, which need no escaping.
  const usernameMention = new RegExp(`(?<![\\p{L}\\p{N}_])@${bot.username}(?![A-Za-z0-9_])`, 'iu');
  return mentionsById || usernameMention.test(message.text);
}
