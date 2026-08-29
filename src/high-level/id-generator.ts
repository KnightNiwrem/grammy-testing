/**
 * Monotonic id generator scoped to a single {@link Chats} instance.
 * Different ranges per kind keep test debugging readable
 * (a 100M-range id is a user; -1B-range is a group, etc.).
 */
export class IdGenerator {
  private userCounter = 100_000_000;

  private groupCounter = -1_000_000_000;

  private supergroupCounter = -1_001_000_000_000;

  private channelCounter = -1_002_000_000_000;

  private messageCounter = 1;

  /** Message IDs claimed out-of-band (e.g. explicit forum topic thread IDs) that `nextMessageId` must never hand out. */
  private readonly reservedMessageIds = new Set<number>();

  private mediaGroupCounter = 1;

  private fileCounter = 1;

  private updateCounter = 1_000_000;

  /**
   * Returns the next unique user ID in the 100 million range.
   * @returns A unique positive integer user ID.
   */
  nextUserId(): number {
    const id = this.userCounter;

    this.userCounter += 1;

    return id;
  }

  /**
   * Returns the next unique group ID in the negative 1 billion range.
   * @returns A unique negative integer group ID.
   */
  nextGroupId(): number {
    const id = this.groupCounter;

    this.groupCounter -= 1;

    return id;
  }

  /**
   * Returns the next unique supergroup ID in the negative 1 trillion range.
   * @returns A unique negative integer supergroup ID.
   */
  nextSupergroupId(): number {
    const id = this.supergroupCounter;

    this.supergroupCounter -= 1;

    return id;
  }

  /**
   * Returns the next unique channel ID in the negative 1.002 trillion range.
   * @returns A unique negative integer channel ID.
   */
  nextChannelId(): number {
    const id = this.channelCounter;

    this.channelCounter -= 1;

    return id;
  }

  /**
   * Returns the next unique message ID, starting at 1 and incrementing by 1.
   * IDs reserved via {@link reserveMessageId} are skipped so they are never
   * handed out to a synthetic message.
   * @returns A unique positive integer message ID.
   */
  nextMessageId(): number {
    let id = this.messageCounter;

    while (this.reservedMessageIds.has(id)) {
      id += 1;
    }

    this.messageCounter = id + 1;

    return id;
  }

  /**
   * Reserves a message ID claimed out-of-band — e.g. an explicit forum topic
   * `message_thread_id`, which in real Telegram is the `message_id` of the
   * topic-creation service message. Reserved IDs are never returned by
   * `nextMessageId`, so no synthetic message can collide with them.
   * @param id - The message ID to reserve.
   */
  reserveMessageId(id: number): void {
    this.reservedMessageIds.add(id);
  }

  /**
   * Reports whether `nextMessageId` has already handed out the given ID to a
   * synthetic message. Every ID below the counter was issued unless it was
   * reserved (reserved IDs are skipped, never issued).
   * @param id - The message ID to check.
   * @returns `true` when the ID was already allocated to a message.
   */
  hasIssuedMessageId(id: number): boolean {
    return id < this.messageCounter && !this.reservedMessageIds.has(id);
  }

  /**
   * Returns the next unique media group ID as a string token (e.g. `"mg-1"`).
   * @returns A unique media group ID string.
   */
  nextMediaGroupId(): string {
    const id = this.mediaGroupCounter;

    this.mediaGroupCounter += 1;

    return `mg-${String(id)}`;
  }

  /**
   * Returns the next unique stub file ID string (e.g. `"stub-file-1"`).
   * @returns A unique file ID string.
   */
  nextFileId(): string {
    const id = this.fileCounter;

    this.fileCounter += 1;

    return `stub-file-${String(id)}`;
  }

  /**
   * Returns the next unique update ID, starting at 1 000 000 and incrementing by 1.
   * @returns A unique positive integer update ID.
   */
  nextUpdateId(): number {
    const id = this.updateCounter;

    this.updateCounter += 1;

    return id;
  }
}
