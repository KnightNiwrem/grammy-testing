import type {
  BotApiCallbackQuery,
  BotApiMyChatMemberUpdated,
  BotApiPrivateTextMessage,
  BotApiUpdateType,
} from '../types/bot_api.ts';
import type { CallbackQuery } from '../types/callback_query.ts';
import type {
  BotBlockChangedEvent,
  CallbackQueryCreatedEvent,
  ChatDomainEvent,
} from '../types/chat_domain_event.ts';
import type { PrivateTextMessage } from '../types/virtual_message.ts';

interface BotMessageViews {
  viewPrivateTextMessageForBot(message: PrivateTextMessage): BotApiPrivateTextMessage;
  viewCallbackQueryForBot(
    callbackQuery: CallbackQuery,
    message: PrivateTextMessage,
  ): BotApiCallbackQuery;
  viewBotBlockChangeForBot(event: BotBlockChangedEvent): BotApiMyChatMemberUpdated;
}

interface BotUpdateMailboxes {
  enqueueMessageUpdate(botId: number, message: BotApiPrivateTextMessage): void;
  enqueueCallbackQueryUpdate(botId: number, callbackQuery: BotApiCallbackQuery): void;
  enqueueMyChatMemberUpdate(botId: number, myChatMember: BotApiMyChatMemberUpdated): void;
}

interface BotUpdateSubscriptionLookup {
  getAllowedUpdateTypes(botId: number): ReadonlySet<BotApiUpdateType>;
}

interface BotUpdateDeliveryServiceDependencies {
  readonly botMessageViews: BotMessageViews;
  readonly botUpdates: BotUpdateMailboxes;
  readonly updateSubscriptions: BotUpdateSubscriptionLookup;
}

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

  constructor(
    { botMessageViews, botUpdates, updateSubscriptions }: BotUpdateDeliveryServiceDependencies,
  ) {
    this.#botMessageViews = botMessageViews;
    this.#botUpdates = botUpdates;
    this.#updateSubscriptions = updateSubscriptions;
  }

  publish(event: ChatDomainEvent): void {
    switch (event.type) {
      case 'message_created':
        this.#deliverPrivateTextMessage(event.message);
        return;
      case 'callback_query_created':
        this.#deliverCallbackQuery(event);
        return;
      case 'bot_block_changed':
        this.#deliverBotBlockChange(event);
        return;
      default: {
        const unhandledEvent: never = event;
        throw new Error(`Unhandled chat domain event: ${JSON.stringify(unhandledEvent)}`);
      }
    }
  }

  /**
   * A private message is observed only by the bot of its conversation, which, as on Telegram,
   * receives no update for a message it sent itself.
   */
  #deliverPrivateTextMessage(message: PrivateTextMessage): void {
    const observingBotId = message.conversation.botId;
    if (message.authorRole === 'bot' || !this.#isSubscribed(observingBotId, 'message')) {
      return;
    }

    this.#botUpdates.enqueueMessageUpdate(
      observingBotId,
      this.#botMessageViews.viewPrivateTextMessageForBot(message),
    );
  }

  /** A callback query is observed only by the bot whose message carries the pressed button. */
  #deliverCallbackQuery({ callbackQuery, message }: CallbackQueryCreatedEvent): void {
    const observingBotId = callbackQuery.conversation.botId;
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

  #isSubscribed(botId: number, updateType: BotApiUpdateType): boolean {
    return this.#updateSubscriptions.getAllowedUpdateTypes(botId).has(updateType);
  }
}
