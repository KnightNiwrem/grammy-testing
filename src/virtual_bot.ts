import type { User } from 'grammy/types';

export type VirtualBotProfile = Readonly<User> & {
  readonly is_bot: true;
  readonly username: string;
};

export interface VirtualBot {
  readonly token: string;
  readonly profile: VirtualBotProfile;
}
