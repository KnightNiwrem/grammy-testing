import type { TextEntity } from '../types/virtual_message.ts';
import {
  asciiCode,
  isTdlibSpace,
  isUtf8FirstCodeUnit,
  markupInvalid,
  type MarkupParsing,
  utf16LengthOfUtf8Character,
  Utf8MarkupInput,
  Utf8MarkupOutput,
} from './markup_input.ts';
import {
  getCheckedLink,
  getLinkCustomEmojiId,
  getLinkDateTime,
  getLinkUserId,
} from './telegram_link.ts';
import { compareTextEntities } from './text_entity_order.ts';

const BACKSLASH = asciiCode('\\');
const UNDERSCORE = asciiCode('_');
const ASTERISK = asciiCode('*');
const BACKTICK = asciiCode('`');
const OPENING_BRACKET = asciiCode('[');
const CLOSING_BRACKET = asciiCode(']');
const OPENING_PARENTHESIS = asciiCode('(');
const CLOSING_PARENTHESIS = asciiCode(')');
const TILDE = asciiCode('~');
const PIPE = asciiCode('|');
const EXCLAMATION_MARK = asciiCode('!');
const GREATER_THAN = asciiCode('>');
const LINE_FEED = asciiCode('\n');
const CARRIAGE_RETURN = asciiCode('\r');

/** The highest byte MarkdownV2 lets a backslash escape: any ASCII character except DEL. */
const MAX_ESCAPABLE_BYTE = 126;

const MARKDOWN_V2_RESERVED_CHARACTERS = '_*[]()~`>#+-=|{}.!\n';
const MARKDOWN_V2_CODE_RESERVED_CHARACTERS = '`';

/**
 * Reads Telegram's legacy Markdown parse mode, mirroring `parse_markdown` in TDLib's
 * `td/telegram/MessageEntity.cpp`.
 */
export function parseMarkdownMarkup(text: string): MarkupParsing {
  const input = new Utf8MarkupInput(text);
  const output = new Utf8MarkupOutput();
  const entities: TextEntity[] = [];
  let utf16Offset = 0;

  for (let index = 0; index < input.size; index++) {
    const byte = input.at(index);
    if (byte === BACKSLASH && isLegacyMarkdownMarker(input.at(index + 1))) {
      index++;
      output.push(input.at(index));
      utf16Offset++;
      continue;
    }
    if (!isLegacyMarkdownMarker(byte)) {
      if (isUtf8FirstCodeUnit(byte)) {
        utf16Offset += utf16LengthOfUtf8Character(byte);
      }
      output.push(byte);
      continue;
    }

    const entityBeginPosition = index;
    const endByte = byte === OPENING_BRACKET ? CLOSING_BRACKET : byte;
    let isPre = false;
    let language = '';
    index++;
    if (byte === BACKTICK && input.at(index) === BACKTICK && input.at(index + 1) === BACKTICK) {
      index += 2;
      isPre = true;
      const languageEnd = findPreLanguageEnd(input, index);
      if (index !== languageEnd && languageEnd < input.size && input.at(languageEnd) !== BACKTICK) {
        language = input.decode(index, languageEnd);
        index = languageEnd;
      }
      index = skipLeadingLineBreak(input, index);
    }

    const entityOffset = utf16Offset;
    const contentBeginPosition = output.size;
    while (
      index < input.size &&
      (input.at(index) !== endByte ||
        (isPre && !(input.at(index + 1) === BACKTICK && input.at(index + 2) === BACKTICK)))
    ) {
      const contentByte = input.at(index++);
      if (isUtf8FirstCodeUnit(contentByte)) {
        utf16Offset += utf16LengthOfUtf8Character(contentByte);
      }
      output.push(contentByte);
    }
    if (index === input.size) {
      return markupInvalid(
        `Can't find end of the entity starting at byte offset ${entityBeginPosition}`,
      );
    }

    if (entityOffset !== utf16Offset) {
      const span = { offset: entityOffset, length: utf16Offset - entityOffset };
      switch (byte) {
        case UNDERSCORE:
          entities.push({ type: 'italic', ...span });
          break;
        case ASTERISK:
          entities.push({ type: 'bold', ...span });
          break;
        case OPENING_BRACKET: {
          // Without a parenthesized URL, the link text is the URL. TDLib reads it from a buffer
          // that it rewrites in place, which garbles it after earlier markup; the emulator reads
          // the link text itself.
          let url: string;
          if (input.at(index + 1) !== OPENING_PARENTHESIS) {
            url = output.decode(contentBeginPosition);
          } else {
            index += 2;
            const urlBeginPosition = index;
            while (index < input.size && input.at(index) !== CLOSING_PARENTHESIS) {
              index++;
            }
            url = input.decode(urlBeginPosition, index);
          }
          const link = readLink(url, span);
          if (link !== undefined) {
            entities.push(link);
          }
          break;
        }
        case BACKTICK:
          if (!isPre) {
            entities.push({ type: 'code', ...span });
          } else {
            entities.push(
              language.length === 0 ? { type: 'pre', ...span } : { type: 'pre', ...span, language },
            );
          }
          break;
        default:
          throw new Error(`Unhandled Markdown marker: ${String.fromCharCode(byte)}`);
      }
    }
    if (isPre) {
      index += 2;
    }
  }

  return { parsed: true, text: output.decode(), entities };
}

type MarkdownV2EntityKind =
  | 'Bold'
  | 'Italic'
  | 'Underline'
  | 'Strikethrough'
  | 'Spoiler'
  | 'Code'
  | 'Pre'
  | 'PreCode'
  | 'TextUrl'
  | 'CustomEmoji'
  | 'BlockQuote'
  | 'ExpandableBlockQuote';

/** An entity whose opening marker has been read; kinds use TDLib's names, which errors show. */
interface OpenMarkdownV2Entity {
  readonly kind: MarkdownV2EntityKind;
  /** The language of a code block. */
  readonly language: string;
  /** Where the content begins, in UTF-16 code units of the output text. */
  readonly entityOffset: number;
  /** Where the opening marker begins, in bytes of the input text. */
  readonly markerPosition: number;
  /** Where the content begins, in bytes of the output text. */
  readonly contentBeginPosition: number;
}

/**
 * Reads Telegram's MarkdownV2 parse mode, mirroring `parse_markdown_v2` in TDLib's
 * `td/telegram/MessageEntity.cpp`.
 */
export function parseMarkdownV2Markup(text: string): MarkupParsing {
  const input = new Utf8MarkupInput(text);
  const output = new Utf8MarkupOutput();
  const entities: TextEntity[] = [];
  const openEntities: OpenMarkdownV2Entity[] = [];
  let utf16Offset = 0;
  let hasBlockquote = false;
  let canStartBlockquote = true;

  const reservedCharacterError = (byte: number) =>
    markupInvalid(
      `Character '${
        String.fromCharCode(byte)
      }' is reserved and must be escaped with the preceding '\\'`,
    );
  const unclosedEntityError = ({ kind, markerPosition }: OpenMarkdownV2Entity) =>
    markupInvalid(`Can't find end of ${kind} entity at byte offset ${markerPosition}`);

  for (let index = 0; index < input.size; index++) {
    const byte = input.at(index);
    const nextByte = input.at(index + 1);
    if (byte === BACKSLASH && nextByte > 0 && nextByte <= MAX_ESCAPABLE_BYTE) {
      index++;
      utf16Offset += 1;
      output.push(nextByte);
      if (nextByte !== CARRIAGE_RETURN) {
        canStartBlockquote = nextByte === LINE_FEED;
      }
      continue;
    }

    const innermostEntity = openEntities.at(-1);
    const reservedCharacters = innermostEntity !== undefined && isCodeKind(innermostEntity.kind)
      ? MARKDOWN_V2_CODE_RESERVED_CHARACTERS
      : MARKDOWN_V2_RESERVED_CHARACTERS;
    if (!reservedCharacters.includes(String.fromCharCode(byte))) {
      if (isUtf8FirstCodeUnit(byte)) {
        utf16Offset += utf16LengthOfUtf8Character(byte);
        if (byte !== CARRIAGE_RETURN) {
          canStartBlockquote = false;
        }
      }
      output.push(byte);
      continue;
    }

    if (
      innermostEntity === undefined ||
      !isMarkdownV2EntityEnd(innermostEntity.kind, input, index, hasBlockquote)
    ) {
      const markerPosition = index;
      let kind: MarkdownV2EntityKind;
      let language = '';
      switch (byte) {
        case UNDERSCORE:
          if (nextByte === UNDERSCORE) {
            index++;
            kind = 'Underline';
          } else {
            kind = 'Italic';
          }
          break;
        case ASTERISK:
          kind = 'Bold';
          break;
        case TILDE:
          kind = 'Strikethrough';
          break;
        case PIPE:
          if (nextByte !== PIPE) {
            return reservedCharacterError(byte);
          }
          index++;
          kind = 'Spoiler';
          break;
        case OPENING_BRACKET:
          kind = 'TextUrl';
          break;
        case BACKTICK:
          if (nextByte === BACKTICK && input.at(index + 2) === BACKTICK) {
            index += 3;
            kind = 'Pre';
            const languageEnd = findPreLanguageEnd(input, index);
            if (
              index !== languageEnd && languageEnd < input.size &&
              input.at(languageEnd) !== BACKTICK
            ) {
              kind = 'PreCode';
              language = input.decode(index, languageEnd);
              index = languageEnd;
            }
            // Step back onto the last marker byte, which the loop steps past.
            index = skipLeadingLineBreak(input, index) - 1;
          } else {
            kind = 'Code';
          }
          break;
        case EXCLAMATION_MARK:
          if (nextByte !== OPENING_BRACKET) {
            return reservedCharacterError(byte);
          }
          index++;
          kind = 'CustomEmoji';
          break;
        case LINE_FEED:
          utf16Offset += 1;
          output.push(LINE_FEED);
          canStartBlockquote = true;
          continue;
        case GREATER_THAN:
          if (!canStartBlockquote) {
            return reservedCharacterError(byte);
          }
          // Each further line of a blockquote repeats its marker.
          if (hasBlockquote) {
            continue;
          }
          kind = 'BlockQuote';
          hasBlockquote = true;
          break;
        default:
          return reservedCharacterError(byte);
      }
      openEntities.push({
        kind,
        language,
        entityOffset: utf16Offset,
        markerPosition,
        contentBeginPosition: output.size,
      });
      continue;
    }

    let closingEntity = innermostEntity;
    let kind = closingEntity.kind;
    if (byte === LINE_FEED && kind !== 'BlockQuote') {
      // Only a spoiler marker at the very end of a blockquote's last line may meet the line
      // break: it makes the blockquote expandable.
      const endsBlockquoteLine = kind === 'Spoiler' &&
        (closingEntity.markerPosition === index - 2 ||
          (closingEntity.markerPosition === index - 3 && output.size !== 0 &&
            output.lastByte === CARRIAGE_RETURN));
      if (!endsBlockquoteLine) {
        return unclosedEntityError(closingEntity);
      }
      openEntities.pop();
      const enclosingEntity = openEntities.at(-1);
      if (enclosingEntity === undefined) {
        throw new Error('A spoiler at the end of a blockquote line has no enclosing blockquote');
      }
      if (enclosingEntity.kind !== 'BlockQuote') {
        return unclosedEntityError(enclosingEntity);
      }
      closingEntity = enclosingEntity;
      kind = 'ExpandableBlockQuote';
    }

    const span = {
      offset: closingEntity.entityOffset,
      length: utf16Offset - closingEntity.entityOffset,
    };
    let skipEntity = span.length === 0;
    let entity: TextEntity | undefined;
    switch (kind) {
      case 'Bold':
        entity = { type: 'bold', ...span };
        break;
      case 'Italic':
        entity = { type: 'italic', ...span };
        break;
      case 'Code':
        entity = { type: 'code', ...span };
        break;
      case 'Strikethrough':
        entity = { type: 'strikethrough', ...span };
        break;
      case 'Underline':
        index++;
        entity = { type: 'underline', ...span };
        break;
      case 'Spoiler':
        index++;
        entity = { type: 'spoiler', ...span };
        break;
      case 'Pre':
        index += 2;
        entity = { type: 'pre', ...span };
        break;
      case 'PreCode':
        index += 2;
        entity = { type: 'pre', ...span, language: closingEntity.language };
        break;
      case 'TextUrl': {
        let url: string;
        if (input.at(index + 1) !== OPENING_PARENTHESIS) {
          url = output.decode(closingEntity.contentBeginPosition);
        } else {
          index += 2;
          const urlReading = readParenthesizedUrl(input, index);
          if (!urlReading.read) {
            return urlReading.failure;
          }
          url = urlReading.url;
          index = urlReading.end;
        }
        entity = readLink(url, span);
        if (entity === undefined) {
          skipEntity = true;
        }
        break;
      }
      case 'CustomEmoji': {
        if (input.at(index + 1) !== OPENING_PARENTHESIS) {
          return markupInvalid('The entity must contain a tg://emoji or tg://time URL');
        }
        index += 2;
        const urlReading = readParenthesizedUrl(input, index);
        if (!urlReading.read) {
          return urlReading.failure;
        }
        index = urlReading.end;
        const customEmoji = getLinkCustomEmojiId(urlReading.url);
        if (customEmoji.kind === 'custom_emoji') {
          entity = { type: 'custom_emoji', ...span, customEmojiId: customEmoji.customEmojiId };
          break;
        }
        const dateTime = getLinkDateTime(urlReading.url);
        if (dateTime === undefined) {
          return markupInvalid('Invalid tg://emoji or tg://time URL specified');
        }
        entity = { type: 'date_time', ...span, ...dateTime };
        break;
      }
      case 'BlockQuote':
      case 'ExpandableBlockQuote':
        // The line break that ends a blockquote belongs to it.
        hasBlockquote = false;
        output.push(byte);
        canStartBlockquote = true;
        utf16Offset += 1;
        skipEntity = false;
        entity = {
          type: kind === 'BlockQuote' ? 'blockquote' : 'expandable_blockquote',
          offset: span.offset,
          length: span.length + 1,
        };
        break;
      default: {
        const unhandledKind: never = kind;
        throw new Error(`Unhandled MarkdownV2 entity: ${unhandledKind}`);
      }
    }
    if (!skipEntity && entity !== undefined) {
      entities.push(entity);
    }
    openEntities.pop();
  }

  if (hasBlockquote) {
    let kind: 'blockquote' | 'expandable_blockquote' = 'blockquote';
    const innermostEntity = openEntities.at(-1);
    if (innermostEntity?.kind === 'Spoiler' && innermostEntity.markerPosition === input.size - 2) {
      openEntities.pop();
      kind = 'expandable_blockquote';
    }
    const blockquote = openEntities.at(-1);
    if (blockquote?.kind === 'BlockQuote') {
      const length = utf16Offset - blockquote.entityOffset;
      if (length !== 0) {
        entities.push({ type: kind, offset: blockquote.entityOffset, length });
      }
      openEntities.pop();
    }
  }
  const unclosedEntity = openEntities.at(-1);
  if (unclosedEntity !== undefined) {
    return unclosedEntityError(unclosedEntity);
  }

  return { parsed: true, text: output.decode(), entities: entities.sort(compareTextEntities) };
}

function isMarkdownV2EntityEnd(
  kind: MarkdownV2EntityKind,
  input: Utf8MarkupInput,
  index: number,
  hasBlockquote: boolean,
): boolean {
  const byte = input.at(index);
  const nextByte = input.at(index + 1);
  if (
    hasBlockquote && byte === LINE_FEED && (index + 1 === input.size || nextByte !== GREATER_THAN)
  ) {
    return true;
  }
  switch (kind) {
    case 'Bold':
      return byte === ASTERISK;
    case 'Italic':
      return byte === UNDERSCORE && nextByte !== UNDERSCORE;
    case 'Code':
      return byte === BACKTICK;
    case 'Pre':
    case 'PreCode':
      return byte === BACKTICK && nextByte === BACKTICK && input.at(index + 2) === BACKTICK;
    case 'TextUrl':
    case 'CustomEmoji':
      return byte === CLOSING_BRACKET;
    case 'Underline':
      return byte === UNDERSCORE && nextByte === UNDERSCORE;
    case 'Strikethrough':
      return byte === TILDE;
    case 'Spoiler':
      return byte === PIPE && nextByte === PIPE;
    case 'BlockQuote':
    case 'ExpandableBlockQuote':
      return false;
    default: {
      const unhandledKind: never = kind;
      throw new Error(`Unhandled MarkdownV2 entity: ${unhandledKind}`);
    }
  }
}

function isCodeKind(kind: MarkdownV2EntityKind): boolean {
  return kind === 'Code' || kind === 'Pre' || kind === 'PreCode';
}

type ParenthesizedUrlReading =
  | { readonly read: true; readonly url: string; readonly end: number }
  | { readonly read: false; readonly failure: MarkupParsing };

/**
 * Reads a MarkdownV2 URL up to its closing parenthesis, unescaping backslash escapes. `end` is
 * the position of the closing parenthesis.
 */
function readParenthesizedUrl(input: Utf8MarkupInput, start: number): ParenthesizedUrlReading {
  const url = new Utf8MarkupOutput();
  let index = start;
  while (index < input.size && input.at(index) !== CLOSING_PARENTHESIS) {
    const nextByte = input.at(index + 1);
    if (input.at(index) === BACKSLASH && nextByte > 0 && nextByte <= MAX_ESCAPABLE_BYTE) {
      url.push(nextByte);
      index += 2;
      continue;
    }
    url.push(input.at(index++));
  }
  if (input.at(index) !== CLOSING_PARENTHESIS) {
    return {
      read: false,
      failure: markupInvalid(`Can't find end of a URL at byte offset ${start}`),
    };
  }
  return { read: true, url: url.decode(), end: index };
}

/**
 * Returns the entity a Markdown link produces: a mention for a `tg://user?id=` link, a text link
 * for a link Telegram accepts, and nothing for any other link.
 */
function readLink(
  url: string,
  span: { readonly offset: number; readonly length: number },
): TextEntity | undefined {
  const userId = getLinkUserId(url);
  if (userId !== undefined) {
    return { type: 'text_mention', ...span, userId };
  }
  const checkedUrl = getCheckedLink(url);
  return checkedUrl === undefined ? undefined : { type: 'text_link', ...span, url: checkedUrl };
}

/** Finds where the language after a code block's opening backticks ends. */
function findPreLanguageEnd(input: Utf8MarkupInput, start: number): number {
  let end = start;
  while (!isTdlibSpace(input.at(end)) && input.at(end) !== BACKTICK) {
    end++;
  }
  return end;
}

/** Skips one line break, written as LF, CR, CRLF, or LFCR, at the start of a code block. */
function skipLeadingLineBreak(input: Utf8MarkupInput, index: number): number {
  const byte = input.at(index);
  if (byte !== LINE_FEED && byte !== CARRIAGE_RETURN) {
    return index;
  }
  const nextByte = input.at(index + 1);
  const isTwoByteLineBreak = (nextByte === LINE_FEED || nextByte === CARRIAGE_RETURN) &&
    byte !== nextByte;
  return index + (isTwoByteLineBreak ? 2 : 1);
}

function isLegacyMarkdownMarker(byte: number): boolean {
  return byte === UNDERSCORE || byte === ASTERISK || byte === BACKTICK || byte === OPENING_BRACKET;
}
