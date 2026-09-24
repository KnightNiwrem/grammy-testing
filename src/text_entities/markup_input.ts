import type { TextEntity } from '../types/virtual_message.ts';

/**
 * The outcome of reading markup. A failure carries TDLib's own error message, which Telegram
 * reports after `Can't parse entities: `.
 */
export type MarkupParsing =
  | { readonly parsed: true; readonly text: string; readonly entities: readonly TextEntity[] }
  | { readonly parsed: false; readonly reason: 'markup_invalid'; readonly error: string }
  | { readonly parsed: false; readonly reason: 'date_time_unsupported' };

export function markupInvalid(error: string): MarkupParsing {
  return { parsed: false, reason: 'markup_invalid', error };
}

export const DATE_TIME_UNSUPPORTED: MarkupParsing = {
  parsed: false,
  reason: 'date_time_unsupported',
};

const utf8Encoder = new TextEncoder();
const utf8Decoder = new TextDecoder();

/**
 * Markup text as UTF-8 bytes, which TDLib's parsers read and whose byte offsets their errors
 * report. Reading past the end yields 0, as reading TDLib's NUL-terminated strings does.
 */
export class Utf8MarkupInput {
  readonly #bytes: Uint8Array;

  constructor(text: string) {
    this.#bytes = utf8Encoder.encode(text);
  }

  get size(): number {
    return this.#bytes.length;
  }

  at(index: number): number {
    return index < this.#bytes.length ? this.#bytes[index] : 0;
  }

  decode(start: number, end: number): string {
    return utf8Decoder.decode(this.#bytes.subarray(start, end));
  }
}

/** Collects the UTF-8 bytes of the text that markup leaves after its tags are removed. */
export class Utf8MarkupOutput {
  readonly #bytes: number[] = [];

  get size(): number {
    return this.#bytes.length;
  }

  get lastByte(): number | undefined {
    return this.#bytes.at(-1);
  }

  push(byte: number): void {
    this.#bytes.push(byte);
  }

  pushCodePoint(codePoint: number): void {
    this.#bytes.push(...encodeCodePoint(codePoint));
  }

  decode(start = 0): string {
    return utf8Decoder.decode(new Uint8Array(this.#bytes.slice(start)));
  }
}

/** Encodes a code point as UTF-8, writing a lone surrogate as its three-byte form, as TDLib does. */
function encodeCodePoint(codePoint: number): number[] {
  if (codePoint <= 0x7f) {
    return [codePoint];
  }
  if (codePoint <= 0x7ff) {
    return [0xc0 | (codePoint >> 6), 0x80 | (codePoint & 0x3f)];
  }
  if (codePoint <= 0xffff) {
    return [0xe0 | (codePoint >> 12), 0x80 | ((codePoint >> 6) & 0x3f), 0x80 | (codePoint & 0x3f)];
  }
  return [
    0xf0 | (codePoint >> 18),
    0x80 | ((codePoint >> 12) & 0x3f),
    0x80 | ((codePoint >> 6) & 0x3f),
    0x80 | (codePoint & 0x3f),
  ];
}

export function isUtf8FirstCodeUnit(byte: number): boolean {
  return (byte & 0xc0) !== 0x80;
}

/** UTF-16 code units of the character a first UTF-8 byte starts: two for four-byte characters. */
export function utf16LengthOfUtf8Character(firstByte: number): number {
  return firstByte >= 0xf0 ? 2 : 1;
}

/** TDLib's `is_space`, which also counts NUL and vertical tab. */
export function isTdlibSpace(byte: number): boolean {
  return byte === 0x20 || byte === 0x09 || byte === 0x0d || byte === 0x0a || byte === 0x00 ||
    byte === 0x0b;
}

export function isAsciiDigit(byte: number): boolean {
  return byte >= 0x30 && byte <= 0x39;
}

export function isAsciiLetter(byte: number): boolean {
  const lowerCased = byte | 0x20;
  return lowerCased >= 0x61 && lowerCased <= 0x7a;
}

export function isAsciiHexDigit(byte: number): boolean {
  const lowerCased = byte | 0x20;
  return isAsciiDigit(byte) || (lowerCased >= 0x61 && lowerCased <= 0x66);
}

export function asciiCode(character: string): number {
  return character.charCodeAt(0);
}
