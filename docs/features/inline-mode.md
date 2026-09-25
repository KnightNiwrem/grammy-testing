# Inline mode

[Feature index and comparison baseline](README.md) ·
[Keyboards and callbacks](keyboards-and-callbacks.md)

## Supported behavior

Create a bot with `supports_inline_queries: true`. An account can send it an inline query from a
private chat with a bot or from a supergroup. The bot receives `inline_query` with the account,
query, offset and appropriate `chat_type`, subject to its update subscription.

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
presses then reach the inline bot without a message payload. That bot can edit text, captions and
keyboards using the inline ID, with a result of `true`, even without access to the chat. If it can
access the chat, it can also edit via `chat_id`/`message_id`; another bot cannot edit the inline
message. TDLib makes the originating bot check in
[`MessagesManager::can_edit_message`][edit-inline].

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

- **User locations.** Inline queries cannot carry a simulated user location, preventing tests of
  location-dependent inline behavior.
- **Result caching.** `cache_time` and `is_personal` are stored but no cache is consulted. Every
  emulated query reaches the bot if subscribed. Tests need simulated result caching that honors
  these options. TDLib caches results using `cache_expire_time` in [`send_inline_query`][cache] and
  records the server's cache duration on receipt.

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
[cache]: https://github.com/tdlib/td/blob/bc9c263e2bfee06aaab41e82db51a103376030bc/td/telegram/InlineQueriesManager.cpp#L1335-L1410
