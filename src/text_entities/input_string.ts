/**
 * The cleanup Telegram applies to text a user or bot supplies, mirroring `clean_input_string` in
 * TDLib's `td/telegram/misc.cpp`.
 */

/** Whether Telegram replaces a character with a space: control characters other than line breaks. */
export function isReplacedWithSpace(codePoint: number): boolean {
  return codePoint <= 0x20 && codePoint !== 0x0a && codePoint !== 0x0d;
}

/**
 * Whether Telegram removes a character: carriage returns, line and paragraph separators,
 * directional embeddings and overrides, and combining vertical lines.
 */
export function isRemovedCharacter(codePoint: number): boolean {
  return codePoint === 0x0d || (codePoint >= 0x2028 && codePoint <= 0x202e) ||
    codePoint === 0x0333 || codePoint === 0x033f || codePoint === 0x030a;
}

/**
 * In a run of left-to-right and right-to-left marks, Telegram keeps only the last and turns the
 * others into zero-width non-joiners, as TDLib's `replace_offending_characters` does.
 */
export function replaceRepeatedDirectionMarks(text: string): string {
  return text.replace(/[\u200e\u200f](?=[\u200e\u200f])/g, '\u200c');
}
