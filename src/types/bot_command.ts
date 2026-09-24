/** The most characters Telegram allows in a bot command, without its leading slash. */
export const MAX_BOT_COMMAND_LENGTH = 32;

/** The most characters Telegram allows in a bot command's description. */
export const MAX_BOT_COMMAND_DESCRIPTION_LENGTH = 256;

/** The most commands one scope and language can list. */
export const MAX_BOT_COMMAND_COUNT = 100;

/** A command a bot lists for users' clients to suggest. */
export interface BotCommand {
  /** The command without its leading slash: lowercase English letters, digits, and underscores. */
  readonly command: string;
  readonly description: string;
  readonly isEphemeral: boolean;
}

/**
 * The users and chats a bot's command list applies to. Chat scopes identify the chat by its Bot
 * API ID, which for a private chat is the other user's ID.
 */
export type BotCommandScope =
  | { readonly type: 'default' }
  | { readonly type: 'all_private_chats' }
  | { readonly type: 'all_group_chats' }
  | { readonly type: 'all_chat_administrators' }
  | { readonly type: 'chat'; readonly chatId: number }
  | { readonly type: 'chat_administrators'; readonly chatId: number }
  | { readonly type: 'chat_member'; readonly chatId: number; readonly userId: number };

/**
 * A two-letter ISO 639-1 language code that a command list is for, or the empty string for users
 * whose language has no dedicated list.
 */
export type BotCommandLanguageCode = string;
