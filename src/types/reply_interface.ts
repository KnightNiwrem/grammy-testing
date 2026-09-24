import type { InlineKeyboard } from './inline_keyboard.ts';

/** A reply keyboard button, which sends its text to the chat as the user's message. */
export interface ReplyKeyboardButton {
  readonly text: string;
}

/**
 * A custom keyboard that the recipient's client shows in place of its letter keyboard. The
 * keyboard has at least one row and no empty rows.
 */
export interface ReplyKeyboard {
  readonly kind: 'reply_keyboard';
  readonly rows: readonly (readonly ReplyKeyboardButton[])[];
  /** Keeps the keyboard shown even when the client would otherwise hide it. */
  readonly isPersistent: boolean;
  /** Fits the keyboard's height to its rows instead of the letter keyboard's height. */
  readonly resizesToFit: boolean;
  /**
   * Hides the keyboard once a button is pressed; the keyboard stays available and can be shown
   * again, as on Telegram.
   */
  readonly isOneTime: boolean;
  /** Shown in the input field while the keyboard is shown; omitted for the client's default. */
  readonly inputFieldPlaceholder?: string;
}

/** A request that the recipient's client show a reply interface to the message. */
export interface ForcedReply {
  readonly kind: 'forced_reply';
  /** Shown in the input field while replying; omitted for the client's default. */
  readonly inputFieldPlaceholder?: string;
}

/**
 * What a message asks its recipient's client to show in place of the usual input. The chat keeps
 * showing it until a later message replaces or removes it, or the message is deleted.
 */
export type ReplyInterface = ReplyKeyboard | ForcedReply;

/** A request that the recipient's client remove the reply keyboard it shows. */
export interface ReplyKeyboardRemoval {
  readonly kind: 'reply_keyboard_removal';
}

/**
 * Reply markup other than an inline keyboard: it changes the reply interface of the recipient's
 * client instead of adding buttons to the message.
 */
export type ReplyInterfaceMarkup = ReplyInterface | ReplyKeyboardRemoval;

/**
 * The reply markup a bot sends with a message: an inline keyboard on the message, or a change of
 * the recipient's reply interface, but not both.
 */
export type BotMessageReplyMarkup =
  | { readonly inlineKeyboard?: InlineKeyboard; readonly replyInterfaceMarkup?: never }
  | { readonly inlineKeyboard?: never; readonly replyInterfaceMarkup: ReplyInterfaceMarkup };
