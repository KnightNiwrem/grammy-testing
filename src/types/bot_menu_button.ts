import type { BotApiMenuButton } from './bot_api.ts';

/**
 * The button a user's client shows next to the message field of a private chat with a bot: the
 * bot's command list, a Web App, or no specific choice, which leaves it to the client.
 */
export type BotMenuButton =
  | { readonly kind: 'commands' }
  | { readonly kind: 'web_app'; readonly text: string; readonly url: string }
  | { readonly kind: 'default' };

/** No specific menu button, as for a bot that has chosen none. */
export const DEFAULT_BOT_MENU_BUTTON: BotMenuButton = { kind: 'default' };

/** Shows a menu button in the shape of the Bot API's `MenuButton`. */
export function toBotApiMenuButton(menuButton: BotMenuButton): BotApiMenuButton {
  return menuButton.kind === 'web_app'
    ? { type: 'web_app', text: menuButton.text, web_app: { url: menuButton.url } }
    : { type: menuButton.kind };
}
