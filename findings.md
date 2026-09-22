# Architecture review findings

## P1 — Separate canonical message identity from Bot API `message_id`

Location: `src/repositories/message.ts:17-23`

`MessageRepository` allocates one session-global number and stores it as the canonical message ID;
`ChatInteractionService` then exposes that number unchanged in every Bot API projection. Telegram's
identifier model cannot be represented by one canonical sequence: private chats and basic groups use
the observing user's common message-ID sequence, while each supergroup or channel owns a shared
sequence. A private or basic-group message may consequently have different IDs for different
observers.

This becomes a structural blocker when the emulator adds shared-chat delivery, bot-authored
messages, replies, edits, deletes, or service messages. Those operations must resolve an
observer-visible ID in the correct sequence, not reuse a session-global property of the canonical
message.

Keep an opaque internal identity on the canonical message and allocate Telegram `message_id` values
for the relevant observer or shared-chat sequence during projection. This is consistent with the
unsettled projection strategy documented in `chat-design.md:333-341`.

Reference:
[Telegram message-ID sequences](https://core.telegram.org/api/updates#message-id-sequences)

## P1 — Produce domain events before projecting Bot API updates

Location: `src/services/chat_interaction.ts:405-406`

`ChatInteractionService.sendMessage` constructs a Bot API DTO and enqueues it directly for a single
bot after storing the canonical message. This makes a state-changing domain command responsible for
wire projection, recipient selection, and polling delivery.

Extending this pattern would require message, membership, and chat commands to embed group privacy
rules, bot eligibility, service-message behavior, update field selection, and delivery-mechanism
concerns. Adding `channel_post`, `my_chat_member`, `chat_member`, webhook delivery, or additional
message kinds would therefore spread Telegram projection logic across domain mutations.

Have commands update canonical state and produce ordered domain events such as `MessageCreatedEvent`
and `ChatMemberStatusChangedEvent`. A separate delivery/projector layer should select eligible bots,
construct observer-specific Bot API objects, and append the resulting updates to each bot's mailbox.
This is the separation already specified in `chat-design.md:343-367`.

References:

- [Telegram `Update`](https://core.telegram.org/bots/api#update)
- [Telegram privacy mode](https://core.telegram.org/bots/features#privacy-mode)

## P2 — Keep concrete repositories behind an application boundary

Location: `src/types/emulation_session.ts:18-19`

`EmulationSession` exposes concrete `MessageRepository` and `BotUpdateRepository` instances. Routes
can consequently orchestrate persistence directly; the `getUpdates` route already authenticates
through `BotRepository` and polls `BotUpdateRepository` itself. Because transport imports only the
`EmulationSession` type, the configured static boundary check does not see these transitive runtime
dependencies.

This leaves no single application-level owner for Bot API invariants that span authentication, bot
configuration, mailbox state, and delivery mode. In particular, Telegram makes `getUpdates` and
webhook delivery mutually exclusive. Future methods such as webhook configuration and pending-update
management could bypass one another if each route coordinates repositories independently.

Keep repositories private to composition and expose narrow application capabilities to transport,
such as a Bot API authentication and update-delivery service. Route handlers should parse HTTP,
invoke that interface, and translate its result to the Bot API response envelope.

Reference: [Telegram webhook delivery rules](https://core.telegram.org/bots/api#setwebhook)

## P2 — Use Telegram's user-ID range for users, bots, and private chats

Location: `src/repositories/telegram_identity.ts:1`

The identity allocator, request validation, TypeScript client schemas, and OpenAPI contract use
`4_503_599_627_370_495` (`2^52 - 1`) as the maximum Telegram user ID. Telegram documents the actual
user ID range as `1` through `0xffffffffff` (`1_099_511_627_775`). The 52-significant-bit statement
describes safe numeric representation of Bot API identifiers in general; it is not the upper bound
of the user-ID sequence.

This currently publishes an invalid contract for account, bot, and private-chat IDs and allows the
allocator to define identities outside Telegram's user range. Define the official bound once in a
shared contract source and use it consistently in the allocator, server validation, generated or
handwritten client validation, and OpenAPI schema.

The existing supported shared-chat ranges are correct: basic groups use `-999999999999` through
`-1`, and supergroups/channels use `-1997852516352` through `-1000000000001`. They do not require a
separate finding.

Reference: [Telegram Bot API dialog IDs](https://core.telegram.org/api/bots/ids)
