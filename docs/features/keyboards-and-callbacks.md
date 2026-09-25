# Keyboards and callbacks

[Feature index and comparison baseline](README.md) · [Inline mode](inline-mode.md)

## Inline keyboards

Messages can carry inline keyboards with callback and URL buttons in private chats and supergroups.
Callback data must contain 1–64 UTF-8 bytes. URL buttons accept the links TDLib's
[`get_inline_keyboard_button`][td-inline-button] accepts: a `tg://user?id=` link opens the user's
profile, and any other link must pass [`LinkManager::check_link`][check-link], the same rule the
emulator applies to text links. The keyboard keeps and returns the normalized link, so `grammy.dev`
becomes `http://grammy.dev/`, and a refused link fails with TDLib's error, such as
`Bad Request: inline keyboard button URL 'grammy' is invalid: Wrong HTTP URL`. Telegram's servers
decide whether a profile link's user may be shown, which the emulator does not check. Bots replace
or remove a keyboard with `editMessageReplyMarkup`, or supply it when editing text/captions. An
empty `inline_keyboard` removes the keyboard.

An account presses a callback button using its message ID and `callback_data`. The emulator creates
a `callback_query` update for the bot responsible for that keyboard. The query includes the account,
data and `chat_instance`; ordinary message callbacks include a message, while inline callbacks use
`inline_message_id` instead. Tests inspect the answer after the bot calls `answerCallbackQuery`.
Answers store optional text, `show_alert`, `url` and `cache_time`; answer text is limited to 200
UTF-16 code units by the emulator's schema.

The [Bot API handler][answer-callback] and TDLib's [`answer_callback_query`][td-callback] pass `url`
to Telegram, whose servers decide which URLs to accept. The Bot API documents a game's URL for game
buttons and links like `t.me/<bot_username>?start=<parameter>`. The emulator has no game buttons. It
accepts only links that start the answering bot, recognizing the `t.me`, `telegram.me` and
`telegram.dog` forms that TDLib's [`LinkManager`][link-manager] parses, and
`tg://resolve?domain=<bot_username>&start=<parameter>`. Other URLs are rejected with
`Bad Request: URL_INVALID`, which may be stricter than Telegram. The link is recorded for tests to
inspect; the account's client does not follow it.

## Reply keyboards and forced replies

In private chats, bots can send a reply keyboard of text buttons, `remove_keyboard`, or
`force_reply`. Tests inspect the active reply interface and press a text button to send its text as
an account message. Keyboard flags and the input placeholder are exposed for inspection.

A new reply keyboard or forced reply replaces the current interface; removal clears it. Messages
without such markup leave it alone. Deleting its message clears the interface. Replacement and
removal follow the corresponding private-chat logic in TDLib's
[`MessagesManager` reply markup handling][reply-state].

`selective` has no effect in private chats. Messages sent with any non-inline reply markup remain
uneditable, even after the interface clears. A forced reply stays shown after the account replies;
its dismissal is an [intentional deviation](#intentional-deviations).

### In supergroups

Bots also send reply keyboards, removals and forced replies to supergroups, which the official
server's [`Client::get_reply_markup`][reply-markup] reads as for private chats. Each account member
inspects and presses what its own client shows. As TDLib's [`get_reply_markup`][received-markup]
decides for received markup, markup applies to every member unless it is `selective`. Selective
markup applies only to the members the message mentions, by `@username` or a text mention, and to
the sender of the message of the chat that it replies to. Telegram's servers decide whom a message
mentions, which the open-source code does not show; the emulator matches mentions as it does for
[privacy mode](supergroups.md#privacy-mode).

Markup that applies to a member changes what its client shows as in a private chat, except that, as
TDLib's [`add_message_to_dialog`][dialog-markup] does, a removal removes only an interface that the
same bot set. An interface also disappears when its message is deleted, or when its bot leaves or is
removed from the supergroup, as TDLib does for that service message and in
[`on_dialog_bots_updated`][bots-updated].

Pressing a button sends its text as the account's message, replying to the keyboard's message as
Telegram Desktop's [`HistoryWidget::sendBotCommand`][desktop-bot-command] does outside private
chats. The bot that sent the keyboard therefore receives the press even in privacy mode. Reply
buttons that request contacts, locations or other data are [missing](#real-gaps); TDLib only allows
them in private chats.

## Button appearance

Inline and reply keyboard buttons accept `style` and `icon_custom_emoji_id`, as the official
server's [`get_button_style`][button-style] and [button parsing][button-parsing] read them. `style`
is `primary`, `danger` or `success` in any ASCII letter case; an empty style or `default` chooses
the client's default. An icon of `0` means none; Telegram also reads an icon given as a JSON number,
which cannot hold every 64-bit identifier exactly, so the emulator requires a string. Bots see the
appearance in returned inline keyboards, in the field order of
[`JsonInlineKeyboardButton`][button-json], and accounts see it on inline and reply keyboard buttons.
The default style and a missing icon are omitted. As TDLib's [button comparison][td-button-equality]
does, an edit that only changes a button's appearance still changes the keyboard. The emulator draws
no buttons, and it checks only the icon identifier's syntax, as it does for
[custom emoji entities](text-formatting.md#real-gaps).

## Intentional deviations

- **Inspectable keyboard data without a client UI.** Tests inspect keyboard data without reproducing
  Telegram's rendering or hidden/shown state. Pressing a `one_time_keyboard` button leaves the
  keyboard available through the inspection API. Persistent and resize flags are recorded without
  rendering a keyboard.
- **No client-side dismissal.** Telegram apps call TDLib's
  [`delete_dialog_reply_markup`][dismiss-reply] after the user answers a forced reply or uses a
  one-time keyboard. That call only changes what the client shows and sends nothing to Telegram, so
  no bot can observe it. The inspection API keeps showing a forced reply until a bot's markup
  replaces or removes it, or its message is deleted.
- **URL inspection without navigation.** URL buttons are stored but cannot be opened through the
  test client. Tests can inspect the target without opening it.
- **Rejecting ambiguous buttons.** Markup and buttons with multiple actions fail strict validation
  to expose ambiguous definitions in tests. Upstream's [parser][button-parsing] selects an action
  according to its field-reading order.
- **Explicit callback expiry.** Queries do not expire with elapsed time; tests control expiry
  explicitly. Set `expired: true` when pressing a button to create an already expired query and
  exercise the query-too-old error. Missing queries, queries belonging to another bot and already
  answered queries also fail.
- **No cached callback answers.** `cache_time` is recorded for inspection, and every press reaches
  the bot. The Bot API describes it as client-side caching. TDLib's
  [`GetBotCallbackAnswerQuery`][callback-answer] drops the server's `cache_time` when it builds
  `callbackQueryAnswer`, so TDLib-based clients never reuse an answer. The emulated accounts follow
  TDLib rather than apps that implement their own cache.
- **Current button presses only.** Callback presses require a currently stored matching button
  because the intended tests only need those presses. Stale or arbitrary callback data and callbacks
  with inaccessible message payloads are not modeled.

## Real gaps

- **Inline button types.** Login, Mini Apps, games, payments, inline switching, copy-text and
  disabled buttons are absent. Tests cannot exercise those button definitions or actions.
- **Reply keyboard request buttons.** Requests for contacts, locations, polls, users, chats and web
  apps are absent. Compare these missing types and fields with upstream's
  [keyboard button parsing][button-parsing].

## Comparison limits

The remote callback query lifetime and all re-answer rules cannot be established from TDLib's
forwarding code. The emulator's single-answer state machine should not be read as proof of exact
server behavior.

## Local evidence

[Markup schemas](../../src/api/sessions/bot_api/reply_markup_parameter.ts),
[callback service](../../src/services/callback_query.ts),
[start link parsing](../../src/text_entities/telegram_link.ts),
[reply interface handling](../../src/services/private_messaging.ts),
[callback tests](../../tests/callback_query_service_test.ts) and
[private message tests](../../tests/private_messaging_service_test.ts).

[received-markup]: https://github.com/tdlib/td/blob/bc9c263e2bfee06aaab41e82db51a103376030bc/td/telegram/ReplyMarkup.cpp#L104-L198
[dialog-markup]: https://github.com/tdlib/td/blob/bc9c263e2bfee06aaab41e82db51a103376030bc/td/telegram/MessagesManager.cpp#L31226-L31241
[bots-updated]: https://github.com/tdlib/td/blob/bc9c263e2bfee06aaab41e82db51a103376030bc/td/telegram/MessagesManager.cpp#L29539-L29546
[desktop-bot-command]: https://github.com/telegramdesktop/tdesktop/blob/64ca5475f24dde7331a388176d3fe60c0849b965/Telegram/SourceFiles/history/history_widget.cpp#L6437-L6458
[reply-state]: https://github.com/tdlib/td/blob/bc9c263e2bfee06aaab41e82db51a103376030bc/td/telegram/MessagesManager.cpp#L12453-L12515
[dismiss-reply]: https://github.com/tdlib/td/blob/bc9c263e2bfee06aaab41e82db51a103376030bc/td/telegram/MessagesManager.cpp#L16043-L16082
[reply-markup]: https://github.com/tdlib/telegram-bot-api/blob/e3e9dd8e5b3d7ab8537cd5a10dc31d5ffa8f82d1/telegram-bot-api/Client.cpp#L10504-L10630
[button-parsing]: https://github.com/tdlib/telegram-bot-api/blob/e3e9dd8e5b3d7ab8537cd5a10dc31d5ffa8f82d1/telegram-bot-api/Client.cpp#L10200-L10503
[td-inline-button]: https://github.com/tdlib/td/blob/bc9c263e2bfee06aaab41e82db51a103376030bc/td/telegram/InlineKeyboardButton.cpp#L226-L262
[check-link]: https://github.com/tdlib/td/blob/bc9c263e2bfee06aaab41e82db51a103376030bc/td/telegram/LinkManager.cpp#L1926-L1994
[button-style]: https://github.com/tdlib/telegram-bot-api/blob/e3e9dd8e5b3d7ab8537cd5a10dc31d5ffa8f82d1/telegram-bot-api/Client.cpp#L10226-L10246
[button-json]: https://github.com/tdlib/telegram-bot-api/blob/e3e9dd8e5b3d7ab8537cd5a10dc31d5ffa8f82d1/telegram-bot-api/Client.cpp#L4247-L4263
[td-button-equality]: https://github.com/tdlib/td/blob/bc9c263e2bfee06aaab41e82db51a103376030bc/td/telegram/InlineKeyboardButton.cpp#L84-L87
[answer-callback]: https://github.com/tdlib/telegram-bot-api/blob/e3e9dd8e5b3d7ab8537cd5a10dc31d5ffa8f82d1/telegram-bot-api/Client.cpp#L15544-L15565
[callback-answer]: https://github.com/tdlib/td/blob/bc9c263e2bfee06aaab41e82db51a103376030bc/td/telegram/CallbackQueriesManager.cpp#L77-L90
[td-callback]: https://github.com/tdlib/td/blob/bc9c263e2bfee06aaab41e82db51a103376030bc/td/telegram/CallbackQueriesManager.cpp#L145-L188
[link-manager]: https://github.com/tdlib/td/blob/bc9c263e2bfee06aaab41e82db51a103376030bc/td/telegram/LinkManager.cpp#L2055-L2084
