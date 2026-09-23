# Chat emulation design

This document records the agreed model for private chats, basic groups, supergroups, and channels.
It describes the intended domain behavior and TypeScript client surface. Exact HTTP paths and wire
schemas can be derived from these contracts when the corresponding behavior is implemented.

## Evidence conventions

Claims supported by published Telegram behavior link directly to Telegram's official Bot API or
MTProto API documentation. Behavior absent from, or underspecified by, those references is marked as
an empirical observation and summarized in
[Observed Telegram behavior](#observed-telegram-behavior). The observations are useful compatibility
targets, but a single capture should not be interpreted as a guarantee from Telegram.

## System boundary

The emulation client controls the Telegram side of a test:

- It creates virtual accounts, bots, and shared chats.
- It performs actions as virtual accounts, including sending messages and managing chat members.
- It observes messages that bots send.
- It never performs an action as a bot.

Bots act only through the emulated Telegram Bot API. Telegram likewise exposes bot actions through
its HTTP Bot API rather than a user client; see
[Bots: An introduction for developers](https://core.telegram.org/bots). An outgoing Bot API call and
an incoming account action must pass through the same chat interaction service so that they share
validation, message history, and message identifiers.

All identities, chats, memberships, messages, and bot update queues belong to one emulation session
and are discarded with that session.

## Canonical state and Bot API projections

Telegram `Chat`, `Message`, `ChatMember`, and `Update` objects are projections for a particular bot;
they are not the canonical stored entities. The server stores chat state, memberships, messages, and
domain events, then projects eligible events into Bot API updates for each observing bot.

This distinction is necessary because:

- a private chat is addressed internally by both the account and bot even though its Bot API chat ID
  is the account ID;
- group privacy rules can make the same message visible to one bot and invisible to another;
- fields such as `ChatMemberAdministrator.can_be_edited` depend on the observing bot;
- compatibility fields can expose one canonical capability under more than one Bot API field name.

Each bot owns an independent update mailbox and increasing `update_id` sequence. Telegram documents
`update_id` sequencing and the mutually exclusive `getUpdates` and webhook delivery mechanisms in
the [Bot API update reference](https://core.telegram.org/bots/api#update) and
[`getUpdates`](https://core.telegram.org/bots/api#getupdates). Updates are delivered from the
emulator mailbox through the corresponding mechanisms.

## Chat identity and addressing

User and bot identifiers remain positive. Shared chats use negative Bot API dialog identifiers in
the Telegram ranges:

- basic groups use the basic-group range;
- supergroups and channels use the shared `-100...`-style range;
- the stored chat kind distinguishes a supergroup from a channel.

A private conversation uses `(accountId, botId)` as its internal key. Its Bot API `Chat.id`, as
observed by that bot, is `accountId`. Looking up a private conversation by `chatId` without the
authenticated bot would therefore be ambiguous in a session containing multiple bots.

Accounts, bots, supergroups, and channels share one case-insensitive public username namespace
within an emulation session. Basic groups do not have public usernames. The session identity
repository owns username reservation and resolution alongside the distinct numeric ID sequences, so
a username cannot be assigned to two different identity kinds. This follows Telegram's generic
[`contacts.resolveUsername`](https://core.telegram.org/method/contacts.resolveUsername) lookup and
its support for assigning usernames to
[`channels` and supergroups](https://core.telegram.org/method/channels.checkUsername).

See [Bot API dialog IDs](https://core.telegram.org/api/bots/ids) for Telegram's identifier ranges.

## Chat types

### Private chats

A private conversation is created implicitly by an account's first supported interaction with a bot.
There is no explicit `createPrivateChat` operation.

```ts
interface PrivateConversation {
  readonly kind: 'private';
  readonly accountId: number;
  readonly botId: number;
}
```

The initial interaction activates the conversation and can enqueue a `message` update for the bot.
Telegram documents that
[bots cannot start conversations with users](https://core.telegram.org/bots#how-are-bots-different-from-users):
a user must first message the bot or add it to a group. Once the conversation exists, bot-originated
messages must be sent through Bot API methods such as `sendMessage`.

### Basic groups

A basic group is explicitly created by an account and includes its initial invited users in the
creation operation. This corresponds to Telegram's
[`messages.createChat`](https://core.telegram.org/method/messages.createChat), which accepts a user
list.

```ts
interface CreateGroupInput {
  readonly title: string;
  readonly creatorAccountId: number;
  readonly initialMemberIds: readonly number[];
}
```

The creator becomes the owner. Every successfully invited identity becomes a member. A bot may be an
initial member.

Creating a basic group with a bot in `initialMemberIds` is observable by that bot. The observed
update order is:

1. `my_chat_member`, with the bot changing from `left` to `member`;
2. `message`, containing the service field `group_chat_created: true`.

Both updates use the creating account as the actor and share the creation timestamp. Initial group
creation does not additionally produce a `new_chat_members` service message. The projected basic
group `Chat` includes `all_members_are_administrators`, initially `false`.

This ordering and payload combination are empirical compatibility evidence from
[observation BG-1](#bg-1-basic-group-created-with-an-initial-bot). Telegram's Bot API separately
documents `my_chat_member` as the update for a bot's own membership change and `group_chat_created`
as a [`Message`](https://core.telegram.org/bots/api#message) service field.

### Supergroups

A supergroup is explicitly created by an account without an initial member list. This corresponds to
[`channels.createChannel`](https://core.telegram.org/method/channels.createChannel) with the
`megagroup` flag.

```ts
interface CreateSupergroupInput {
  readonly title: string;
  readonly description?: string;
  readonly creatorAccountId: number;
}
```

Only the creating account is present at creation, as owner. Consequently, creation itself produces
no bot updates. Accounts and bots are added later through a separate membership action. Bots may be
ordinary members or administrators of a supergroup.

### Channels

A channel is explicitly created by an account without an initial member list. This corresponds to
[`channels.createChannel`](https://core.telegram.org/method/channels.createChannel) with the
`broadcast` flag.

```ts
interface CreateChannelInput {
  readonly title: string;
  readonly description?: string;
  readonly creatorAccountId: number;
}
```

Only the creating account is present at creation, as owner. Consequently, creation itself produces
no bot updates. Human accounts can later become subscribers or administrators. A bot cannot be an
ordinary channel member; it can participate only as an administrator.

Appointing an absent bot as a channel administrator changes it directly from `left` to
`administrator`. The affected bot receives one `my_chat_member` update. The observed operation does
not produce a join service message, a `new_chat_members` message, or a channel-creation update.

The exact transition and absence of accompanying messages are empirical compatibility evidence from
[observation CH-1](#ch-1-absent-bot-appointed-as-channel-administrator).

Telegram exposes invitation and administrator changes separately through
[`channels.inviteToChannel`](https://core.telegram.org/method/channels.inviteToChannel) and
[`channels.editAdmin`](https://core.telegram.org/method/channels.editAdmin). The invitation method
explicitly rejects adding a bot as an ordinary channel member.

## Membership model

Shared chats store explicit membership state:

```ts
type ChatMembership =
  | {
    readonly status: 'owner';
    readonly identityId: number;
  }
  | {
    readonly status: 'administrator';
    readonly identityId: number;
    readonly rights: ChatAdministratorRights;
  }
  | {
    readonly status: 'member';
    readonly identityId: number;
  }
  | {
    readonly status: 'restricted';
    readonly identityId: number;
  }
  | {
    readonly status: 'left';
    readonly identityId: number;
  }
  | {
    readonly status: 'banned';
    readonly identityId: number;
  };
```

The statuses correspond to the Bot API's documented
[`ChatMember`](https://core.telegram.org/bots/api#chatmember) variants. The canonical model uses
`owner` while the Bot API projects that state as `ChatMemberOwner.status: "creator"`.

The chat kind constrains valid states and administrator rights:

- owners are accounts;
- basic-group and supergroup bots may be members or administrators;
- channel bots may be administrators, left, or banned, but never ordinary members;
- channel-only rights such as posting or editing channel messages are invalid in groups;
- group-only rights are invalid in channels.

Administrator rights are stored as canonical capabilities. The Bot API projector derives fields
whose values are contextual or implied. In particular, `can_be_edited` is observer-dependent,
`can_manage_chat` follows from administrator status, and the voice/video-chat compatibility fields
must not become independently mutable capabilities.

These projection rules follow the field semantics in
[`ChatMemberAdministrator`](https://core.telegram.org/bots/api#chatmemberadministrator). Observation
CH-1 additionally shows `can_be_edited: false` for the affected bot's own `my_chat_member` update
and includes both the current video-chat permission and its compatibility field.

## Membership operations

### Add a member

`addChatMember` represents a post-creation invitation. It applies to basic groups and supergroups,
and to human channel subscribers where Telegram permits the action. It rejects an attempt to add a
bot as an ordinary channel member.

```ts
interface AddChatMemberInput {
  readonly actorAccountId: number;
  readonly chatId: number;
  readonly memberId: number;
}
```

### Set an administrator

One `setChatAdministrator` operation covers appointment, promotion, and rights changes:

```ts
interface SetChatAdministratorInput {
  readonly actorAccountId: number;
  readonly chatId: number;
  readonly administratorId: number;
  readonly rights: ChatAdministratorRights;
}
```

Its transition depends on the target's current state and the chat kind:

- an existing basic-group or supergroup member is implicitly promoted;
- an existing administrator has their rights updated;
- an absent channel bot can transition directly from `left` to `administrator`;
- unsupported source states or rights are rejected at the boundary.

There is no separate `promoteChatMember` operation in the emulation client. Promotion remains a
meaningful domain transition, but it is one behavior of `setChatAdministrator`. The name also avoids
pretending that a channel bot was previously an ordinary member.

### Remove an administrator

`removeChatAdministrator` removes administrator status without encoding demotion as an empty rights
object:

```ts
interface RemoveChatAdministratorInput {
  readonly actorAccountId: number;
  readonly chatId: number;
  readonly administratorId: number;
}
```

The resulting membership is chat- and identity-dependent. A basic-group or supergroup administrator
normally becomes a member. A channel bot must leave the channel because it cannot remain as an
ordinary member. The exact channel-account result and emitted update shapes remain to be confirmed
against Telegram behavior.

## Messages and posts

Account-originated text initially uses two operations because a channel post has different
authorization and produces a different Bot API update type:

```ts
type AccountMessageTarget =
  | {
    readonly type: 'private';
    readonly botId: number;
  }
  | {
    readonly type: 'chat';
    readonly chatId: number;
  };

interface AccountSendMessageInput {
  readonly to: AccountMessageTarget;
  readonly text: string;
}

interface AccountPublishMessageInput {
  readonly channelId: number;
  readonly text: string;
}
```

These are account-bound client operations: `account.sendMessage(input)` and, when channel posts are
implemented, `account.publishMessage(input)`. The server-side command still identifies the acting
account explicitly from the account-scoped HTTP route, but callers do not pass a separate account ID
to an operation already bound to that account.

`sendMessage` creates a private, basic-group, or supergroup message. `publishMessage` validates that
the account can post in the channel and creates a channel post. Eligible bots receive `message` for
the former and `channel_post` for the latter, matching the distinct fields documented by the
[Bot API `Update`](https://core.telegram.org/bots/api#update) object.

The message store keeps canonical authorship, content, timestamp, reply relationships, and service
event data. A projector constructs the Bot API `Message` visible to each bot. Service messages, such
as basic-group creation, are stored messages and consume message identifiers. Membership changes
without service messages do not.

A canonical message is identified by an opaque, emulator-internal ID. That ID is never exposed as a
Telegram `message_id`, because Telegram numbers the same message differently depending on the chat
kind and observer:

- Every account and bot owns a common message box. A private-chat or basic-group message takes the
  next ID in the box of each participant it is delivered to, so its `message_id` can differ between
  observers. A private message is numbered in both the account's and the bot's box.
- Each supergroup and channel owns one sequence shared by all of its observers.

Projection resolves the observing bot's `message_id` from the stored assignment; it never derives
one from the canonical ID. Because a box spans all of its owner's chats, implementations must not
assume that every newly created chat starts at message ID `1`. Observation BG-1 is consistent with
this model: the first message of a newly created basic group reached the bot as
`message_id: 883182`.

Private-chat numbering is implemented. Basic-group and supergroup/channel numbering will follow the
rules above when those chats carry messages.

See Telegram's
[message ID sequence documentation](https://core.telegram.org/api/updates#message-id-sequences),
which also notes that private/basic-group message IDs can differ between observing accounts while
supergroup/channel message IDs are shared by their observers.

## Update generation

Chat commands first change canonical state, including message-box numbering, and then publish
ordered domain events (`ChatDomainEvent` in `src/types/chat_domain_event.ts`). Commands never build
Bot API objects for updates or append to mailboxes.

`BotUpdateDeliveryService` is the delivery layer. It determines which bots are eligible to observe
each event, projects it into observer-specific Bot API updates, and appends them to each bot's
mailbox. This keeps state transitions independent of polling and webhook delivery.

`BotApiService` is the only way the Bot API transport reaches session state. It authenticates bot
tokens and consumes mailboxes, so invariants spanning bot configuration and delivery mode, such as
[`getUpdates` and webhooks](https://core.telegram.org/bots/api#setwebhook) being mutually exclusive,
have a single owner. Repositories are private to session composition.

Only `MessageCreatedEvent` for private text messages exists today; its sole observer is the
conversation's bot. Further events, such as a chat-member status change, are added together with the
update projections that consume them.

Delivery must eventually account for:

- private messages being visible to their target bot;
- bot membership and administrator status;
- group privacy mode and `can_read_all_group_messages`;
- commands and replies directed to a privacy-mode bot;
- service messages visible regardless of group privacy mode;
- channel posts visible to participating administrator bots.

Telegram's [Privacy Mode documentation](https://core.telegram.org/bots/features#privacy-mode)
specifies which group messages privacy-mode bots receive and states that service messages, private
messages, and messages from channels in which the bot participates remain visible.

## Observing bot output

Tests need to observe messages written by bots through the Bot API without acting as those bots. The
client can expose a wait operation backed by the stored message history:

```ts
await session.waitForMessage({
  chat: {
    type: 'private',
    accountId: account.id,
    botId: bot.id,
  },
  afterMessageId: incoming.message_id,
  fromBotId: bot.id,
  timeoutMilliseconds: 1_000,
});
```

The cursor prevents an assertion from matching an older message. Because private-chat and
basic-group message IDs are observer-specific, the observer API must state whose message box its
cursor refers to.

## Behavior still requiring confirmation

The following behavior should be captured from Telegram before its exact update sequence is made a
contract:

- inviting a bot to an existing basic group or supergroup;
- promoting an existing group or supergroup bot and changing its administrator rights;
- removing administrator status from bots and accounts in each shared chat type;
- adding, removing, restricting, and banning ordinary members;
- update visibility for other administrator bots subscribed to `chat_member`;
- whether basic-group messages hidden from a privacy-mode bot consume an ID in that bot's message
  box.

These gaps do not change the settled chat shapes or valid membership transitions above.

## Observed Telegram behavior

These captures were supplied from live Telegram behavior on 2026-09-20. Identifying profile data is
omitted because it is irrelevant to the behavioral contract. The reproduction steps are included so
a future session can check whether Telegram behavior has changed.

### BG-1: Basic group created with an initial bot

Reproduction:

1. In an official Telegram client, create a basic group and select a bot as an initial participant.
2. Read the bot's pending Bot API updates.

The bot received two consecutive updates with the same chat, actor, and timestamp:

```json
{
  "update_id": 256758760,
  "my_chat_member": {
    "chat": {
      "id": -5485213659,
      "type": "group",
      "all_members_are_administrators": false
    },
    "date": 1789877713,
    "old_chat_member": {
      "user": { "is_bot": true },
      "status": "left"
    },
    "new_chat_member": {
      "user": { "is_bot": true },
      "status": "member"
    }
  }
}
```

```json
{
  "update_id": 256758761,
  "message": {
    "message_id": 883182,
    "chat": {
      "id": -5485213659,
      "type": "group",
      "all_members_are_administrators": false
    },
    "date": 1789877713,
    "group_chat_created": true
  }
}
```

No separate `new_chat_members` service message was present in the reported creation updates.

### CH-1: Absent bot appointed as channel administrator

Reproduction:

1. In an official Telegram client, create a channel; the creation UI does not include an initial
   participant list.
2. Add a bot through the channel administrator UI and grant administrator rights.
3. Read the bot's pending Bot API updates.

The bot received one membership update whose relevant fields were:

```json
{
  "update_id": 256758767,
  "my_chat_member": {
    "chat": {
      "id": -1002116349164,
      "type": "channel"
    },
    "date": 1789879330,
    "old_chat_member": {
      "user": { "is_bot": true },
      "status": "left"
    },
    "new_chat_member": {
      "user": { "is_bot": true },
      "status": "administrator",
      "can_be_edited": false,
      "can_manage_chat": true,
      "can_post_messages": true,
      "can_edit_messages": true,
      "can_delete_messages": true,
      "can_invite_users": true,
      "can_restrict_members": true,
      "can_promote_members": false,
      "can_manage_video_chats": true,
      "can_manage_direct_messages": true,
      "is_anonymous": false,
      "can_manage_voice_chats": true
    }
  }
}
```

No join service message or channel-creation update accompanied the reported membership update.

## Official reference index

| Design concern                                                | Telegram reference                                                                                                                                     |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Bot limitations and private-chat initiation                   | [Bots: An introduction for developers](https://core.telegram.org/bots#how-are-bots-different-from-users)                                               |
| Bot API chat types and projections                            | [`Chat`](https://core.telegram.org/bots/api#chat)                                                                                                      |
| Bot update types and membership-update semantics              | [`Update`](https://core.telegram.org/bots/api#update), [`ChatMemberUpdated`](https://core.telegram.org/bots/api#chatmemberupdated)                     |
| Membership statuses and administrator fields                  | [`ChatMember`](https://core.telegram.org/bots/api#chatmember), [`ChatMemberAdministrator`](https://core.telegram.org/bots/api#chatmemberadministrator) |
| Basic-group creation with an invited-user list                | [`messages.createChat`](https://core.telegram.org/method/messages.createChat)                                                                          |
| Supergroup and channel creation without a member list         | [`channels.createChannel`](https://core.telegram.org/method/channels.createChannel)                                                                    |
| Later supergroup/channel invitations; channel bot restriction | [`channels.inviteToChannel`](https://core.telegram.org/method/channels.inviteToChannel)                                                                |
| Administrator appointment and rights changes                  | [`channels.editAdmin`](https://core.telegram.org/method/channels.editAdmin)                                                                            |
| Basic group, supergroup, and channel distinctions             | [Channels, supergroups, gigagroups and basic groups](https://core.telegram.org/api/channel)                                                            |
| Bot API dialog ID ranges                                      | [Bot API dialog IDs](https://core.telegram.org/api/bots/ids)                                                                                           |
| Message boxes and message ID sequences                        | [Working with updates](https://core.telegram.org/api/updates#message-id-sequences)                                                                     |
| Group privacy and service-message visibility                  | [Privacy Mode](https://core.telegram.org/bots/features#privacy-mode)                                                                                   |
