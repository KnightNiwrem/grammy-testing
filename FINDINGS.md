# Review findings: minimal Bot API emulator

Reviewed on 2026-09-18. This review covers all eight commits ahead of `main` (`05bb7d7`), through
`52974e4`, including the server, client, tests, configuration, CI workflow, and documentation
against [PLAN.md](PLAN.md). The original finding numbers are retained for reference; finding 14 is
new in the final pass.

The minimal message flow and grammY polling lifecycle work. Four findings are deferred to a separate
design and implementation review, two risks remain accepted, and eight findings are fixed. Deferred
does not mean resolved or accepted. P2 denotes a correctness or contract issue; P3 denotes a smaller
validation or coverage issue. Finding 10 is a future design concern without a runtime severity
assignment.

## Deferred findings

### 5. [DEFERRED] [P2] Private-chat validation permits additional human parties

Locations: [session_store.ts](src/server/session_store.ts), `Session.createPrivateChat`, and
[admin_routes.ts](src/server/admin_routes.ts), `createChat`.

The store verifies that the named human exists, is included, and that every member exists. It does
not reject other human members. An admin request declaring Alice, Bob, and a bot as members of a
private chat returns 201. This contradicts the planned private conversation between one human and
one bot; the documented multiple-bot exception does not justify additional humans.

The follow-up should enforce the human-party invariant while preserving a way to test a bot that
cannot send. Resolve this alongside finding 10 so that a permission fixture does not dictate the
conversation's parties.

### 10. [DEFERRED] Private conversations lack ownership by the bot/user pair

Location: [session_store.ts](src/server/session_store.ts), `ChatRecord`, `Session.chats`, and
`Session.createPrivateChat`.

The session-global map is keyed only by independently generated chat ID. Several bots can append to
one private history, while repeated creation for the same bot/user pair creates unrelated histories.
Both outcomes remain reproducible. The records do not distinguish conversation ownership from
sending permission.

To converge toward Telegram's private-conversation model, each bot's conversation with a human needs
its own history and sending permissions. If exposed private-chat IDs were changed to user IDs, the
current map could not distinguish conversations belonging to different bots. The design should
consider ownership by the bot/user pair, or a separate internal conversation identity, and decide
how repeated creation behaves. The existing client `{ user, bot }` interface supplies the parties.

Model blocked or unstarted conversations through sending permission rather than arbitrary private
membership. Finding 5 concerns the current validation gap; this finding concerns the representation
needed for future behavior. Independent exposed chat IDs remain an accepted choice in finding 9.

### 14. [DEFERRED] [P2] Deleting a session leaves active long polls pending

Locations: [session_store.ts](src/server/session_store.ts), `SessionStore.delete` and
`Session.waitForUpdates`; [admin_routes.ts](src/server/admin_routes.ts), `deleteSession`;
[client/mod.ts](src/client/mod.ts), `TestSession.destroy`.

Session deletion removes the map entry without ending registered polls. A probe started a 30-second
`getUpdates` request, waited until it was registered, and deleted the session. DELETE returned 204
and the store no longer contained the session, but the handler was still unresolved and
`pendingLongPolls.size` remained 1. Aborting the original request released it.

The pending timer and abort listener retain the deleted session and its state until timeout or
client cancellation. A maximum valid timeout can retain it for about 24.8 days. This conflicts with
the client's promise that `destroy()` removes the session and everything declared in it.

Define session disposal, including how active requests finish, and release held polls as part of
deletion. A regression test should establish a registered poll before deletion, then verify its
completion and removal. The existing destroy test checks only that subsequent requests return 404.

### 7. [DEFERRED] [P3] Successful admin responses are unchecked

Location: [admin_transport.ts](src/client/admin_transport.ts), `AdminTransport.request`.

The transport asserts arbitrary successful response JSON as `TResponse`; a 204 similarly becomes
`undefined` for any requested response type. A fetch override returning 200 with `{}` makes
`createSession()` return a handle whose required `id` and `apiRoot` are both `undefined`.

Validate required protocol fields at the client boundary and report malformed successful responses
explicitly. Request-specific validators should establish the promised types and expected empty
responses. The current generic assertion cannot provide that runtime guarantee.

## Accepted risks

### 3. [RISK ACCEPTED] [P3] Entity handles do not preserve session ownership

Locations: [client/mod.ts](src/client/mod.ts), `TestSession.createPrivateChat`, and
[handles.ts](src/client/handles.ts), `TestUser` and `TestBot`.

Chat creation sends only numeric entity IDs. If a foreign handle's ID coincides with a local
entity's ID, the client silently selects the local entity. Controlled random draws in the original
review reproduced this across sessions and across servers. The foreign-bot test covers an absent ID,
not ownership; the server's session namespaces remain isolated.

**Decision:** Accept the residual risk because an uncontrolled collision is extremely unlikely.
Reassess ownership validation if explicit IDs or another use case make overlapping IDs likely.

### 9. [RISK ACCEPTED] [P3] Independent private-chat IDs differ from Telegram's implementation

Locations: [PLAN.md](PLAN.md), the identifier decision, and
[session_store.ts](src/server/session_store.ts), `Session.createPrivateChat`.

Telegram's TDLib constructs a private dialog ID from the peer user ID, and the Bot API server
serializes that chat ID. See
[TDLib's identity mapping](https://github.com/tdlib/td/blob/master/td/telegram/DialogId.cpp) and
[Bot API chat serialization](https://github.com/tdlib/telegram-bot-api/blob/master/telegram-bot-api/Client.cpp).
Code that addresses a private chat by user ID can therefore work against Telegram and fail here.

**Decision:** Keep independent allocation of chat and user IDs, including permitted coincidental
equality. Accept this compatibility deviation; it is not a separate implementation defect.
Conversation ownership in finding 10 remains a distinct design concern.

## Fixed findings

| Finding                                                   | Resolution in the reviewed branch                                                                                                                                      |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Invalid `chat_id` types could succeed or produce 500   | Lookup accepts numbers and canonical numeric strings without coercing other JSON types. Invalid targets return 400 without storing messages.                           |
| 2. Malformed multipart requests produced 500              | Form-decoding failures return 400 with the Telegram error envelope.                                                                                                    |
| 4. Explicit user IDs bypassed the documented range        | Every user ID is server-assigned in `1 .. 2^52 - 1`; explicit IDs are absent from the creation protocol.                                                               |
| 6. `getMe` did not make `bot.start()` work                | `deleteWebhook` and `getUpdates` stubs support grammY startup and shutdown. Documentation distinguishes initialization, polling lifecycle, and future update delivery. |
| 8. Identifier tests required unequal user and chat IDs    | Store, client, and grammY tests permit coincidental equality; README documents it.                                                                                     |
| 11. Malformed polling timeouts could produce 500          | Timeout validation accepts only numbers or canonical decimal strings representing integers in `0 .. 2^31 - 1`; other values return 400.                                |
| 12. Oversized timeouts overflowed native timers           | The wait clamps the timer delay to `2^31 - 1` milliseconds. Longer valid requests end early, as documented. A coverage limitation remains below.                       |
| 13. Lifecycle tests did not prove a long poll was pending | In-process grammY and HTTP cancellation tests wait for server-side poll registration and verify release; store tests cover registration and abort cleanup.             |

## Remaining coverage limitation

**[P3] Finding 12's native timer overflow guard lacks an effective permanent regression test.** The
oversized-timeout cases in [bot_api_handler_test.ts](tests/bot_api_handler_test.ts) use FakeTime,
which does not reproduce Deno's timer overflow. The original review verified that removing the clamp
in an isolated copy still passed that test. A native-timer probe against the current branch
confirmed that a maximum valid timeout remains registered and pending until aborted.

Add a native-timer regression test that establishes poll registration, proves an oversized valid
timeout stays pending, then aborts and verifies cleanup. This is a test improvement; the overflow
fix remains in place.

## Verification and analyzer triage

The final pass used Deno 2.9.6 and passed:

- `deno task check`
- `deno task lint`
- `deno task fmt:check`
- `git diff --check main...HEAD`
- `deno task test`: 26 passed, 1 standalone test ignored.
- `BOT_API_EMULATOR_URL=http://localhost:18087 deno task test`, with a standalone server running:
  all 27 tests passed.

Temporary probes reconfirmed extra-human membership, duplicate bot/user conversations, shared
multiple-bot membership, unchecked client responses, and native oversized-timeout retention. They
also established finding 14. These probes are diagnostic evidence, not permanent regression
coverage.

Fallow 3.27.0 ran the combined dead-code, duplication, and maintainability analyses. Discovery
covered all 15 source and test files. A temporary configuration explicitly supplied `src/main.ts`
and `src/client/mod.ts`; the Deno plugin discovered all four test entry points. No project tooling
or analysis configuration was changed.

- **Unused type:** `ListMessagesQuery` has no consumers. This is a minor protocol cleanup candidate,
  separate from the deferred behavioral findings.
- **False positives:** `TestChat.id` and `TestChat.listMessages` are exercised by client and grammY
  tests. The reported unlisted `@std/testing` dependency is declared in `deno.json`; its
  `@std/testing/time` import resolves and passes Deno checking.
- **Duplication:** The five-line entity setup fragments belong to separate test responsibilities and
  do not justify coupling them. The identical `until` helpers share waiting behavior and could be
  consolidated during test maintenance; no correctness defect was established.
- **Maintainability:** Signals for `decodePayload` and `readPort` use estimated coverage, not
  measured coverage. Inspection did not establish a structural refactoring requirement. Change
  frequency signals alone likewise do not justify redesign.

Fallow's file discovery does not establish complete understanding of remote Deno dependencies or
runtime behavior. No measured coverage was supplied, and architecture-boundary and policy analyses
were not configured; their zero counts are not clean results for those checks.

Unsupported methods, groups, uploads, update generation and delivery, ignored update-selection
parameters, and the documented timer cap remain intentional limits of this step.
