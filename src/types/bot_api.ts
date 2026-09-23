import type { VirtualAccountProfile } from './virtual_account.ts';

export interface BotApiPrivateChat {
  readonly id: number;
  readonly type: 'private';
  readonly first_name: string;
  readonly last_name?: string;
  readonly username?: string;
}

/** Offsets and lengths count UTF-16 code units. */
export interface BotApiMessageEntity {
  readonly type: 'bot_command';
  readonly offset: number;
  readonly length: number;
}

export interface BotApiPrivateTextMessage {
  readonly message_id: number;
  readonly from: VirtualAccountProfile;
  readonly chat: BotApiPrivateChat;
  readonly date: number;
  readonly text: string;
  /** Omitted when the text has no entities, as Telegram does. */
  readonly entities?: readonly BotApiMessageEntity[];
}

export interface BotApiMessageUpdate {
  readonly update_id: number;
  readonly message: BotApiPrivateTextMessage;
}

export type BotApiUpdate = BotApiMessageUpdate;
