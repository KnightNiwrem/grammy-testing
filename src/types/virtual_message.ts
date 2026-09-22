import type { PrivateConversationKey } from './virtual_chat.ts';

export const MAX_TEXT_MESSAGE_LENGTH = 4_096;

/** Canonical account-authored text stored in a private conversation. */
export interface PrivateTextMessage {
  readonly kind: 'private_text';
  readonly messageId: number;
  readonly conversation: PrivateConversationKey;
  readonly authorAccountId: number;
  readonly sentAtUnixSeconds: number;
  readonly text: string;
}
