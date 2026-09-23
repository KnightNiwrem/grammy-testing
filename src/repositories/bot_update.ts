import type { BotApiPrivateTextMessage, BotApiUpdate } from '../types/bot_api.ts';

export interface GetBotUpdatesInput {
  readonly offset?: number;
  readonly limit: number;
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

  enqueueMessageUpdate(botId: number, message: BotApiPrivateTextMessage): BotApiUpdate {
    const mailbox = this.#getOrCreateMailbox(botId);
    const update: BotApiUpdate = {
      update_id: mailbox.nextUpdateId++,
      message,
    };
    mailbox.updates.push(update);
    this.#notifyWaiters(botId);
    return update;
  }

  async getUpdates(botId: number, input: GetBotUpdatesInput): Promise<readonly BotApiUpdate[]> {
    const mailbox = this.#getOrCreateMailbox(botId);
    // Telegram resolves a negative offset once, when the request arrives, so updates enqueued while
    // this request waits are not cut from the tail again.
    const firstUnconfirmedUpdateId = this.#resolveFirstUnconfirmedUpdateId(mailbox, input.offset);

    let updates = this.#selectUpdates(mailbox, firstUnconfirmedUpdateId, input.limit);
    if (updates.length > 0 || input.timeoutSeconds === 0 || input.signal?.aborted === true) {
      return updates;
    }

    await this.#waitForUpdate(botId, input.timeoutSeconds, input.signal);
    updates = this.#selectUpdates(mailbox, firstUnconfirmedUpdateId, input.limit);
    return updates;
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

  /** Converts a Bot API offset, which may count back from the queue tail, into an update ID. */
  #resolveFirstUnconfirmedUpdateId(
    mailbox: BotUpdateMailbox,
    offset: number | undefined,
  ): number | undefined {
    if (offset === undefined || offset >= 0) {
      return offset;
    }

    const retainedUpdateCount = Math.min(-offset, mailbox.updates.length);
    const firstRetainedUpdate = mailbox.updates[mailbox.updates.length - retainedUpdateCount];
    return firstRetainedUpdate?.update_id ?? mailbox.nextUpdateId;
  }

  /** Confirms updates preceding `firstUnconfirmedUpdateId`, then reads pending updates. */
  #selectUpdates(
    mailbox: BotUpdateMailbox,
    firstUnconfirmedUpdateId: number | undefined,
    limit: number,
  ): BotApiUpdate[] {
    if (firstUnconfirmedUpdateId !== undefined) {
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

  #waitForUpdate(botId: number, timeoutSeconds: number, signal?: AbortSignal): Promise<void> {
    return new Promise((resolve) => {
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

  #notifyWaiters(botId: number): void {
    for (const finish of [...(this.#waitersByBotId.get(botId) ?? [])]) {
      finish();
    }
  }
}
