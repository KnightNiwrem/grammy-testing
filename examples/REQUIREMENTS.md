# Requirements derived from the examples

Each requirement below is read off the example tests in this folder; the examples that force it are
cited. Together they are the constraints the simulated world must satisfy. Where a requirement
reverses a decision of the first implementation attempt (PR #1), that is stated explicitly with the
finding number from its review.

## R1. Two faces, one world

The emulator serves two protocols against one shared state: the wire-level Bot API for the bot under
test (reached through grammY's `apiRoot`), and an admin protocol for the test (sessions, actors,
observation, the call log). The admin surface is not an afterthought — examples 2, 4, and 6 assert
things (`answerCallbackQuery` payloads, member status, failed calls) that are invisible in message
history. Re-implementing Bot API methods alone cannot support these tests. _(All examples;
especially 6.)_

## R2. Private conversations are (user, bot) pairs, created by first contact

A private conversation is identified by its user–bot pair, and it comes into existence with the
user's **first message** to the bot: "the conversation exists" and "a history exists" are the same
fact. Telegram has no user-side "open a chat" event — a user who finds a bot sees an empty chat
screen with a Start button, and pressing it simply sends `/start`; the Bots FAQ states the rule as
"Bots can't initiate conversations with users. A user must either add them to a group or send them a
message first." The library therefore has no chat-opening action: `chatWith` is a pure, synchronous
address (made possible by R3), and sending to it is what creates the conversation. Consequences:

- There is no admin endpoint that creates a "private chat with a member list". A private chat with
  two humans, or with no bot, is unrepresentable — settling finding 5 by construction rather than by
  validation.
- One pair, one conversation: every `chatWith(bot)` handle addresses the same history. Two bots
  talking to the same user hold two unrelated conversations — settling finding 10.
- Conversation state is a per-pair permission progression: **no history yet** (bot sends fail with
  `403: bot can't initiate conversation with a user`) → **live** (the user has sent a message) →
  **blocked** (`403: bot was blocked by the user`, reversible, history retained). Blocking is a
  permission flip, not a membership change — and unlike opening a chat it is a real Telegram event:
  a private chat's `my_chat_member` update is documented to fire exactly when the user blocks or
  unblocks the bot, which is why block/unblock are actor actions while "open" is not. _(Example 3.)_

## R3. Private chat id equals user id

Telegram derives a private dialog's id from the peer's user id, and real bot code universally relies
on it (`bot.api.sendMessage(userId, ...)`). The emulator must honor the equality, because an
emulator that allocates independent ids fails bots that are correct against Telegram. This
**reverses** accepted risk 9 of the first attempt, which chose independent random ids. User and
group ids remain server-assigned within Telegram's documented ranges; tests never pick ids.
_(Example 3.)_

## R4. User actions synthesize updates; delivery is per-recipient

Every actor action (`sendText`, `tapInlineButton`, `joinGroup`, `addToGroup`) both mutates world
state and synthesizes the Telegram `Update` a real client action would produce. Updates are queued
per bot and served through `getUpdates` long polling with Telegram semantics:

- Updates produced while the bot is not polling are queued, not lost. _(Examples 1, 4 — actions can
  precede or follow `startBot`.)_
- Delivery is filtered per recipient at synthesis time: group privacy mode means a non-admin bot
  receives commands and service messages but not member chatter; an administrator receives
  everything. _(Example 4.)_
- Within one chat, updates are delivered in action order, and the stored history preserves send
  order. Across chats, no ordering is promised — matching Telegram. _(Example 5.)_

## R5. Race-free observation via anchors

Actions return the artifact they produced (`Message`, `PendingCallbackQuery`), and every wait takes
an anchor: `waitForMessage({ after })`, `waitForEdit({ of })`, `waitForMemberStatus({ status })`,
`answered()`. A wait must resolve correctly when the awaited event happened _before_ the wait was
issued — the server needs enough retained state (message ids per chat, edit snapshots, member
status, query answers) to decide "already happened" without the test sleeping or polling. Waits
reject on timeout with a clear diagnostic. _(All examples.)_

## R6. The session records every Bot API call

Each served call is appended to a queryable log: method, decoded payload, and outcome (`ok`, or
Telegram error code plus description). Failed calls are first-class data — a bot's error handling is
tested by asserting the 403 it received, not only by observing client-side exceptions. _(Example
6.)_

## R7. Groups are role-bearing and grow by events

A group is created with an owner; everyone else arrives through `joinGroup`/`addToGroup`, which
produce the corresponding service messages and membership updates. Promotion carries per-capability
rights mirroring `promoteChatMember`, and the Bot API side must enforce them (`banChatMember`
requires `can_restrict_members`). Member status is queryable and awaitable through the admin
surface. _(Example 4.)_

## R8. Sessions are hermetic and disposal is complete

Sessions share nothing: usernames are per-session namespaces and foreign ids fail as
`chat not
found`. `TestSession` is an `AsyncDisposable`; destroying it removes all entities **and
completes any long poll the server still holds for it** — settling finding 14, which left held polls
pending for up to the timeout after deletion. Neither disposing a running bot nor a session may hang
a test. _(Examples 1 and 6.)_

## R9. Telegram shapes and Telegram wording

Everything a test observes is a plain `grammy/types` object, and every emulated failure uses
Telegram's HTTP status, envelope, and description verbatim, because bots branch on those strings.
_(Examples 3 and 6.)_

## R10. grammY coupling stays at the edges

The emulator speaks the wire protocol; nothing server-side imports grammY. Test-side, only the
`startBot` helper (start polling, resolve when the first poll is armed, stop on disposal) takes a
grammY `Bot`. The rest of the client library is framework-agnostic. _(All examples.)_

## Open questions, deliberately not settled here

These did not surface as requirements in any example and should wait for an example that needs them,
in this same usage-first manner:

- **Deep-link starts** — `t.me/<bot_username>?start=<payload>`: an action like
  `sendStart(bot, { payload })` whose `/start` message carries the payload.
- **Failure injection** — making the emulator answer 429/500 or drop connections to test bot
  resilience and rate-limit handling.
- **Time control** — freezing or advancing emulator time for scheduled behavior.
- **Webhook delivery** as an alternative to long polling.
- **Media and file uploads**, channels, supergroup migration, inline mode.
- **In-process handler** for socket-free unit-style runs, as PR #1 supported; the examples only
  require the standalone-server form.
