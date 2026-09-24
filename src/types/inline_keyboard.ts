/** The most bytes of UTF-8 callback data Telegram accepts on one button. */
export const MAX_CALLBACK_DATA_BYTES = 64;

/** A button that sends its callback data to the message's bot when a user presses it. */
export interface CallbackInlineKeyboardButton {
  readonly kind: 'callback';
  readonly text: string;
  readonly callbackData: string;
}

/** A button that opens a URL on the user's device, without involving the bot. */
export interface UrlInlineKeyboardButton {
  readonly kind: 'url';
  readonly text: string;
  readonly url: string;
}

export type InlineKeyboardButton = CallbackInlineKeyboardButton | UrlInlineKeyboardButton;

/** Rows of buttons shown below a message. A keyboard has at least one row and no empty rows. */
export type InlineKeyboard = readonly (readonly InlineKeyboardButton[])[];
