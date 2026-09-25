import type { PlainTextEntityType, TextEntity } from '../types/virtual_message.ts';
import { findBotCommandEntities } from './bot_command.ts';
import { COMMON_TOP_LEVEL_DOMAINS } from './common_top_level_domains.ts';
import { compareTextEntities } from './text_entity_order.ts';

/**
 * Finds the entities that Telegram marks in message text by itself: mentions, bot commands,
 * hashtags, cashtags, bank card numbers, URLs and email addresses. Mirrors TDLib's `find_entities`
 * in `td/telegram/MessageEntity.cpp` for chats with bots, which every emulated chat is, without the
 * media timestamps that bots never receive. Telegram's servers also mark phone numbers, by rules
 * the open-source code does not contain, so they are not detected.
 *
 * The result is sorted, and of entities that overlap only the first is kept. Like TDLib, the
 * matchers work on the UTF-8 encoding of the text, whose byte counts some of their limits use;
 * the returned offsets and lengths count UTF-16 code units. The text must be well-formed.
 */
export function findDetectedEntities(text: string): TextEntity[] {
  const entities = [
    ...findMentionEntities(text),
    ...findBotCommandEntities(text),
    ...findHashtagEntities(text),
    ...findCashtagEntities(text),
    ...findBankCardNumberEntities(text),
    ...findTgUrlEntities(text),
    ...findUrlEntities(text),
  ].sort(compareTextEntities);
  return removeIntersectingEntities(entities);
}

/** The mentions of usernames that TDLib's `find_mentions` finds. */
export function findMentionEntities(text: string): TextEntity[] {
  return findEntitiesOfType(text, 'mention', findMentions);
}

/** The hashtags that TDLib's `find_hashtags` finds. */
export function findHashtagEntities(text: string): TextEntity[] {
  return findEntitiesOfType(text, 'hashtag', matchHashtags);
}

/** The cashtags that TDLib's `find_cashtags` finds. */
export function findCashtagEntities(text: string): TextEntity[] {
  return findEntitiesOfType(text, 'cashtag', matchCashtags);
}

/** The bank card numbers that TDLib's `find_bank_card_numbers` finds. */
export function findBankCardNumberEntities(text: string): TextEntity[] {
  return findEntitiesOfType(text, 'bank_card_number', findBankCardNumbers);
}

/** The `tg://`, `ton://` and `tonsite://` links that TDLib's `find_tg_urls` finds. */
export function findTgUrlEntities(text: string): TextEntity[] {
  return findEntitiesOfType(text, 'url', matchTgUrls);
}

/** The URLs and email addresses that TDLib's `find_urls` finds. */
export function findUrlEntities(text: string): TextEntity[] {
  const bytes = utf8Encoder.encode(text);
  return toTextEntities(bytes, findUrls(bytes));
}

function findEntitiesOfType(
  text: string,
  type: PlainTextEntityType,
  findSpans: (bytes: Uint8Array) => Span[],
): TextEntity[] {
  const bytes = utf8Encoder.encode(text);
  return toTextEntities(bytes, findSpans(bytes).map((span) => ({ ...span, type })));
}

/** Converts spans of the UTF-8 encoded text to entities, whose offsets count UTF-16 code units. */
function toTextEntities(bytes: Uint8Array, spans: readonly ByteSpan[]): TextEntity[] {
  const utf16Offsets = getUtf16Offsets(bytes);
  return spans.map(({ type, begin, end }) => ({
    type,
    offset: utf16Offsets[begin],
    length: utf16Offsets[end] - utf16Offsets[begin],
  }));
}

/** A span of the UTF-8 encoded text: `begin` is inclusive, `end` exclusive. */
interface Span {
  readonly begin: number;
  readonly end: number;
}

interface ByteSpan extends Span {
  readonly type: PlainTextEntityType;
}

/**
 * Keeps each entity that starts after the previous kept one ends, as TDLib's
 * `remove_intersecting_entities` does.
 */
function removeIntersectingEntities(entities: readonly TextEntity[]): TextEntity[] {
  const keptEntities: TextEntity[] = [];
  let lastEntityEnd = 0;
  for (const entity of entities) {
    if (entity.offset >= lastEntityEnd) {
      keptEntities.push(entity);
      lastEntityEnd = entity.offset + entity.length;
    }
  }
  return keptEntities;
}

/** Maps each UTF-8 byte position that starts a character, and the end, to its UTF-16 offset. */
function getUtf16Offsets(bytes: Uint8Array): number[] {
  const offsets: number[] = new Array(bytes.length + 1);
  let utf16Offset = 0;
  let position = 0;
  while (position < bytes.length) {
    offsets[position] = utf16Offset;
    const { code, next } = decodeAt(bytes, position);
    utf16Offset += code > 0xffff ? 2 : 1;
    position = next;
  }
  offsets[bytes.length] = utf16Offset;
  return offsets;
}

/** Unicode categories as TDLib's `get_unicode_simple_category` assigns them. */
type UnicodeSimpleCategory = 'letter' | 'decimal_number' | 'number' | 'separator' | 'unknown';

const LETTER_PATTERN = /\p{L}/u;
const DECIMAL_NUMBER_PATTERN = /\p{Nd}/u;
const NUMBER_PATTERN = /\p{N}/u;
const SEPARATOR_PATTERN = /\p{Z}/u;

function getUnicodeSimpleCategory(code: number): UnicodeSimpleCategory {
  const character = String.fromCodePoint(code);
  if (LETTER_PATTERN.test(character)) {
    return 'letter';
  }
  if (DECIMAL_NUMBER_PATTERN.test(character)) {
    return 'decimal_number';
  }
  if (NUMBER_PATTERN.test(character)) {
    return 'number';
  }
  return SEPARATOR_PATTERN.test(character) ? 'separator' : 'unknown';
}

/** Decodes the character that starts at `position`. */
function decodeAt(bytes: Uint8Array, position: number): { code: number; next: number } {
  const first = bytes[position];
  if (first < 0x80) {
    return { code: first, next: position + 1 };
  }
  const length = first >= 0xf0 ? 4 : first >= 0xe0 ? 3 : 2;
  let code = first & (0xff >> (length + 1));
  for (let index = 1; index < length; index++) {
    code = (code << 6) | (bytes[position + index] & 0x3f);
  }
  return { code, next: position + length };
}

/** Returns where the character that ends at `position` starts. */
function previousCharacterStart(bytes: Uint8Array, position: number): number {
  let start = position - 1;
  while ((bytes[start] & 0xc0) === 0x80) {
    start--;
  }
  return start;
}

function codeBefore(bytes: Uint8Array, position: number): number {
  return decodeAt(bytes, previousCharacterStart(bytes, position)).code;
}

function codeAt(bytes: Uint8Array, position: number): number {
  return position < bytes.length ? decodeAt(bytes, position).code : 0;
}

function isByte(bytes: Uint8Array, position: number, character: string): boolean {
  return bytes[position] === character.charCodeAt(0);
}

function isDigit(code: number): boolean {
  return code >= 0x30 && code <= 0x39;
}

function isAsciiLetter(code: number): boolean {
  return (code >= 0x41 && code <= 0x5a) || (code >= 0x61 && code <= 0x7a);
}

function isAlphaDigit(code: number): boolean {
  return isDigit(code) || isAsciiLetter(code);
}

function isAlphaDigitOrUnderscore(code: number): boolean {
  return isAlphaDigit(code) || code === 0x5f;
}

function isAlphaDigitOrUnderscoreOrMinus(code: number): boolean {
  return isAlphaDigitOrUnderscore(code) || code === 0x2d;
}

function isWordCharacter(code: number): boolean {
  const category = getUnicodeSimpleCategory(code);
  return category === 'letter' || category === 'decimal_number' || category === 'number' ||
    code === 0x5f;
}

function isHashtagLetter(code: number): boolean {
  if (code === 0x5f || code === 0x200c || code === 0xb7 || (code >= 0xd80 && code <= 0xdff)) {
    return true;
  }
  const category = getUnicodeSimpleCategory(code);
  return category === 'decimal_number' || category === 'letter';
}

/** Lowercases ASCII letters only, as TDLib's `to_lower` does. */
function toAsciiLowerCase(text: string): string {
  return text.replace(/[A-Z]/g, (letter) => letter.toLowerCase());
}

const utf8Encoder = new TextEncoder();
const utf8Decoder = new TextDecoder();

function textOf(bytes: Uint8Array, begin: number, end: number): string {
  return utf8Decoder.decode(bytes.subarray(begin, end));
}

/** Short usernames that Telegram still marks as mentions. */
const VALID_SHORT_USERNAMES: ReadonlySet<string> = new Set(['gif', 'nft', 'pic', 'ufc', 'vid']);

/**
 * TDLib's `find_mentions`: `@` and 2 to 32 username characters, of which only 4 or more, or a
 * valid short username, count.
 */
function findMentions(bytes: Uint8Array): Span[] {
  return matchMentions(bytes).filter(({ begin, end }) => {
    const username = textOf(bytes, begin + 1, end);
    return username.length >= 4 || VALID_SHORT_USERNAMES.has(toAsciiLowerCase(username));
  });
}

function matchMentions(bytes: Uint8Array): Span[] {
  const result: Span[] = [];
  const end = bytes.length;
  let position = 0;
  while (true) {
    position = bytes.indexOf(0x40, position);
    if (position === -1) {
      return result;
    }
    if (position !== 0 && isWordCharacter(codeBefore(bytes, position))) {
      position++;
      continue;
    }
    const mentionBegin = ++position;
    while (position !== end && isAlphaDigitOrUnderscore(bytes[position])) {
      position++;
    }
    const mentionSize = position - mentionBegin;
    if (mentionSize < 2 || mentionSize > 32) {
      continue;
    }
    if (isWordCharacter(codeAt(bytes, position))) {
      continue;
    }
    result.push({ begin: mentionBegin - 1, end: position });
  }
}

/**
 * TDLib's `match_hashtags`: `#` and up to 256 hashtag letters, at least one of them a letter,
 * optionally addressed to a username.
 */
function matchHashtags(bytes: Uint8Array): Span[] {
  const result: Span[] = [];
  const end = bytes.length;
  let position = 0;
  while (true) {
    position = bytes.indexOf(0x23, position);
    if (position === -1) {
      return result;
    }
    if (position !== 0 && isHashtagLetter(codeBefore(bytes, position))) {
      position++;
      continue;
    }
    const hashtagBegin = ++position;
    let hashtagSize = 0;
    let hashtagEnd: number | undefined;
    let wasLetter = false;
    while (position !== end) {
      const { code, next } = decodeAt(bytes, position);
      if (!isHashtagLetter(code)) {
        break;
      }
      position = next;
      if (hashtagSize === 255) {
        hashtagEnd = position;
      }
      if (hashtagSize !== 256) {
        wasLetter ||= getUnicodeSimpleCategory(code) === 'letter';
        hashtagSize++;
      }
    }
    hashtagEnd ??= position;
    if (hashtagSize < 1) {
      continue;
    }
    if (hashtagEnd === position && position !== end && isByte(bytes, position, '@')) {
      let usernameEnd = position + 1;
      while (
        usernameEnd !== end && usernameEnd - position < 33 &&
        isAlphaDigitOrUnderscore(bytes[usernameEnd])
      ) {
        usernameEnd++;
      }
      if (usernameEnd - position - 1 >= 3) {
        position = usernameEnd;
        hashtagEnd = usernameEnd;
      }
    }
    if (position !== end && isByte(bytes, position, '#')) {
      continue;
    }
    if (!wasLetter) {
      continue;
    }
    result.push({ begin: hashtagBegin - 1, end: hashtagEnd });
  }
}

const ONE_INCH_TICKER = '1INCH';

/**
 * TDLib's `match_cashtags`: `$` and 1 to 8 capital letters, or `1INCH`, optionally addressed to a
 * username.
 */
function matchCashtags(bytes: Uint8Array): Span[] {
  const result: Span[] = [];
  const end = bytes.length;
  let position = 0;
  while (true) {
    position = bytes.indexOf(0x24, position);
    if (position === -1) {
      return result;
    }
    if (position !== 0) {
      const previous = codeBefore(bytes, position);
      if (isHashtagLetter(previous) || previous === 0x24) {
        position++;
        continue;
      }
    }
    const cashtagBegin = ++position;
    if (textOf(bytes, position, position + ONE_INCH_TICKER.length) === ONE_INCH_TICKER) {
      position += ONE_INCH_TICKER.length;
    } else {
      while (position !== end && bytes[position] >= 0x41 && bytes[position] <= 0x5a) {
        position++;
      }
    }
    let cashtagEnd = position;
    const cashtagSize = cashtagEnd - cashtagBegin;
    if (cashtagSize < 1 || cashtagSize > 8) {
      continue;
    }
    if (position !== end && isByte(bytes, position, '@')) {
      let usernameEnd = position + 1;
      while (usernameEnd !== end && isAlphaDigitOrUnderscore(bytes[usernameEnd])) {
        usernameEnd++;
      }
      const usernameLength = usernameEnd - position - 1;
      if (usernameLength >= 3 && usernameLength <= 32) {
        cashtagEnd = usernameEnd;
        position = usernameEnd;
      }
    }
    if (cashtagEnd !== end) {
      const next = codeAt(bytes, position);
      if (isHashtagLetter(next) || next === 0x24) {
        continue;
      }
    }
    result.push({ begin: cashtagBegin - 1, end: cashtagEnd });
  }
}

function isCardNumberCharacter(code: number): boolean {
  return isDigit(code) || code === 0x20 || code === 0x2d;
}

/**
 * TDLib's `find_bank_card_numbers`: 13 to 19 digits, grouped by spaces or hyphens, that pass
 * `is_valid_bank_card`.
 */
function findBankCardNumbers(bytes: Uint8Array): Span[] {
  return matchBankCardNumbers(bytes).filter(({ begin, end }) =>
    isValidBankCard(textOf(bytes, begin, end))
  );
}

function matchBankCardNumbers(bytes: Uint8Array): Span[] {
  const result: Span[] = [];
  const end = bytes.length;
  let position = 0;
  while (true) {
    while (position !== end && !isDigit(bytes[position])) {
      position++;
    }
    if (position === end) {
      return result;
    }
    if (position !== 0) {
      const previous = codeBefore(bytes, position);
      if (
        previous === 0x2e || previous === 0x2c || previous === 0x2b || previous === 0x2d ||
        previous === 0x5f || getUnicodeSimpleCategory(previous) === 'letter'
      ) {
        while (position !== end && isCardNumberCharacter(bytes[position])) {
          position++;
        }
        continue;
      }
    }

    const cardNumberBegin = position;
    let digitCount = 0;
    while (position !== end && isCardNumberCharacter(bytes[position])) {
      if (
        isByte(bytes, position, ' ') && digitCount >= 16 && digitCount <= 19 &&
        digitCount === position - cardNumberBegin
      ) {
        // A continuous card number ends at the space.
        break;
      }
      if (isDigit(bytes[position])) {
        digitCount++;
      }
      position++;
    }
    if (digitCount < 13 || digitCount > 19) {
      continue;
    }

    let cardNumberEnd = position;
    while (!isDigit(bytes[cardNumberEnd - 1])) {
      cardNumberEnd--;
    }
    if (cardNumberEnd - cardNumberBegin > 2 * digitCount - 1) {
      continue;
    }
    if (cardNumberEnd !== end) {
      const next = codeAt(bytes, cardNumberEnd);
      if (next === 0x2d || next === 0x5f || getUnicodeSimpleCategory(next) === 'letter') {
        continue;
      }
    }
    result.push({ begin: cardNumberBegin, end: cardNumberEnd });
  }
}

/** TDLib's `is_valid_bank_card`: the Luhn checksum, and the lengths of known card networks. */
function isValidBankCard(cardNumber: string): boolean {
  const digits = [...cardNumber].filter((character) => isDigit(character.charCodeAt(0)))
    .map(Number);
  let sum = 0;
  for (let index = digits.length; index > 0; index--) {
    const digit = digits[index - 1];
    if ((digits.length - index) % 2 === 0) {
      sum += digit;
    } else {
      sum += digit < 5 ? 2 * digit : 2 * digit - 9;
    }
  }
  if (sum % 10 !== 0) {
    return false;
  }

  const digitCount = digits.length;
  const prefix1 = digits[0];
  const prefix2 = prefix1 * 10 + digits[1];
  const prefix4 = (prefix2 * 10 + digits[2]) * 10 + digits[3];
  if (prefix1 === 4) {
    // Visa
    return digitCount === 13 || digitCount === 16 || digitCount === 18 || digitCount === 19;
  }
  if ((prefix2 >= 51 && prefix2 <= 55) || (prefix4 >= 2221 && prefix4 <= 2720)) {
    // Mastercard
    return digitCount === 16;
  }
  if (prefix2 === 34 || prefix2 === 37) {
    // American Express
    return digitCount === 15;
  }
  if (prefix2 === 62 || prefix2 === 81) {
    // UnionPay
    return digitCount >= 16;
  }
  if (prefix4 >= 2200 && prefix4 <= 2204) {
    // Mir
    return digitCount === 16;
  }
  return true;
}

/** Characters that end a URL path when they come last. */
const BAD_PATH_END_CHARACTERS = ".:;,('?!`";

function isBadPathEnd(bytes: Uint8Array, position: number): boolean {
  return BAD_PATH_END_CHARACTERS.includes(String.fromCharCode(bytes[position]));
}

function isUrlUnicodeSymbol(code: number): boolean {
  if (code >= 0x2000 && code <= 0x206f) {
    // Of General Punctuation, only zero-width non-joiners and joiners, and dashes.
    return code === 0x200c || code === 0x200d || (code >= 0x2010 && code <= 0x2015);
  }
  return getUnicodeSimpleCategory(code) !== 'separator';
}

function isUrlPathSymbol(code: number): boolean {
  switch (code) {
    case 0x0a: // \n
    case 0x3c: // <
    case 0x3e: // >
    case 0x22: // "
    case 0xab: // «
    case 0xbb: // »
      return false;
    default:
      return isUrlUnicodeSymbol(code);
  }
}

/** Where the path of a URL that continues at `position` with `/`, `?` or `#` ends. */
function findUrlPathEnd(bytes: Uint8Array, position: number): number {
  let pathEnd = position + 1;
  while (pathEnd !== bytes.length) {
    const { code, next } = decodeAt(bytes, pathEnd);
    if (!isUrlPathSymbol(code)) {
      break;
    }
    pathEnd = next;
  }
  while (pathEnd > position + 1 && isBadPathEnd(bytes, pathEnd - 1)) {
    pathEnd--;
  }
  return pathEnd;
}

function isPathStart(bytes: Uint8Array, position: number): boolean {
  return position !== bytes.length &&
    (isByte(bytes, position, '/') || isByte(bytes, position, '?') || isByte(bytes, position, '#'));
}

/** TDLib's `match_tg_urls`: `tg://`, `ton://` and `tonsite://` links. */
function matchTgUrls(bytes: Uint8Array): Span[] {
  const result: Span[] = [];
  const end = bytes.length;
  const isLowerCaseAt = (position: number, word: string) =>
    position >= 0 && toAsciiLowerCase(textOf(bytes, position, position + word.length)) === word;
  let position = 0;
  while (end - position > 5) {
    position = bytes.indexOf(0x3a, position);
    if (position === -1) {
      return result;
    }

    let urlBegin: number | undefined;
    if (
      end - position >= 3 && isByte(bytes, position + 1, '/') && isByte(bytes, position + 2, '/')
    ) {
      if (isLowerCaseAt(position - 2, 'tg')) {
        urlBegin = position - 2;
      } else if (isLowerCaseAt(position - 3, 'ton')) {
        urlBegin = position - 3;
      } else if (isLowerCaseAt(position - 7, 'tonsite')) {
        // TDLib's `match_tg_urls` starts such a link three characters before the colon, in the
        // middle of its scheme, which looks like an error; the link starts at its scheme here.
        urlBegin = position - 7;
      }
    }
    if (urlBegin === undefined) {
      position++;
      continue;
    }

    position += 3;
    const domainBegin = position;
    while (
      position !== end && position - domainBegin !== 253 &&
      isAlphaDigitOrUnderscoreOrMinus(bytes[position])
    ) {
      position++;
    }
    if (position === domainBegin) {
      continue;
    }

    if (isPathStart(bytes, position)) {
      const pathEnd = findUrlPathEnd(bytes, position);
      if (isByte(bytes, position, '/') || pathEnd > position + 1) {
        position = pathEnd;
      }
    }
    result.push({ begin: urlBegin, end: position });
  }
  return result;
}

function isProtocolSymbol(code: number): boolean {
  if (code < 0x80) {
    // Dots are not allowed in the protocol.
    return isAlphaDigit(code) || code === 0x2b || code === 0x2d;
  }
  // Letters and digits are accepted, so that the protocol is later found invalid.
  return getUnicodeSimpleCategory(code) !== 'separator';
}

const USER_DATA_EXCLUDED_CHARACTERS = '\n/[]{}()\'`<>"@«»';

function isUserDataSymbol(code: number): boolean {
  return !USER_DATA_EXCLUDED_CHARACTERS.includes(String.fromCodePoint(code)) &&
    isUrlUnicodeSymbol(code);
}

function isDomainSymbol(code: number): boolean {
  if (code < 0xc0) {
    return code === 0x2e || isAlphaDigitOrUnderscoreOrMinus(code) || code === 0x7e;
  }
  return isUrlUnicodeSymbol(code);
}

/**
 * Moves back from `position` over characters that satisfy `isIncluded`, stopping at `limit`, and
 * returns where the run starts.
 */
function findRunStart(
  bytes: Uint8Array,
  position: number,
  limit: number,
  isIncluded: (code: number) => boolean,
): number {
  let start = position;
  while (start !== limit) {
    const previousStart = previousCharacterStart(bytes, start);
    if (!isIncluded(decodeAt(bytes, previousStart).code)) {
      break;
    }
    start = previousStart;
  }
  return start;
}

/** TDLib's `match_urls`: candidate URLs and email addresses around each dot. */
function matchUrls(bytes: Uint8Array): Span[] {
  const result: Span[] = [];
  const end = bytes.length;
  let begin = 0;
  while (true) {
    const dot = bytes.indexOf(0x2e, begin);
    if (dot === -1 || dot + 1 === end) {
      return result;
    }
    if (isByte(bytes, dot + 1, ' ')) {
      begin = dot + 2;
      continue;
    }

    let domainBegin = findRunStart(bytes, dot, begin, isDomainSymbol);
    let lastAt: number | undefined;
    let domainEnd = dot;
    while (domainEnd !== end) {
      const { code, next } = decodeAt(bytes, domainEnd);
      if (code === 0x40) {
        lastAt = domainEnd;
      } else if (!isDomainSymbol(code)) {
        break;
      }
      domainEnd = next;
    }
    if (lastAt !== undefined) {
      domainBegin = findRunStart(bytes, domainBegin, begin, isUserDataSymbol);
    }

    let urlEnd = domainEnd;
    if (urlEnd !== end && isByte(bytes, urlEnd, ':')) {
      let portEnd = urlEnd + 1;
      while (portEnd !== end && isDigit(bytes[portEnd])) {
        portEnd++;
      }
      let portBegin = urlEnd + 1;
      while (portBegin !== portEnd && isByte(bytes, portBegin, '0')) {
        portBegin++;
      }
      if (
        portBegin !== portEnd && portEnd - portBegin <= 5 &&
        Number(textOf(bytes, portBegin, portEnd)) <= 65_535
      ) {
        urlEnd = portEnd;
      }
    }
    if (isPathStart(bytes, urlEnd)) {
      const pathEnd = findUrlPathEnd(bytes, urlEnd);
      if (isByte(bytes, urlEnd, '/') || pathEnd > urlEnd + 1) {
        urlEnd = pathEnd;
      }
    }
    while (urlEnd > dot + 1 && isByte(bytes, urlEnd - 1, '.')) {
      urlEnd--;
    }

    let isBad = false;
    let urlBegin = domainBegin;
    if (urlBegin !== begin && isByte(bytes, urlBegin - 1, '@')) {
      if (lastAt !== undefined) {
        isBad = true;
      }
      const userDataBegin = findRunStart(bytes, urlBegin - 1, begin, isUserDataSymbol);
      if (userDataBegin === urlBegin - 1) {
        isBad = true;
      }
      urlBegin = userDataBegin;
    }

    if (urlBegin !== begin) {
      const prefix = textOf(bytes, begin, urlBegin);
      if (urlBegin - begin >= 6 && prefix.endsWith('://')) {
        const protocolBegin = findRunStart(bytes, urlBegin - 3, begin, isProtocolSymbol);
        const protocol = toAsciiLowerCase(textOf(bytes, protocolBegin, urlBegin - 3));
        if (protocol.endsWith('http') && protocol !== 'shttp') {
          urlBegin -= 'http://'.length;
        } else if (protocol.endsWith('https')) {
          urlBegin -= 'https://'.length;
        } else if (protocol.endsWith('ftp') && protocol !== 'tftp' && protocol !== 'sftp') {
          urlBegin -= 'ftp://'.length;
        } else if (protocol.endsWith('tonsite')) {
          urlBegin -= 'tonsite://'.length;
        } else {
          isBad = true;
        }
      } else {
        const previous = codeBefore(bytes, urlBegin);
        if (
          isWordCharacter(previous) || previous === 0x2f || previous === 0x23 || previous === 0x40
        ) {
          isBad = true;
        }
      }
    }

    if (!isBad) {
      if (urlEnd > dot + 1) {
        result.push({ begin: urlBegin, end: urlEnd });
      }
      while (urlEnd !== end && isByte(bytes, urlEnd, '.')) {
        urlEnd++;
      }
    } else {
      while (!isByte(bytes, urlEnd - 1, '.')) {
        urlEnd--;
      }
    }
    if (urlEnd <= dot) {
      urlEnd = dot + 1;
    }
    begin = urlEnd;
  }
}

const MAILTO_PREFIX = 'mailto:';

/** TDLib's `find_urls`: the candidates that are email addresses or valid URLs. */
function findUrls(bytes: Uint8Array): ByteSpan[] {
  const result: ByteSpan[] = [];
  for (const { begin, end } of matchUrls(bytes)) {
    const candidate = textOf(bytes, begin, end);
    if (isEmailAddress(candidate)) {
      result.push({ type: 'email', begin, end });
    } else if (
      candidate.startsWith(MAILTO_PREFIX) && isEmailAddress(candidate.slice(MAILTO_PREFIX.length))
    ) {
      result.push({ type: 'email', begin: begin + MAILTO_PREFIX.length, end });
    } else {
      const urlEnd = fixUrl(bytes, begin, end);
      if (urlEnd !== undefined) {
        result.push({ type: 'url', begin, end: urlEnd });
      }
    }
  }
  return result;
}

/** TDLib's `is_email_address`, which accepts only ASCII addresses. */
export function isEmailAddress(text: string): boolean {
  const atIndex = text.indexOf('@');
  if (atIndex === -1 || atIndex === text.length - 1) {
    return false;
  }
  const userData = text.slice(0, atIndex);
  const domain = text.slice(atIndex + 1);

  let partStart = 0;
  let userDataPartCount = 0;
  for (let index = 0; index < userData.length; index++) {
    const code = userData.charCodeAt(index);
    if (code === 0x2e || code === 0x2b) {
      if (index - partStart >= 27) {
        return false;
      }
      userDataPartCount++;
      partStart = index + 1;
    } else if (!isAlphaDigitOrUnderscoreOrMinus(code)) {
      return false;
    }
  }
  userDataPartCount++;
  if (userDataPartCount >= 12) {
    return false;
  }
  const lastPartLength = userData.length - partStart;
  if (lastPartLength === 0 || lastPartLength >= 36) {
    return false;
  }

  const domainParts = domain.split('.');
  if (domainParts.length <= 1 || domainParts.length > 7) {
    return false;
  }
  const topLevelDomain = domainParts.pop() ?? '';
  if (
    topLevelDomain.length <= 1 || topLevelDomain.length >= 9 ||
    ![...topLevelDomain].every((character) => isAsciiLetter(character.charCodeAt(0)))
  ) {
    return false;
  }
  return domainParts.every((part) =>
    part.length > 0 && part.length < 31 &&
    [...part].every((character) => isAlphaDigitOrUnderscoreOrMinus(character.charCodeAt(0))) &&
    isAlphaDigit(part.charCodeAt(0)) && isAlphaDigit(part.charCodeAt(part.length - 1))
  );
}

const URL_PROTOCOLS = ['http://', 'https://', 'ftp://', 'tonsite://'] as const;

/**
 * TDLib's `fix_url`: checks the domain of a candidate URL and cuts unbalanced brackets and
 * trailing punctuation from its path. Returns where the URL ends, or `undefined` for no URL.
 */
function fixUrl(bytes: Uint8Array, urlBegin: number, urlEnd: number): number | undefined {
  let rest = bytes.subarray(urlBegin, urlEnd);
  const protocolPart = toAsciiLowerCase(textOf(rest, 0, Math.min(10, rest.length)));
  const hasProtocol = URL_PROTOCOLS.some((protocol) => protocolPart.startsWith(protocol));
  if (hasProtocol) {
    rest = rest.subarray(rest.indexOf(0x3a) + '://'.length);
  }
  const domainEnd = Math.min(
    ...[0x2f, 0x3f, 0x23].map((terminator) => rest.indexOf(terminator)).filter((index) =>
      index !== -1
    ),
    rest.length,
  );
  let domain = rest.subarray(0, domainEnd);
  const path = rest.subarray(domainEnd);

  const atIndex = domain.indexOf(0x40);
  if (atIndex !== -1) {
    domain = domain.subarray(atIndex + 1);
  }
  const portIndex = domain.lastIndexOf(0x3a);
  if (portIndex !== -1) {
    domain = domain.subarray(0, portIndex);
  }

  const domainText = textOf(domain, 0, domain.length);
  if (domain.length === 12 && toAsciiLowerCase(domainText) === 'teiegram.org') {
    return undefined;
  }

  const bracketBalances = { '(': 0, '[': 0, '{': 0 };
  const closingBrackets: Record<string, keyof typeof bracketBalances> = {
    ')': '(',
    ']': '[',
    '}': '{',
  };
  let pathEnd = 0;
  for (; pathEnd < path.length; pathEnd++) {
    const character = String.fromCharCode(path[pathEnd]);
    if (character in bracketBalances) {
      bracketBalances[character as keyof typeof bracketBalances]++;
    } else if (character in closingBrackets) {
      bracketBalances[closingBrackets[character]]--;
    }
    if (Object.values(bracketBalances).some((balance) => balance < 0)) {
      break;
    }
  }
  while (pathEnd > 0 && isBadPathEnd(path, pathEnd - 1)) {
    pathEnd--;
  }
  const fixedUrlEnd = urlEnd - (path.length - pathEnd);

  const domainParts = domainText.split('.');
  let isIpv4 = true;
  let hasNonDigit = false;
  for (const part of domainParts) {
    const partBytes = utf8Encoder.encode(part);
    if (
      partBytes.length === 0 || partBytes.length >= 64 || partBytes[partBytes.length - 1] === 0x2d
    ) {
      return undefined;
    }
    if (isIpv4) {
      if (partBytes.length > 3) {
        isIpv4 = false;
      }
      if (
        partBytes.length === 3 &&
        (partBytes[0] >= 0x33 ||
          (partBytes[0] === 0x32 &&
            (partBytes[1] >= 0x36 || (partBytes[1] === 0x35 && partBytes[2] >= 0x36))))
      ) {
        isIpv4 = false;
      }
      if (partBytes[0] === 0x30 && partBytes.length >= 2) {
        isIpv4 = false;
      }
    }
    if (!partBytes.every(isDigit)) {
      isIpv4 = false;
      hasNonDigit = true;
    }
  }
  if (domainParts.length === 1) {
    return undefined;
  }
  if (isIpv4 && domainParts.length === 4) {
    return fixedUrlEnd;
  }
  if (!hasNonDigit) {
    return undefined;
  }

  const topLevelDomain = domainParts[domainParts.length - 1];
  if ([...topLevelDomain].length <= 1) {
    return undefined;
  }
  if (topLevelDomain.startsWith('xn--')) {
    if (topLevelDomain.length <= 5) {
      return undefined;
    }
    if (![...topLevelDomain.slice(4)].every((character) => isAlphaDigit(character.charCodeAt(0)))) {
      return undefined;
    }
  } else {
    if (topLevelDomain.includes('_') || topLevelDomain.includes('-')) {
      return undefined;
    }
    if (!hasProtocol && !isCommonTopLevelDomain(topLevelDomain)) {
      return undefined;
    }
  }

  if (domainParts[domainParts.length - 2].includes('_')) {
    return undefined;
  }
  return fixedUrlEnd;
}

/**
 * TDLib's `is_common_tld`, which lowercases the domain but rejects one whose case differs from its
 * lowercase form only in the first character.
 */
function isCommonTopLevelDomain(topLevelDomain: string): boolean {
  const lowerCaseDomain = topLevelDomain.toLowerCase();
  if (
    lowerCaseDomain !== topLevelDomain &&
    [...lowerCaseDomain].slice(1).join('') === [...topLevelDomain].slice(1).join('')
  ) {
    return false;
  }
  return COMMON_TOP_LEVEL_DOMAINS.has(lowerCaseDomain);
}
