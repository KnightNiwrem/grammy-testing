/** Each account's block list: the users, such as bots, whose messages it refuses. */
export class BlockedUserRepository {
  readonly #blockedUserIdsByAccountId = new Map<number, Set<number>>();

  /** Adds the user to the account's block list; returns whether the account did not block it. */
  block(accountId: number, userId: number): boolean {
    const blockedUserIds = this.#blockedUserIdsByAccountId.get(accountId) ?? new Set<number>();
    if (blockedUserIds.has(userId)) {
      return false;
    }
    blockedUserIds.add(userId);
    this.#blockedUserIdsByAccountId.set(accountId, blockedUserIds);
    return true;
  }

  /** Removes the user from the account's block list; returns whether the account blocked it. */
  unblock(accountId: number, userId: number): boolean {
    return this.#blockedUserIdsByAccountId.get(accountId)?.delete(userId) ?? false;
  }

  isBlocked(accountId: number, userId: number): boolean {
    return this.#blockedUserIdsByAccountId.get(accountId)?.has(userId) ?? false;
  }
}
