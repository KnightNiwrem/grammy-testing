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

| Scope                                        | Emulator support                                                                                  |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `default`                                    | Store/read/delete; participates in private menu fallback                                          |
| `all_private_chats`                          | Store/read/delete; participates in private menu fallback                                          |
| `all_group_chats`, `all_chat_administrators` | Store/read/delete; no group menu inspection or resolution                                         |
| `chat`                                       | Only private conversations already started with this bot                                          |
| `chat_administrators`, `chat_member`         | Parsed, but no supported target: rejected in private chats, and supergroup targets are unresolved |

Tests read a private chat's effective menu through `account.getBotCommands`. Resolution prefers the
chat scope, then all-private-chats, then default; within each scope, it prefers the account's
language and then the language-neutral list. The account's primary language subtag is used, such as
`en` from `en-US`. This implements the private-chat order in Telegram's
[command scope documentation][scope-order].

## Gaps and deviations

Supergroup chat scopes, administrator/member scopes with a usable target, username chat targets and
group menu resolution are absent. Upstream accepts and validates those scopes through
[`Client::get_bot_command_scope`][scope-parser] and [`BotCommandScope`][td-scope].

Commands do not define message routing or restrict what users can type. Automatic `bot_command`
entities are handled separately by [text formatting](text-formatting.md). Menu buttons, bot
descriptions and default administrator rights are not implemented. BotFather settings can only be
chosen from the supported options at bot creation.

## Local evidence

[Command service](../../src/services/bot_command.ts),
[scope/command parsing](../../src/api/sessions/bot_api/bot_command_parameters.ts),
[command repository](../../src/repositories/bot_command.ts) and
[command tests](../../tests/bot_command_service_test.ts).

[bot-command]: https://github.com/tdlib/td/blob/bc9c263e2bfee06aaab41e82db51a103376030bc/td/telegram/BotCommand.cpp
[scope-order]: https://core.telegram.org/bots/api#determining-list-of-commands
[scope-parser]: https://github.com/tdlib/telegram-bot-api/blob/e3e9dd8e5b3d7ab8537cd5a10dc31d5ffa8f82d1/telegram-bot-api/Client.cpp#L11301-L11367
[td-scope]: https://github.com/tdlib/td/blob/bc9c263e2bfee06aaab41e82db51a103376030bc/td/telegram/BotCommandScope.cpp
