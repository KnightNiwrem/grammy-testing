import { fixFormattedText } from '../src/text_entities/formatted_text.ts';
import { mentionsUser, type TextEntity } from '../src/types/virtual_message.ts';

const MENTIONED_USER = { id: 1, username: 'test_bot' };

/** Whether text with its supplied entities, stored as Telegram normalizes it, mentions the user. */
function mentionsTestBot(text: string, suppliedEntities: readonly TextEntity[] = []): boolean {
  const fixing = fixFormattedText(text, suppliedEntities, {
    isMentionableUser: (userId) => userId === MENTIONED_USER.id,
  });
  if (!fixing.fixed) {
    throw new Error(`Expected ${JSON.stringify(text)} to be valid, received ${fixing.error}`);
  }
  return mentionsUser({ kind: 'text', ...fixing.formattedText }, MENTIONED_USER);
}

Deno.test('mentionsUser matches usernames of mentions ignoring ASCII letter case', () => {
  for (const text of ['@test_bot', 'Hi @Test_Bot!', '(@TEST_BOT)', 'Hi @test_bot, @other_bot']) {
    if (!mentionsTestBot(text)) {
      throw new Error(`Expected ${JSON.stringify(text)} to mention @test_bot`);
    }
  }
});

Deno.test('mentionsUser ignores text that Telegram does not detect as a mention', () => {
  // As TDLib's `match_mentions` decides, a username must not run into further letters or digits of
  // any script, and consists of ASCII characters only, so no Unicode case folding applies.
  for (
    const text of [
      '@test_boté',
      '@test_bot中',
      '@test_bot٣',
      '@teſt_bot',
      '@test_bots',
      'mail@test_bot',
      'example.com/@test_bot',
    ]
  ) {
    if (mentionsTestBot(text)) {
      throw new Error(`Expected ${JSON.stringify(text)} not to mention @test_bot`);
    }
  }
});

Deno.test('mentionsUser ignores mentions in code and links but not in formatting', () => {
  const span = { offset: 3, length: 9 };
  const cases: [TextEntity, boolean][] = [
    [{ type: 'bold', ...span }, true],
    [{ type: 'code', ...span }, false],
    [{ type: 'text_link', ...span, url: 'https://example.com/' }, false],
  ];
  for (const [entity, expected] of cases) {
    if (mentionsTestBot('Hi @test_bot', [entity]) !== expected) {
      throw new Error(`Expected a mention in ${entity.type} to count: ${expected}`);
    }
  }
});

Deno.test('mentionsUser matches text mentions of users without usernames', () => {
  const textMention: TextEntity = { type: 'text_mention', offset: 0, length: 3, userId: 1 };
  const fixing = fixFormattedText('Ada', [textMention], { isMentionableUser: () => true });
  if (!fixing.fixed) {
    throw new Error(`Expected the text mention to be valid, received ${fixing.error}`);
  }
  const content = { kind: 'text', ...fixing.formattedText } as const;
  if (!mentionsUser(content, { id: 1 }) || mentionsUser(content, { id: 2, username: 'ada' })) {
    throw new Error('Expected the text mention to mention only its user');
  }
});
