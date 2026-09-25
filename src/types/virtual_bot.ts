import type { UserFromGetMe } from 'grammy/types';

export type VirtualBotProfile = Readonly<UserFromGetMe>;

export interface VirtualBot {
  readonly token: string;
  readonly profile: VirtualBotProfile;
  /**
   * Whether the bot receives a `chosen_inline_result` update for each inline query result an
   * account sends, as BotFather's inline feedback setting turns on. It matters only for a bot that
   * supports inline queries.
   */
  readonly receivesChosenInlineResults: boolean;
}
