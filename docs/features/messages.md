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

Cross-chat replies, quotes and replies to checklist tasks or poll options are
[real gaps](#real-gaps). Text and captions follow the [formatting limits](text-formatting.md).
Observable notification behavior and simulated link-preview metadata are also
[missing](sessions-and-requests.md#real-gaps).

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

Message deletion does not consider message age, and account edits have no age limit. Scheduled
messages and automatic deletion timers are absent. These timing simplifications are
[intentional](#intentional-deviations).

Media edits are limited to captions and inline keyboards. Replacing media and deleting messages as
an account are [real gaps](#real-gaps).

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

Origins are always users. Other origin types, sender privacy, `forwardMessages` and `copyMessages`
are [real gaps](#real-gaps), as are video start timestamps and media albums.

## Intentional deviations

- **Account-to-bot private chats only.** Private chat tests only need conversations between an
  account and a bot. Private conversations between two accounts are intentionally unsupported,
  including [inline-result use](inline-mode.md#intentional-deviations) in those chats.
- **Account edits regardless of age.** Tests should be able to edit account messages regardless of
  their age, so the emulator does not apply TDLib's configurable account edit time limit. Upstream
  already exempts bots editing their own outgoing messages; a blanket "all edits expire after 48
  hours" rule would be incorrect. See [`MessagesManager::can_edit_message`][edit-permissions].
- **Deletion regardless of age.** Bot deletion checks ownership and rights without considering
  message age. TDLib's [`can_delete_channel_message` and `can_revoke_message`][delete-permissions]
  stop bots from deleting messages older than two days in production. Test sessions do not run that
  long, so the limit could not be exercised.
- **Immediate sends only.** The account emulation API does not expose scheduled messages. Tests only
  need immediately sent messages, so scheduling is outside the intended account simulation.
- **No automatic message deletion.** Message fixtures remain available until explicitly deleted or
  the session ends. Automatic deletion timers are intentionally absent to preserve those fixtures.

## Real gaps

- **Cross-chat replies.** Replies can only reference messages in the same chat. Tests cannot
  exercise replies to messages in another chat, although upstream
  [`Client::get_reply_parameters`][reply-parameters] accepts a separate chat target.
- **Reply quotes.** Replies cannot carry quoted text, quote entities or a quote position. These
  fields are needed to test quote handling and are read by the same upstream reply parser.
- **Checklist and poll reply targets.** Replies cannot target an individual checklist task or poll
  option. These targets are also supported by the upstream reply parser and are missing from the
  emulator.
- **Replacing media.** `editMessageMedia` is not implemented, preventing tests from exercising bots
  that replace message media.
- **Account-side deletion.** The account emulation API has no message deletion operation. Tests
  cannot simulate an account deleting its messages; only Bot API deletion is available.
- **Forward origins and sender privacy.** Forward origins are always visible users. Tests cannot
  exercise hidden-sender, channel or chat origins, which TDLib's
  [forward origin model][forward-origin] supports.
- **Batched forwarding and copying.** `forwardMessages` and `copyMessages` are not implemented. Only
  the corresponding single-message methods are available.
- **Video start timestamps.** Forwarding and copying cannot specify a video start timestamp. This
  option is missing along with video message support.
- **Message-effect metadata.** The emulator rejects `message_effect_id` and exposes no effect
  metadata. Tests need to submit and inspect it. The [official send path][message-effects] reads
  this option and passes it into the message send options.
- **Additional content and albums.** Media albums and the other message kinds listed in the
  [feature inventory](README.md#unimplemented-areas) are not implemented.

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
[message-effects]: https://github.com/tdlib/telegram-bot-api/blob/e3e9dd8e5b3d7ab8537cd5a10dc31d5ffa8f82d1/telegram-bot-api/Client.cpp#L17343-L17375
