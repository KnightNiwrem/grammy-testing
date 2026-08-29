/* eslint-disable max-classes-per-file -- ModerationActionsView is tightly coupled to ModerationLog */

import type { Context } from 'grammy';
import type { ChatPermissions } from 'grammy/types';

import type { PermissionFlags } from './types';
import type { User } from './user';

/**
 * Discriminates what a captured moderation call did:
 * - `'ban'` — `banChatMember`
 * - `'unban'` — `unbanChatMember`
 * - `'restrict'` — `restrictChatMember`
 * - `'promote'` — `promoteChatMember` with at least one right granted
 * - `'demote'` — `promoteChatMember` with all boolean rights false/absent
 *   (the Bot API documents all-false promote calls as demotions)
 */
export type ModerationActionKind = 'ban' | 'demote' | 'promote' | 'restrict' | 'unban';

/**
 * A captured `banChatMember` / `unbanChatMember` / `restrictChatMember` /
 * `promoteChatMember` API call, normalised for test assertions.
 */
export interface ModerationAction<TContext extends Context = Context> {
  /** What the call did (`'promote'` vs `'demote'` is derived from the flags). */
  kind: ModerationActionKind;
  /** The raw API method name (`banChatMember`, `unbanChatMember`, `restrictChatMember`, `promoteChatMember`). */
  method: string;
  /** The `chat_id` from the payload. */
  chatId: number | string;
  /** The `user_id` from the payload. */
  userId: number;
  /** The targeted `User` actor when it was minted by this orchestrator, otherwise `undefined`. */
  user: User<TContext> | undefined;
  /** The raw `until_date` from the payload (`banChatMember` / `restrictChatMember`), unclamped. */
  untilDate?: number;
  /** The `revoke_messages` flag from a `banChatMember` payload. */
  revokeMessages?: boolean;
  /** The `only_if_banned` flag from an `unbanChatMember` payload. */
  onlyIfBanned?: boolean;
  /**
   * The effective permission flags of the call. For `'restrict'` this is the payload's
   * `permissions` object after applying the Bot API's implied-permission grouping (see
   * `use_independent_chat_permissions`); for `'promote'` these are the granted administrator
   * rights with `can_manage_chat` implied by any other privilege.
   */
  permissions?: PermissionFlags;
  /** The original captured outgoing-API payload (escape hatch). */
  raw: Record<string, unknown>;
}

/**
 * Read-only filtered view over moderation actions. Returned by the per-kind
 * getters on `ModerationLog` (`bans`, `restrictions`, …) and by `byUser`.
 */
export class ModerationActionsView<TContext extends Context = Context> {
  /**
   * Creates a view over the given actions.
   * @param items - The actions this view exposes, in capture order.
   */
  constructor(protected readonly items: readonly ModerationAction<TContext>[]) {}

  /**
   * Number of actions in this view.
   * @returns The count of captured actions.
   */
  get length(): number {
    return this.items.length;
  }

  /**
   * The most recently captured action in this view, or `undefined` if it is empty.
   * @returns The last action, or `undefined`.
   */
  get last(): ModerationAction<TContext> | undefined {
    return this.items.at(-1);
  }

  /**
   * Read-only view of all actions in capture order.
   * @returns A read-only array of all captured actions.
   */
  get all(): readonly ModerationAction<TContext>[] {
    return this.items;
  }

  /**
   * Returns the last action or throws if the view is empty.
   * @returns The last `ModerationAction<TContext>`.
   * @throws {Error} When the view is empty.
   */
  lastOrThrow(): ModerationAction<TContext> {
    const last = this.items.at(-1);

    if (last === undefined) {
      throw new Error('Expected a moderation action but the log is empty');
    }

    return last;
  }

  /**
   * Narrows this view to actions targeting the given user.
   * @param user - A `User` actor or a plain Telegram user ID.
   * @returns A new view containing only actions whose `userId` matches.
   */
  byUser(user: User<TContext> | number): ModerationActionsView<TContext> {
    const userId = typeof user === 'number' ? user : user.id;

    return new ModerationActionsView(this.items.filter((action) => action.userId === userId));
  }
}

/**
 * Per-chat collection of captured moderation calls in capture order.
 * Exposed as `chat.moderation` on `Group`, `Supergroup`, and `Channel`.
 */
export class ModerationLog<TContext extends Context = Context> extends ModerationActionsView<TContext> {
  /** Creates an empty log. */
  constructor() {
    super([]);
  }

  /**
   * Appends a captured moderation action to the log.
   * @param action - The action to append.
   */
  push(action: ModerationAction<TContext>): void {
    (this.items as ModerationAction<TContext>[]).push(action);
  }

  /** Removes all actions from the log. */
  clear(): void {
    (this.items as ModerationAction<TContext>[]).length = 0;
  }

  /**
   * Captured `banChatMember` calls.
   * @returns A view of all `'ban'` actions.
   */
  get bans(): ModerationActionsView<TContext> {
    return this.ofKind('ban');
  }

  /**
   * Captured `unbanChatMember` calls.
   * @returns A view of all `'unban'` actions.
   */
  get unbans(): ModerationActionsView<TContext> {
    return this.ofKind('unban');
  }

  /**
   * Captured `restrictChatMember` calls.
   * @returns A view of all `'restrict'` actions.
   */
  get restrictions(): ModerationActionsView<TContext> {
    return this.ofKind('restrict');
  }

  /**
   * Captured `promoteChatMember` calls that granted at least one right.
   * @returns A view of all `'promote'` actions.
   */
  get promotions(): ModerationActionsView<TContext> {
    return this.ofKind('promote');
  }

  /**
   * Captured `promoteChatMember` calls with all boolean rights false/absent —
   * the Bot API documents these as demotions.
   * @returns A view of all `'demote'` actions.
   */
  get demotions(): ModerationActionsView<TContext> {
    return this.ofKind('demote');
  }

  /**
   * Narrows the log to a single action kind.
   * @param kind - The kind to filter by.
   * @returns A view containing only actions of that kind.
   */
  private ofKind(kind: ModerationActionKind): ModerationActionsView<TContext> {
    return new ModerationActionsView(this.items.filter((action) => action.kind === kind));
  }
}

/** All boolean administrator-right parameters accepted by `promoteChatMember`. */
const PROMOTE_FLAG_KEYS = [
  'is_anonymous',
  'can_manage_chat',
  'can_delete_messages',
  'can_manage_video_chats',
  'can_restrict_members',
  'can_promote_members',
  'can_change_info',
  'can_invite_users',
  'can_manage_tags',
  'can_post_stories',
  'can_edit_stories',
  'can_delete_stories',
  'can_post_messages',
  'can_edit_messages',
  'can_pin_messages',
  'can_manage_topics',
  'can_manage_direct_messages',
] as const;

type PromoteFlagKey = (typeof PROMOTE_FLAG_KEYS)[number];

/**
 * Extracts the boolean administrator-right flags from a `promoteChatMember` payload.
 * Only explicitly passed flags appear in the result — absent flags mean `false` on
 * real Telegram and are left out.
 * @param payload - The raw `promoteChatMember` payload.
 * @returns The subset of `PROMOTE_FLAG_KEYS` present in the payload.
 */
export function extractPromoteFlags(payload: Record<string, unknown>): Partial<Record<PromoteFlagKey, boolean>> {
  const flags: Partial<Record<PromoteFlagKey, boolean>> = {};

  for (const key of PROMOTE_FLAG_KEYS) {
    // eslint-disable-next-line security/detect-object-injection -- key iterates a const tuple of known flag names
    const value = payload[key];

    if (typeof value === 'boolean') {
      // eslint-disable-next-line security/detect-object-injection -- key iterates a const tuple of known flag names
      flags[key] = value;
    }
  }

  return flags;
}

/** The member-permission keys the Bot API checks when deciding whether a restrict call lifts all restrictions. */
const CHAT_PERMISSION_KEYS = [
  'can_send_messages',
  'can_send_audios',
  'can_send_documents',
  'can_send_photos',
  'can_send_videos',
  'can_send_video_notes',
  'can_send_voice_notes',
  'can_send_polls',
  'can_send_other_messages',
  'can_add_web_page_previews',
  'can_change_info',
  'can_invite_users',
  'can_pin_messages',
  'can_manage_topics',
  'can_react_to_messages',
  'can_edit_tag',
] as const;

const MEDIA_SEND_KEYS = [
  'can_send_messages',
  'can_send_audios',
  'can_send_documents',
  'can_send_photos',
  'can_send_videos',
  'can_send_video_notes',
  'can_send_voice_notes',
] as const;

/**
 * Applies the Bot API's implied-permission grouping to a `restrictChatMember`
 * `permissions` object. Unless `use_independent_chat_permissions` is passed:
 * `can_send_other_messages` / `can_add_web_page_previews` imply `can_send_messages`
 * and every media-send permission, and `can_send_polls` implies `can_send_messages`.
 * Afterwards the documented omitted-flag defaults apply: `can_react_to_messages`
 * defaults to `can_send_messages`, and `can_manage_topics` / `can_edit_tag`
 * default to `can_pin_messages`.
 * @param permissions - The raw `permissions` object from the payload.
 * @param independent - The payload's `use_independent_chat_permissions` flag.
 * @returns The effective permission flags after grouping.
 */
export function expandChatPermissions(permissions: ChatPermissions, independent: boolean | undefined): PermissionFlags {
  const flags: PermissionFlags = { ...permissions };

  if (independent !== true) {
    if (flags.can_send_other_messages === true || flags.can_add_web_page_previews === true) {
      for (const key of MEDIA_SEND_KEYS) {
        // eslint-disable-next-line security/detect-object-injection -- key iterates a const tuple of known flag names
        flags[key] = true;
      }
    }

    if (flags.can_send_polls === true) {
      flags.can_send_messages = true;
    }
  }

  flags.can_react_to_messages ??= flags.can_send_messages;
  flags.can_manage_topics ??= flags.can_pin_messages;
  flags.can_edit_tag ??= flags.can_pin_messages;

  return flags;
}

/**
 * Returns `true` when the (already expanded) permission flags grant everything —
 * the Bot API documents "Pass True for all permissions" as lifting restrictions,
 * turning the member back into a plain `'member'`.
 * @param permissions - The expanded permission flags.
 * @returns `true` when every member permission is granted.
 */
export function liftsAllRestrictions(permissions: PermissionFlags): boolean {
  // eslint-disable-next-line security/detect-object-injection -- key iterates a const tuple of known flag names
  return CHAT_PERMISSION_KEYS.every((key) => permissions[key] === true);
}

/** Seconds in 366 days — the Bot API's upper clamp for `until_date`. */
const MAX_UNTIL_DATE_SECONDS = 366 * 24 * 60 * 60;

/** Seconds under which an `until_date` counts as "forever" on real Telegram. */
const MIN_UNTIL_DATE_SECONDS = 30;

/**
 * Applies the Bot API's `until_date` clamping: a date less than 30 seconds or more
 * than 366 days from now means the ban/restriction is forever, which `ChatMember`
 * shapes encode as `until_date: 0` (this library models forever as `undefined`).
 * @param untilDate - The raw `until_date` from the payload.
 * @param now - The current Unix timestamp in seconds.
 * @returns The `until_date` to store, or `undefined` for forever.
 */
export function clampUntilDate(untilDate: number | undefined, now: number): number | undefined {
  if (untilDate === undefined) {
    return undefined;
  }

  if (untilDate < now + MIN_UNTIL_DATE_SECONDS || untilDate > now + MAX_UNTIL_DATE_SECONDS) {
    return undefined;
  }

  return untilDate;
}
