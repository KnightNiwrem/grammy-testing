import {
  findBankCardNumberEntities,
  findCashtagEntities,
  findDetectedEntities,
  findHashtagEntities,
  findMentionEntities,
  findTgUrlEntities,
  findUrlEntities,
  isEmailAddress,
} from '../src/text_entities/detected_entities.ts';
import type { TextEntity } from '../src/types/virtual_message.ts';
import {
  TDLIB_BANK_CARD_NUMBER_CASES,
  TDLIB_CASHTAG_CASES,
  TDLIB_EMAIL_ADDRESS_CASES,
  TDLIB_EMAIL_ADDRESS_PARTS,
  TDLIB_HASHTAG_CASES,
  TDLIB_MENTION_CASES,
  TDLIB_TG_URL_CASES,
  TDLIB_URL_CASES,
  type TdlibFindCase,
} from './fixtures/tdlib_detected_entity_cases.ts';

Deno.test('entity finders match the cases of TDLib', () => {
  const finders: readonly [
    string,
    (text: string) => TextEntity[],
    readonly TdlibFindCase[],
  ][] = [
    ['mentions', findMentionEntities, TDLIB_MENTION_CASES],
    ['hashtags', findHashtagEntities, TDLIB_HASHTAG_CASES],
    ['cashtags', findCashtagEntities, TDLIB_CASHTAG_CASES],
    ['bank card numbers', findBankCardNumberEntities, TDLIB_BANK_CARD_NUMBER_CASES],
    ['tg links', findTgUrlEntities, TDLIB_TG_URL_CASES],
  ];
  for (const [name, find, cases] of finders) {
    for (const [text, expected] of cases) {
      const found = spanTexts(text, find(text));
      if (JSON.stringify(found) !== JSON.stringify(expected)) {
        throw new Error(
          `Expected ${name} ${JSON.stringify(expected)} in ${JSON.stringify(text)}, found ${
            JSON.stringify(found)
          }`,
        );
      }
    }
  }
});

Deno.test('URL and email address finding matches the cases of TDLib', () => {
  for (const [text, expectedUrls, expectedEmailAddresses] of TDLIB_URL_CASES) {
    const entities = findUrlEntities(text);
    const found = [
      spanTexts(text, entities.filter((entity) => entity.type === 'url')),
      spanTexts(text, entities.filter((entity) => entity.type === 'email')),
    ];
    if (JSON.stringify(found) !== JSON.stringify([expectedUrls, expectedEmailAddresses])) {
      throw new Error(
        `Expected URLs and email addresses ${
          JSON.stringify([expectedUrls, expectedEmailAddresses])
        } in ${JSON.stringify(text)}, found ${JSON.stringify(found)}`,
      );
    }
  }

  const { badUserParts, goodUserParts, badDomains, goodDomains } = TDLIB_EMAIL_ADDRESS_PARTS;
  const combinedCases = [...badUserParts, ...goodUserParts].flatMap((userPart) =>
    [...badDomains, ...goodDomains].flatMap((domain) => [
      [
        `${userPart}@${domain}`,
        (goodUserParts as readonly string[]).includes(userPart) &&
        (goodDomains as readonly string[]).includes(domain),
      ] as const,
      [userPart + domain, false] as const,
    ])
  );
  for (const [text, expected] of [...TDLIB_EMAIL_ADDRESS_CASES, ...combinedCases]) {
    if (isEmailAddress(text) !== expected) {
      throw new Error(`Expected ${JSON.stringify(text)} to be an email address: ${expected}`);
    }
  }
});

Deno.test('detected entities are sorted, and only the first of overlapping entities is kept', () => {
  const text = '😀 /start@grammy_bot #news $TON see https://grammy.dev/#docs @grammy_team, ' +
    'mail ada@example.com, card 4242 4242 4242 4242';
  const found = findDetectedEntities(text).map((entity) => [
    entity.type,
    text.slice(entity.offset, entity.offset + entity.length),
  ]);
  const expected = [
    ['bot_command', '/start@grammy_bot'],
    ['hashtag', '#news'],
    ['cashtag', '$TON'],
    ['url', 'https://grammy.dev/#docs'],
    ['mention', '@grammy_team'],
    ['email', 'ada@example.com'],
    ['bank_card_number', '4242 4242 4242 4242'],
  ];
  if (JSON.stringify(found) !== JSON.stringify(expected)) {
    throw new Error(`Expected ${JSON.stringify(expected)}, found ${JSON.stringify(found)}`);
  }
});

function spanTexts(text: string, entities: readonly TextEntity[]): string[] {
  return entities.map((entity) => text.slice(entity.offset, entity.offset + entity.length));
}
