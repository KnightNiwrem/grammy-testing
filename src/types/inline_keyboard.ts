import type { ButtonAppearance } from './button_appearance.ts';

/** The most bytes of UTF-8 callback data Telegram accepts on one button. */
export const MAX_CALLBACK_DATA_BYTES = 64;

/** The Bot API's documented limit on the text a copy-text button copies. */
export const MAX_COPIED_TEXT_LENGTH = 256;

/** A button that sends its callback data to the message's bot when a user presses it. */
export interface CallbackInlineKeyboardButton extends ButtonAppearance {
  readonly kind: 'callback';
  readonly text: string;
  readonly callbackData: string;
}

/** A button that opens a URL on the user's device, without involving the bot. */
export interface UrlInlineKeyboardButton extends ButtonAppearance {
  readonly kind: 'url';
  readonly text: string;
  readonly url: string;
}

/** A button that copies text to the user's clipboard, without involving the bot. */
export interface CopyTextInlineKeyboardButton extends ButtonAppearance {
  readonly kind: 'copy_text';
  readonly text: string;
  readonly copiedText: string;
}

/** The kinds of chats a user may choose to start an inline query in, as TDLib's `targetChatTypes`. */
export interface InlineQueryChatTypes {
  readonly allowsUserChats: boolean;
  readonly allowsBotChats: boolean;
  readonly allowsGroupChats: boolean;
  readonly allowsChannelChats: boolean;
}

/** Whether a user may choose some chat, which TDLib requires of a switch-inline button. */
export function allowsSomeInlineQueryChat(chatTypes: InlineQueryChatTypes): boolean {
  return chatTypes.allowsUserChats || chatTypes.allowsBotChats || chatTypes.allowsGroupChats ||
    chatTypes.allowsChannelChats;
}

/** Whether a user may choose any chat, as a plain `switch_inline_query` button lets it. */
export function allowsEveryInlineQueryChat(chatTypes: InlineQueryChatTypes): boolean {
  return chatTypes.allowsUserChats && chatTypes.allowsBotChats && chatTypes.allowsGroupChats &&
    chatTypes.allowsChannelChats;
}

/**
 * Where a switch-inline button starts its inline query: in the message's own chat, or in a chat
 * the user chooses among the allowed kinds.
 */
export type InlineQuerySwitchTarget =
  | { readonly kind: 'current_chat' }
  | { readonly kind: 'chosen_chat'; readonly chatTypes: InlineQueryChatTypes };

/**
 * A button that puts the bot's username and a query into the input field of a chat, so that the
 * user can send the message's bot an inline query. Pressing it involves only the user's client;
 * tests send the inline query itself.
 */
export interface SwitchInlineQueryInlineKeyboardButton extends ButtonAppearance {
  readonly kind: 'switch_inline_query';
  readonly text: string;
  /** The query put after the bot's username; empty for the username alone. */
  readonly query: string;
  readonly target: InlineQuerySwitchTarget;
}

/** A button that does nothing when pressed. */
export interface DisabledInlineKeyboardButton extends ButtonAppearance {
  readonly kind: 'disabled';
  readonly text: string;
}

export type InlineKeyboardButton =
  | CallbackInlineKeyboardButton
  | UrlInlineKeyboardButton
  | CopyTextInlineKeyboardButton
  | SwitchInlineQueryInlineKeyboardButton
  | DisabledInlineKeyboardButton;

/** Rows of buttons shown below a message. A keyboard has at least one row and no empty rows. */
export type InlineKeyboard = readonly (readonly InlineKeyboardButton[])[];
