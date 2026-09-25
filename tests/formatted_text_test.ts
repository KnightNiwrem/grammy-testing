import { fixFormattedText, type FormattedTextFixing } from '../src/text_entities/formatted_text.ts';
import type { TextEntity } from '../src/types/virtual_message.ts';

// Unless noted, cases come from the `fix_formatted_text` test in TDLib's `test/message_entities.cpp`
// at commit ea97bcdd3a15523c58ddfe772b4547187cf5bbeb, for the options Telegram uses when a message
// is sent: empty text rejected and whitespace trimmed.

const MENTIONABLE_USER_ID = 1;
const context = { isMentionableUser: (userId: number) => userId === MENTIONABLE_USER_ID };

const bold = (offset: number, length: number): TextEntity => ({ type: 'bold', offset, length });
const italic = (offset: number, length: number): TextEntity => ({ type: 'italic', offset, length });
const underline = (offset: number, length: number): TextEntity => ({
  type: 'underline',
  offset,
  length,
});
const strikethrough = (offset: number, length: number): TextEntity => ({
  type: 'strikethrough',
  offset,
  length,
});
const spoiler = (offset: number, length: number): TextEntity => ({
  type: 'spoiler',
  offset,
  length,
});
const pre = (offset: number, length: number): TextEntity => ({ type: 'pre', offset, length });
const blockquote = (offset: number, length: number): TextEntity => ({
  type: 'blockquote',
  offset,
  length,
});
const textLink = (offset: number, length: number): TextEntity => ({
  type: 'text_link',
  offset,
  length,
  url: 'http://t.me/',
});
const textMention = (offset: number, length: number): TextEntity => ({
  type: 'text_mention',
  offset,
  length,
  userId: MENTIONABLE_USER_ID,
});

Deno.test('fixFormattedText cleans control characters and trims whitespace', () => {
  let controlCharacters = '';
  let cleanedControlCharacters = '';
  for (let code = 0; code <= 32; code++) {
    controlCharacters += String.fromCharCode(code);
    if (code !== 13) {
      cleanedControlCharacters += code === 10 ? '\n' : ' ';
    }
  }
  assertFailed(fixFormattedText(controlCharacters, [], context), 'Text must be non-empty');
  assertFixed(fixFormattedText('  aba\n ', [], context), 'aba', []);
  assertFailed(fixFormattedText('  \n ', [], context), 'Text must be non-empty');

  const text = `${controlCharacters}a  \r\n  `;
  const expectedText = `${cleanedControlCharacters}a`;
  // Trimming stops at an entity, and cuts entities at the new end.
  for (const length of [33, 34, 35]) {
    assertFixed(fixFormattedText(text, [pre(0, length)], context), expectedText, [
      pre(0, length === 33 ? 32 : 33),
    ]);
    assertFixed(fixFormattedText(text, [bold(0, length)], context), expectedText, [
      bold(0, length === 33 ? 32 : 33),
    ]);
  }
});

Deno.test('fixFormattedText rejects entities that split a character or pass the end', () => {
  const text = '👉 👉  ';
  for (let offset = 0; offset < 10; offset++) {
    const fixing = fixFormattedText(text, [bold(offset, 1)], context);
    if (offset === 2) {
      assertFixed(fixing, '👉 👉', [bold(2, 1)]);
    } else if (offset === 5 || offset === 6) {
      assertFixed(fixing, '👉 👉', []);
    } else if (fixing.fixed) {
      throw new Error(
        `Expected bold at ${offset} to be rejected, received ${JSON.stringify(fixing)}`,
      );
    }
  }

  assertFailed(
    fixFormattedText(text, [bold(1, 1)], context),
    'Entity begins in a middle of a UTF-16 symbol at byte offset 4',
  );
  assertFailed(
    fixFormattedText(text, [bold(0, 1)], context),
    'Entity beginning at UTF-16 offset 0 ends in a middle of a UTF-16 symbol at byte offset 4',
  );
  assertFailed(
    fixFormattedText('aba caba', [bold(3, 6)], context),
    'Entity beginning at UTF-16 offset 3 ends after the end of the text at UTF-16 offset 9',
  );
  assertFailed(
    fixFormattedText('aba caba', [bold(9, 1)], context),
    'Entity begins after the end of the text at UTF-16 offset 9',
  );
  assertFailed(
    fixFormattedText('aba caba', [bold(-1, 1)], context),
    'Receive an entity with incorrect offset -1',
  );
  assertFailed(
    fixFormattedText('aba caba', [bold(0, -1)], context),
    'Receive an entity with incorrect length -1',
  );

  for (let length = -10; length <= 10; length++) {
    for (let offset = -10; offset <= 10; offset++) {
      const fixing = fixFormattedText('aba caba', [bold(offset, length)], context);
      if (length < 0 || offset < 0 || (length > 0 && length + offset > 8)) {
        if (fixing.fixed) {
          throw new Error(`Expected bold(${offset}, ${length}) to be rejected`);
        }
        continue;
      }
      assertFixed(fixing, 'aba caba', length > 0 ? [bold(offset, length)] : []);
    }
  }
});

Deno.test('fixFormattedText shifts entities over removed carriage returns', () => {
  const text = 'aba \r\n caba ';
  for (let length = 1; length <= 3; length++) {
    for (let offset = 0; offset + length <= text.length; offset++) {
      for (const createEntity of [bold, textLink, textMention]) {
        const fixedText = 'aba \n caba';
        let fixedLength = offset <= 4 && offset + length >= 5 ? length - 1 : length;
        const fixedOffset = offset >= 5 ? offset - 1 : offset;
        while (fixedOffset + fixedLength > fixedText.length) {
          fixedLength--;
        }
        assertFixed(
          fixFormattedText(text, [createEntity(offset, length)], context),
          fixedText,
          fixedLength > 0 ? [createEntity(fixedOffset, fixedLength)] : [],
        );
      }
    }
  }
});

Deno.test('fixFormattedText drops links that intersect earlier links', () => {
  const text = 'abadcaba';
  for (let length = 1; length <= 7; length++) {
    for (let offset = 0; offset <= 8 - length; offset++) {
      for (let secondLength = 1; secondLength <= 7; secondLength++) {
        for (let secondOffset = 0; secondOffset <= 8 - secondLength; secondOffset++) {
          if (offset === secondOffset) {
            continue;
          }
          const entities = [textLink(offset, length), textLink(secondOffset, secondLength)];
          const [first, second] = [...entities].sort((a, b) => a.offset - b.offset);
          const expectedEntities = first.offset + first.length > second.offset
            ? [first]
            : [first, second];
          assertFixed(fixFormattedText(text, entities, context), text, expectedEntities);
        }
      }
    }
  }
});

Deno.test('fixFormattedText trims around formatting only up to the first entity', () => {
  for (const text of [' \n ➡️ ➡️ ➡️ ➡️  \n ', '\n\n\nab cd ef gh        ']) {
    const entities: TextEntity[] = [];
    const expectedEntities: TextEntity[] = [];
    for (let index = 0; index < 10; index++) {
      if ((index + 1) * 3 + 2 <= text.length) {
        entities.push(bold((index + 1) * 3, 2));
      }
      if ((index + 2) * 3 <= text.length) {
        entities.push(italic((index + 1) * 3 + 2, 1));
      }
      if (index < 4) {
        expectedEntities.push(bold(index * 3, 2));
      }
      if (index < 3) {
        expectedEntities.push(italic(index * 3 + 2, 1));
      }
    }
    assertFixed(
      fixFormattedText(text, entities, context),
      text.slice(3, 14),
      expectedEntities.sort((first, second) => first.offset - second.offset),
    );
  }
});

Deno.test('fixFormattedText merges and splits formatting as TDLib does', () => {
  const cases: ReadonlyArray<
    readonly [string, readonly TextEntity[], string, readonly TextEntity[]]
  > = [
    ['a\rbc\r', [italic(0, 1), bold(0, 2), italic(3, 2), bold(3, 1)], 'abc', [
      bold(0, 1),
      italic(0, 1),
      bold(2, 1),
      italic(2, 1),
    ]],
    ['a ', [italic(0, 2), bold(0, 1)], 'a', [bold(0, 1), italic(0, 1)]],
    ['abc', [italic(1, 1), italic(0, 1)], 'abc', [italic(0, 2)]],
    ['abc', [italic(1, 1), italic(1, 1)], 'abc', [italic(1, 1)]],
    ['abc', [italic(0, 2), italic(1, 2)], 'abc', [italic(0, 3)]],
    ['abc', [italic(0, 2), italic(2, 1)], 'abc', [italic(0, 3)]],
    ['abc', [italic(0, 1), italic(2, 1)], 'abc', [italic(0, 1), italic(2, 1)]],
    ['abc', [italic(0, 2), bold(1, 2)], 'abc', [italic(0, 1), bold(1, 2), italic(1, 1)]],
    ['abc', [italic(0, 2), bold(2, 1)], 'abc', [italic(0, 2), bold(2, 1)]],
    ['abc', [italic(0, 1), bold(2, 1)], 'abc', [italic(0, 1), bold(2, 1)]],
    ['ab', [underline(0, 2), strikethrough(1, 1)], 'ab', [
      underline(0, 1),
      underline(1, 1),
      strikethrough(1, 1),
    ]],
    ['ab', [underline(0, 1), underline(1, 1), strikethrough(1, 1)], 'ab', [
      underline(0, 1),
      underline(1, 1),
      strikethrough(1, 1),
    ]],
    ['ab', [strikethrough(0, 2), underline(1, 1)], 'ab', [
      strikethrough(0, 1),
      underline(1, 1),
      strikethrough(1, 1),
    ]],
    ['ab', [underline(0, 2), spoiler(0, 1)], 'ab', [underline(0, 2), spoiler(0, 1)]],
    ['ab', [underline(0, 1), underline(1, 1), spoiler(0, 1)], 'ab', [
      underline(0, 2),
      spoiler(0, 1),
    ]],
    ['a\rb', [bold(0, 1), italic(0, 1), bold(2, 1), italic(2, 1)], 'ab', [
      bold(0, 2),
      italic(0, 2),
    ]],
    ['a\nb', [bold(0, 1), italic(0, 1), bold(2, 1), italic(2, 1)], 'a\nb', [
      bold(0, 1),
      italic(0, 1),
      bold(2, 1),
      italic(2, 1),
    ]],
    ['a', [pre(0, 1), spoiler(0, 1)], 'a', [pre(0, 1)]],
    ['a', [spoiler(0, 1), pre(0, 1)], 'a', [pre(0, 1)]],
    ['abc', [pre(0, 3), strikethrough(1, 1)], 'abc', [pre(0, 3)]],
    ['abc', [pre(1, 1), strikethrough(0, 3)], 'abc', [
      strikethrough(0, 1),
      pre(1, 1),
      strikethrough(2, 1),
    ]],
    ['abc', [pre(1, 1), strikethrough(1, 2)], 'abc', [pre(1, 1), strikethrough(2, 1)]],
    ['abc', [pre(1, 1), strikethrough(0, 2)], 'abc', [strikethrough(0, 1), pre(1, 1)]],
    ['abc', [pre(0, 3), blockquote(1, 1)], 'abc', [blockquote(1, 1)]],
    ['abc', [blockquote(0, 3), pre(1, 1)], 'abc', [blockquote(0, 3), pre(1, 1)]],
  ];
  for (const [text, entities, expectedText, expectedEntities] of cases) {
    assertFixed(fixFormattedText(text, entities, context), expectedText, expectedEntities);
  }
});

Deno.test('fixFormattedText keeps only the last of repeated direction marks', () => {
  assertFixed(
    fixFormattedText('\u200f\u200f  \u200e\u200e\u200e\u200c \u200f\u200e \u200f a', [], context),
    '\u200c\u200f  \u200c\u200c\u200e\u200c \u200c\u200e \u200f a',
    [],
  );
  assertFailed(
    fixFormattedText('\u200f\u200f  \u200e\u200e\u200e\u200c \u200f\u200e \u200f', [], context),
    'Text must be non-empty',
  );
});

// The remaining cases cover the emulator's own responsibilities around TDLib's algorithm.

Deno.test('fixFormattedText marks bot commands around formatting', () => {
  assertFixed(fixFormattedText('hi /start there', [bold(0, 15)], context), 'hi /start there', [
    bold(0, 3),
    { type: 'bot_command', offset: 3, length: 6 },
    bold(3, 6),
    bold(9, 6),
  ]);
  // Commands inside code or links are not marked.
  assertFixed(
    fixFormattedText('run /start', [{ type: 'code', offset: 4, length: 6 }], context),
    'run /start',
    [
      { type: 'code', offset: 4, length: 6 },
    ],
  );
  assertFixed(fixFormattedText('/start', [textLink(0, 6)], context), '/start', [textLink(0, 6)]);
});

Deno.test('fixFormattedText marks the entities Telegram detects outside code and links', () => {
  assertFixed(
    fixFormattedText('ask @grammy_team at grammy.dev #help', [italic(0, 36)], context),
    'ask @grammy_team at grammy.dev #help',
    [
      italic(0, 4),
      { type: 'mention', offset: 4, length: 12 },
      italic(4, 12),
      italic(16, 4),
      { type: 'url', offset: 20, length: 10 },
      italic(20, 10),
      italic(30, 1),
      { type: 'hashtag', offset: 31, length: 5 },
      italic(31, 5),
    ],
  );
  assertFixed(
    fixFormattedText(
      'see grammy.dev and ada@example.com',
      [{ type: 'code', offset: 4, length: 10 }, textLink(19, 15)],
      context,
    ),
    'see grammy.dev and ada@example.com',
    [{ type: 'code', offset: 4, length: 10 }, textLink(19, 15)],
  );
});

Deno.test('fixFormattedText validates entity arguments as TDLib does', () => {
  assertFixed(
    fixFormattedText(
      'site',
      [{ type: 'text_link', offset: 0, length: 4, url: 'Example.COM' }],
      context,
    ),
    'site',
    [{ type: 'text_link', offset: 0, length: 4, url: 'http://example.com/' }],
  );
  assertFixed(
    fixFormattedText('Ada', [{
      type: 'text_link',
      offset: 0,
      length: 3,
      url: `tg://user?id=${MENTIONABLE_USER_ID}`,
    }], context),
    'Ada',
    [textMention(0, 3)],
  );
  assertFailed(
    fixFormattedText(
      'site',
      [{ type: 'text_link', offset: 0, length: 4, url: 'localhost' }],
      context,
    ),
    "Entity URL 'localhost' is invalid: Wrong HTTP URL",
  );
  assertFailed(
    fixFormattedText('Bob', [{ type: 'text_mention', offset: 0, length: 3, userId: 2 }], context),
    'User not found',
  );
  assertFailed(
    fixFormattedText(
      'x',
      [{ type: 'custom_emoji', offset: 0, length: 1, customEmojiId: '0' }],
      context,
    ),
    'Invalid custom emoji identifier specified',
  );
});

Deno.test('fixFormattedText keeps entities consistent for random input', () => {
  // A seeded version of the randomized test in TDLib's `fix_formatted_text` test.
  const random = createSeededRandom(20_260_924);
  const createEntities: ReadonlyArray<(offset: number, length: number) => TextEntity> = [
    bold,
    italic,
    underline,
    strikethrough,
    spoiler,
    (offset, length) => ({ type: 'code', offset, length }),
    pre,
    (offset, length) => ({ type: 'pre', offset, length, language: 'ts' }),
    textLink,
    textMention,
    (offset, length) => ({ type: 'custom_emoji', offset, length, customEmojiId: '1' }),
    blockquote,
    (offset, length) => ({ type: 'expandable_blockquote', offset, length }),
  ];
  const splittableTypes = new Set<TextEntity['type']>([
    'bold',
    'italic',
    'underline',
    'strikethrough',
    'spoiler',
  ]);
  const preTypes = new Set<TextEntity['type']>(['code', 'pre']);
  const blockquoteTypes = new Set<TextEntity['type']>(['blockquote', 'expandable_blockquote']);

  for (let iteration = 0; iteration < 5_000; iteration++) {
    const text = 'a'.repeat(random.integer(1, 20));
    const entities: TextEntity[] = [];
    const entityCount = random.integer(1, 20);
    for (let index = 0; index < entityCount; index++) {
      const offset = random.integer(0, text.length - 1);
      let maxLength = text.length - offset;
      if (iteration % 2 === 1 && maxLength > 4) {
        maxLength = 4;
      }
      entities.push(
        createEntities[random.integer(0, createEntities.length - 1)](
          offset,
          random.integer(0, maxLength),
        ),
      );
    }

    const fixing = fixFormattedText(text, entities, context);
    if (!fixing.fixed || fixing.formattedText.text !== text) {
      throw new Error(
        `Expected ${JSON.stringify(entities)} to be fixed, received ${JSON.stringify(fixing)}`,
      );
    }
    const fixedEntities = fixing.formattedText.entities;

    // Formatting covers the same characters, except that code shows none.
    for (let position = 0; position < text.length; position++) {
      const coveringTypes = (list: readonly TextEntity[]) =>
        new Set(
          list.filter((entity) =>
            entity.length > 0 && entity.offset <= position &&
            position < entity.offset + entity.length
          ).map((entity) => entity.type),
        );
      const oldTypes = coveringTypes(entities);
      const newTypes = coveringTypes(fixedEntities);
      const isInCode = [...newTypes].some((type) => preTypes.has(type));
      for (const type of splittableTypes) {
        const expected = !isInCode && oldTypes.has(type);
        if (newTypes.has(type) !== expected) {
          throw new Error(
            `Expected ${type} ${expected ? '' : 'not '}at ${position} after fixing ${
              JSON.stringify(entities)
            }, received ${JSON.stringify(fixedEntities)}`,
          );
        }
      }
    }

    for (let index = 0; index < fixedEntities.length; index++) {
      const outer = fixedEntities[index];
      for (const inner of fixedEntities.slice(index + 1)) {
        const isSorted = inner.offset > outer.offset ||
          (inner.offset === outer.offset && inner.length <= outer.length);
        const isNestedOrDisjoint = inner.offset >= outer.offset + outer.length ||
          inner.offset + inner.length <= outer.offset + outer.length;
        const isNested = inner.offset < outer.offset + outer.length;
        const isValidNesting = !isNested || (
          inner.type !== outer.type && !preTypes.has(outer.type) &&
          (splittableTypes.has(outer.type) || blockquoteTypes.has(outer.type) ||
            splittableTypes.has(inner.type))
        );
        if (!isSorted || !isNestedOrDisjoint || !isValidNesting) {
          throw new Error(`Inconsistent entities after fixing: ${JSON.stringify(fixedEntities)}`);
        }
      }
    }
  }
});

Deno.test('fixFormattedText empties captions without visible content as TDLib does', () => {
  // Captions use TDLib's `allow_empty`, and bot captions also `allow_empty_string`.
  for (const treatment of ['clear', 'keep_invisible_characters'] as const) {
    assertFixed(fixFormattedText('  \n ', [bold(0, 2)], context, treatment), '', []);
    assertFixed(fixFormattedText('', [], context, treatment), '', []);
  }
  assertFixed(fixFormattedText(' \u200b ', [], context, 'clear'), '', []);
  assertFixed(
    fixFormattedText(' \u200b ', [], context, 'keep_invisible_characters'),
    '\u200b',
    [],
  );
  assertFailed(fixFormattedText(' \u200b ', [], context, 'reject'), 'Text must be non-empty');
  assertFixed(fixFormattedText(' /start ', [], context, 'clear'), '/start', [
    { type: 'bot_command', offset: 0, length: 6 },
  ]);
});

function assertFixed(
  fixing: FormattedTextFixing,
  expectedText: string,
  expectedEntities: readonly TextEntity[],
): void {
  if (
    !fixing.fixed || fixing.formattedText.text !== expectedText ||
    canonicalJson(fixing.formattedText.entities) !== canonicalJson(expectedEntities)
  ) {
    throw new Error(
      `Expected ${JSON.stringify(expectedText)} with ${
        JSON.stringify(expectedEntities)
      }, received ${JSON.stringify(fixing)}`,
    );
  }
}

function assertFailed(fixing: FormattedTextFixing, expectedError: string): void {
  if (fixing.fixed || fixing.error !== expectedError) {
    throw new Error(
      `Expected error ${JSON.stringify(expectedError)}, received ${JSON.stringify(fixing)}`,
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

/** A small deterministic generator (mulberry32), so failures reproduce. */
function createSeededRandom(seed: number) {
  let state = seed >>> 0;
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let mixed = state;
    mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4_294_967_296;
  };
  return {
    /** Returns an integer from `min` to `max`, inclusive. */
    integer: (min: number, max: number) => min + Math.floor(next() * (max - min + 1)),
  };
}
