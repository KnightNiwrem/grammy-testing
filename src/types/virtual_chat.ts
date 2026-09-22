export interface PrivateConversationKey {
  readonly accountId: number;
  readonly botId: number;
}

export interface PrivateConversation extends PrivateConversationKey {
  readonly kind: 'private';
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
