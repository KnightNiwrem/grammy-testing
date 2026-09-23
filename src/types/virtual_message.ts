import type { PrivateConversationKey } from './virtual_chat.ts';

export const MAX_TEXT_MESSAGE_LENGTH = 4_096;

/**
 * Emulator-internal identity of a canonical message.
 *
 * It is never a Telegram `message_id`: Telegram numbers the same message differently for each
 * observer, so Bot API projections resolve `message_id` from the observer's message box instead.
 */
export type CanonicalMessageId = string;

/**
 * A marked span of message text.
 *
 * Offsets and lengths count UTF-16 code units, as Telegram's message entities do.
 */
export interface TextEntity {
  readonly type: 'bot_command';
  readonly offset: number;
  readonly length: number;
}

/** Canonical account-authored text stored in a private conversation. */
export interface PrivateTextMessage {
  readonly kind: 'private_text';
  readonly id: CanonicalMessageId;
  readonly conversation: PrivateConversationKey;
  readonly authorAccountId: number;
  readonly sentAtUnixSeconds: number;
  readonly text: string;
  readonly entities: readonly TextEntity[];
}
