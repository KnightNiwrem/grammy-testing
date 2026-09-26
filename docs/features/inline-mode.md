# Inline mode

[Feature index and comparison baseline](README.md) ·
[Keyboards and callbacks](keyboards-and-callbacks.md)

## Supported behavior

Create a bot with `supports_inline_queries: true`. An account can send it an inline query from a
private chat with a bot or from a supergroup. The bot receives `inline_query` with the account,
query, offset and appropriate `chat_type`, subject to its update subscription.

### User locations

A bot created with `requests_inline_location: true` stands in for BotFather's inline location
setting. An account can then share a `location` with its queries, which the bot receives in
`inline_query` and in the `chosen_inline_result` of a result sent from that query, as the official
server's [`JsonInlineQuery`][inline-query-json] and `JsonChosenInlineResult` show TDLib's user
location. As TDLib's `get_input_geo_point` sends it to Telegram, a horizontal accuracy is rounded up
to whole meters, and 0 means unknown. Telegram's apps share a location only with bots that request
it, so the emulator refuses a location for any other bot with `409`; coordinates outside ±90° and
±180° or an accuracy above 1500 meters are refused with `400`.

The bot answers with `answerInlineQuery`. Tests can inspect the answer and choose a result, sending
it to the original chat as the account's message with `via_bot`. The inline bot need not be a member
of the destination supergroup. Choices can be repeated while the account can still write there.
Eligible chat bots receive the resulting account message; privacy mode includes messages sent
through the observing bot.

Supported results are articles with text input content, and cached photos/documents identified by a
`file_id` the bot knows. Photo/document results may instead specify text input content. Supported
caption formatting and inline keyboards apply. Answers allow up to 50 results, unique nonempty
result IDs of at most 64 UTF-8 bytes and a `next_offset` of at most 64 UTF-8 bytes. The emulator
checks button options, result count and message content before query state and result metadata,
producing errors such as `RESULT_ID_DUPLICATE` and the query-too-old error.

With `receives_chosen_inline_results: true`, a choice also generates `chosen_inline_result` for the
inline bot. If the result has an inline keyboard, that update supplies `inline_message_id`. Callback
presses then reach the inline bot without a message payload. That bot can edit text, captions, media
and keyboards using the inline ID, with a result of `true`, even without access to the chat. If it
can access the chat, it can also edit via `chat_id`/`message_id`; another bot cannot edit the inline
message. TDLib makes the originating bot check in
[`MessagesManager::can_edit_message`][edit-inline].

### Answer caching

An answer is reused for `cache_time` seconds, 300 by default. A repeated query within that time is
created already answered, and the bot receives no `inline_query` update. TDLib's
[`send_inline_query`][cache] identifies a repeated query by bot, chat type, offset and text without
surrounding whitespace, and reuses the answer for the account that received it whatever
`is_personal` says; it records the expiry when the [answer arrives][cache-expiry]. An answer that is
not personal is also reused for other accounts, as the Bot API documents for Telegram's server
cache. The server's cache key is not in the open-source code, so the emulator uses TDLib's. Reused
answers expire with the original, and the bot cannot answer a query that received one. Bots that
need a fresh answer every time answer with `cache_time: 0`. For a bot that requests locations,
TDLib's key also includes a shared location's coordinates in whole ten-thousandths of a degree, so a
query from elsewhere, or without a location, reaches the bot.

## Intentional deviations

**Account-to-bot private chats only.** Private chat tests only need conversations between an account
and a bot. Private conversations between two accounts, including inline-result use there, are
intentionally outside the emulator's scope.

**No timed query expiry.** Test timing should not invalidate unanswered inline queries, so queries
never expire with elapsed time. Unknown, wrong-bot and already answered query IDs still fail.

**Deterministic chosen-result feedback.** Feedback is an on/off switch: every choice generates
feedback when enabled. BotFather sampling percentages are not modeled, so tests can rely on
deterministic feedback.

**Result-header button metadata only.** The button above results can be recorded as a start-bot or
web-app button, including legacy `switch_pm_text`/`switch_pm_parameter`. Inspecting that metadata is
sufficient for the intended tests; pressing the button, launching an app and following the start
flow are intentionally unsupported. TDLib's [answer validation][answer] handles these button
variants.

**Metadata without rendering or media processing.** Thumbnail metadata is accepted where supported
by the result schema, but thumbnails are not downloaded or rendered. Optional photo dimensions are
validated without changing the stored photo. Tests inspect the metadata without fetching thumbnails
or reproducing a client UI.

**Opaque inline message identifiers.** Inline message IDs are emulator handles, without
TDLib-compatible encoding. Tests should treat them as opaque values.

## Real gaps

- **Additional results and input content.** URL-backed photo/document results and all other result
  kinds are unsupported. Only text `input_message_content` works; locations, venues, contacts,
  invoices and other content types do not. Compare the result dispatch in
  [`InlineQueriesManager::get_input_bot_inline_result`][results].

- **Prepared messages and sharing.** Prepared inline messages and result-sharing flows are not
  implemented. Tests currently have to use the supported query-and-choice workflow.

- **Basic groups and channels.** Inline use in these chats is missing along with their
  [HTTP messaging workflows](supergroups.md#real-gaps).

- **Business and ephemeral messages.** These variants are absent, along with their broader
  [feature workflows](README.md#unimplemented-areas).

## Comparison limits

TDLib passes query answers to Telegram's remote server in [`answer_inline_query`][answer]. The exact
remote expiry and repeated-answer rules were not verified through live calls.

## Local evidence

[Inline query service](../../src/services/inline_query.ts),
[result parsing](../../src/api/sessions/bot_api/inline_query_answer_parameters.ts),
[message edit permissions](../../src/types/virtual_message.ts),
[inline tests](../../tests/inline_query_service_test.ts) and
[HTTP tests](../../tests/emulation_api_test.ts).

[edit-inline]: https://github.com/tdlib/td/blob/bc9c263e2bfee06aaab41e82db51a103376030bc/td/telegram/MessagesManager.cpp#L23183-L23292
[results]: https://github.com/tdlib/td/blob/bc9c263e2bfee06aaab41e82db51a103376030bc/td/telegram/InlineQueriesManager.cpp#L870-L1280
[answer]: https://github.com/tdlib/td/blob/bc9c263e2bfee06aaab41e82db51a103376030bc/td/telegram/InlineQueriesManager.cpp#L696-L760
[inline-query-json]: https://github.com/tdlib/telegram-bot-api/blob/e3e9dd8e5b3d7ab8537cd5a10dc31d5ffa8f82d1/telegram-bot-api/Client.cpp#L5439-L5535
[cache]: https://github.com/tdlib/td/blob/bc9c263e2bfee06aaab41e82db51a103376030bc/td/telegram/InlineQueriesManager.cpp#L1335-L1410
[cache-expiry]: https://github.com/tdlib/td/blob/bc9c263e2bfee06aaab41e82db51a103376030bc/td/telegram/InlineQueriesManager.cpp#L2280-L2320
