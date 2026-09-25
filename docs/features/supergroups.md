# Supergroups and administration

[Feature index and comparison baseline](README.md) · [Messages](messages.md) · [Updates](updates.md)

## Membership and messages

An account creates a supergroup and becomes its owner. The owner adds accounts and bots, removes
members, and promotes/demotes administrators through the emulation API. Members can leave; bots
leave through `leaveChat`. Removed members are banned until unbanned or added back by the owner.

Text, photos, documents, replies, inline keyboards, callbacks, forwarding and edits use the same Bot
API methods as private chats, with a negative supergroup chat ID. Message IDs belong to the
supergroup and are shared by all observers.

Additions and departures create membership service messages containing `new_chat_members` or
`left_chat_member` and legacy aliases. Bots receive these despite privacy mode, subject to their
`message` subscription. An affected bot also receives `my_chat_member` when subscribed. A removed
bot receives its removal service message and the `kicked` membership change; subsequent chat access
fails with `403 Forbidden: bot was kicked from the supergroup chat`. A bot that left instead gets
`403 Forbidden: bot is not a member of the supergroup chat`.

## Privacy mode

Administrator bots and bots created with `can_read_all_group_messages: true` receive all account
messages. Bots never receive ordinary messages from other bots, including themselves. Privacy mode
is enabled by default for other bots.

For an account message, the emulator first resolves an explicit recipient: replies to a bot's
message or to a message meant for it, then `via_bot`, then a leading command naming a bot. Such a
message goes only to that recipient among privacy-enabled bots. A reply to bot A's message that
commands bot B therefore goes to A. Without an explicit recipient, a mention or an unqualified
leading command can cause delivery.

Two limits matter when testing multiple bots:

- The emulator sends unqualified commands to every privacy-enabled bot. Telegram's
  [Bot FAQ][privacy-faq] limits them to the bot that last sent a message to the group.
- Mention matching may deliver a message to several bots. The FAQ describes at most one
  privacy-enabled recipient and gives replies highest priority, but does not specify every
  tie-break. Ranking `via_bot` before an addressed command is an emulator rule; source inspection of
  the public Bot API/TDLib clients does not prove the remote server uses that ordering.

Changing subscriptions does not change which bot a message is addressed to. This prevents an
unsubscribed recipient from redirecting a reply to another privacy-enabled bot.

## Administrator operations

Owners grant administrator rights by their Bot API names. Promotion and demotion update an affected
bot's `my_chat_member` status, and administrator status bypasses privacy mode. The implemented
rights with behavioral effects are:

| Right                  | Effect                                                        |
| ---------------------- | ------------------------------------------------------------- |
| `can_delete_messages`  | Delete other members' content and membership service messages |
| `can_restrict_members` | Call `banChatMember` and `unbanChatMember`                    |

`banChatMember` removes a current member and records a service message authored by the bot.
`unbanChatMember` lifts a ban; unless `only_if_banned` is true, it also removes a current member.
Checks include self-targeting, owner protection, required rights and administrator targets. The
ordering follows the relevant TDLib [participant status checks][participant-checks].

Removed members lose access to history; their prior messages remain visible to other members.
`revoke_messages` has no separate effect in the emulator's supergroups. TDLib's
[`ban_dialog_participant`][ban-member] passes that flag to its basic-group removal path, while its
supergroup path changes participant status. The public client code does not establish additional
remote history processing.

`getChatMember`, `getChatAdministrators` and `getChatMemberCount` expose stored membership.
`getChatAdministrators` excludes bot administrators by default and accepts `return_bots: true`, as
the pinned official [response callback][administrator-list] does. Administrator bots subscribed to
`chat_member` receive changes to other members, including additions, removals, promotions,
demotions, bans and unbans.

## Gaps and deviations

- **Bans never expire automatically.** `until_date` is normalized using the less-than-30-seconds /
  more-than-366-days permanent-ban rule, but remains in effect after its date passes. TDLib also
  normalizes the date and later clears elapsed restrictions in
  [`DialogParticipantStatus::update_restrictions`][ban-expiry].
- **The owner cannot leave.** TDLib's [creator status transitions][owner-leave] support an owner who
  is no longer a member; the emulator requires the owner to remain a member.
- Other stored rights have no corresponding enforcement. There is no `restrictChatMember`,
  `promoteChatMember` through the Bot API, default chat permissions, anonymous administration,
  custom administrator titles or delegated administrator hierarchy.
- No invite links, join requests, self-joining, public usernames, topics, slow mode, protected-chat
  setting, automatic message deletion or chat migration. Only membership service messages are
  produced; other Telegram service message kinds are absent.
- Reply keyboards/forced replies and supergroup command-menu resolution are unsupported. Basic
  groups and channels have internal representations but no usable HTTP messaging workflow.

The emulator's complete in-memory membership view also does not model Telegram's hidden member lists
or remote access/cache restrictions. Passing a membership query here does not establish all
production read permissions.

## Local evidence

[Administration service](../../src/services/shared_chat_administration.ts),
[privacy filtering](../../src/services/bot_update_delivery.ts),
[administration tests](../../tests/shared_chat_administration_service_test.ts),
[delivery tests](../../tests/bot_update_delivery_service_test.ts) and
[supergroup messaging tests](../../tests/supergroup_messaging_service_test.ts).

[privacy-faq]: https://core.telegram.org/bots/faq#what-messages-will-my-bot-get
[participant-checks]: https://github.com/tdlib/td/blob/bc9c263e2bfee06aaab41e82db51a103376030bc/td/telegram/DialogParticipantManager.cpp#L2820-L3065
[administrator-list]: https://github.com/tdlib/telegram-bot-api/blob/e3e9dd8e5b3d7ab8537cd5a10dc31d5ffa8f82d1/telegram-bot-api/Client.cpp#L7925-L7995
[ban-expiry]: https://github.com/tdlib/td/blob/bc9c263e2bfee06aaab41e82db51a103376030bc/td/telegram/DialogParticipant.cpp#L595-L715
[ban-member]: https://github.com/tdlib/td/blob/bc9c263e2bfee06aaab41e82db51a103376030bc/td/telegram/DialogParticipantManager.cpp#L2385-L2413
[owner-leave]: https://github.com/tdlib/td/blob/bc9c263e2bfee06aaab41e82db51a103376030bc/td/telegram/DialogParticipantManager.cpp#L2860-L2890
