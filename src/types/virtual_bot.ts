import type { UserFromGetMe } from 'grammy/types';

export type VirtualBotProfile = Readonly<UserFromGetMe>;

export interface VirtualBot {
  readonly token: string;
  readonly profile: VirtualBotProfile;
}
