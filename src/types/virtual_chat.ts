export interface PrivateConversationKey {
  readonly accountId: number;
  readonly botId: number;
}

/** Which participant of a private conversation, identified relative to its key. */
export type PrivateConversationRole = 'account' | 'bot';

export interface PrivateConversation extends PrivateConversationKey {
  readonly kind: 'private';
  /**
   * Telegram's `chat_instance`: an opaque signed 64-bit decimal that identifies the chat in
   * callback queries from its messages.
   */
  readonly chatInstance: string;
}

interface SharedChatBase {
  readonly id: number;
  readonly title: string;
}

export interface BasicGroup extends SharedChatBase {
  readonly kind: 'basic_group';
}

export interface Supergroup extends SharedChatBase {
  readonly kind: 'supergroup';
  readonly description?: string;
}

export interface Channel extends SharedChatBase {
  readonly kind: 'channel';
  readonly description?: string;
}

export type SharedChat = BasicGroup | Supergroup | Channel;
