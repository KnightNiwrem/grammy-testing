# tg-bot-api-emulator — audit findings and recommendations

**Review date:** 25 September 2026\
**Reviewed repository:** KnightNiwrem/tg-bot-api-emulator\
**Reviewed commit:** `4c793b46a13c7aaacb32d4014f5a3a8973f4cacf` ([immutable snapshot][snapshot])\
**Latest change included in this snapshot:** “Deliver webhook updates of different chats
concurrently.”

## Executive assessment

**Keep the existing emulator architecture; improve the fidelity of the workflows it already supports
before attempting broad Telegram feature coverage.** The separation between canonical state,
observer-specific projections, message services and delivery is a useful foundation. This is not a
recommendation to replace the implementation with TDLib, introduce a generic service framework, or
make every service a dependency-free leaf. The composition root already supplies explicit
dependencies, and common message normalization and edit rules already have a shared implementation.
[Sources: composition][composition], [message content rules][content], [message views][view].

The remaining capability gap I identified is `getChat` for the chat types already modeled. There are
also concrete robustness issues in recursive reply routing and the new webhook dispatcher's backlog
handling. The architectural work should be focused: separate reusable Bot API method dispatch from
Hono routing, rather than mechanically splitting every large class.

**No P0 or P1 defect was established by this review.** That is not a certification that the
repository has no such defects. The findings below distinguish observed implementation defects,
acknowledged coverage gaps, architecture risks and proposed testing capabilities. Missing optional
features are not automatically classified as bugs.

### Evidence and validation limits

This was a **source-based audit with selected reduced probes**, not an executed full-repository test
run. I read the pinned repository through the GitHub connector. A runnable local checkout could not
be obtained in this environment, and Deno was unavailable. Consequently, I did **not** run the
repository's Deno tests, type checker, formatter, linter, OpenAPI lint or Fallow checks. I also did
not run Telegram's C++ code or send experimental requests to live Telegram accounts.

I did execute reduced, source-derived JavaScript probes under Node `v22.16.0` for the mutually
recursive reply traversal. They establish the behavior of that extracted algorithm, not that a
repository integration test has been run. The webhook operation counts below are analytical counts,
not measured Deno benchmark results.

The C++ comparison uses the project's documented baseline: Bot API
`e3e9dd8e5b3d7ab8537cd5a10dc31d5ffa8f82d1` and TDLib `bc9c263e2bfee06aaab41e82db51a103376030bc`.
Relevant sections of `Client.cpp`, `WebhookActor.cpp` and `MessageEntity.cpp` were inspected
directly. Public Telegram documentation was also consulted. Source-visible parsing, serialization
and delivery behavior is distinguished from behavior decided by Telegram's remote servers; the
latter cannot always be inferred from a forwarding call in TDLib. [Baseline][scope] ·
[Bot API C++][cpp-client] · [webhook C++][cpp-webhook] · [TDLib entities][cpp-entities].

### Priority convention

The sequence below is the recommended implementation order, balancing practical bot-testing utility,
confidence, affected workflows and likely scope. **P2** means worthwhile near-term work; **P3**
means follow-on or optional work. The classification beside each item matters: a P2 capability
recommendation is not a claim that an unsupported method is a severe implementation defect.

| Rank | Priority | Finding or recommendation                                                | Classification                                            |
| ---: | :------: | ------------------------------------------------------------------------ | --------------------------------------------------------- |
|    5 |    P2    | Add `getChat` for the chat types already modeled                         | Targeted capability recommendation                        |
|    6 |    P2    | Replace recursive reply-address resolution with a stack-safe traversal   | Source-verified robustness defect; reduced probe executed |
|    7 |    P2    | Separate method dispatch from HTTP routing; constrain facade growth      | Architecture / SRP recommendation                         |
|    8 |    P2    | Extend upstream-derived fixtures into a differential conformance harness | Fidelity assurance recommendation                         |
|   10 |    P3    | Bound webhook workers and avoid repeated full-backlog scans              | Source-verified scalability risk                          |
|   13 |    P3    | Make the development and CI dependency baseline reproducible             | Build reproducibility risk                                |

## Findings, in priority order

### 5. P2 — Add `getChat` for already-supported private chats and supergroups

**Context and evidence.** The method registry includes several chat membership/query methods but no
`getChat`; unknown method names take the 404 path. The emulator already stores user profiles,
supergroup titles/descriptions and membership state and already has projections for message-level
chat objects. [Method registry][routes] · [administration state][administration] ·
[existing projections][projection].

**Why this is valuable.** A test bot that sends and receives ordinary messages may also query its
chat's metadata or permissions before doing useful work. That workflow currently reaches an
unsupported method even though much of its underlying state is already modeled. This is a
recommendation about likely utility and implementation leverage, not a measured claim about how
frequently all bot developers use the method.

**Recommendation.** Implement numeric-ID `getChat` for the currently supported chat types first. Use
the actual `getChat` access/error rules rather than blindly copying send permissions. Return a
properly formed `ChatFullInfo` for the supported profile—not merely the smaller `Chat` object copied
out of a message. Required fields need explicit, documented fixture defaults or modeled values;
unknown optional fields should not be invented. Continue rejecting unsupported chat kinds and
username addressing until those capabilities are deliberately added.
[Telegram `getChat`][api-getchat] · [`ChatFullInfo` contract][api-chatfull] ·
[C++ method handling][cpp-client].

**Acceptance tests.** Query the same private chat and supergroup used by the core send/receive
tests; verify stable identity/title/description data, relevant membership/access failures, and
consistency with message projections. Exercise it through a real bot framework or the normal Bot API
transport. Add separate tests for fields that are absent versus explicitly false.

**Scope/cost.** Small to medium. This is a new capability, not an accusation that the existing
implementation violates its declared scope. It should precede a wide collection of rarely tested
optional parameters.

### 6. P2 — Deep reply chains can overflow the call stack during message publication

**Context and evidence.** `#findPrivacyModeAddressee` calls `#findRepliedMessageAddressee`, which
calls back into `#findPrivacyModeAddressee` for an account-authored content message. Each step walks
another `replyToMessageId`. There is no iterative traversal or depth bound. The dispatcher performs
this lookup before iterating the potential recipient bots. [Mutually recursive methods][delivery].

The failure is more than an unsuccessful lookup: `SupergroupMessagingService.#commitMessage` first
stores the message and assigns its visible ID, then publishes `message_created`, and only afterward
updates member reply interfaces. An exception from publication therefore occurs after part of the
operation has committed. [Commit sequence][supergroup].

**Reduced reproduction.** I constructed 30,000 account-authored text messages in a chain, with no
bot command, no `viaBot`, and each message replying to its predecessor. A reduced version preserving
the two methods' recursive control flow failed under Node `v22.16.0` with:

```text
RangeError: Maximum call stack size exceeded
```

This is not an asserted exact Deno failure threshold. Stack limits and surrounding frames vary. The
source demonstrates unbounded recursion, and the reduced probe demonstrates the failure mechanism.
Ordinary short conversations are unaffected.

**Impact.** Generated/state-machine tests and sufficiently long-lived sessions can fail on otherwise
valid message sequences. In the real call path, publication can fail after storage and numbering,
potentially leaving a stored message despite an unsuccessful API operation and preventing later
publication work. Even below the stack limit, repeatedly walking every ancestor makes a growing
unaddressed chain quadratic across successive sends.

**Recommendation.** First replace recursion with a stack-safe traversal that preserves the existing
precedence. Be careful: when a chain is unwound, an older replied-to addressee can take precedence
over an addressee on a newer message. A simplistic “return the first command while walking backward”
can change semantics. Use an explicit traversal/unwind representation or an equivalent proven
algorithm. Treat malformed cycles defensively without imposing an arbitrary Telegram-visible maximum
on valid chains.

Memoizing derived routing metadata can be a later optimization, but only after edit/deletion
invalidation semantics are specified. Do not fix this by swallowing publication errors and silently
losing updates, and do not introduce a general transaction framework just for this patch.

**Acceptance tests.** Add a large synthetic chain, a short chain with conflicting explicit
addressees at different depths, a reply to a bot-authored message, and termination at a
missing/deleted ancestor. At integration level, check that the long-chain send completes with
consistent history, numbering and update delivery.

**Scope/cost.** Small for stack safety; medium for safe caching. This is ranked below more frequent
workflow gaps because the failure requires unusually deep history.

### 7. P2 — Separate reusable method dispatch from HTTP routing, and keep facade growth tied to real responsibilities

**Context and evidence.** `src/api/sessions/bot_api/mod.ts` contains request schemas,
method-specific handling, the method registry and Hono route construction. `webhook_reply.ts`
imports `findBotApiMethodHandler` from that same module, while session composition imports the
webhook-reply path. A transport-independent webhook reply therefore reaches the module that also
owns the HTTP router. Separately, `BotApiService` contains substantial logic across messaging, file
resolution, queries, subscriptions, webhooks, commands and administration. [Router/registry][routes]
· [webhook reply import][webhook-reply] · [composition][composition] · [facade][bot-api].

**SRP assessment.** Large files alone are not the finding. Nor is it inherently wrong for an
application service to orchestrate other services. The concrete concern is the number of independent
reasons these modules change: adding an HTTP adapter, changing a Telegram parameter decoder, adding
a domain operation and changing webhook reply dispatch touch overlapping modules. The existing
shared content rules and dependency interfaces are useful and should be retained.
[Shared rules][content].

**Recommendation.** Make a focused first extraction: move the method registry and reusable
method-handler definitions into a transport-neutral module. Keep the Hono module responsible for
authentication/context acquisition, HTTP body decoding and converting method answers into HTTP
responses. Let webhook replies invoke the same neutral dispatcher after their own response-body
decoding and excluded-method check.

Next, split method handlers by cohesive feature family only where they have genuinely separate
dependencies—message operations, update/webhook control, and chat/command queries are plausible
boundaries. Keep the public facade if it remains useful; move substantive independent workflows
behind it rather than replacing it with a generic service locator. Avoid one class per Bot API
method, inheritance for superficially similar chat workflows, or an untyped string-to-command event
bus.

**Acceptance tests.** Run the same valid and invalid method requests through direct HTTP and webhook
reply dispatch and compare method-level effects. Preserve the existing excluded `get*`,
webhook-changing and session-ending reply methods. Add dependency-boundary checks that prevent the
neutral dispatcher from importing Hono/router construction. Keep the behavior-preserving extraction
separate from any fidelity change.

**Scope/cost.** Small to medium for the dispatch boundary; incremental thereafter. This is a
maintainability recommendation, not a proven runtime circular-import failure.

### 8. P2 — Build a differential conformance harness around the existing upstream-derived tests

**Context and evidence.** The repository already has valuable upstream-derived markup fixtures.
Their header identifies TDLib test cases and their source commits, including date/time adjustments.
The feature guide correctly says they are regression coverage rather than proof of full equivalence.
The delivery and webhook tests also exercise important behavior such as per-chat ordering and
progress when another chat fails. This recommendation is not based on an absence of tests.
[Fixture provenance][markup-fixtures] · [documented limit][format-doc] ·
[delivery tests][delivery-tests] · [webhook tests][webhook-tests].

**Remaining risk.** A port can pass a finite fixture set while retaining differences in Unicode
boundaries, combinations of entities, validation precedence or stateful workflows. Assertions
derived from the port's own helper functions cannot independently establish Telegram fidelity.
Conversely, not every upstream behavior is visible in C++: some operations only forward a request to
Telegram's remote service.

**Recommendation.** Maintain three explicitly different evidence levels:

1. **Executable local C++ oracle** for source-visible operations such as markup parsing, text
   normalization and link/entity helpers. Build it against a fixed TDLib commit as a
   development-only tool. It should not become a runtime dependency of the emulator.
2. **Bot API protocol fixtures** for method decoding, returned JSON and update serialization. Record
   the exact upstream source/test provenance and the request that produced each expected result.
3. **Authorized, optional live traces** for remote-server decisions not settled by local code. Keep
   these outside the default offline test run and redact account-specific data while preserving
   identity relationships.

Start with a small corpus of the entity and routing cases already ported, then expand through
generated boundary cases and state-machine sequences. Normalize volatile values carefully: renumber
IDs within the correct identity namespace rather than erasing all IDs, and retain field presence,
ordering guarantees and relationships that are part of the behavior under test.

**Acceptance criteria.** A checked-in case records its request/scenario, oracle commit or capture
provenance, expected response/update shape and normalization policy. Updating the oracle must show
semantic fixture changes for review rather than automatically accepting all new outputs. CI should
continue running the ordinary TypeScript tests even when an optional live oracle is unavailable.

**Scope/cost.** Medium, staged. A small useful harness is preferable to trying to reproduce all of
Telegram before shipping the next feature.

### 10. P3 — `max_connections` bounds HTTP attempts, not the amount of webhook backlog work

**Context and evidence.** `#deliverPendingUpdates` starts a worker for every distinct pending queue
key. Each `#deliverQueue` first calls `readPendingUpdates(botId).find(...)`, before awaiting a
connection. `readPendingUpdates` copies the entire pending array. Therefore, even with
`max_connections: 1`, a backlog spanning many distinct chats creates many workers and repeatedly
scans/copies the backlog before network progress. [Dispatcher and queue worker][webhook] ·
[mailbox copying][update-repo].

**Analytical reproduction.** Preload N updates belonging to N distinct queue keys, then enable a
webhook. During the initial synchronous worker startup, the worker for each key searches the same
backlog before its first `await`. The searches visit `1 + 2 + ... + N` entries, and N full-array
copies contain roughly N² copied references, excluding the outer scan.

For N = 10,000, that is **50,005,000 predicate checks** and **100,000,000 copied array entries** at
startup. These are operation counts, not a measured latency or a claim that all copied arrays are
retained simultaneously. The worker/semaphore-waiter count is also proportional to distinct pending
keys rather than the configured connection limit.

**Telegram comparison.** `WebhookActor` separates per-key queues from connection scheduling and
limits how much update work it loads relative to connection count. Matching that ownership is useful
even without copying the complete C++ implementation.
[Upstream queue/connection scheduling][cpp-webhook].

**Recommendation.** Maintain pending updates indexed by queue key, expose a head lookup and
acknowledgement operation, and have a bounded scheduler select ready keys. Retrying keys should
retain their own backoff but release their connection slot, as the current implementation already
does. A repository can legitimately maintain indexes; the scheduler should own readiness, connection
capacity and retry policy.

Do not cap the number of keys by simply letting failing workers permanently occupy all worker
slots—that would undo the current cross-chat progress improvement. Keep fair ready-queue scheduling
and individual acknowledgement semantics.

**Acceptance tests.** Retain the existing blocked-chat progress and connection-limit tests. Add a
high-cardinality backlog case with instrumentation for loaded workers/queue lookups rather than a
fragile wall-clock threshold. Verify fair progress, one in-flight update per key, bounded active
scheduling work, cancellation and webhook replacement.

**Scope/cost.** Medium. It is not an ordinary small-test failure, which is why it follows the core
fidelity items.

### 13. P3 — A pinned source commit does not currently pin the dependency baseline

**Context and evidence.** `deno.json` sets `"lock": false` and uses caret dependency ranges,
including an external CDN import for `grammy/types`. Thus the repository's own configuration does
not provide a reproducible resolved dependency graph for development and tests.
[Actual configuration][deno].

**Impact.** Two clean executions of the same emulator commit can resolve different compatible
dependency versions. A fidelity regression or changed validator behavior becomes harder to
distinguish from a change to the emulator itself. This is a reproducibility concern; I did not
observe an actual dependency regression or allege a compromise.

**Recommendation.** Commit a development/CI lockfile and enforce it in CI. Pin externally hosted
source URLs to an immutable revision or exact release where appropriate, rather than relying on a
range embedded in a CDN URL. Keep package-consumer version policy separate from the repository's own
tested resolution: using a lockfile for development does not require forbidding all compatible
dependency ranges for consumers. Deno documents frozen lockfiles for exactly this purpose.
[Deno lockfile guidance][deno-lock].

**Acceptance tests.** A clean locked install/check/test resolves the same graph; an intentional
dependency update produces a reviewed lockfile diff; a CI run that would update the lockfile fails
instead of silently accepting the change. Record the Deno/runtime baseline alongside the C++ oracle
baseline.

**Scope/cost.** Small. This does not require a build-system rewrite.

## Architecture and behavior worth preserving

The proposed changes do not require abandoning the current model. Canonical messages are separate
from the IDs visible to participants, and the view/projection layer resolves observer-specific files
and nested message representations. Those responsibilities should remain distinct from permission
checks and message creation. The repositories' indexes are not, by themselves, SRP violations;
repositories can own identity and lookup invariants. [Message storage][message-repo] ·
[message views][view] · [projections][projection] · [identity storage][identity-repo].

The private and supergroup messaging services already share content normalization, caption/text
replacement, quote and edit-checking helpers. Moving these rules back into route handlers or merging
all chat workflows through a weakly typed generic base class would be a regression in clarity. A
service orchestrating collaborators is not inherently less cohesive than a service that is a leaf.
[Shared rules][content] · [private workflow][private] · [supergroup workflow][supergroup].

The delivery separation also has useful semantics: subscription filtering happens when an update is
created, queued updates are not retroactively removed by changing subscriptions, polling and
webhooks coordinate their mutually exclusive states, and webhook queues can progress independently
while a different chat retries. These are important regression targets during refactoring.
[Polling][polling] · [delivery][delivery] · [webhook scheduling][webhook] · [scope][updates-doc].

Several initially plausible concerns should **not** be promoted into findings without stronger
evidence. The webhook reply handler already excludes `get*`, `setWebhook`, `deleteWebhook`, `close`
and `logout`. Same-chat reply parameters receive normalization at the transport layer. Forwarded
inline provenance is retained separately from an editable inline-message identity. These are
examples of why a local helper or field cannot be judged without its call path.
[Webhook reply filter][webhook-reply] · [reply routing][routes] · [forward model][forward-types] ·
[provenance resolution][view].

The remaining questions about exact edit-update visibility after privacy/membership transitions,
callback re-answer rules and edit timestamps should be investigated with the conformance approach in
finding 8, not turned into speculative bug reports. No claim of an observed live-server mismatch in
those areas is made here.

## Review coverage and limits

This table describes inspected areas, not a claim that every line or every test in the repository
was exhaustively checked.

| Area                      | Review performed                                                                                                                                                   |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Composition and ownership | Session wiring, repository/service interfaces, identity/message storage, message view and projection boundaries.                                                   |
| Bot API transport         | Method registry and selected handlers, body parameter decoding, reply parameters, webhook reply dispatch and client serialization.                                 |
| Messaging workflows       | Substantial sections of private/bot messaging, normalization, edits, replies, copies/forwards and inline provenance; selected supergroup commit and routing paths. |
| Updates and concurrency   | Polling service and pending queue; webhook registration, workers, connection limiter, retries, acknowledgement, abort paths and reply handling.                    |
| Callbacks and inline mode | Callback ownership/current-button checks and expiry scope; inline result/query flow and message identity handling.                                                 |
| Text fidelity             | Explicit-vs-detected entity pipeline, mention helper, relevant pinned TDLib scanner code and upstream-derived markup fixture provenance.                           |
| Tests/build               | Selected delivery and webhook tests, markup fixtures, repository quality instructions and `deno.json`; no execution of the project checks.                         |
| External comparison       | Relevant Bot API `Client.cpp`, `WebhookActor.cpp`, TDLib `MessageEntity.cpp`, and official Telegram/Deno documentation.                                            |

Media codec edge cases, exhaustive command-scope combinations, every administration failure
precedence, every generated schema and every end-to-end API test are not certified by this review.
The evidence is stronger for the specifically named paths and reproductions than for untouched
combinations.

Intentional constraints such as disposable in-memory sessions, predictable update IDs, no automatic
update expiry, omitted production pacing, strict unsupported-parameter handling and incomplete
advanced Telegram feature coverage were not automatically counted as defects. The user-supplied
`disable_notification` example is illustrative: this snapshot already carries silent-send state, so
it is not listed as a missing parameter. [Update deviations][updates-doc] ·
[message capabilities][message-doc] · [message state][message-types].

## Reproducing the reduced probes

The following is a standalone JavaScript reduction, **not a repository test**. It reproduces the
reply traversal observation without Deno or repository imports. It does not prove HTTP responses, a
precise Deno stack threshold, or live Telegram behavior.

```javascript
// Run with Node; the review used v22.16.0.
// Reduced traversal: every message is account-authored plain text and has
// no leading command or via_bot. Terminal command lookup thus returns undefined.
const messages = new Map();
function findAddressee(message) {
  const parent = message.replyToMessageId === undefined
    ? undefined
    : messages.get(message.replyToMessageId);
  const addressee = parent === undefined ? undefined : findParentAddressee(parent);
  if (addressee !== undefined) return addressee;
  if (message.viaBot !== undefined) return { botId: message.viaBot.botId };
  return undefined;
}
function findParentAddressee(message) {
  if (message.author.kind === 'bot') return { botId: message.author.botId };
  return findAddressee(message);
}
for (let i = 0; i < 30_000; i++) {
  messages.set(i, {
    author: { kind: 'account' },
    ...(i === 0 ? {} : { replyToMessageId: i - 1 }),
  });
}
try {
  console.log(findAddressee(messages.get(29_999)));
} catch (error) {
  console.log(error.name, error.message);
  // Observed: RangeError Maximum call stack size exceeded
}
```

The implementation sequence is the numbered findings above. Keep behavior fixes, coverage additions
and structural extractions in separate focused PRs; use each item's acceptance tests to establish
the change before moving to adjacent refactors.

---

## Source references

Repository links below are pinned to the reviewed commit. Telegram documentation links are living
references; the C++ references are pinned to the stated comparison baseline.

[snapshot]: https://github.com/KnightNiwrem/tg-bot-api-emulator/tree/4c793b46a13c7aaacb32d4014f5a3a8973f4cacf
[scope]: https://github.com/KnightNiwrem/tg-bot-api-emulator/blob/4c793b46a13c7aaacb32d4014f5a3a8973f4cacf/docs/features/README.md
[composition]: https://github.com/KnightNiwrem/tg-bot-api-emulator/blob/4c793b46a13c7aaacb32d4014f5a3a8973f4cacf/src/composition/emulation_session.ts
[bot-api]: https://github.com/KnightNiwrem/tg-bot-api-emulator/blob/4c793b46a13c7aaacb32d4014f5a3a8973f4cacf/src/services/bot_api.ts
[routes]: https://github.com/KnightNiwrem/tg-bot-api-emulator/blob/4c793b46a13c7aaacb32d4014f5a3a8973f4cacf/src/api/sessions/bot_api/mod.ts
[content]: https://github.com/KnightNiwrem/tg-bot-api-emulator/blob/4c793b46a13c7aaacb32d4014f5a3a8973f4cacf/src/services/message_content.ts
[private]: https://github.com/KnightNiwrem/tg-bot-api-emulator/blob/4c793b46a13c7aaacb32d4014f5a3a8973f4cacf/src/services/private_messaging.ts
[supergroup]: https://github.com/KnightNiwrem/tg-bot-api-emulator/blob/4c793b46a13c7aaacb32d4014f5a3a8973f4cacf/src/services/supergroup_messaging.ts
[administration]: https://github.com/KnightNiwrem/tg-bot-api-emulator/blob/4c793b46a13c7aaacb32d4014f5a3a8973f4cacf/src/services/shared_chat_administration.ts
[delivery]: https://github.com/KnightNiwrem/tg-bot-api-emulator/blob/4c793b46a13c7aaacb32d4014f5a3a8973f4cacf/src/services/bot_update_delivery.ts
[polling]: https://github.com/KnightNiwrem/tg-bot-api-emulator/blob/4c793b46a13c7aaacb32d4014f5a3a8973f4cacf/src/services/bot_update_polling.ts
[update-repo]: https://github.com/KnightNiwrem/tg-bot-api-emulator/blob/4c793b46a13c7aaacb32d4014f5a3a8973f4cacf/src/repositories/bot_update.ts
[message-repo]: https://github.com/KnightNiwrem/tg-bot-api-emulator/blob/4c793b46a13c7aaacb32d4014f5a3a8973f4cacf/src/repositories/message.ts
[identity-repo]: https://github.com/KnightNiwrem/tg-bot-api-emulator/blob/4c793b46a13c7aaacb32d4014f5a3a8973f4cacf/src/repositories/telegram_identity.ts
[view]: https://github.com/KnightNiwrem/tg-bot-api-emulator/blob/4c793b46a13c7aaacb32d4014f5a3a8973f4cacf/src/services/bot_message_view.ts
[projection]: https://github.com/KnightNiwrem/tg-bot-api-emulator/blob/4c793b46a13c7aaacb32d4014f5a3a8973f4cacf/src/projections/bot_api_message.ts
[message-types]: https://github.com/KnightNiwrem/tg-bot-api-emulator/blob/4c793b46a13c7aaacb32d4014f5a3a8973f4cacf/src/types/virtual_message.ts
[forward-types]: https://github.com/KnightNiwrem/tg-bot-api-emulator/blob/4c793b46a13c7aaacb32d4014f5a3a8973f4cacf/src/types/message_forward.ts
[webhook]: https://github.com/KnightNiwrem/tg-bot-api-emulator/blob/4c793b46a13c7aaacb32d4014f5a3a8973f4cacf/src/services/bot_webhook.ts
[webhook-reply]: https://github.com/KnightNiwrem/tg-bot-api-emulator/blob/4c793b46a13c7aaacb32d4014f5a3a8973f4cacf/src/api/sessions/bot_api/webhook_reply.ts
[format-doc]: https://github.com/KnightNiwrem/tg-bot-api-emulator/blob/4c793b46a13c7aaacb32d4014f5a3a8973f4cacf/docs/features/text-formatting.md
[message-doc]: https://github.com/KnightNiwrem/tg-bot-api-emulator/blob/4c793b46a13c7aaacb32d4014f5a3a8973f4cacf/docs/features/messages.md
[updates-doc]: https://github.com/KnightNiwrem/tg-bot-api-emulator/blob/4c793b46a13c7aaacb32d4014f5a3a8973f4cacf/docs/features/updates.md
[delivery-tests]: https://github.com/KnightNiwrem/tg-bot-api-emulator/blob/4c793b46a13c7aaacb32d4014f5a3a8973f4cacf/tests/bot_update_delivery_service_test.ts
[webhook-tests]: https://github.com/KnightNiwrem/tg-bot-api-emulator/blob/4c793b46a13c7aaacb32d4014f5a3a8973f4cacf/tests/bot_webhook_service_test.ts
[markup-fixtures]: https://github.com/KnightNiwrem/tg-bot-api-emulator/blob/4c793b46a13c7aaacb32d4014f5a3a8973f4cacf/tests/fixtures/tdlib_markup_cases.ts
[deno]: https://github.com/KnightNiwrem/tg-bot-api-emulator/blob/4c793b46a13c7aaacb32d4014f5a3a8973f4cacf/deno.json
[cpp-client]: https://github.com/tdlib/telegram-bot-api/blob/e3e9dd8e5b3d7ab8537cd5a10dc31d5ffa8f82d1/telegram-bot-api/Client.cpp
[cpp-webhook]: https://github.com/tdlib/telegram-bot-api/blob/e3e9dd8e5b3d7ab8537cd5a10dc31d5ffa8f82d1/telegram-bot-api/WebhookActor.cpp
[cpp-entities]: https://github.com/tdlib/td/blob/bc9c263e2bfee06aaab41e82db51a103376030bc/td/telegram/MessageEntity.cpp
[api-getchat]: https://core.telegram.org/bots/api#getchat
[api-chatfull]: https://core.telegram.org/bots/api#chatfullinfo
[deno-lock]: https://docs.deno.com/examples/dependency_lockfile_tutorial/
