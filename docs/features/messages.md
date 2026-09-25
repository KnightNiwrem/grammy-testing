# Messages

[Feature index and comparison baseline](README.md) · [Text formatting](text-formatting.md) ·
[Media](media-and-files.md) · [Supergroups](supergroups.md)

## Sending, replying and inspecting history

Accounts and bots exchange text, photos and documents in private chats and supergroups. A private
conversation must first be started by the account before the bot can send to it. `sendMessage`,
`sendPhoto` and `sendDocument` accept `protect_content` and supported
[reply markup](keyboards-and-callbacks.md). Bot messages appear in account history; bots receive no
updates for their own sends or edits.

Both sides can reply to a message in the same chat. Bots use `reply_parameters` or the legacy
`reply_to_message_id` and `allow_sending_without_reply` parameters. `reply_parameters` takes
precedence, and a missing/non-positive message ID means no reply. If a target is absent,
`allow_sending_without_reply` permits a normal send. Returned messages include `reply_to_message`
without recursively nesting the replied message's own reply.

The emulator supports only same-chat replies. Cross-chat replies, quotes and quote entities,
checklist tasks, and poll-option reply targets are absent, although upstream
[`Client::get_reply_parameters`][reply-parameters] reads them. Text and captions follow the
[formatting limits](text-formatting.md). Notification flags and link previews have
[no visible effects](sessions-and-requests.md#accepted-options-without-their-telegram-effects).

Private message IDs come from each observer's message box; a supergroup has one sequence shared by
all members. Private conversation history in the emulation API uses the **bot's** message IDs, so a
test can pass them to Bot API calls. History contains the currently stored messages, without
pagination or deleted entries; it is a test inspection API, not a Telegram history endpoint.

## Editing and deleting

Bots edit text, captions and inline keyboards with `editMessageText`, `editMessageCaption` and
`editMessageReplyMarkup`. Omitting the inline keyboard in an edit removes it. Unchanged content and
markup produce the message-not-modified error. Accounts can edit their own text or captions through
the emulation API, producing `edited_message` updates for eligible bots.

Forwarded messages and messages originally carrying a reply keyboard, keyboard removal or forced
reply cannot be edited. A bot can edit its own content or content sent through its inline mode;
administrator status does not grant general editing of other members' messages. These checks reflect
TDLib's [`MessagesManager::can_edit_message`][edit-permissions]. Inline edits are described under
[inline mode](inline-mode.md).

`deleteMessage` deletes one message and fails if it is missing. `deleteMessages` accepts 1–100 IDs
and skips missing messages. In private chats, the bot may delete either participant's messages. In
supergroups, it may delete its own content; `can_delete_messages` allows deleting other members'
messages and membership service messages.

**Age limits are absent.** The emulator checks ownership and rights without considering message age.
TDLib's [`can_delete_channel_message` and `can_revoke_message`][delete-permissions] impose a two-day
bot deletion limit in normal production operation. Account edits also lack TDLib's configurable edit
time limit; bot edits of their own outgoing messages are exempt upstream, so a blanket "all edits
expire after 48 hours" rule would be incorrect. The emulator has no scheduled messages or automatic
deletion timers.

`editMessageMedia` and account-side deletion operations are not exposed. Media edits are limited to
captions and inline keyboards.

## Blocking

An account can block or unblock a bot through the emulation API. Each actual transition produces a
`my_chat_member` update, subject to the bot's subscription. While blocked, the account cannot send
to that bot, and the bot's private sends and chat actions fail with
`403 Forbidden: bot was blocked
by the user`. Existing history remains inspectable. Blocking does
not remove shared supergroup membership.

## Forwarding and copying

`forwardMessage` forwards supported content between private chats and supergroups accessible to the
bot. It keeps the original sender/date in `forward_origin` and legacy `forward_from`/`forward_date`,
including when forwarding an existing forward. It preserves `via_bot` and keeps an inline keyboard
only if all buttons are URL buttons. Accounts can forward messages from their own chats too.

`copyMessage` returns only the new `message_id`. The copy has no forward origin and uses the
request's reply and markup. A supplied caption, including an empty one, replaces a photo/document
caption; without one the original caption is kept. `show_caption_above_media` applies to a copied
photo when a replacement caption is supplied.

Protected messages cannot be forwarded, but bots can copy them. Service messages can be neither
forwarded nor copied. The protected-content exception for bot copies is explicit in TDLib's
[`MessagesManager::can_forward_message`][forward-permissions]. Keyboard filtering for the supported
URL/callback button types follows [`dup_reply_markup`][forward-markup] and
[`InlineKeyboardButton::clone`][forward-buttons]. Upstream can also retain some button kinds that
the emulator cannot create, such as copy-text and login buttons.

Origins are always users: the emulator has no hidden-sender privacy setting, channel origins or chat
origins. TDLib's [forward origin model][forward-origin] covers those additional cases.
`forwardMessages`, `copyMessages`, media albums and video start timestamps are not implemented.

## Local evidence

[Bot API service](../../src/services/bot_api.ts),
[private messaging](../../src/services/private_messaging.ts),
[message projection](../../src/projections/bot_api_message.ts),
[forward rules](../../src/types/message_forward.ts),
[private messaging tests](../../tests/private_messaging_service_test.ts) and
[forward tests](../../tests/message_forward_test.ts).

[reply-parameters]: https://github.com/tdlib/telegram-bot-api/blob/e3e9dd8e5b3d7ab8537cd5a10dc31d5ffa8f82d1/telegram-bot-api/Client.cpp#L10130-L10180
[edit-permissions]: https://github.com/tdlib/td/blob/bc9c263e2bfee06aaab41e82db51a103376030bc/td/telegram/MessagesManager.cpp#L23183-L23292
[delete-permissions]: https://github.com/tdlib/td/blob/bc9c263e2bfee06aaab41e82db51a103376030bc/td/telegram/MessagesManager.cpp#L8405-L8520
[forward-permissions]: https://github.com/tdlib/td/blob/bc9c263e2bfee06aaab41e82db51a103376030bc/td/telegram/MessagesManager.cpp#L8270-L8330
[forward-markup]: https://github.com/tdlib/td/blob/bc9c263e2bfee06aaab41e82db51a103376030bc/td/telegram/ReplyMarkup.cpp
[forward-origin]: https://github.com/tdlib/td/blob/bc9c263e2bfee06aaab41e82db51a103376030bc/td/telegram/MessageForwardInfo.cpp
[forward-buttons]: https://github.com/tdlib/td/blob/bc9c263e2bfee06aaab41e82db51a103376030bc/td/telegram/InlineKeyboardButton.cpp#L42-L81
