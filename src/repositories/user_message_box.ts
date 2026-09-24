import type { CanonicalMessageId } from '../types/virtual_message.ts';

interface UserMessageBox {
  nextMessageId: number;
  readonly messageIdsByCanonicalId: Map<CanonicalMessageId, number>;
  readonly canonicalIdsByMessageId: Map<number, CanonicalMessageId>;
}

/**
 * Assigns Telegram message IDs from each user's common message box.
 *
 * Accounts and bots each own one box. Private-chat and basic-group messages take the next ID in the
 * box of every participant they are delivered to, so one canonical message can have a different
 * Telegram message ID for each observer.
 */
export class UserMessageBoxRepository {
  readonly #messageBoxesByOwnerId = new Map<number, UserMessageBox>();

  /** Adds a canonical message to the owner's box and returns its Telegram message ID there. */
  assignMessageId(ownerId: number, canonicalMessageId: CanonicalMessageId): number {
    const messageBox = this.#getOrCreateMessageBox(ownerId);
    if (messageBox.messageIdsByCanonicalId.has(canonicalMessageId)) {
      throw new Error(
        `Message ${canonicalMessageId} already has a message ID in the box of ${ownerId}`,
      );
    }

    const messageId = messageBox.nextMessageId++;
    messageBox.messageIdsByCanonicalId.set(canonicalMessageId, messageId);
    messageBox.canonicalIdsByMessageId.set(messageId, canonicalMessageId);
    return messageId;
  }

  getMessageId(ownerId: number, canonicalMessageId: CanonicalMessageId): number | undefined {
    return this.#messageBoxesByOwnerId.get(ownerId)?.messageIdsByCanonicalId.get(
      canonicalMessageId,
    );
  }

  /** Resolves a Telegram message ID in the owner's box to the canonical message it numbers. */
  getCanonicalMessageId(ownerId: number, messageId: number): CanonicalMessageId | undefined {
    return this.#messageBoxesByOwnerId.get(ownerId)?.canonicalIdsByMessageId.get(messageId);
  }

  #getOrCreateMessageBox(ownerId: number): UserMessageBox {
    const existingMessageBox = this.#messageBoxesByOwnerId.get(ownerId);
    if (existingMessageBox !== undefined) {
      return existingMessageBox;
    }

    const messageBox: UserMessageBox = {
      nextMessageId: 1,
      messageIdsByCanonicalId: new Map(),
      canonicalIdsByMessageId: new Map(),
    };
    this.#messageBoxesByOwnerId.set(ownerId, messageBox);
    return messageBox;
  }
}
