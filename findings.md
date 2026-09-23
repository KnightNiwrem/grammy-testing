# Telegram emulation server: fidelity findings and recommendations

## Review context

| Item                       | Details                                                                                                                                           |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Repository                 | [KnightNiwrem/grammy-testing][repository]                                                                                                         |
| Reviewed snapshot          | `main` at commit [`274da0e2b8db667a84fa76df7fbf28042aab8e12`][snapshot]                                                                           |
| Report prepared            | September 23, 2026                                                                                                                                |
| Primary objective          | Identify departures from Telegram behavior that could make end-to-end bot tests misleading or become problematic foundations for future features. |
| Scope                      | Implemented HTTP routes, services, repositories, message projections, OpenAPI contract, and relevant tests described in the preceding review.     |
| Telegram source comparison | Official Bot API server, including polling implementation at commit [`e3e9dd8e5b3d7ab8537cd5a10dc31d5ffa8f82d1`][telegram-source].                |

This document consolidates the preceding review; it is **not a fresh audit of repository HEAD**.
Repository observations and framework-specific observations are carried forward from that review.
Official documentation links are reference points and can change independently of the pinned
repository snapshots.

The compatibility target includes the Bot API-facing interface and the Telegram behavior represented
through custom account and administrative operations. The review does **not** establish complete
MTProto or TDLib compatibility.

### Evidence and limitations

The original review compared code with Telegram documentation and official implementation source.

The original review did **not** run the full Deno suite or run live differential tests against
Telegram. No additional test execution or repository revalidation was performed while preparing this
document. Recommendations and proposed regression tests below are not claims that fixes have already
been implemented.

Evidence is distinguished as follows:

- **Reported code/documentation comparison:** a mismatch identified in the preceding review, without
  an additional local reproduction recorded here.
- **Coverage limitation or extension risk:** a missing workflow or a design assumption to address
  before extending the emulator, rather than a claim that every unsupported feature is currently
  defective.

Unsupported Telegram methods are not automatically defects. The important distinction is between an
explicitly unsupported feature and an implemented or accepted feature that behaves differently from
Telegram.

## Overall assessment

**Preserve the overall architecture, but correct the implemented behavioral mismatches before
substantially widening endpoint coverage.** The principal risk is that tests pass or fail for
emulator-specific reasons rather than for reasons that would hold against Telegram.

The existing separation of canonical messages, observer-specific message numbering,
private-conversation identity, domain events, and Bot API update projection is worth retaining. The
highest-priority remaining work concerns Bot API error responses.

### Prioritized findings

Priorities describe impact on testing fidelity and future implementation work, not security
severity.

| ID  | Priority                    | Finding                                          | Main consequence                                      | Evidence                               |
| --- | --------------------------- | ------------------------------------------------ | ----------------------------------------------------- | -------------------------------------- |
| F06 | Medium                      | Some Bot API failures return an empty body       | Error handling exercises the wrong failure category.  | Reported code/documentation comparison |
| F07 | Lower for short-lived tests | Update retention and idle-ID behavior are absent | Recovery and long-duration scenarios are unrealistic. | Reported code/documentation comparison |

## F06 — Some Bot API failures have an empty body

**Priority:** Medium\
**Primary locations:** [`src/api/mod.ts`][api-root] and [Bot API routes][bot-api-routes].\
**Evidence:** Reported code/documentation comparison.

### Context and observed behavior

The application-level fallback is:

```ts
api.notFound((context) => context.body(null, 404));
```

An authenticated request reaching an unmatched Bot API method therefore receives an empty body.
Authentication and some validation failures already use a Bot API-shaped JSON response, so the
behavior is inconsistent within the same surface.

Telegram's error contract is JSON containing `ok: false`, `error_code`, and a description. See
[Making requests][telegram-requests].

### Testing consequence

Clients may encounter JSON-decoding or transport-style failures instead of a normal Telegram API
error. Error handling that branches on a Telegram error code is not exercised.

### Recommendation

Establish a Bot API-specific error boundary and keep administrative lifecycle failures separate.
Distinguish genuine Telegram-level invalid requests, valid Telegram methods not implemented by the
emulator, and internal emulator failures.

Match documented Telegram failures to reference status/body fixtures. For unsupported functionality,
fail clearly and expose an emulator diagnostic rather than returning fabricated success. Make the
compatibility limitation visible without confusing it with a successfully emulated Telegram outcome.

### Proposed regression tests

Exercise unmatched methods, invalid parameters, authentication failures, and declared unsupported
methods. Assert HTTP status, response content, and the client-visible error category. An assertion
that only checks for a non-success status is insufficient.

## F07 — Update retention and long-idle ID behavior are absent

**Priority:** Lower for short-lived tests; important for recovery and time-dependent scenarios.\
**Primary location:** [`src/repositories/bot_update.ts`][queue].\
**Evidence:** Reported code/documentation comparison.

### Context and observed behavior

Mailbox entries have no expiry metadata or clock dependency. Update IDs start at one and increment
indefinitely.

Telegram retains pending updates for no longer than 24 hours. Its `Update` documentation also
specifies a randomly chosen next update ID after at least a week without new updates. See
[Getting updates][telegram-getting-updates] and [Update][telegram-update].

**Starting at one is not itself a fidelity violation.** Determinism is useful; the missing behavior
concerns expiry and assumptions about sequences across long idle periods.

### Testing consequence

Outage-recovery tests can assume that every missed update remains recoverable forever. Cursor logic
can also accidentally rely on uninterrupted numbering across long idle periods.

### Recommendation

Inject time into the queue and add controlled expiry and idle-sequence behavior. Use seeded
randomness or explicit test controls where appropriate so that tests remain reproducible.

The interaction service already accepts `currentUnixTimeSeconds`; extend that approach rather than
introducing unrelated real-time dependencies.

### Proposed regression tests

Advance a controlled clock beyond the documented retention maximum and verify that expired updates
cannot be recovered. Exercise long-idle ID changes without depending on a particular random value.
Preserve normal short-session replay and acknowledgement tests as controls.

## C01 — The current integration coverage is not a complete bot lifecycle

**Classification:** Declared coverage limitation, not an undisclosed implementation defect.

### Context

The integration test described in the original review constructs a grammY bot and calls
`grammyBot.api.getUpdates()` directly. It demonstrates useful API-client interoperability, but does
not start polling through `bot.start()`, execute command middleware, and send a reply.

The original review checked grammY 1.46.0, matching the baseline of the range imported by the test,
and found that `bot.start()` invokes `deleteWebhook` during setup. The reviewed emulator routes
implement only `getMe` and `getUpdates`; `deleteWebhook` and outbound `sendMessage` are absent. See
the [reviewed route implementation][bot-api-routes] and the [grammY project][grammy].

### Consequence

Passing the existing integration test does not yet establish that an ordinary grammY bot can
complete startup and a command-to-reply interaction against the emulator.

### Recommendation

Make the next complete workflow:

```text
Create bot and account
  → start the actual bot
  → send /start through the account API
  → execute the actual command handler
  → send a reply
  → inspect conversation history
  → stop and restart
  → preserve correct update acknowledgement behavior
```

Implement the relevant startup and outbound behavior rather than bypassing it with test-only
replacements. Completing this workflow faithfully should take precedence over adding many unrelated
methods.

## Architectural foundations to preserve

### A01 — Canonical messages and observer-specific message numbering

The separation of canonical messages from `UserMessageBoxRepository` is an important fidelity
decision. Telegram describes a common message-ID sequence across an account's private chats and
basic groups, with different accounts potentially assigning different IDs to the same message.
Channels and supergroups instead have their own shared sequences. See Telegram's
[message-ID documentation][telegram-message-ids].

The reviewed repository models the common user-owned message box, while private conversations are
keyed by the account–bot pair. **Do not replace this with a counter per private chat.**

For reply, edit, and delete operations, resolve an external message identifier through its
observation context and verify that it belongs to the addressed conversation. A canonical internal
identifier must not become interchangeable with a Bot API `message_id`.

### A02 — Event-to-update projection boundary

`BotUpdateDeliveryService` separates stored chat events from Bot API update production. Preserve
that boundary for recipient selection, projection, subscription checks, and delivery.

Update subscriptions are checked here when an update is created. Polling does not determine whether
the underlying message exists, and excluding an update does not erase conversation history.

## Extension risks to resolve before generalizing the implementation

The following are architectural cautions from the original review. They should not be presented as
already reproduced defects in unsupported features.

### R01 — Separate author, conversation peer, and observer

**Context:** The current private-message projection derives `chat.id` from the author's ID. That is
appropriate for its current case: an account-to-bot message viewed by the bot.

**Risk:** It is not a general private-message projection rule. For a bot replying to a human, the
bot-facing result identifies the bot as author and the human as the private-chat peer. Reusing the
function by merely changing `author` would confuse those roles. See the [projection][projection] and
Telegram's [Message specification][telegram-message].

**Recommendation:** Derive the peer from the conversation and observer independently of the sender.
Make observation context explicit wherever it controls externally visible IDs.

The original review also found that account-facing history intentionally exposes the recipient bot's
projection and numbering, as documented in the current OpenAPI contract. This is an inspection
contract, not automatically an account-native message view. Preserve it explicitly or add an
observer-qualified view before introducing account-side operations that consume those message IDs.

**Regression focus:** Incoming versus outgoing private messages; the same canonical message viewed
by each participant; and reply/edit/delete lookup using the correct observer's identifiers.

### R02 — Do not generalize `owner | member` into Telegram permissions

**Context:** `addChatMember` currently requires an owner actor, membership is represented as
owner/member, and the ordinary member-addition path rejects adding a bot to a channel.

**Risk:** This is insufficient as a general authorization model. Telegram has separate
administrator-management operations and action-specific rights, including
[`channels.editAdmin`][telegram-edit-admin].

**Recommendation:** Do not simply remove the channel restriction and allow every ordinary bot
invitation. Implement the distinct administrator-management operation and represent the rights it
grants. Separate membership, permission to perform an action, and eligibility to receive an update.

**Regression focus:** Owner and administrator actions, relevant granted and missing rights, and
channel bot administration through the appropriate operation.

### R03 — Privacy is not the same as `allowed_updates`

**Context:** Current delivery covers the simpler private-message case, and bots advertise fixed
capability defaults. Group visibility introduces additional rules.

**Risk:** Applying only subscription filtering to group events would omit privacy mode,
administrator status, and command/reply visibility behavior. Telegram documents these separately
from update subscriptions in [Bot Features][telegram-features].

**Recommendation:** Keep authorization, visibility, subscription, and transport delivery as separate
decisions, even if a single service coordinates them. Connect advertised bot capabilities to actual
behavior as those modes become supported.

**Regression focus:** Group messages visible or hidden under the applicable privacy and
administrator settings, followed by independent subscription checks.

### R04 — Avoid making private conversations permanently human–bot-only

**Context:** The original review flagged version-sensitive, mode-dependent features in Telegram's
documentation, including conditional bot-to-bot communication and guest interactions. This is a
design caveat, not a claim that those modes are implemented or locally tested here. See
[Bot Features][telegram-features].

**Risk:** Global assumptions such as “every private conversation must contain a human,” “bots can
never observe another bot's messages,” or “interaction always requires ordinary membership” can make
later support difficult.

**Recommendation:** Retain the account–bot conversation model as the supported subtype, rather than
treating it as an exhaustive definition of all possible Telegram private conversations. Mark
additional modes unsupported until their prerequisites and behavior have been checked against the
chosen compatibility version.

**Regression focus:** As each additional mode is implemented, test its prerequisites and disabled
behavior explicitly rather than broadening visibility globally.

### R05 — Distinguish fixture creation from simulated user actions

**Context:** Group creation and member addition currently mutate state without publishing
corresponding domain events; the published path described in the review is message creation.

**Risk:** Silent state creation is useful for fixture setup, but it can bypass the observable side
effects expected from an operation presented as a user action. A future “add bot to group” test
could establish membership without exercising onboarding behavior.

**Recommendation:** Make fixture seeding and user-action simulation distinguishable in naming,
documentation, or operation mode. Define the side-effect contract before presenting a state mutation
as an emulated Telegram action.

Before adding ordinary outbound private messaging, also model reachability separately from account
existence. A bot does not acquire the right to initiate an ordinary private conversation merely
because the target user exists; see Telegram's [bot introduction][telegram-bots]. Keep special modes
explicit rather than using them to weaken the ordinary rule.

**Regression focus:** Fixture seeding that intentionally avoids delivery, simulated user actions
that produce their required side effects, and outbound messaging with and without the relevant
reachability prerequisites.

## Recommended conformance-test plan

The existing tests described in the original review cover ordinary replay, acknowledgement, per-bot
sequencing, waking a long poll, and a plain private message through grammY's API client. Keep those
controls and add the following targeted cases.

| Scenario                                        | Required assertion                                                                               | Related finding |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------ | --------------- |
| Bot API errors                                  | The client receives the expected structured API error, not an empty-body parsing failure.        | F06             |
| Time advanced beyond retention                  | Expired updates cannot be recovered.                                                             | F07             |
| Long-idle update sequence                       | Cursor handling does not assume uninterrupted numbering.                                         | F07             |
| Real startup, command, reply, stop, and restart | Framework lifecycle works without test-only replacements.                                        | C01             |
| Interleaved conversations and observers         | Canonical IDs, observer message IDs, and update IDs remain distinct.                             | A01, R01        |
| Group permissions and visibility                | Membership, action permission, privacy visibility, and subscription are evaluated independently. | R02, R03        |
| Fixture seeding versus simulated actions        | Each follows its explicitly documented side-effect contract.                                     | R05             |

### Keep evidence beside the tests

For each conformance case, record whether its expected behavior comes from documentation, a pinned
official source revision, or a captured live observation. Preserve the relevant source and version
next to the test.

The emulator's own OpenAPI schema is useful, but cannot be the sole authority for Telegram behavior:
an incorrect schema and implementation can otherwise validate each other.

Record the targeted Bot API compatibility version separately from the emulator's API version.
Maintain a supported-behavior matrix that can express “implemented with documented restrictions,”
not just a binary implemented/unimplemented status.

## Suggested implementation order

| Work unit | Scope                                                                     | Completion criterion                                                                |
| --------- | ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| 1         | Add the Bot API error boundary.                                           | Client-visible failures conform to reference fixtures.                              |
| 2         | Complete the real command-to-reply lifecycle.                             | Startup, reply, history inspection, shutdown, and restart run without bypasses.     |
| 3         | Add controlled retention and idle-sequence behavior.                      | Time-dependent recovery scenarios are deterministic and realistic.                  |
| 4         | Extend projections, permissions, and action semantics in focused changes. | Each new capability has explicit scope and independently sourced conformance tests. |

Keep the queue fixes independently reviewable. Avoid bundling broad architectural refactors with
narrowly reproducible behavior corrections. Where the error boundary permits it, keep those changes
independently testable as well.

## Bottom line

The repository's architecture is a sensible foundation for the supported scenario. The greatest
immediate fidelity risk comes from behaviors that appear implemented but silently differ from
Telegram, such as unmatched methods that fail without a Bot API error.

Correct those behaviors, then prove a real command-to-reply lifecycle. Preserve observer-aware
identifiers and the event/projection boundary, and make new permissions, visibility modes, and
user-action side effects explicit rather than allowing today's narrow assumptions to become
permanent global rules.

<!-- Source references: repository links are pinned to the reviewed snapshot; documentation links are live. -->

[repository]: https://github.com/KnightNiwrem/grammy-testing
[snapshot]: https://github.com/KnightNiwrem/grammy-testing/tree/274da0e2b8db667a84fa76df7fbf28042aab8e12
[projection]: https://github.com/KnightNiwrem/grammy-testing/blob/274da0e2b8db667a84fa76df7fbf28042aab8e12/src/projections/bot_api_message.ts
[queue]: https://github.com/KnightNiwrem/grammy-testing/blob/274da0e2b8db667a84fa76df7fbf28042aab8e12/src/repositories/bot_update.ts
[bot-api-routes]: https://github.com/KnightNiwrem/grammy-testing/blob/274da0e2b8db667a84fa76df7fbf28042aab8e12/src/api/sessions/bot_api/mod.ts
[api-root]: https://github.com/KnightNiwrem/grammy-testing/blob/274da0e2b8db667a84fa76df7fbf28042aab8e12/src/api/mod.ts
[telegram-source]: https://github.com/tdlib/telegram-bot-api/blob/e3e9dd8e5b3d7ab8537cd5a10dc31d5ffa8f82d1/telegram-bot-api/Client.cpp
[telegram-requests]: https://core.telegram.org/bots/api#making-requests
[telegram-getting-updates]: https://core.telegram.org/bots/api#getting-updates
[telegram-update]: https://core.telegram.org/bots/api#update
[telegram-message]: https://core.telegram.org/bots/api#message
[telegram-message-ids]: https://core.telegram.org/api/ids#message-ids
[telegram-edit-admin]: https://core.telegram.org/method/channels.editAdmin
[telegram-features]: https://core.telegram.org/bots/features
[telegram-bots]: https://core.telegram.org/bots
[grammy]: https://github.com/grammyjs/grammY
