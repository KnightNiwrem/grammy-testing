# Architecture review findings

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
