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

/**
 * Cleans text as Telegram does, or returns `undefined` for text that is not well-formed Unicode,
 * which Telegram rejects as not encoded in UTF-8.
 */
export function cleanInputString(text: string): string | undefined {
  if (!text.isWellFormed()) {
    return undefined;
  }
  let cleanedText = '';
  for (const character of text) {
    const codePoint = character.codePointAt(0) ?? 0;
    if (isReplacedWithSpace(codePoint)) {
      cleanedText += ' ';
    } else if (!isRemovedCharacter(codePoint)) {
      cleanedText += character;
    }
  }
  return replaceRepeatedDirectionMarks(cleanedText);
}

/** Removes the characters TDLib's `trim` does from both ends: spaces, tabs, and line breaks. */
export function trimTdlibSpaces(text: string): string {
  return text.replace(/^[ \t\r\n\0\v]+|[ \t\r\n\0\v]+$/g, '');
}
