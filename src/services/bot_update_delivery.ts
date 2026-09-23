import { projectPrivateTextMessage } from '../projections/bot_api_message.ts';
import type { BotApiPrivateTextMessage } from '../types/bot_api.ts';
import type { ChatDomainEvent } from '../types/chat_domain_event.ts';
import type { VirtualAccount } from '../types/virtual_account.ts';
import type { CanonicalMessageId, PrivateTextMessage } from '../types/virtual_message.ts';

interface AccountLookup {
  getById(accountId: number): VirtualAccount | undefined;
}

interface MessageIdLookup {
  getMessageId(ownerId: number, canonicalMessageId: CanonicalMessageId): number | undefined;
}

interface BotUpdateMailboxes {
  enqueueMessageUpdate(botId: number, message: BotApiPrivateTextMessage): void;
}

interface BotUpdateDeliveryServiceDependencies {
  readonly accounts: AccountLookup;
  readonly userMessageBoxes: MessageIdLookup;
  readonly botUpdates: BotUpdateMailboxes;
}

/**
 * Turns chat domain events into Bot API updates.
 *
 * It selects the bots that observe each event, projects the event for each of them, and appends
 * the resulting update to that bot's mailbox.
 */
export class BotUpdateDeliveryService {
  readonly #accounts: AccountLookup;
  readonly #userMessageBoxes: MessageIdLookup;
  readonly #botUpdates: BotUpdateMailboxes;

  constructor({ accounts, userMessageBoxes, botUpdates }: BotUpdateDeliveryServiceDependencies) {
    this.#accounts = accounts;
    this.#userMessageBoxes = userMessageBoxes;
    this.#botUpdates = botUpdates;
  }

  publish(event: ChatDomainEvent): void {
    switch (event.type) {
      case 'message_created':
        this.#deliverPrivateTextMessage(event.message);
        return;
      default: {
        const unhandledEventType: never = event.type;
        throw new Error(`Unhandled chat domain event: ${unhandledEventType}`);
      }
    }
  }

  /** A private message is observed only by the bot of its conversation. */
  #deliverPrivateTextMessage(message: PrivateTextMessage): void {
    const observingBotId = message.conversation.botId;
    const author = this.#accounts.getById(message.authorAccountId);
    if (author === undefined) {
      throw new Error(`Author ${message.authorAccountId} of message ${message.id} does not exist`);
    }
    const observerMessageId = this.#userMessageBoxes.getMessageId(observingBotId, message.id);
    if (observerMessageId === undefined) {
      throw new Error(`Private message ${message.id} was not delivered to bot ${observingBotId}`);
    }

    this.#botUpdates.enqueueMessageUpdate(
      observingBotId,
      projectPrivateTextMessage({ message, author: author.profile, observerMessageId }),
    );
  }
}
