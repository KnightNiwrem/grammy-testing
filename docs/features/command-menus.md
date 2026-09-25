# Command menus

[Feature index and comparison baseline](README.md) · [Text command detection](text-formatting.md)

## Supported behavior

Bots store, read and delete command lists with `setMyCommands`, `getMyCommands` and
`deleteMyCommands`. A list is keyed by scope and language. `getMyCommands` returns exactly that
list, without applying the fallback used by a user's command menu. A missing/empty list in
`setMyCommands` deletes the entry.

Commands are cleaned and trimmed, with a leading slash removed, before validation. Names contain
1–32 lowercase Latin letters, digits or underscores; descriptions contain 1–256 Unicode code points.
A list holds at most 100 commands. `is_ephemeral` is stored and returned, but the emulator has no
ephemeral message workflow. Language codes are empty or two lowercase letters. These normalization
checks follow TDLib's [`BotCommand` implementation][bot-command].

| Scope                                        | Emulator support                                                                            |
| -------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `default`                                    | Store/read/delete; participates in private and group menu fallback                          |
| `all_private_chats`                          | Store/read/delete; participates in private menu fallback                                    |
| `all_group_chats`, `all_chat_administrators` | Store/read/delete; participate in group menu fallback                                       |
| `chat`                                       | Private conversations already started with this bot, and supergroups the bot is a member of |
| `chat_administrators`, `chat_member`         | Supergroups the bot is a member of; rejected in private chats with Telegram's scope error   |

A chat scope naming a supergroup the bot left or was removed from is rejected with Telegram's `403`
membership errors, as the official server's [chat access check][chat-access] does. A `chat_member`
scope accepts any positive user ID, as TDLib does for bots.

Tests read a private chat's effective menu through `account.getBotCommands`. Resolution prefers the
chat scope, then all-private-chats, then default; within each scope, it prefers the account's
language and then the language-neutral list. The account's primary language subtag is used, such as
`en` from `en-US`.

Tests read a supergroup member's effective menus through `account.getSupergroupBotCommands`, which
returns one list for each bot member that has commands, as TDLib's `BotCommands` lists do.
Resolution prefers the member scope, then the chat administrators scope, the chat scope, the
all-chat-administrators scope, all-group-chats and default. Administrator scopes apply only to the
owner and administrators. Both orders implement Telegram's
[command scope documentation][scope-order].

Commands do not define message routing or restrict what users can type. Automatic `bot_command`
entities are handled separately by [text formatting](text-formatting.md).

## Bot descriptions

Bots store and read their description, shown in an empty chat with the bot, with `setMyDescription`
and `getMyDescription`, and their short description, shown on the bot's profile, with
`setMyShortDescription` and `getMyShortDescription`. Each text is kept per language, and the
language code is empty or two lowercase letters, as TDLib's
[`validate_bot_language_code`][bot-language] requires. A text is cleaned of control characters as
TDLib's [`setBotInfoDescription` request][description-request] cleans it, but not trimmed; its UTF-8
check comes before the language check. An empty or missing text removes the text for that language.

The getters return exactly the text of the requested language, `""` if it has none, in the
[`{"description": …}` or `{"short_description": …}`][description-json] objects of the official
server. Whether Telegram's server falls back to the language-neutral text there is not visible in
the source, so tests should not rely on a fallback. Telegram's server also limits a description to
512 characters and a short description to 120; the emulator does not enforce these limits, because
the source does not show the server's error. Accounts do not see either text.

## Real gaps

Changing supported BotFather-style settings after bot creation is also a
[real gap](sessions-and-requests.md#real-gaps).

Menu buttons and default administrator rights are also real gaps; these methods are not implemented.

## Local evidence

[Command service](../../src/services/bot_command.ts),
[scope/command parsing](../../src/api/sessions/bot_api/bot_command_parameters.ts),
[command repository](../../src/repositories/bot_command.ts),
[command tests](../../tests/bot_command_service_test.ts),
[description service](../../src/services/bot_description.ts) and
[description tests](../../tests/bot_description_service_test.ts).

[bot-command]: https://github.com/tdlib/td/blob/bc9c263e2bfee06aaab41e82db51a103376030bc/td/telegram/BotCommand.cpp
[scope-order]: https://core.telegram.org/bots/api#determining-list-of-commands
[chat-access]: https://github.com/tdlib/telegram-bot-api/blob/e3e9dd8e5b3d7ab8537cd5a10dc31d5ffa8f82d1/telegram-bot-api/Client.cpp#L8796-L8866
[bot-language]: https://github.com/tdlib/td/blob/bc9c263e2bfee06aaab41e82db51a103376030bc/td/telegram/misc.cpp#L395-L404
[description-request]: https://github.com/tdlib/td/blob/bc9c263e2bfee06aaab41e82db51a103376030bc/td/telegram/Requests.cpp#L7042-L7065
[description-json]: https://github.com/tdlib/telegram-bot-api/blob/e3e9dd8e5b3d7ab8537cd5a10dc31d5ffa8f82d1/telegram-bot-api/Client.cpp#L5743-L5767
