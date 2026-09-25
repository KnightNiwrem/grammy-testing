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

## Gaps and deviations

- URL-backed photo/document results and all other result kinds are unsupported. Only text
  `input_message_content` works; locations, venues, contacts, invoices and other content types do
  not. Compare the result dispatch in
  [`InlineQueriesManager::get_input_bot_inline_result`][results].
- User locations, inline use in channels/basic groups and private chats between two accounts are not
  modeled.
- Queries never expire with time. Unknown, wrong-bot and already answered query IDs fail, but
  waiting does not make an unanswered query invalid. TDLib passes query answers to Telegram's remote
  server in [`answer_inline_query`][answer]; the exact remote expiry and repeated-answer rules were
  not verified through live calls.
- `cache_time` and `is_personal` are stored but no cache is consulted. Every emulated query reaches
  the bot if subscribed. TDLib actually caches results using `cache_expire_time` in
  [`send_inline_query`][cache] and records the server's cache duration on receipt.
- Inline feedback is an on/off switch with feedback for every choice when enabled. There is no
  BotFather feedback sampling percentage.
- The button above results can be recorded as a start-bot or web-app button, including legacy
  `switch_pm_text`/`switch_pm_parameter`. Tests cannot press it, launch an app, or follow its start
  flow. TDLib's [answer validation][answer] handles these button variants.
- Thumbnail metadata is accepted where supported by the result schema, but thumbnails are not
  downloaded or rendered. Optional photo dimensions are likewise validated without changing the
  stored photo.
- Inline message IDs are opaque emulator identifiers, not TDLib-compatible encodings. Prepared
  inline messages, result sharing and business/ephemeral message variants are absent.

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
