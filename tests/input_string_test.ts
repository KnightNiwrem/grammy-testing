import { cleanName, stripEmptyCharacters } from '../src/text_entities/input_string.ts';

Deno.test('stripEmptyCharacters strips and truncates text as TDLib does', () => {
  const cases: Array<[string, number, string]> = [
    // Unusual spaces become plain spaces, and the text is trimmed.
    ['　 Café au lait  ', 20, 'Café au lait'],
    // Tag characters become spaces too.
    ['a\u{e0041}b', 10, 'a b'],
    // The text keeps at most the given number of characters, counting each code point once.
    ['😀😀😀 tail', 3, '😀😀😀'],
    ['ab   cd', 3, 'ab'],
    // Text of only empty characters is empty; a no-break space is not trimmed but is empty.
    ['​ ‎ \n', 10, ''],
    [' x', 10, ' x'],
  ];
  for (const [text, maxLength, expected] of cases) {
    const stripped = stripEmptyCharacters(text, maxLength);
    if (stripped !== expected) {
      throw new Error(
        `Expected ${JSON.stringify(text)} to become ${JSON.stringify(expected)}, received ${
          JSON.stringify(stripped)
        }`,
      );
    }
  }
});

Deno.test('cleanName joins runs of spaces as TDLib does', () => {
  const cleaned = cleanName('  Team \n  Chat  news\n', 128);
  if (cleaned !== 'Team Chat news') {
    throw new Error(`Expected the spaces to be joined, received ${JSON.stringify(cleaned)}`);
  }
});
