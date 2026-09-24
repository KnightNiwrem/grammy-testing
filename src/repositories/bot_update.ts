import type {
  BotApiCallbackQuery,
  BotApiMyChatMemberUpdated,
  BotApiTextMessage,
  BotApiUpdate,
} from '../types/bot_api.ts';

/**
 * How far beyond the ID of the next update an offset can be before Telegram ignores it. From the
 * "from_id is in the future" check in TDLib's `TQueue::get`, which the official Bot API server
 * answers by reading from the queue head instead.
 */
const MAX_OFFSET_BEYOND_NEXT_UPDATE_ID = 10;

interface ConfirmAndReadPendingUpdatesInput {
  /**
   * Updates with a lower ID are confirmed and forgotten; `undefined` confirms none. As on Telegram,
   * an ID more than 10 beyond the ID the next update will receive also confirms none.
   */
  readonly firstUnconfirmedUpdateId?: number;
  readonly limit: number;
}

interface WaitForUpdateInput {
  readonly timeoutSeconds: number;
  readonly signal?: AbortSignal;
}

interface BotUpdateMailbox {
  nextUpdateId: number;
  readonly updates: BotApiUpdate[];
}

/** Owns each bot's independently sequenced pending Bot API updates. */
export class BotUpdateRepository {
  readonly #mailboxesByBotId = new Map<number, BotUpdateMailbox>();
  readonly #waitersByBotId = new Map<number, Set<() => void>>();

  enqueueMessageUpdate(botId: number, message: BotApiTextMessage): BotApiUpdate {
    return this.#enqueueUpdate(botId, (update_id) => ({ update_id, message }));
  }

  enqueueEditedMessageUpdate(botId: number, editedMessage: BotApiTextMessage): BotApiUpdate {
    return this.#enqueueUpdate(
      botId,
      (update_id) => ({ update_id, edited_message: editedMessage }),
    );
  }

  enqueueCallbackQueryUpdate(botId: number, callbackQuery: BotApiCallbackQuery): BotApiUpdate {
    return this.#enqueueUpdate(
      botId,
      (update_id) => ({ update_id, callback_query: callbackQuery }),
    );
  }

  enqueueMyChatMemberUpdate(botId: number, myChatMember: BotApiMyChatMemberUpdated): BotApiUpdate {
    return this.#enqueueUpdate(
      botId,
      (update_id) => ({ update_id, my_chat_member: myChatMember }),
    );
  }

  /**
   * Converts a Bot API offset, which may count back from the queue tail, into the ID of the first
   * update to keep. The result depends on the current queue, so resolve it once per request.
   */
  resolveFirstUnconfirmedUpdateId(botId: number, offset: number | undefined): number | undefined {
    if (offset === undefined || offset >= 0) {
      return offset;
    }

    const mailbox = this.#getOrCreateMailbox(botId);
    const retainedUpdateCount = Math.min(-offset, mailbox.updates.length);
    const firstRetainedUpdate = mailbox.updates[mailbox.updates.length - retainedUpdateCount];
    return firstRetainedUpdate?.update_id ?? mailbox.nextUpdateId;
  }

  /** Confirms updates preceding `firstUnconfirmedUpdateId`, then reads pending updates. */
  confirmAndReadPendingUpdates(
    botId: number,
    { firstUnconfirmedUpdateId, limit }: ConfirmAndReadPendingUpdatesInput,
  ): readonly BotApiUpdate[] {
    const mailbox = this.#getOrCreateMailbox(botId);
    if (
      firstUnconfirmedUpdateId !== undefined &&
      firstUnconfirmedUpdateId <= mailbox.nextUpdateId + MAX_OFFSET_BEYOND_NEXT_UPDATE_ID
    ) {
      const firstUnconfirmedUpdateIndex = mailbox.updates.findIndex((update) =>
        update.update_id >= firstUnconfirmedUpdateId
      );
      if (firstUnconfirmedUpdateIndex === -1) {
        mailbox.updates.splice(0);
      } else if (firstUnconfirmedUpdateIndex > 0) {
        mailbox.updates.splice(0, firstUnconfirmedUpdateIndex);
      }
    }

    return mailbox.updates.slice(0, limit);
  }

  /** Forgets every pending update; later updates continue the bot's update ID sequence. */
  discardPendingUpdates(botId: number): void {
    this.#getOrCreateMailbox(botId).updates.splice(0);
  }

  /** Resolves when an update is enqueued for the bot, the timeout elapses, or `signal` aborts. */
  waitForUpdate(botId: number, { timeoutSeconds, signal }: WaitForUpdateInput): Promise<void> {
    return new Promise((resolve) => {
      if (signal?.aborted === true) {
        resolve();
        return;
      }

      const waiters = this.#waitersByBotId.get(botId) ?? new Set<() => void>();

      const finish = () => {
        clearTimeout(timeoutId);
        signal?.removeEventListener('abort', finish);
        waiters.delete(finish);
        if (waiters.size === 0) {
          this.#waitersByBotId.delete(botId);
        }
        resolve();
      };

      waiters.add(finish);
      this.#waitersByBotId.set(botId, waiters);
      const timeoutId = setTimeout(finish, timeoutSeconds * 1_000);
      signal?.addEventListener('abort', finish, { once: true });
    });
  }

  #enqueueUpdate(botId: number, createUpdate: (updateId: number) => BotApiUpdate): BotApiUpdate {
    const mailbox = this.#getOrCreateMailbox(botId);
    const update = createUpdate(mailbox.nextUpdateId++);
    mailbox.updates.push(update);
    this.#notifyWaiters(botId);
    return update;
  }

  #getOrCreateMailbox(botId: number): BotUpdateMailbox {
    const existingMailbox = this.#mailboxesByBotId.get(botId);
    if (existingMailbox !== undefined) {
      return existingMailbox;
    }

    const mailbox: BotUpdateMailbox = { nextUpdateId: 1, updates: [] };
    this.#mailboxesByBotId.set(botId, mailbox);
    return mailbox;
  }

  #notifyWaiters(botId: number): void {
    for (const finish of [...(this.#waitersByBotId.get(botId) ?? [])]) {
      finish();
    }
  }
}
