import type { User } from 'grammy/types';

export type VirtualAccountProfile = Readonly<User> & {
  readonly is_bot: false;
};

export interface VirtualAccount {
  readonly profile: VirtualAccountProfile;
  /**
   * Whether the account's privacy settings keep forwards of its messages from linking to it, as
   * Telegram's "Forwarded messages" setting does; the Bot API reports it as `has_private_forwards`.
   */
  readonly hasPrivateForwards: boolean;
}

/**
 * The name that forwards of an account's messages show instead of linking to the account, as
 * TDLib's `get_user_private_forward_name` returns it: the account's name, as TDLib's
 * `get_user_title` joins it, when its privacy settings hide it from forwards. Returns `undefined`
 * for an account whose forwards link to it.
 */
export function getPrivateForwardName(
  { profile, hasPrivateForwards }: VirtualAccount,
): string | undefined {
  if (!hasPrivateForwards) {
    return undefined;
  }
  return profile.last_name === undefined
    ? profile.first_name
    : `${profile.first_name} ${profile.last_name}`;
}
