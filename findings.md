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
webhook attempt deadline, retries, and future age/expiry behavior without sleeping or globally
patching time for unrelated sessions.

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

A narrow `getChat` implementation offers useful coverage without requiring comprehensive Telegram
emulation. Notification behavior and less frequently tested options can remain lower priority while
these changes make the supported workflows substantially more trustworthy.
