import { parseHtmlMarkup } from '../src/text_entities/html_markup.ts';
import {
  parseMarkdownMarkup,
  parseMarkdownV2Markup,
} from '../src/text_entities/markdown_markup.ts';
import type { MarkupParsing } from '../src/text_entities/markup_input.ts';
import type { TextEntity } from '../src/types/virtual_message.ts';
import {
  TDLIB_HTML_CASES,
  TDLIB_MARKDOWN_V2_CASES,
  type TdlibMarkupCase,
} from './fixtures/tdlib_markup_cases.ts';

Deno.test('parseHtmlMarkup reads HTML as TDLib does', () => {
  for (const tdlibCase of TDLIB_HTML_CASES) {
    assertTdlibCase(parseHtmlMarkup, tdlibCase);
  }
});

Deno.test('parseMarkdownV2Markup reads MarkdownV2 as TDLib does', () => {
  for (const tdlibCase of TDLIB_MARKDOWN_V2_CASES) {
    assertTdlibCase(parseMarkdownV2Markup, tdlibCase);
  }
});

Deno.test('parseMarkdownV2Markup requires reserved characters to be escaped', () => {
  // Mirrors the character loop of TDLib's `parse_markdown` test.
  const reservedCharacters = ']()>#+-=|{}.!';
  const entityBeginCharacters = '_*[~`>';
  for (let code = 1; code < 126; code++) {
    const character = String.fromCharCode(code);
    if (entityBeginCharacters.includes(character)) {
      continue;
    }
    if (!reservedCharacters.includes(character)) {
      assertParsed(parseMarkdownV2Markup(character), character, []);
      continue;
    }
    assertFailed(
      parseMarkdownV2Markup(character),
      `Character '${character}' is reserved and must be escaped with the preceding '\\'`,
    );
    assertParsed(parseMarkdownV2Markup(`\\${character}`), character, []);
  }
});

Deno.test('parseMarkdownMarkup reads legacy Markdown', () => {
  assertParsed(parseMarkdownMarkup('*bold* _italic_ `code`'), 'bold italic code', [
    { type: 'bold', offset: 0, length: 4 },
    { type: 'italic', offset: 5, length: 6 },
    { type: 'code', offset: 12, length: 4 },
  ]);
  assertParsed(parseMarkdownMarkup('\\*not bold\\* 2\\*3'), '*not bold* 2*3', []);
  assertParsed(parseMarkdownMarkup('[site](telegram.org) [Ada](tg://user?id=7)'), 'site Ada', [
    { type: 'text_link', offset: 0, length: 4, url: 'http://telegram.org/' },
    { type: 'text_mention', offset: 5, length: 3, userId: 7 },
  ]);
  assertParsed(parseMarkdownMarkup('[bad](not a link)'), 'bad', []);
  assertParsed(parseMarkdownMarkup('```ts\nconst x = 1;```'), 'const x = 1;', [
    { type: 'pre', offset: 0, length: 12, language: 'ts' },
  ]);
  assertParsed(parseMarkdownMarkup('```\nplain```'), 'plain', [
    { type: 'pre', offset: 0, length: 5 },
  ]);
  // Reserved MarkdownV2 characters are plain text here.
  assertParsed(parseMarkdownMarkup('1.5 + 2 = 3.5!'), '1.5 + 2 = 3.5!', []);
  // Markers enclosing nothing produce no entity.
  assertParsed(parseMarkdownMarkup('**'), '', []);
  assertFailed(
    parseMarkdownMarkup('🏟 *bold'),
    "Can't find end of the entity starting at byte offset 5",
  );
});

Deno.test('markup parsers report date and time entities as unsupported', () => {
  assertDateTimeUnsupported(parseHtmlMarkup('<tg-time unix="1700000000">now</tg-time>'));
  assertDateTimeUnsupported(parseMarkdownV2Markup('![now](tg://time?unix=1700000000)'));
  // TDLib creates no entity for a time that is not positive.
  assertParsed(parseHtmlMarkup('<tg-time unix="0">never</tg-time>'), 'never', []);
});

function assertTdlibCase(
  parse: (markup: string) => MarkupParsing,
  tdlibCase: TdlibMarkupCase,
): void {
  const parsing = parse(tdlibCase.markup);
  if ('error' in tdlibCase) {
    assertFailed(parsing, tdlibCase.error);
  } else if ('dateTimeUnsupported' in tdlibCase) {
    assertDateTimeUnsupported(parsing);
  } else {
    assertParsed(parsing, tdlibCase.text, tdlibCase.entities);
  }
}

function assertParsed(
  parsing: MarkupParsing,
  expectedText: string,
  expectedEntities: readonly TextEntity[],
): void {
  if (
    !parsing.parsed || parsing.text !== expectedText ||
    canonicalJson(parsing.entities) !== canonicalJson(expectedEntities)
  ) {
    throw new Error(
      `Expected ${JSON.stringify(expectedText)} with ${
        JSON.stringify(expectedEntities)
      }, received ${JSON.stringify(parsing)}`,
    );
  }
}

function assertFailed(parsing: MarkupParsing, expectedError: string): void {
  if (parsing.parsed || parsing.reason !== 'markup_invalid' || parsing.error !== expectedError) {
    throw new Error(
      `Expected error ${JSON.stringify(expectedError)}, received ${JSON.stringify(parsing)}`,
    );
  }
}

function assertDateTimeUnsupported(parsing: MarkupParsing): void {
  if (parsing.parsed || parsing.reason !== 'date_time_unsupported') {
    throw new Error(
      `Expected date and time entities to be unsupported, received ${JSON.stringify(parsing)}`,
    );
  }
}

/** JSON with object keys sorted, so equal entities compare equal whatever their key order. */
function canonicalJson(value: unknown): string {
  return JSON.stringify(
    value,
    (_key, nestedValue: unknown) =>
      typeof nestedValue === 'object' && nestedValue !== null && !Array.isArray(nestedValue)
        ? Object.fromEntries(
          Object.entries(nestedValue).sort(([first], [second]) => first.localeCompare(second)),
        )
        : nestedValue,
  );
}
