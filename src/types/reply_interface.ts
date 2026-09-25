import type { ButtonAppearance } from './button_appearance.ts';
import type { InlineKeyboard } from './inline_keyboard.ts';

/** A reply keyboard button, which sends its text to the chat as the user's message. */
export interface ReplyKeyboardButton extends ButtonAppearance {
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
  /**
   * The Bot API's `selective`: in a group, applies the markup only to the users the message
   * mentions and the sender of the message of the chat that it replies to, rather than to every
   * member. As in TDLib's `get_reply_markup`, it has no effect in private chats.
   */
  readonly isSelective: boolean;
}

/** A request that the recipient's client show a reply interface to the message. */
export interface ForcedReply {
  readonly kind: 'forced_reply';
  /** Shown in the input field while replying; omitted for the client's default. */
  readonly inputFieldPlaceholder?: string;
  /** As `ReplyKeyboard` describes it. */
  readonly isSelective: boolean;
}

/**
 * What a message asks its recipient's client to show in place of the usual input. The chat keeps
 * showing it until a later message replaces or removes it, or the message is deleted.
 */
export type ReplyInterface = ReplyKeyboard | ForcedReply;

/** A request that the recipient's client remove the reply keyboard it shows. */
export interface ReplyKeyboardRemoval {
  readonly kind: 'reply_keyboard_removal';
  /** As `ReplyKeyboard` describes it. */
  readonly isSelective: boolean;
}

/**
 * Reply markup other than an inline keyboard: it changes the reply interface of the recipient's
 * client instead of adding buttons to the message.
 */
export type ReplyInterfaceMarkup = ReplyInterface | ReplyKeyboardRemoval;

/** Whether a reply keyboard has a button with the given text, which pressing it sends. */
export function hasReplyKeyboardButton(replyKeyboard: ReplyKeyboard, text: string): boolean {
  return replyKeyboard.rows.some((row) => row.some((button) => button.text === text));
}

/**
 * Whether a group message's reply interface markup applies to a member, as TDLib's
 * `get_reply_markup` decides for received markup: markup that is not selective applies to every
 * member, and selective markup only to a member whom the message mentions or whose message it
 * replies to, which Telegram marks as mentioning the member.
 */
export function appliesReplyInterfaceTo(
  { isSelective }: ReplyInterfaceMarkup,
  { mentionsMember, repliesToMember }: {
    readonly mentionsMember: boolean;
    readonly repliesToMember: boolean;
  },
): boolean {
  return !isSelective || mentionsMember || repliesToMember;
}

/**
 * The reply markup a bot sends with a message: an inline keyboard on the message, or a change of
 * the recipient's reply interface, but not both.
 */
export type BotMessageReplyMarkup =
  | { readonly inlineKeyboard?: InlineKeyboard; readonly replyInterfaceMarkup?: never }
  | { readonly inlineKeyboard?: never; readonly replyInterfaceMarkup: ReplyInterfaceMarkup };
