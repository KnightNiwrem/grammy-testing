/** A button color that Telegram clients show instead of their default one. */
export type ButtonStyle = 'primary' | 'danger' | 'success';

/**
 * How Telegram clients draw a keyboard button, as TDLib's `KeyboardButtonStyle` holds it. The
 * emulator renders no buttons; it keeps the appearance for bots and tests to inspect.
 */
export interface ButtonAppearance {
  /** Omitted for the client's default style. */
  readonly style?: ButtonStyle;
  /** The custom emoji shown before the button's text; omitted for none. */
  readonly iconCustomEmojiId?: string;
}

/** Whether two buttons look the same, which TDLib compares along with their text and action. */
export function isSameButtonAppearance(first: ButtonAppearance, second: ButtonAppearance): boolean {
  return first.style === second.style && first.iconCustomEmojiId === second.iconCustomEmojiId;
}
