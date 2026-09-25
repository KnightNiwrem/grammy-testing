# Telegram Bot API Emulator — Audit Findings and Recommendations

## Review context and scope

**Repository:**
[KnightNiwrem/tg-bot-api-emulator](https://github.com/KnightNiwrem/tg-bot-api-emulator)

**Reviewed revision:**
[`5b02d7f129bf81ba79e6ce5f46903e6f213bb42c`](https://github.com/KnightNiwrem/tg-bot-api-emulator/tree/5b02d7f129bf81ba79e6ce5f46903e6f213bb42c)

**Review scope:** Source code, tests, architecture, adherence to the Single Responsibility Principle
(SRP), and behavioral fidelity to Telegram’s Bot API documentation and relevant Telegram/TDLib C++
implementation paths. The review includes the inline-query and inline-message editing implementation
at the reviewed revision.

**Product context:** The emulator is intentionally pursuing low-hanging fruit to unblock bot
developers writing tests. Incomplete optional-parameter coverage is not automatically a major
defect. The priorities below emphasize incorrect behavior in already-supported workflows, then
capabilities that unlock useful tests with modest implementation scope. Less frequently tested
options, such as notification behavior, can remain lower priority.

**Review limitation:** This was a source-and-test audit. The Deno suite and live Telegram
differential tests were not executed. Regression scenarios below are source-derived cases, not
claims of executed test failures. This document packages the preceding review; it is not a new audit
of subsequent repository changes.

**Source-link convention:** Repository links point to the reviewed revision. Telegram documentation
and upstream C++ links are reference entry points and may change independently. Exact upstream
revisions and line-level references were not retained for every comparison in the preceding review;
those links should not be treated as immutable evidence snapshots.

## Overall assessment

**The architecture has a sound foundation, but several already-supported workflows can produce
materially different results from Telegram.** Prioritize those discrepancies over expanding
optional-parameter coverage.

The session-scoped composition root, narrow dependency interfaces, separation of stored messages
from Bot API projections, and distinct private/supergroup messaging services are sensible choices.
Service-to-service collaboration through narrow interfaces is not inherently an SRP violation; the
current composition does not need to be replaced with an event bus or a collection of strictly
leaf-only services.

Relevant architectural entry points:

- [`src/composition/emulation_session.ts`](https://github.com/KnightNiwrem/tg-bot-api-emulator/blob/5b02d7f129bf81ba79e6ce5f46903e6f213bb42c/src/composition/emulation_session.ts)
- [`src/services/private_messaging.ts`](https://github.com/KnightNiwrem/tg-bot-api-emulator/blob/5b02d7f129bf81ba79e6ce5f46903e6f213bb42c/src/services/private_messaging.ts)
- [`src/services/supergroup_messaging.ts`](https://github.com/KnightNiwrem/tg-bot-api-emulator/blob/5b02d7f129bf81ba79e6ce5f46903e6f213bb42c/src/services/supergroup_messaging.ts)

## Priority definitions

The findings and recommendations are presented in one priority order, not grouped by category.

- **P1:** Fix before trusting the affected workflow.
- **P2:** The next most valuable correctness, capability, and supporting engineering work.
- **P3:** Supporting maintainability and reproducibility improvements.

---

## 6. P2 — Webhook delivery has no emulator-controlled per-attempt deadline

**Location:**
[`src/services/bot_webhook.ts`](https://github.com/KnightNiwrem/tg-bot-api-emulator/blob/5b02d7f129bf81ba79e6ce5f46903e6f213bb42c/src/services/bot_webhook.ts),
`#deliverPendingUpdates`, `#sendUpdate`, and `createWebhookRequest`.

### Finding and context

The delivery loop awaits `#sendWebhookRequest`, using a signal associated with stopping or replacing
delivery. There is no per-attempt deadline. The response-body cancellation is also awaited without a
bound. A sender that never settles can therefore prevent the loop from recording an error, retrying
the update, or processing subsequent updates.

This is separate from the intentional one-at-a-time delivery model. Serial delivery can be a
reasonable simplification; an unbounded attempt makes that simplification fragile. Telegram’s
webhook actor constructs its outbound connection with finite timeout settings.

**Reference:**
[Telegram Bot API server `WebhookActor.cpp`](https://github.com/tdlib/telegram-bot-api/blob/master/telegram-bot-api/WebhookActor.cpp).

### Recommendation

Add an injectable per-attempt deadline that aborts the attempt—not the webhook registration. On
expiry, retain the pending update, record the delivery failure, and enter the existing retry path.
Ensure that deleting the webhook or ending the session cancels the attempt and any scheduled retry.

Bound completion of the delivery attempt as a whole, rather than relying on incidental timeout
behavior of whichever fetch implementation is installed.

### Regression coverage

Inject a sender that remains pending until aborted. Advance a test scheduler and verify that the
attempt is aborted, the update remains pending, the same update ID is retried, and registration
teardown prevents further attempts.

## 7. P2 — Extract transport-independent method execution, then support webhook-response methods

**Locations:**

- [`src/api/sessions/bot_api/mod.ts`](https://github.com/KnightNiwrem/tg-bot-api-emulator/blob/5b02d7f129bf81ba79e6ce5f46903e6f213bb42c/src/api/sessions/bot_api/mod.ts)
- [`src/services/bot_webhook.ts`](https://github.com/KnightNiwrem/tg-bot-api-emulator/blob/5b02d7f129bf81ba79e6ce5f46903e6f213bb42c/src/services/bot_webhook.ts)

### Finding and context

The webhook implementation explicitly discards response bodies. Thus a successful webhook response
containing a supported Bot API operation can acknowledge the incoming update without performing the
requested operation.

Telegram’s webhook actor recognizes an eligible method in a successful response and dispatches it.
This is an alternate invocation path for existing methods, not merely a cosmetic parameter.

**References:**
[Bot API — making requests when getting updates](https://core.telegram.org/bots/api#making-requests-when-getting-updates),
[Telegram Bot API server `WebhookActor.cpp`](https://github.com/tdlib/telegram-bot-api/blob/master/telegram-bot-api/WebhookActor.cpp).

### Practical impact and architectural context

Implementing this can unblock existing webhook-based bot configurations while reusing methods such
as `sendMessage` that already work. It does not require another large family of message types.

It also exposes the most useful SRP improvement in the transport layer. The Bot API route module
currently combines parameter schemas, handler registration, HTTP context access, method handling,
and response construction. Those responsibilities are closely related, but keeping execution tied to
Hono makes a second invocation path unnecessarily difficult.

### Recommendation

Introduce a transport-independent execution boundary shared by ordinary HTTP calls and
webhook-response operations. Keep decoding and response writing in the adapters, with
feature-specific parameter readers and error/result translation alongside the corresponding method
implementation.

This does **not** require one class per method, nor does the size of `BotApiService` alone make it
an SRP violation. A façade can legitimately coordinate multiple features.

Make the extraction behavior-preserving first. Add webhook-response execution in a separate change,
following upstream restrictions on which methods may run this way.

### Regression coverage

A successful response containing `sendMessage` should create one message. Separately test that
webhook acknowledgement and the embedded method’s success are not incorrectly treated as the same
outcome.

## 8. P2 — Add `chat_member` updates for membership transitions already implemented

**Classification:** High-value capability recommendation, not a demand for complete membership
emulation.

**Location:**
[`src/services/bot_update_delivery.ts`](https://github.com/KnightNiwrem/tg-bot-api-emulator/blob/5b02d7f129bf81ba79e6ce5f46903e6f213bb42c/src/services/bot_update_delivery.ts),
`#deliverChatMemberStatusChange`.

### Finding and context

The domain already publishes membership changes with old status, new status, actor, chat, and time.
The delivery layer currently uses that event only to notify a bot about its own membership through
`my_chat_member`; it does not project general `chat_member` updates to observer bots.

Telegram makes these updates available to administrator bots that explicitly subscribe to
`chat_member`.

**Reference:** [Bot API `Update`](https://core.telegram.org/bots/api#update).

### Recommendation

Support notifications for the transitions the emulator can already perform, rather than introducing
every missing membership state or administrative operation.

This is a good fit for the low-hanging-fruit strategy: it unlocks membership-driven handlers using
state and events that already exist. A service-message substitute does not exercise the same handler
or payload contract.

Architecturally, generalizing the membership-event projection is preferable to manufacturing these
updates separately inside each ban, unban, add, or promotion operation.

### Regression coverage

A subscribed administrator receives the transition with accurate old/new status; an unsubscribed
administrator and an ordinary member bot do not receive the general update. Preserve the existing
own-bot membership notification behavior.

## 9. P2 — Implement a narrow `getChat` before less frequently exercised options

**Classification:** Capability recommendation.

**Relevant locations:**
[`src/api/sessions/bot_api/mod.ts`](https://github.com/KnightNiwrem/tg-bot-api-emulator/blob/5b02d7f129bf81ba79e6ce5f46903e6f213bb42c/src/api/sessions/bot_api/mod.ts),
[`src/composition/emulation_session.ts`](https://github.com/KnightNiwrem/tg-bot-api-emulator/blob/5b02d7f129bf81ba79e6ce5f46903e6f213bb42c/src/composition/emulation_session.ts).

### Context

The method registry supports membership queries such as `getChatMember` and `getChatAdministrators`,
but not `getChat`. The model already contains accounts, private conversations, and shared-chat
metadata that can support a useful initial implementation.

### Recommendation

Start with numeric identifiers for already-supported private chats and supergroups. Leave username
resolution and unsupported chat families explicit.

The important contract detail is that `getChat` returns **`ChatFullInfo`**, not the lightweight chat
object embedded in messages. Reusing the existing message-chat projection unchanged would create
another false-success implementation.

**References:** [Bot API `getChat`](https://core.telegram.org/bots/api#getchat),
[Bot API `ChatFullInfo`](https://core.telegram.org/bots/api#chatfullinfo).

Give this query its own read-access tests rather than automatically reusing `sendMessage`’s
write-access conditions. Metadata lookup and permission to send a new message are different
operations.

This would let tests exercise a straightforward sequence such as “receive a message, retrieve chat
metadata, make a decision, respond,” without needing broader media or notification emulation.

## 10. P2 — Extend the upstream-derived tests into stateful conformance scenarios

### Context

The existing TDLib markup fixtures are a strong precedent: they identify the upstream commit and
translate upstream cases into the emulator’s representations. That is much better than having
expected values with no recorded origin.

The gaps above illustrate the next testing need: **interactions between otherwise-supported
features**. Testing reply routing, inline ownership, and editing separately does not establish that
their combinations are correct.

### Recommendation

Add a small collection of stateful reference scenarios recording setup, requests, responses,
resulting state, and per-bot update delivery. Preserve the distinction between source-derived
expectations and observations captured from Telegram.

For each scenario, normalize incidental identifiers and timestamps while retaining the relationships
that matter: which bot owns a message, which observer receives an update, which message a reply
targets, and whether a failed request changed state.

There is also a specific investigation worth adding here: edits that remove a command or change
apparent privacy eligibility. The current implementation routes edits by re-evaluating the edited
content. Telegram describes `edited_message` in terms of a message known to the bot. **Establish the
precise behavior with a Telegram trace before prescribing a historical-audience rule.** This is an
investigation recommendation, not a confirmed historical-routing defect.

**References:**
[`src/services/bot_update_delivery.ts`](https://github.com/KnightNiwrem/tg-bot-api-emulator/blob/5b02d7f129bf81ba79e6ce5f46903e6f213bb42c/src/services/bot_update_delivery.ts),
[Bot API `Update`](https://core.telegram.org/bots/api#update).

Keep these reference-capture tests separate from the ordinary offline suite. Behavioral fidelity
does not require embedding TDLib or copying its actor architecture.

## 11. P2 — Separate Telegram compatibility from deliberate “strict testing” validation

**Locations:** Bot API parameter schemas, including
[`src/api/sessions/bot_api/mod.ts`](https://github.com/KnightNiwrem/tg-bot-api-emulator/blob/5b02d7f129bf81ba79e6ce5f46903e6f213bb42c/src/api/sessions/bot_api/mod.ts),
`reply_markup_parameter.ts`, and inline-result parameter readers.

### Finding and context

Several comments explicitly describe a policy of rejecting inputs Telegram accepts in order to
surface mistakes. Examples include string-valued message IDs inside `deleteMessages`, malformed
`allowed_updates`, and ambiguous markup shapes. This is therefore not simply an accidental parser
defect.

**The architectural issue is that an emulator and a linter have different responsibilities.** A
production bot can legitimately rely on behavior that a stricter testing tool dislikes. Rejecting
that behavior by default makes the test environment less representative.

### Recommendation

Make the distinction explicit. Prefer Telegram-compatible wire behavior for emulation, with stricter
diagnostics as an opt-in policy—or, at minimum, document the stricter mode as part of the public
compatibility contract.

This should not become blanket acceptance of unsupported parameters. Distinguish:

- Supported semantics, including known Telegram coercions.
- Accepted options with intentionally unmodeled effects.
- Unsupported behavior that must fail explicitly.

A small capability table backed by tests may be enough initially; this does not need a new
configuration framework. The important result is that “Telegram rejects this,” “the emulator does
not implement this,” and “strict diagnostics discourage this” no longer collapse into the same
generic invalid-parameters response.

## 13. P3 — Complete the clock-injection seam with a session-level scheduler

**Locations:**
[`src/composition/emulation_session.ts`](https://github.com/KnightNiwrem/tg-bot-api-emulator/blob/5b02d7f129bf81ba79e6ce5f46903e6f213bb42c/src/composition/emulation_session.ts)
and timed delivery services such as
[`src/services/bot_webhook.ts`](https://github.com/KnightNiwrem/tg-bot-api-emulator/blob/5b02d7f129bf81ba79e6ce5f46903e6f213bb42c/src/services/bot_webhook.ts).

### Finding and context

The services already accept an injected current-time function, which is a good foundation. However,
the session factory fixes it to `Date.now()`, while webhook retry scheduling uses ordinary timers.
There is no shared session-level runtime abstraction that lets an integration test advance both time
and scheduled work consistently.

### Recommendation

Let the composition root accept a small runtime dependency containing the clock, scheduler, and
outbound webhook transport, with normal production defaults.

Build on the existing injection rather than replacing it. A deterministic session can then test the
deadline in finding 6, retries, and future age/expiry behavior without sleeping or globally patching
time for unrelated sessions.

Avoid introducing “advance the timestamp” without also advancing scheduled tasks. That produces a
partially simulated clock and difficult-to-explain tests.

Treat this as infrastructure enabling future fidelity work, not as a prerequisite to immediately
implementing every currently omitted timeout or expiry rule.

## 14. P3 — Make dependency resolution and the tested runtime reproducible

**Locations:**
[`deno.json`](https://github.com/KnightNiwrem/tg-bot-api-emulator/blob/5b02d7f129bf81ba79e6ce5f46903e6f213bb42c/deno.json)
and
[`.github/workflows/ci.yml`](https://github.com/KnightNiwrem/tg-bot-api-emulator/blob/5b02d7f129bf81ba79e6ce5f46903e6f213bb42c/.github/workflows/ci.yml).

### Finding and context

The configuration explicitly disables the lockfile and uses version ranges for dependencies. CI also
selects Deno through `v2.x`. A fixed emulator commit can therefore be tested against different
resolved dependencies or runtime releases over time.

### Recommendation

Commit a lockfile, require frozen dependency resolution in CI, and establish a pinned reference
runtime. A separate compatibility job can track newer supported runtime versions.

For a testing emulator, reproducibility is part of the product’s usefulness. When an emulated
behavior changes, developers should be able to determine whether the cause was an intentional
implementation change, a dependency update, or a runtime change.

Keep dependency/runtime updates as explicit, reviewable changes rather than incidental changes
beneath an otherwise identical source revision.

---

## Bottom line

**Retain the architecture and fix the behavioral invariants first.** The highest-value remaining
correction is bounded webhook attempts.

The most important SRP improvements are not “split every large service.” They are more specific:
make method execution reusable across transports, and distinguish faithful emulation from strict
diagnostics.

After those corrections, webhook-response execution, `chat_member` notifications, and a narrow
`getChat` implementation offer useful coverage without requiring comprehensive Telegram emulation.
Notification behavior and less frequently tested options can remain lower priority while these
changes make the supported workflows substantially more trustworthy.
