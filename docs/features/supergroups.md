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
leading command can cause delivery. A message mentions a bot through a text mention of it, or a
[detected](text-formatting.md#detected-entities) `mention` entity of its username, ignoring letter
case. As TDLib's [`match_mentions`][mention-matching] decides, an `@username` that runs into further
letters or digits of any script is no mention, nor is one inside code, a link or a URL.

As Telegram's [Bot FAQ][privacy-faq] describes, an unqualified command such as `/start` reaches only
the bot that last sent a message to the group. Only bots' own messages count: not an account's
message sent through an inline bot, nor a membership service message a bot causes. When that bot
already receives all messages, as an administrator or with privacy mode disabled, no privacy-enabled
bot receives the command. Before any bot has sent a message, every privacy-enabled bot receives it,
an [intentional routing rule](#intentional-deviations).

Multiple-recipient mention routing is a [real gap](#real-gaps). Ranking `via_bot` before an
addressed command is also an intentional routing rule.

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

The owner can also protect all of the supergroup's content, as Telegram's "Restrict saving content"
setting does, and lift that protection. As TDLib's
[`get_message_has_protected_content`][protected-content] decides, every message of the supergroup,
including earlier ones, is then protected while the setting lasts: bots see `has_protected_content`,
neither bots nor accounts can forward the messages, and a bot's reply to one from another chat is
sent without the reply, though bots may still copy them. As TDLib's
[`toggle_dialog_has_protected_content`][protection-toggle] requires, only the owner may change the
setting. The official server hides the service message for the change from bots, so they receive
none.

The owner also sets its own custom title or an administrator's through the emulation API, and an
empty title removes it. Bots see it as `custom_title` of the owner and administrators, in the field
order of the official server's [`JsonChatMember`][chat-member-json], and a bot whose title changes
receives `my_chat_member`. An administrator keeps its title when its rights change and loses it when
demoted. Titles hold at most 16 characters without emoji, as the Bot API documents; the emulator
refuses others. The official server's
[`process_set_chat_administrator_custom_title_query`][custom-title-method] lets a bot set only the
title of an administrator it may edit, which is one it promoted. Bots promote no one here, so
`setChatAdministratorCustomTitle` always fails with Telegram's error for the case, such as
`Bad Request: not enough rights to change custom title of the user`.

`getChatMember`, `getChatAdministrators` and `getChatMemberCount` expose stored membership.
`getChatAdministrators` excludes bot administrators by default and accepts `return_bots: true`, as
the pinned official [response callback][administrator-list] does. Administrator bots subscribed to
`chat_member` receive changes to other members, including additions, removals, promotions,
demotions, bans and unbans.

## Intentional deviations

**No automatic message deletion.** Message fixtures remain available until explicitly deleted or the
session ends, as described under [messages](messages.md#intentional-deviations).

**Documented routing precedence.** The emulator intentionally prioritizes `via_bot` over a command
addressed to another bot, giving tests a deterministic rule. Public Bot API/TDLib source inspection
does not establish Telegram's ordering, so this is a deliberate emulator contract rather than a
confirmed difference from Telegram.

**Unqualified commands before any bot writes.** Telegram's documentation names no recipient for an
unqualified command in a group where no bot has sent a message yet, and its servers decide it, not
the public Bot API or TDLib source. The emulator delivers such a command to every privacy-enabled
bot, so a test of a newly added bot receives `/start` without first making the bot speak.

**Explicit ban removal.** Membership changes remain under explicit test control. `until_date` is
normalized using the less-than-30-seconds / more-than-366-days permanent-ban rule, but a ban remains
in effect after its date passes. TDLib also normalizes the date and later clears elapsed
restrictions in [`DialogParticipantStatus::update_restrictions`][ban-expiry].

**An owner remains in the chat.** The owner cannot leave, retaining a member who can administer test
fixtures. TDLib's [creator status transitions][owner-leave] support an owner who is no longer a
member.

**No slow-mode pacing.** Slow mode is unsupported because tests should not wait for production
message pacing.

**Complete membership view.** Within the supported chat-access checks, membership queries use the
complete session state so tests have a complete membership view. Hidden member lists and Telegram's
remote access/cache restrictions are not modeled. A successful emulated query does not establish all
production read permissions.

## Real gaps

- **Single recipient for mentions.** Mention matching can deliver one message to several
  privacy-enabled bots. Telegram's [Bot FAQ][privacy-faq] describes at most one such recipient and
  gives replies highest priority. Tests need single-recipient routing; the FAQ does not specify
  every tie-break, so the exact selection among competing mentions requires further verification.

- **Administrator rights enforcement.** Rights other than `can_delete_messages` and
  `can_restrict_members` are stored without corresponding enforcement. Tests need their behavioral
  effects as the associated features are supported.

- **Member restrictions and default permissions.** `restrictChatMember` and default chat permissions
  are absent. Tests cannot apply partial restrictions to members.
- **Bot-driven promotion and demotion.** `promoteChatMember` is not implemented. Only the owner can
  change administrators through the emulation API.
- **Anonymous administrators.** Anonymous administration and its message attribution are absent.
- **Administrator delegation.** The emulator has no delegated administrator hierarchy for deciding
  who can edit another administrator's status.
- **Invitation and joining workflows.** Invite links, join requests and account self-joining are
  absent; additions require the owner.
- **Additional service messages.** Only membership service messages are produced. Other service
  events, such as title changes or pins, need corresponding messages as their features are
  supported.

- **Basic groups and channels.** Internal representations exist, but there is no usable HTTP
  messaging workflow for these chat kinds. See the
  [feature inventory](README.md#unimplemented-areas).

- **Topics.** Forum topics and channel direct-message topics are unsupported.
- **Chat migration.** Basic-group-to-supergroup migration and its API effects are unsupported.

## Local evidence

[Administration service](../../src/services/shared_chat_administration.ts),
[privacy filtering](../../src/services/bot_update_delivery.ts),
[administration tests](../../tests/shared_chat_administration_service_test.ts),
[delivery tests](../../tests/bot_update_delivery_service_test.ts) and
[supergroup messaging tests](../../tests/supergroup_messaging_service_test.ts).

[privacy-faq]: https://core.telegram.org/bots/faq#what-messages-will-my-bot-get
[mention-matching]: https://github.com/tdlib/td/blob/bc9c263e2bfee06aaab41e82db51a103376030bc/td/telegram/MessageEntity.cpp#L267-L310
[protected-content]: https://github.com/tdlib/td/blob/bc9c263e2bfee06aaab41e82db51a103376030bc/td/telegram/MessagesManager.cpp#L8145-L8148
[protection-toggle]: https://github.com/tdlib/td/blob/bc9c263e2bfee06aaab41e82db51a103376030bc/td/telegram/DialogManager.cpp#L2721-L2745
[chat-member-json]: https://github.com/tdlib/telegram-bot-api/blob/e3e9dd8e5b3d7ab8537cd5a10dc31d5ffa8f82d1/telegram-bot-api/Client.cpp#L5802-L5872
[custom-title-method]: https://github.com/tdlib/telegram-bot-api/blob/e3e9dd8e5b3d7ab8537cd5a10dc31d5ffa8f82d1/telegram-bot-api/Client.cpp#L16451-L16482
[participant-checks]: https://github.com/tdlib/td/blob/bc9c263e2bfee06aaab41e82db51a103376030bc/td/telegram/DialogParticipantManager.cpp#L2820-L3065
[administrator-list]: https://github.com/tdlib/telegram-bot-api/blob/e3e9dd8e5b3d7ab8537cd5a10dc31d5ffa8f82d1/telegram-bot-api/Client.cpp#L7925-L7995
[ban-expiry]: https://github.com/tdlib/td/blob/bc9c263e2bfee06aaab41e82db51a103376030bc/td/telegram/DialogParticipant.cpp#L595-L715
[ban-member]: https://github.com/tdlib/td/blob/bc9c263e2bfee06aaab41e82db51a103376030bc/td/telegram/DialogParticipantManager.cpp#L2385-L2413
[owner-leave]: https://github.com/tdlib/td/blob/bc9c263e2bfee06aaab41e82db51a103376030bc/td/telegram/DialogParticipantManager.cpp#L2860-L2890
