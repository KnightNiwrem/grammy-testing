# Text formatting

[Feature index and comparison baseline](README.md) · [Messages](messages.md)

## Supported behavior

Bots format text and captions with `parse_mode` (`HTML`, `MarkdownV2`, legacy `Markdown`) or
explicit `entities`/`caption_entities`. Parse mode names are case-insensitive; `none` disables
markup parsing. A real parse mode takes precedence over supplied entities. Accounts can supply
entities through the emulation API.

The parser and normalizer implement the relevant TDLib rules: markup error descriptions, cleaning
control characters, trimming whitespace, shifting entity offsets, sorting entities, removing invalid
overlap and splitting/merging formatting. For example, an unescaped `.` in MarkdownV2 fails. Empty
message text fails; empty captions are allowed. Entity offsets and lengths use UTF-16 code units and
must not split a surrogate pair.

Supported explicit entities are `bold`, `italic`, `underline`, `strikethrough`, `spoiler`, `code`,
`pre` (with optional language), `blockquote`, `expandable_blockquote`, `text_link`, `text_mention`
and `custom_emoji`. `tg://user?id=…` text links become mentions of known session users. Bot commands
such as `/start` are detected automatically, allowing bot framework command handlers to match them.

Normalized message text is limited to 4,096 Unicode code points; captions to 1,024. Bot API
formatted input has an additional 32,768-byte UTF-8 limit before markup parsing, following
[`Client::get_formatted_text`][formatted-input].

## Intentional deviations

- **One set of account limits.** Premium account differences are not modeled. Tests use the same
  text and caption limits for every account.
- **No external link-preview fetching.** Tests should not depend on third-party websites, so the
  emulator does not fetch preview content. Simulated preview metadata remains a real gap.

## Real gaps

- **Automatic entity detection is partial.** The Bot API ignores explicitly supplied detected entity
  types such as `url`, `mention`, `hashtag`, `cashtag`, `email`, `phone_number`, `bank_card_number`
  and `bot_command`, then TDLib can rediscover entities from the text. The emulator likewise ignores
  them in Bot API input but redetects only bot commands. Sending an existing Telegram entity list
  therefore does not preserve automatically detected URLs or mentions. See
  [`Client::get_text_entity_type`][entity-input] and [`TDLib::find_entities`][entity-detection].
- **Date/time entities are unsupported.** Explicit `date_time` entities and markup that produces
  them are rejected. Upstream reads these entities in [the same entity parser][entity-input].
- **Simulated link-preview metadata.** Returned messages omit `link_preview_options`; tests need a
  simulated representation of that object. Upstream passes these options into message content via
  [`Client::get_input_message_text`][input-text].

- **Mention access and privacy.** A text mention may reference any known account or bot in the
  session. Simulated access and privacy restrictions are missing, so tests cannot exercise them.
  TDLib resolves mentioned users in [`get_message_entities`][message-entities]; the exact remote
  authorization rules are not established by that local parser.
- **Custom emoji availability and eligibility.** Emoji IDs are only checked for valid syntax. Tests
  need simulated emoji availability and bot eligibility checks. These checks must work within the
  isolated session; the local upstream parser does not establish remote emoji availability.

## Comparison limits

TDLib is not linked into the emulator. The
[markup fixtures](../../tests/fixtures/tdlib_markup_cases.ts) and normalization tests provide
regression coverage, not proof that every input has the same output upstream. Nested JSON fields
also follow the emulator's intentional
[stricter validation](sessions-and-requests.md#strict-request-validation).

## Local evidence

[Parse mode dispatch](../../src/text_entities/parse_mode.ts),
[normalization](../../src/text_entities/formatted_text.ts),
[Bot API entity input](../../src/api/sessions/bot_api/message_entities_parameter.ts),
[markup tests](../../tests/text_markup_test.ts) and
[normalization tests](../../tests/formatted_text_test.ts).

[formatted-input]: https://github.com/tdlib/telegram-bot-api/blob/e3e9dd8e5b3d7ab8537cd5a10dc31d5ffa8f82d1/telegram-bot-api/Client.cpp#L11955-L12000
[entity-input]: https://github.com/tdlib/telegram-bot-api/blob/e3e9dd8e5b3d7ab8537cd5a10dc31d5ffa8f82d1/telegram-bot-api/Client.cpp#L11872-L11952
[entity-detection]: https://github.com/tdlib/td/blob/bc9c263e2bfee06aaab41e82db51a103376030bc/td/telegram/MessageEntity.cpp#L1740-L1800
[input-text]: https://github.com/tdlib/telegram-bot-api/blob/e3e9dd8e5b3d7ab8537cd5a10dc31d5ffa8f82d1/telegram-bot-api/Client.cpp#L12000-L12080
[message-entities]: https://github.com/tdlib/td/blob/bc9c263e2bfee06aaab41e82db51a103376030bc/td/telegram/MessageEntity.cpp#L3650-L3800
