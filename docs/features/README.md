# Feature coverage and compatibility

[Project README](../../README.md) · [TypeScript client walkthrough](../typescript-client.md)

These pages describe the standalone HTTP server. A supported method implements the behavior and
parameters described on its feature page; it does not imply support for every Telegram option.
Internal types for additional chat kinds do not make those kinds available through HTTP.

## Intentional deviations and real gaps

**Intentional deviations** are differences retained for the emulator's testing purpose. Their
documented reasons explain which behavior tests should expect instead of Telegram's behavior.

**Real gaps** are missing or incorrect behavior the emulator should support. Listing a gap does not
make the behavior available or establish an implementation schedule.

An area can contain both. For example, tests should configure rate-limit errors instead of
reproducing Telegram's production traffic thresholds, but that configuration is
[not yet implemented](sessions-and-requests.md#real-gaps).

## Feature guide

| Feature                                               | Coverage                                                                   |
| ----------------------------------------------------- | -------------------------------------------------------------------------- |
| [Sessions and requests](sessions-and-requests.md)     | Test isolation, virtual identities, request formats, validation and errors |
| [Updates and polling](updates.md)                     | Generated update types, subscriptions, offsets, long polling and retention |
| [Webhooks](webhooks.md)                               | Delivery, replies, retry behavior and connection limitations               |
| [Messages](messages.md)                               | Sending, replies, edits, deletion, blocking, forwarding and copying        |
| [Text formatting](text-formatting.md)                 | Parse modes, entities, normalization and limits                            |
| [Keyboards and callbacks](keyboards-and-callbacks.md) | Inline buttons, reply interfaces and callback answers                      |
| [Media and files](media-and-files.md)                 | Photos, documents, uploads, file identifiers and downloads                 |
| [Inline mode](inline-mode.md)                         | Queries, results, feedback and inline message editing                      |
| [Supergroups](supergroups.md)                         | Privacy mode, membership, service messages and administration              |
| [Command menus](command-menus.md)                     | Command storage, scopes, languages and menu resolution                     |

## Implemented Bot API methods

This is the complete inventory from the
[HTTP method registry](../../src/api/sessions/bot_api/mod.ts). Method names are case-insensitive.
The two legacy aliases below are also accepted.

| Area             | Methods                                                                                                         |
| ---------------- | --------------------------------------------------------------------------------------------------------------- |
| Identity         | `getMe`                                                                                                         |
| Updates          | `getUpdates`, `setWebhook`, `deleteWebhook`, `getWebhookInfo`                                                   |
| Sending          | `sendMessage`, `sendPhoto`, `sendDocument`, `sendChatAction`                                                    |
| Reusing messages | `forwardMessage`, `forwardMessages`, `copyMessage`, `copyMessages`                                              |
| Editing          | `editMessageText`, `editMessageCaption`, `editMessageReplyMarkup`                                               |
| Deletion         | `deleteMessage`, `deleteMessages`                                                                               |
| Files            | `getFile`, plus HTTP file downloads                                                                             |
| Interaction      | `answerCallbackQuery`, `answerInlineQuery`                                                                      |
| Commands         | `setMyCommands`, `getMyCommands`, `deleteMyCommands`                                                            |
| Membership       | `leaveChat`, `getChatMember`, `getChatAdministrators`, `getChatMemberCount`, `banChatMember`, `unbanChatMember` |
| Legacy aliases   | `getChatMembersCount` → `getChatMemberCount`, `kickChatMember` → `banChatMember`                                |

Methods outside this inventory return `404` with a Bot API error body. For supported methods,
unknown parameters usually produce `400`, including parameters that the official method supports but
the emulator has not implemented.

## Unimplemented areas

### Real gaps

The official [method registry][upstream-methods] includes these broader areas absent from the
emulator. They are real gaps in the intended testing coverage. This list groups them; the inventory
above determines whether an individual method is available.

- Basic groups, channels, public chat usernames, forum topics, direct messages of channels, and chat
  migration. Supergroups are the only shared chat kind exposed by the HTTP server.
- Media other than photos and documents, albums, stickers and sticker sets, polls, dice, locations,
  venues, contacts, games, checklists, rich messages, ephemeral messages, drafts and stories.
- Reactions, pins, chat metadata and photos, `getChat`, invite links, join requests, member
  restrictions, and promotion through the Bot API. Tests can promote supergroup members through the
  emulation API.
- Payments, invoices, shipping, Telegram Stars, gifts, paid broadcasts and paid media.
- Business connections, managed bots, Mini Apps, login authorization, Passport and boosts.
- Most bot profile/settings methods, including descriptions, menu buttons and default administrator
  rights, plus `getUserProfilePhotos`.

### Intentional exclusions

`close` and `logOut` are intentionally unsupported:
[session teardown](sessions-and-requests.md#intentional-deviations) is sufficient for emulator
lifecycle control.

Other intentional choices include
[in-memory sessions and strict request validation](sessions-and-requests.md#intentional-deviations),
[retaining unconfirmed updates](updates.md#intentional-deviations), and omitting production rate
thresholds. The feature pages explain their testing rationale and distinguish them from missing
functionality such as [configurable rate-limit responses](sessions-and-requests.md#real-gaps).

## Comparison baseline and evidence

The implementation comparison was reviewed on **2026-09-25** against:

- Official C++ Bot API server at [`e3e9dd8e5b3d7ab8537cd5a10dc31d5ffa8f82d1`][bot-api-revision]
  (2026-08-25).
- TDLib at [`bc9c263e2bfee06aaab41e82db51a103376030bc`][tdlib-revision], the
  [submodule revision used by that Bot API server][tdlib-submodule].

Upstream implementation links on these pages use these immutable revisions and name the relevant
functions. Local implementation and test links point into this repository. Telegram's public API
reference and FAQ supplement the code where they describe server-side behavior.

This is a source comparison, not a claim of complete conformance or a live differential test against
Telegram. The open-source Bot API server delegates work to TDLib, which in turn calls Telegram's
remote servers. Their code can establish parsing, local checks and serialization, but does not
expose every remote validation rule, privacy decision or media transformation. Where that boundary
matters, the feature page identifies the limitation rather than treating a local check as proof of
parity.

Unless a page says otherwise, cloud restrictions refer to the official server without `--local`. The
official [local mode][local-mode] relaxes webhook and file restrictions. The emulator has its own
combination of constraints and is not an implementation of either deployment mode in full.

[upstream-methods]: https://github.com/tdlib/telegram-bot-api/blob/e3e9dd8e5b3d7ab8537cd5a10dc31d5ffa8f82d1/telegram-bot-api/Client.cpp#L200-L410
[bot-api-revision]: https://github.com/tdlib/telegram-bot-api/commit/e3e9dd8e5b3d7ab8537cd5a10dc31d5ffa8f82d1
[tdlib-revision]: https://github.com/tdlib/td/commit/bc9c263e2bfee06aaab41e82db51a103376030bc
[tdlib-submodule]: https://github.com/tdlib/telegram-bot-api/tree/e3e9dd8e5b3d7ab8537cd5a10dc31d5ffa8f82d1/td
[local-mode]: https://github.com/tdlib/telegram-bot-api/blob/e3e9dd8e5b3d7ab8537cd5a10dc31d5ffa8f82d1/README.md#usage
