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

Bots can add a message effect with `message_effect_id` to `sendMessage`, `sendPhoto`,
`sendDocument`, `forwardMessage` and `copyMessage`. The message then reports it as `effect_id`,
including in account history. `0` means no effect. As in TDLib's
[`MessageSendOptions::get_message_send_options`][effect-rules], effects are refused in supergroups,
and `forwardMessages` or `copyMessages` accept one only when a single message is found. Telegram's
servers decide which effect identifiers exist; that check is not in the open-source code, and the
emulator accepts any 64-bit identifier. The [official send path][message-effects] shows how the
option is read.

Bots can also reply to a message of another of their chats by naming its `chat_id` in
`reply_parameters`. As the official server's [`check_reply_parameters`][check-reply] does, the bot
must be able to read that chat, and a missing message fails the send unless
`allow_sending_without_reply` is set. The reply shows the message in `external_reply` as TDLib's
[`RepliedMessageInfo`][replied-message-info] keeps it. It includes the original sender and date, and
the chat and message ID when the message is in a supergroup. It also carries a photo or document
without its caption. The text or caption becomes an automatic `quote` of up to 1,024 characters.
That quote keeps only the entity types TDLib's [`is_allowed_quote_entity_type`][quote-entities]
allows. As TDLib's [`create_message_input_reply_to`][external-reply-input] does, the emulator sends
a reply to protected content or a service message of another chat without a reply. The emulator
resolves the replied message before the destination chat and text. When a request fails both ways,
it fails for the reply.

Bots can quote part of the replied message with `quote`, `quote_parse_mode` or `quote_entities`, and
`quote_position`, which the reply shows as a `quote` with `is_manual`. As TDLib's
[`MessageQuote`][message-quote] does, the quote is normalized like message text. A quote that cannot
be normalized, or is empty, is ignored, and trimmed leading spaces shift its position. Telegram's
servers then look the quote up in the replied text; that check is not in the open-source code. The
emulator follows the documented contract. The quote must be an exact part of the replied text,
including its bold, italic, underline, strikethrough, spoiler, custom emoji and date and time
entities, and at most 1,024 characters long. Otherwise the send fails with
`Bad Request: QUOTE_TEXT_INVALID`. Among several occurrences, the one nearest to `quote_position` is
chosen, searching in the order of TDLib's `MessageQuote::search_quote`. A chosen quote replaces the
automatic quote of a reply to another chat.

Replies to checklist tasks or poll options are [real gaps](#real-gaps). Text and captions follow the
[formatting limits](text-formatting.md); link-preview metadata is
[intentionally absent](text-formatting.md#intentional-deviations).

Bots show chat actions, such as typing, with `sendChatAction`. Tests read the actions an account's
client shows through `account.getChatActions` for a private chat or a supergroup. As TDLib's
[`DialogActionManager`][dialog-actions] shows them, an action lasts 5.5 seconds unless the bot sends
it again. It ends when the bot sends `cancel` or a message to the chat, and a supergroup lists each
bot's latest action.

Private message IDs come from each observer's message box; a supergroup has one sequence shared by
all members. Private conversation history in the emulation API uses the **bot's** message IDs, so a
test can pass them to Bot API calls. History contains the currently stored messages, without
pagination or deleted entries; it is a test inspection API, not a Telegram history endpoint.

## Notifications

Tests read the notifications an account's client shows through `account.getNotifications` for a
private chat or a supergroup. Every message another participant sent to the chat notifies, in order,
and the account's own messages do not. `disable_notification` on `sendMessage`, `sendPhoto`,
`sendDocument`, `forwardMessage(s)` and `copyMessage(s)` makes the notification silent. The official
server passes the option to TDLib's send options. As TDLib's
[`Message::disable_notification`][silent-message] carries it to the recipient, the notification
reports it as `is_silent`, as TDLib's [`notification`][notification-object] object does. Bot API
messages do not show it.

Accounts have no notification settings, so no chat is muted, and reading a message keeps its
notification; a deleted message has none.

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

`forwardMessages` and `copyMessages` repeat up to 100 messages of one chat, whose IDs must be in
strictly increasing order, and return the new `message_id`s. As in TDLib's
[`forward_messages_impl`][forward-messages], missing messages and messages that cannot be forwarded
or copied are skipped, and the request fails only when none is left. A message that replies to an
earlier message of the same request replies to that message's new counterpart. Batch copies keep no
reply markup, and `remove_caption` drops media captions.

An account created with `has_private_forwards` keeps forwards from linking to it, as Telegram's
"Forwarded messages" privacy setting does. As TDLib's
[`MessageOrigin::hide_sender_if_needed`][hide-sender] does, forwards of its messages show a
`hidden_user` origin with only its name, and the legacy `forward_sender_name` replaces
`forward_from`. This applies to forwards by bots and accounts, to forwards of those forwards, as
TDLib's [`copy_message_forward_info`][copy-forward-info] hides them again, and to replies from other
chats. Telegram's servers supply the shown name; the emulator uses the account's first and last
name, joined as TDLib's `get_user_title` joins them. The official server serializes the origin in
[`JsonMessageOrigin`][json-origin].

Other origins are users. Channel and chat origins, video start timestamps and media albums are
[real gaps](#real-gaps).

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

- **Checklist and poll reply targets.** Replies cannot target an individual checklist task or poll
  option. These targets are read by the upstream reply parser,
  [`Client::get_reply_parameters`][reply-parameters], and are missing from the emulator.
- **Replacing media.** `editMessageMedia` is not implemented, preventing tests from exercising bots
  that replace message media.
- **Account-side deletion.** The account emulation API has no message deletion operation. Tests
  cannot simulate an account deleting its messages; only Bot API deletion is available.
- **Channel and chat origins.** Forward origins are users or hidden users. Tests cannot exercise
  channel or chat origins, which TDLib's [forward origin model][forward-origin] supports; they need
  the missing channels and anonymous administrators.
- **Video start timestamps.** Forwarding and copying cannot specify a video start timestamp. This
  option is missing along with video message support.
- **Additional content and albums.** Media albums and the other message kinds listed in the
  [feature inventory](README.md#unimplemented-areas) are not implemented.

## Local evidence

[Bot API service](../../src/services/bot_api.ts),
[private messaging](../../src/services/private_messaging.ts),
[message projection](../../src/projections/bot_api_message.ts),
[forward rules](../../src/types/message_forward.ts),
[reply rules](../../src/types/message_reply.ts), [chat actions](../../src/services/chat_action.ts),
[private messaging tests](../../tests/private_messaging_service_test.ts),
[forward tests](../../tests/message_forward_test.ts),
[reply tests](../../tests/message_reply_test.ts) and
[chat action tests](../../tests/chat_action_service_test.ts).

[check-reply]: https://github.com/tdlib/telegram-bot-api/blob/e3e9dd8e5b3d7ab8537cd5a10dc31d5ffa8f82d1/telegram-bot-api/Client.cpp#L9144-L9207
[message-quote]: https://github.com/tdlib/td/blob/bc9c263e2bfee06aaab41e82db51a103376030bc/td/telegram/MessageQuote.cpp#L54-L71
[dialog-actions]: https://github.com/tdlib/td/blob/bc9c263e2bfee06aaab41e82db51a103376030bc/td/telegram/DialogActionManager.cpp#L240-L334
[external-reply-input]: https://github.com/tdlib/td/blob/bc9c263e2bfee06aaab41e82db51a103376030bc/td/telegram/MessagesManager.cpp#L21264-L21291
[quote-entities]: https://github.com/tdlib/td/blob/bc9c263e2bfee06aaab41e82db51a103376030bc/td/telegram/MessageEntity.cpp#L4840-L4853
[replied-message-info]: https://github.com/tdlib/td/blob/bc9c263e2bfee06aaab41e82db51a103376030bc/td/telegram/RepliedMessageInfo.cpp#L142-L200
[reply-parameters]: https://github.com/tdlib/telegram-bot-api/blob/e3e9dd8e5b3d7ab8537cd5a10dc31d5ffa8f82d1/telegram-bot-api/Client.cpp#L10130-L10180
[edit-permissions]: https://github.com/tdlib/td/blob/bc9c263e2bfee06aaab41e82db51a103376030bc/td/telegram/MessagesManager.cpp#L23183-L23292
[delete-permissions]: https://github.com/tdlib/td/blob/bc9c263e2bfee06aaab41e82db51a103376030bc/td/telegram/MessagesManager.cpp#L8405-L8520
[forward-permissions]: https://github.com/tdlib/td/blob/bc9c263e2bfee06aaab41e82db51a103376030bc/td/telegram/MessagesManager.cpp#L8270-L8330
[forward-markup]: https://github.com/tdlib/td/blob/bc9c263e2bfee06aaab41e82db51a103376030bc/td/telegram/ReplyMarkup.cpp
[silent-message]: https://github.com/tdlib/td/blob/bc9c263e2bfee06aaab41e82db51a103376030bc/td/telegram/MessagesManager.cpp#L11842
[notification-object]: https://github.com/tdlib/td/blob/bc9c263e2bfee06aaab41e82db51a103376030bc/td/generate/scheme/td_api.tl#L8864-L8868
[forward-origin]: https://github.com/tdlib/td/blob/bc9c263e2bfee06aaab41e82db51a103376030bc/td/telegram/MessageForwardInfo.cpp
[hide-sender]: https://github.com/tdlib/td/blob/bc9c263e2bfee06aaab41e82db51a103376030bc/td/telegram/MessageOrigin.cpp#L123-L131
[copy-forward-info]: https://github.com/tdlib/td/blob/bc9c263e2bfee06aaab41e82db51a103376030bc/td/telegram/MessageForwardInfo.cpp#L182-L192
[json-origin]: https://github.com/tdlib/telegram-bot-api/blob/e3e9dd8e5b3d7ab8537cd5a10dc31d5ffa8f82d1/telegram-bot-api/Client.cpp#L2140-L2185
[forward-messages]: https://github.com/tdlib/td/blob/bc9c263e2bfee06aaab41e82db51a103376030bc/td/telegram/MessagesManager.cpp#L24816-L24965
[forward-buttons]: https://github.com/tdlib/td/blob/bc9c263e2bfee06aaab41e82db51a103376030bc/td/telegram/InlineKeyboardButton.cpp#L42-L81
[effect-rules]: https://github.com/tdlib/td/blob/bc9c263e2bfee06aaab41e82db51a103376030bc/td/telegram/MessageSendOptions.cpp#L161-L170
[message-effects]: https://github.com/tdlib/telegram-bot-api/blob/e3e9dd8e5b3d7ab8537cd5a10dc31d5ffa8f82d1/telegram-bot-api/Client.cpp#L17343-L17375
