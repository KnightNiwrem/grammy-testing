import type { User } from 'grammy/types';

export type VirtualAccountProfile = Readonly<User> & {
  readonly is_bot: false;
};

export interface VirtualAccount {
  readonly profile: VirtualAccountProfile;
}
