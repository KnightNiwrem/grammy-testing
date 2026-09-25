import { MAX_TELEGRAM_USER_ID, MIN_TELEGRAM_USER_ID } from '../types/telegram_identity.ts';
import type { DateTimeFormat } from '../types/virtual_message.ts';
import { readMarkupDateTimeFormat } from './date_time_format.ts';

/**
 * Link rules that Telegram applies to text links, mirroring `LinkManager::check_link`,
 * `LinkManager::get_link_user_id`, `LinkManager::get_link_custom_emoji_id`, and
 * `LinkManager::get_link_formatted_date` in TDLib's
 * `td/telegram/LinkManager.cpp`, and `parse_url` in `tdutils/td/utils/HttpUrl.cpp`.
 *
 * Failures carry TDLib's own error message, which callers wrap as Telegram does.
 */

export type LinkCheck =
  | { readonly valid: true; readonly url: string }
  | { readonly valid: false; readonly error: string };

type LinkScheme = 'tg' | 'ton' | 'tonsite';

const LINK_SCHEMES: readonly LinkScheme[] = ['tg', 'ton', 'tonsite'];

/** Characters that end the protocol part of a URL in TDLib's `parse_url`. */
const PROTOCOL_TERMINATORS = ':/?#@[]';
/** Characters that end the user information, host, and port part of a URL. */
const AUTHORITY_TERMINATORS = '/?#';
/** Punctuation that RFC 7230 and RFC 3986 allow in a URL host or user information. */
const URL_PART_PUNCTUATION = ".-_!$,~*'();&+=";

const MAX_PORT = 65_535;
const INT64_MIN = -(2n ** 63n);
const INT64_MAX = 2n ** 63n - 1n;
const INT32_MAX = 2n ** 31n - 1n;

/**
 * Checks and normalizes a link as TDLib does for a text link given as an entity. An error names
 * the link, as in `URL 'example' is invalid: Wrong HTTP URL`.
 */
export function checkLink(link: string): LinkCheck {
  const check = checkLinkWithoutContext(link);
  return check.valid ? check : { valid: false, error: `URL '${link}' is invalid: ${check.error}` };
}

/**
 * Normalizes a link as TDLib does for a link written in markup, or returns `undefined` for an
 * invalid link, which markup drops silently.
 */
export function getCheckedLink(link: string): string | undefined {
  const check = checkLinkWithoutContext(link);
  return check.valid ? check.url : undefined;
}

/** Returns the user a `tg://user?id=` link mentions, or `undefined` for any other link. */
export function getLinkUserId(link: string): number | undefined {
  let rest = toAsciiLowerCase(link);
  if (!rest.startsWith('tg:')) {
    return undefined;
  }
  rest = removePrefix(rest.slice('tg:'.length), '//');

  const host = 'user';
  if (!rest.startsWith(host) || (rest.length > host.length && !'/?#'.includes(rest[host.length]))) {
    return undefined;
  }
  rest = removePrefix(rest.slice(host.length), '/');
  if (!rest.startsWith('?')) {
    return undefined;
  }

  const userIdText = findQueryParameter(truncateAt(rest.slice(1), '#'), 'id');
  const userId = userIdText === undefined ? undefined : parseInt64(userIdText);
  if (
    userId === undefined || userId < BigInt(MIN_TELEGRAM_USER_ID) ||
    userId > BigInt(MAX_TELEGRAM_USER_ID)
  ) {
    return undefined;
  }
  return Number(userId);
}

export type CustomEmojiLinkReading =
  | { readonly kind: 'custom_emoji'; readonly customEmojiId: string }
  | { readonly kind: 'invalid'; readonly error: string };

/**
 * Reads the custom emoji identifier from a `tg://emoji?id=` link, as TDLib's
 * `get_link_custom_emoji_id` does.
 */
export function getLinkCustomEmojiId(link: string): CustomEmojiLinkReading {
  const query = getTgLinkQuery(link, 'emoji');
  if (!query.found) {
    return { kind: 'invalid', error: query.error };
  }
  const customEmojiIdText = findQueryParameter(query.query, 'id');
  if (customEmojiIdText === undefined) {
    return { kind: 'invalid', error: 'Custom emoji URL must have an emoji identifier' };
  }
  const customEmojiId = parseCustomEmojiId(customEmojiIdText);
  return customEmojiId === undefined
    ? { kind: 'invalid', error: 'Invalid custom emoji identifier specified' }
    : { kind: 'custom_emoji', customEmojiId };
}

/** The date and time that a `tg://time` link describes. */
export interface LinkDateTime {
  /** The positive Unix time of the link's `unix` parameter. */
  readonly unixTime: number;
  /** Omitted when the link chooses no format. */
  readonly format?: DateTimeFormat;
}

/**
 * Reads a `tg://time` link, which Telegram uses for date and time entities: it needs a positive
 * `unix` time and accepts a `format`, as `readMarkupDateTimeFormat` reads it. Mirrors TDLib's
 * `get_link_formatted_date`; returns `undefined` for any other link.
 */
export function getLinkDateTime(link: string): LinkDateTime | undefined {
  const query = getTgLinkQuery(link, 'time');
  if (!query.found) {
    return undefined;
  }
  let unixTime = 0;
  let format = '';
  for (const parameter of query.query.split('&')) {
    const separatorIndex = parameter.indexOf('=');
    const key = separatorIndex === -1 ? parameter : parameter.slice(0, separatorIndex);
    const value = separatorIndex === -1 ? '' : parameter.slice(separatorIndex + 1);
    if (key === 'unix') {
      const parsedUnixTime = parseInt64(value);
      if (parsedUnixTime === undefined || parsedUnixTime <= 0n || parsedUnixTime > INT32_MAX) {
        return undefined;
      }
      unixTime = Number(parsedUnixTime);
    }
    if (key === 'format') {
      format = value;
    }
  }
  if (unixTime === 0) {
    return undefined;
  }
  const formatReading = readMarkupDateTimeFormat(format);
  if (!formatReading.valid) {
    return undefined;
  }
  return formatReading.format === undefined
    ? { unixTime }
    : { unixTime, format: formatReading.format };
}

/**
 * Reads a custom emoji identifier: a nonzero signed 64-bit integer written without a sign or
 * leading zeros that would change its value.
 */
export function parseCustomEmojiId(text: string): string | undefined {
  const customEmojiId = parseInt64(text);
  return customEmojiId === undefined || customEmojiId === 0n ? undefined : customEmojiId.toString();
}

/** Lowercases ASCII letters only, as TDLib's `to_lower` does. */
export function toAsciiLowerCase(text: string): string {
  return text.replace(/[A-Z]/g, (letter) => letter.toLowerCase());
}

/**
 * Reads a signed 64-bit integer that `to_integer_safe` accepts: its decimal text must round-trip,
 * so a plus sign, leading zeros, and `-0` are rejected.
 */
function parseInt64(text: string): bigint | undefined {
  if (!/^-?\d+$/.test(text)) {
    return undefined;
  }
  const value = BigInt(text);
  if (value < INT64_MIN || value > INT64_MAX || value.toString() !== text) {
    return undefined;
  }
  return value;
}

type TgLinkQuery =
  | { readonly found: true; readonly query: string }
  | { readonly found: false; readonly error: string };

/** Mirrors TDLib's `check_tg_url_host`: returns the query of a `tg://<host>?…` link. */
function getTgLinkQuery(link: string, host: string): TgLinkQuery {
  const lowerCasedLink = toAsciiLowerCase(link);
  if (!lowerCasedLink.startsWith('tg:')) {
    return { found: false, error: 'URL must have scheme tg' };
  }
  let rest = link.slice('tg:'.length);
  let lowerCasedRest = lowerCasedLink.slice('tg:'.length);
  if (rest.startsWith('//')) {
    rest = rest.slice(2);
    lowerCasedRest = lowerCasedRest.slice(2);
  }
  if (
    !lowerCasedRest.startsWith(host) ||
    (rest.length > host.length && !'/?#'.includes(rest[host.length]))
  ) {
    return { found: false, error: `URL must have host "${host}"` };
  }
  rest = removePrefix(rest.slice(host.length), '/');
  if (!rest.startsWith('?')) {
    return { found: false, error: 'URL must have parameters' };
  }
  return { found: true, query: truncateAt(rest.slice(1), '#') };
}

function findQueryParameter(query: string, name: string): string | undefined {
  for (const parameter of query.split('&')) {
    const separatorIndex = parameter.indexOf('=');
    const key = separatorIndex === -1 ? parameter : parameter.slice(0, separatorIndex);
    if (key === name) {
      return separatorIndex === -1 ? '' : parameter.slice(separatorIndex + 1);
    }
  }
  return undefined;
}

/** Mirrors TDLib's `check_link_impl` for links that may use any scheme Telegram accepts. */
function checkLinkWithoutContext(link: string): LinkCheck {
  let rest = link;
  const scheme = LINK_SCHEMES.find((candidate) =>
    toAsciiLowerCase(rest).startsWith(`${candidate}:`)
  );
  if (scheme !== undefined) {
    rest = removePrefix(rest.slice(scheme.length + 1), '//');
  }

  const parsing = parseHttpUrl(rest);
  if (!parsing.parsed) {
    return { valid: false, error: parsing.error };
  }
  const url = parsing.url;

  if (scheme !== undefined) {
    if (
      toAsciiLowerCase(rest).startsWith('http://') || url.protocol === 'https' ||
      url.userinfo.length > 0 || url.specifiedPort !== 0 || url.isIpv6
    ) {
      return { valid: false, error: scheme === 'tg' ? 'Wrong tg URL' : 'Wrong ton URL' };
    }
    const query = url.query.length > 1 && url.query[1] === '?' ? url.query.slice(1) : url.query;
    for (const character of url.host) {
      if (
        !isAsciiAlphanumeric(character) && character !== '-' && character !== '_' &&
        !(scheme === 'tonsite' && character === '.')
      ) {
        return { valid: false, error: 'Unallowed characters in URL host' };
      }
    }
    return { valid: true, url: `${scheme}://${url.host}${query}` };
  }

  if (!url.host.includes('.') && !url.isIpv6) {
    return { valid: false, error: 'Wrong HTTP URL' };
  }
  const userinfo = url.userinfo.length === 0 ? '' : `${url.userinfo}@`;
  const port = url.specifiedPort > 0 ? `:${url.specifiedPort}` : '';
  return { valid: true, url: `${url.protocol}://${userinfo}${url.host}${port}${url.query}` };
}

interface HttpUrl {
  readonly protocol: 'http' | 'https';
  readonly userinfo: string;
  /** Lowercased. */
  readonly host: string;
  readonly isIpv6: boolean;
  /** 0 when the URL names no port. */
  readonly specifiedPort: number;
  /** The path, query, and fragment; always begins with `/`. */
  readonly query: string;
}

type HttpUrlParsing =
  | { readonly parsed: true; readonly url: HttpUrl }
  | { readonly parsed: false; readonly error: string };

/** Mirrors TDLib's `parse_url` with HTTP as the default protocol. */
function parseHttpUrl(url: string): HttpUrlParsing {
  let position = 0;
  const protocolText = toAsciiLowerCase(readUntil(url, position, PROTOCOL_TERMINATORS));
  let protocol: HttpUrl['protocol'] = 'http';
  if (url.startsWith('://', protocolText.length)) {
    if (protocolText !== 'http' && protocolText !== 'https') {
      return { parsed: false, error: 'Unsupported URL protocol' };
    }
    protocol = protocolText;
    position = protocolText.length + '://'.length;
  }

  const authority = readUntil(url, position, AUTHORITY_TERMINATORS);
  position += authority.length;

  let colonIndex = authority.length - 1;
  while (colonIndex > 0 && !':]@'.includes(authority[colonIndex])) {
    colonIndex--;
  }
  let port = 0;
  let userinfoAndHost = authority;
  if (colonIndex > 0 && authority[colonIndex] === ':') {
    let portText = authority.slice(colonIndex + 1);
    while (portText.length > 1 && portText[0] === '0') {
      portText = portText.slice(1);
    }
    const parsedPort = /^\d+$/.test(portText) && String(Number(portText)) === portText
      ? Number(portText)
      : 0;
    port = parsedPort === 0 ? -1 : parsedPort;
    userinfoAndHost = authority.slice(0, colonIndex);
  }
  if (port < 0 || port > MAX_PORT) {
    return { parsed: false, error: 'Wrong port number specified in the URL' };
  }

  const atIndex = userinfoAndHost.lastIndexOf('@');
  const userinfo = atIndex === -1 ? '' : userinfoAndHost.slice(0, atIndex);
  const host = userinfoAndHost.slice(atIndex + 1);

  const isIpv6 = host.length > 0 && host[0] === '[' && host.endsWith(']');
  if (isIpv6 && !URL.canParse(`http://${host}/`)) {
    return { parsed: false, error: 'Wrong IPv6 address specified in the URL' };
  }
  if (host.length === 0) {
    return { parsed: false, error: 'URL host is empty' };
  }
  if (host === '.') {
    return { parsed: false, error: 'Host is invalid' };
  }

  let rawQuery = url.slice(position);
  while (rawQuery.length > 0 && isTdlibSpace(rawQuery[rawQuery.length - 1])) {
    rawQuery = rawQuery.slice(0, -1);
  }
  if (rawQuery.length === 0) {
    rawQuery = '/';
  }
  let query = rawQuery[0] === '/' ? '' : '/';
  for (const character of rawQuery) {
    const codePoint = character.codePointAt(0) ?? 0;
    query += codePoint <= 0x20
      ? `%${codePoint.toString(16).toUpperCase().padStart(2, '0')}`
      : character;
  }

  const lowerCasedHost = toAsciiLowerCase(host);
  if (isIpv6) {
    if (!/^[:0-9a-f.]*$/.test(lowerCasedHost.slice(1, -1))) {
      return { parsed: false, error: 'Wrong IPv6 URL host' };
    }
  } else {
    const partError = checkUrlPart(lowerCasedHost, 'host', false) ??
      checkUrlPart(userinfo, 'userinfo', true);
    if (partError !== undefined) {
      return { parsed: false, error: partError };
    }
  }

  return {
    parsed: true,
    url: { protocol, userinfo, host: lowerCasedHost, isIpv6, specifiedPort: port, query },
  };
}

/** Returns TDLib's error for a character a URL host or user information may not contain. */
function checkUrlPart(part: string, name: string, allowColon: boolean): string | undefined {
  for (let index = 0; index < part.length; index++) {
    const character = part[index];
    if (
      isAsciiAlphanumeric(character) || URL_PART_PUNCTUATION.includes(character) ||
      (allowColon && character === ':')
    ) {
      continue;
    }
    if (character === '%') {
      if (isAsciiHexDigit(part[index + 1]) && isAsciiHexDigit(part[index + 2])) {
        index += 2;
        continue;
      }
      return `Wrong percent-encoded symbol in URL ${name}`;
    }
    // Plain Unicode characters are allowed.
    if (character.charCodeAt(0) >= 0x80) {
      continue;
    }
    return `Disallowed character in URL ${name}`;
  }
  return undefined;
}

function readUntil(text: string, start: number, terminators: string): string {
  let end = start;
  while (end < text.length && !terminators.includes(text[end])) {
    end++;
  }
  return text.slice(start, end);
}

function removePrefix(text: string, prefix: string): string {
  return text.startsWith(prefix) ? text.slice(prefix.length) : text;
}

function truncateAt(text: string, terminator: string): string {
  const index = text.indexOf(terminator);
  return index === -1 ? text : text.slice(0, index);
}

function isAsciiAlphanumeric(character: string | undefined): boolean {
  return character !== undefined && /^[A-Za-z0-9]$/.test(character);
}

function isAsciiHexDigit(character: string | undefined): boolean {
  return character !== undefined && /^[0-9A-Fa-f]$/.test(character);
}

/** TDLib's `is_space`, which also counts NUL and vertical tab. */
function isTdlibSpace(character: string): boolean {
  return ' \t\r\n\0\v'.includes(character);
}
