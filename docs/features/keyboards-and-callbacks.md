# Keyboards and callbacks

[Feature index and comparison baseline](README.md) · [Inline mode](inline-mode.md)

## Inline keyboards

Messages can carry inline keyboards with callback and URL buttons in private chats and supergroups.
Callback data must contain 1–64 UTF-8 bytes. Bots replace or remove a keyboard with
`editMessageReplyMarkup`, or supply it when editing text/captions. An empty `inline_keyboard`
removes the keyboard.

An account presses a callback button using its message ID and `callback_data`. The emulator creates
a `callback_query` update for the bot responsible for that keyboard. The query includes the account,
data and `chat_instance`; ordinary message callbacks include a message, while inline callbacks use
`inline_message_id` instead. Tests inspect the answer after the bot calls `answerCallbackQuery`.
Answers store optional text, `show_alert` and `cache_time`; answer text is limited to 200 UTF-16
code units by the emulator's schema.

## Reply keyboards and forced replies

In private chats, bots can send a reply keyboard of text buttons, `remove_keyboard`, or
`force_reply`. Tests inspect the active reply interface and press a text button to send its text as
an account message. Keyboard flags and the input placeholder are exposed for inspection.

A new reply keyboard or forced reply replaces the current interface; removal clears it. Messages
without such markup leave it alone. Deleting its message clears the interface. Replacement and
removal follow the corresponding private-chat logic in TDLib's
[`MessagesManager` reply markup handling][reply-state].

The emulator does not model the client UI's hidden/shown state. In particular, pressing a
`one_time_keyboard` button leaves the keyboard available through the inspection API. Persistent and
resize flags are recorded without rendering a keyboard. `selective` has no effect in private chats.
Messages sent with any non-inline reply markup remain uneditable, even after the interface clears.
Sending a reply does not dismiss a forced reply, and there is no explicit dismissal operation. TDLib
exposes [`delete_dialog_reply_markup`][dismiss-reply] for that client action.

## Gaps and deviations

- Reply keyboards and forced replies in supergroups are rejected. Telegram's
  [`Client::get_reply_markup`][reply-markup] and TDLib support them in groups.
- Inline button types for login, Mini Apps, games, payments, inline switching, copying text and
  disabled buttons are absent, as are button styles/icons. Reply keyboard requests for contacts,
  locations, polls, users, chats and web apps are also absent. Compare upstream's
  [keyboard button parsing][button-parsing]. URL buttons are stored but cannot be opened through the
  test client.
- Ambiguous markup and buttons with multiple actions fail strict schema validation. Upstream's
  parser selects actions according to its field-reading order. URL validation uses JavaScript's
  `URL` parser rather than Telegram's full link rules, so acceptance is not identical.
- Callback queries do not expire with elapsed time. Set `expired: true` when pressing a button to
  create an already expired query and exercise the query-too-old error. Missing queries, queries
  belonging to another bot and already answered queries also fail.
- Callback `cache_time` is recorded but never avoids a subsequent callback update. `url` in an
  answer is unsupported. The official [Bot API handler][answer-callback] accepts both, and TDLib's
  [`answer_callback_query`][td-callback] passes them to Telegram. The remote query lifetime and all
  re-answer rules cannot be established from that forwarding code; the emulator's single-answer
  state machine should not be read as proof of exact server behavior.
- Callback presses require a currently stored matching button. Stale or arbitrary callback data and
  callbacks with inaccessible message payloads are not modeled.

## Local evidence

[Markup schemas](../../src/api/sessions/bot_api/reply_markup_parameter.ts),
[callback service](../../src/services/callback_query.ts),
[reply interface handling](../../src/services/private_messaging.ts),
[callback tests](../../tests/callback_query_service_test.ts) and
[private message tests](../../tests/private_messaging_service_test.ts).

[reply-state]: https://github.com/tdlib/td/blob/bc9c263e2bfee06aaab41e82db51a103376030bc/td/telegram/MessagesManager.cpp#L12453-L12515
[dismiss-reply]: https://github.com/tdlib/td/blob/bc9c263e2bfee06aaab41e82db51a103376030bc/td/telegram/MessagesManager.cpp#L16043-L16082
[reply-markup]: https://github.com/tdlib/telegram-bot-api/blob/e3e9dd8e5b3d7ab8537cd5a10dc31d5ffa8f82d1/telegram-bot-api/Client.cpp#L10504-L10630
[button-parsing]: https://github.com/tdlib/telegram-bot-api/blob/e3e9dd8e5b3d7ab8537cd5a10dc31d5ffa8f82d1/telegram-bot-api/Client.cpp#L10200-L10503
[answer-callback]: https://github.com/tdlib/telegram-bot-api/blob/e3e9dd8e5b3d7ab8537cd5a10dc31d5ffa8f82d1/telegram-bot-api/Client.cpp#L15544-L15565
[td-callback]: https://github.com/tdlib/td/blob/bc9c263e2bfee06aaab41e82db51a103376030bc/td/telegram/CallbackQueriesManager.cpp#L145-L188
