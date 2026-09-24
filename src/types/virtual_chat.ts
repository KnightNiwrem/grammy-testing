export interface PrivateConversationKey {
  readonly accountId: number;
  readonly botId: number;
}

/**
 * What a bot shows it is doing in a chat, such as typing, by the Bot API names. `cancel` stops
 * showing an action.
 */
export type ChatAction =
  | 'cancel'
  | 'typing'
  | 'record_video'
  | 'upload_video'
  | 'record_voice'
  | 'upload_voice'
  | 'upload_photo'
  | 'upload_document'
  | 'choose_sticker'
  | 'find_location'
  | 'record_video_note'
  | 'upload_video_note';

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
