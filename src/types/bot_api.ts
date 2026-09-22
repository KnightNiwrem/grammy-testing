import type { VirtualAccountProfile } from './virtual_account.ts';

export interface BotApiPrivateChat {
  readonly id: number;
  readonly type: 'private';
  readonly first_name: string;
  readonly last_name?: string;
  readonly username?: string;
}

export interface BotApiPrivateTextMessage {
  readonly message_id: number;
  readonly from: VirtualAccountProfile;
  readonly chat: BotApiPrivateChat;
  readonly date: number;
  readonly text: string;
}

export interface BotApiMessageUpdate {
  readonly update_id: number;
  readonly message: BotApiPrivateTextMessage;
}

export type BotApiUpdate = BotApiMessageUpdate;
