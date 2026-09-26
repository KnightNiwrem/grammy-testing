/**
 * The cleanup Telegram applies to text a user or bot supplies, mirroring `clean_input_string`,
 * `strip_empty_characters` and `clean_name` in TDLib's `td/telegram/misc.cpp`.
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

/**
 * Characters that TDLib's `strip_empty_characters` replaces with a plain space: the Ogham space
 * mark, the Mongolian vowel separator, the typographic spaces, the narrow no-break and medium
 * mathematical spaces, the Braille blank, the ideographic space, the object replacement character,
 * and tag characters.
 */
const REPLACED_SPACE_PATTERN = /[ ᠎ -   ⠀　￼\u{e0000}-\u{e007f}]/gu;

/**
 * Text of only the characters that TDLib's `strip_empty_characters` counts as empty: spaces, line
 * feeds, zero-width characters, direction marks, the right-to-left override, the byte order mark,
 * and the no-break space.
 */
const EMPTY_TEXT_PATTERN = /^[ \n​-‏‮﻿ ]*$/;

/**
 * Strips text as TDLib's `strip_empty_characters` does: replaces unusual spaces with plain spaces,
 * trims the text, keeps at most `maxLength` characters of it, and trims it again. Text of only
 * empty characters becomes empty.
 */
export function stripEmptyCharacters(text: string, maxLength: number): string {
  const spacedText = text.replace(REPLACED_SPACE_PATTERN, ' ');
  const strippedText = trimTdlibSpaces(
    [...trimTdlibSpaces(spacedText)].slice(0, maxLength).join(''),
  );
  return EMPTY_TEXT_PATTERN.test(strippedText) ? '' : strippedText;
}

/**
 * Cleans a name, such as a chat's title, as TDLib's `clean_name` does: strips it as
 * `stripEmptyCharacters` does, turns each run of spaces, line feeds and no-break spaces into one
 * space, and trims the result.
 */
export function cleanName(text: string, maxLength: number): string {
  return trimTdlibSpaces(stripEmptyCharacters(text, maxLength).replace(/[ \n ]+/g, ' '));
}
