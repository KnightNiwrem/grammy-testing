# grammy-testing: architecture and Single Responsibility Principle review

## Review context

- **Repository:** [KnightNiwrem/grammy-testing](https://github.com/KnightNiwrem/grammy-testing)
- **Reviewed branch:** `main`
- **Reviewed commit:**
  [`d0f166d212990d1594ef8530bf13eb47f9390308`](https://github.com/KnightNiwrem/grammy-testing/tree/d0f166d212990d1594ef8530bf13eb47f9390308)
- **Report date:** September 24, 2026
- **Focus:** Clear, semantically sound Single Responsibility Principle (SRP), with particular
  attention to policy boundaries, invariant ownership, dependency direction, and lifecycle
  ownership.
- **Scope:** Application services, composition, principal repositories, HTTP routes, message
  projection, TypeScript client contracts, and representative tests.
- **Provenance:** This document consolidates the preceding architecture review. Findings concern the
  pinned commit, not any later changes to `main`.

Code identifiers in this report refer to the [reviewed source snapshot][snapshot]. Proposed
component names and illustrative contracts are recommendations, not claims about existing code.
Exact source links appear in the appendix.

## Executive assessment

**The architecture has a sound foundation, but several boundaries are broader than their names
suggest.** The main issue is not a shortage of classes or files. Some components own policies that
should be independently understandable and changeable—particularly the boundary between canonical
messages and Bot API views.

The highest-value change is to keep Bot API presentation outside the operation that commits
canonical message state.

| Priority   | Finding and recommendation                                                                       | Nature of the finding                                  |
| ---------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------ |
| **High**   | Separate canonical messaging operations from Bot API message presentation.                       | Clear architectural boundary improvement.              |
| **Medium** | Give long-poll coordination an explicit owner and clarify the queue's mutating operations.       | Cohesion and semantic clarity improvement.             |
| **Lower**  | Improve ownership of application contracts and distinguish fixture setup from simulated actions. | Targeted refinements, not reasons for a large rewrite. |

These are implementation priorities for this review, not formal security or incident severity
ratings. The architectural recommendations should not all be read as demonstrated runtime bugs.

I would **not** recommend replacing the current design with a generic command bus, introducing a
service for every method, making every service a leaf, or creating repository interfaces solely for
uniformity.

## 1. The SRP standard used in this review

The useful interpretation of SRP is grouping code by the responsibility it serves and the reasons
that responsibility changes—not counting methods, dependencies, or operations. This is consistent
with [Robert Martin's clarification of the principle][srp-reference].

For this repository, the first test is:

> Can the component's responsibility be described precisely enough to identify both what belongs
> inside it and what definitely does not?

“Handle chat interactions” is not a sufficiently discriminating answer. Almost every future Telegram
operation could fit it.

Conversely, “preserve a bot's pending update queue, including sequencing, acknowledgement, and
availability notification” describes a reasonably cohesive responsibility even though it involves
several methods and some behavior.

The second test is:

> Does this component own an invariant, or does it merely participate in a workflow whose invariant
> nobody fully owns?

### Practical consequences of this interpretation

A service is not required to be a leaf. It can depend on other services or coordinate several
collaborators when the coordination itself is its responsibility.

A repository is not required to be passive storage. Behavior that preserves the consistency of the
state it owns can belong there.

A composition root is supposed to know how the object graph fits together. Its large dependency list
is not evidence of an SRP violation.

The goal is therefore **clear ownership of distinct policies and invariants**, not mechanically
smaller classes.

---

## 2. Finding SRP-03: canonical messaging still owns Bot API presentation

**Priority: High**\
**Classification: Clear architectural boundary improvement**

The project already has a valuable projection boundary, but the messaging service does not
consistently respect it.

### Existing behavior and context

`ChatInteractionService`:

- Returns `BotApiPrivateTextMessage` from its send operations and Bot API messages from history
  queries.
- Resolves the bot's observer-specific message ID.
- Calls `projectPrivateTextMessageForBot()`.

Its private storage helper both commits canonical state and returns a Bot API projection.

At the same time, `BotUpdateDeliveryService` independently resolves the observing bot, account, and
observer-specific message ID before calling the same pure projector.

The pure projector itself is reasonably well designed. It takes explicit message, participant, and
observer-numbering inputs and constructs the Bot API view. **Preserve that pure function.** The
issue is where responsibility for obtaining and applying the view lives.

### Why this boundary matters

There are two independent questions:

> What happened in the emulated conversation?

and:

> How is that occurrence represented to a particular API observer?

The canonical message model already answers the first independently. It stores an internal message
identity, conversation key, author role, timestamp, text, and entities. It does not need a Bot API
`chat` object or `message_id` to exist.

But the application command currently rejoins those responsibilities by making its successful result
a Bot API view. The domain-facing operation is therefore shaped around a particular consumer's
presentation even though canonical state and observer numbering have already been separated
underneath it.

### Recommended design

Have the messaging operation return a canonical result:

```ts
// Illustrative target contract, not a drop-in patch.
type SendPrivateTextResult =
  | {
    readonly sent: true;
    readonly message: PrivateTextMessage;
  }
  | {
    readonly sent: false;
    readonly reason: PrivateMessageFailureReason;
  };
```

Then give **bot-view assembly** an explicit owner outside that command.

For example, a `BotMessageViewReader` could obtain the relevant participant profiles and
observer-specific ID, then delegate to the existing pure projector. It could be used by the
bot-facing application boundary, admin history presentation, and update delivery.

The precise name is less important than the responsibility:

> Read canonical state and produce the supported bot-observer view. Do not create messages or decide
> whether sending is permitted.

Do not achieve this by handing repositories directly to Hono routes. Keep raw repositories private
to composition and expose suitable application queries or view capabilities.

History retrieval may remain a small query component. There is no need to adopt a full CQRS
framework merely to separate a read view from a command.

### Preserve the documented public view

The account-facing client currently documents that returned private messages use **the conversation
bot's view and numbering**, regardless of the author.

That is an explicit current contract—not automatically an observer-ID defect.

The recommendation is therefore:

> Move responsibility for producing the documented view; do not silently change which view the API
> returns.

### Preserve the canonical commit invariant

Within the private-message commit operation, keeping the following steps coordinated is sensible:

```text
Store canonical message
        |
        v
Assign participant message IDs
        |
        v
Publish message-created event
```

The existing implementation performs observer numbering before event publication. That ordering lets
update delivery project an already-numbered message.

Do not fragment those steps into unrelated services that callers must invoke correctly. That would
replace an overly broad class with an under-owned invariant.

### Recommended validation

Verify that command responses, history, and delivered updates continue to produce the documented
observer-specific view. Preserve canonical message persistence, participant numbering, and event
ordering independently of presentation changes.

### Practical outcome

Canonical messaging can evolve without carrying Bot API presentation policy. Presentation remains
consistent across responses, history, and update delivery without making HTTP routes responsible for
assembling domain state.

---

## 3. Finding SRP-04: polling coordination needs a more explicit owner

**Priority: Medium**\
**Classification: Cohesion and semantic clarity improvement**

This area requires a more nuanced judgment than simply declaring the repository or service too
large.

### Existing behavior and context

`BotApiService` is described as the application boundary for Bot API methods. It authenticates
tokens and adapts message sending, but also contains the full held-long-poll state machine:
subscription updates, offset resolution, waiting, supersession, cancellation composition, and
held-controller cleanup. See the pinned [Bot API service][bot-api-source].

A façade can legitimately expose all these operations. What is less cohesive is **the façade also
owning the detailed state machine of one particular operation family**.

### Recommended refinement

Extract the stateful polling behavior into something such as `BotUpdatePollingService`.

Its responsibility should be:

> Coordinate a bot's polling requests against its subscription and pending update queue, including
> cancellation and competing held requests.

`BotApiService` may remain a thin application façade. Its delegation to another service through an
explicit interface is not an SRP violation.

### Do not force the update queue into passive storage

`BotUpdateRepository` owns update sequencing, pending entries, acknowledgement-related removal, and
notification of waiting readers. See the pinned [update repository][bot-update-source].

That can be a coherent **stateful queue** abstraction.

The presence of `setTimeout()` does not, by itself, prove SRP failure. Separating notification from
queue mutation carelessly can introduce a coordination problem: enqueueing an update must reliably
notify the appropriate waiters.

The useful distinction is:

| Responsibility | Scope                                                                                                 |
| -------------- | ----------------------------------------------------------------------------------------------------- |
| Polling policy | Which request supersedes another, when subscriptions change, and how an API polling request proceeds. |
| Queue behavior | Retaining ordered entries, confirming entries, and making new availability observable.                |

The existing code already partially makes this distinction. The improvement is to make the policy
owner more explicit and give its lifetime a complete contract.

### Concrete naming improvement

`readPendingUpdates()` can delete confirmed updates before returning the remainder. The
implementation and comment make that clear, but the method name does not.

Prefer a name such as:

```ts
confirmAndReadPendingUpdates(...)
```

This communicates that invoking the operation can advance destructive queue state.

Do not necessarily split confirmation and reading into two calls. Keeping them together can preserve
a useful atomic operation.

### Preserve the existing behavioral distinctions

The polling tests encode important distinctions that a structural extraction must preserve:

- Negative offsets are resolved once; a newly held poll supersedes an earlier held poll, but an
  immediately answered request does not.
- Different bots poll independently.
- Ordinary request cancellation is not a competing-poller conflict.
- Ending a session answers its held polls without reporting a competing-poller conflict.

### Practical outcome

Polling-specific state and lifecycle become easier to understand, test, and close without weakening
the queue's own consistency guarantees.

---

## 4. Additional targeted refinements

These recommendations are useful, but they are not equally severe findings and do not justify a
broad rewrite.

### 4.1 Put contracts with the responsibility that owns them

Dependency injection is generally explicit, and several consumers already declare narrow interfaces.

However:

- `ChatInteractionService` imports registration-result contracts from the concrete chat repository
  module.
- `VirtualUserService` imports identity reservation contracts from the identity repository module.
- `BotApiService` separately restates the bot-message sending result shape.

As the services are split, move important command and storage-capability contracts into modules
owned by their domain or application boundary.

This is a **module ownership and dependency-direction refinement**, not a claim that type-only
imports create a runtime dependency bug.

Do not centralize every structurally similar interface. Two small `AccountLookup` interfaces may be
valid consumer-owned contracts. Identical syntax alone does not establish shared responsibility.

### 4.2 Clarify what “activate private conversation” means

`activatePrivateConversation()` establishes a conversation without storing a message or publishing a
message-created event. Its tests exercise that behavior directly.

That can be valid, but the conceptual category should be explicit:

| Category                   | Meaning                                                     |
| -------------------------- | ----------------------------------------------------------- |
| Fixture setup              | Establish initial conditions.                               |
| Simulated user interaction | Perform an action with its modeled observable consequences. |

Document and name the operation according to whichever role is intended. Do not make a fixture
helper look like a simulated “start conversation” action if it deliberately omits that action's
observable effects.

This does not require an entire `ScenarioSetupService` today. A clearly named, separately exposed
setup capability may be enough.

### 4.3 Keep the SDK independent while maintaining wire-contract alignment

The TypeScript client has its own response types and schemas. Its request utilities own HTTP
execution, response validation, and client error construction. That is a sensible client boundary.

Do not make the SDK import server services or repositories simply to remove duplication.

As contracts grow, use an explicitly owned wire-contract layer or contract tests to keep the two
sides aligned. This is different from sharing canonical domain objects.

The client's `utils.ts` is largely an HTTP transport module despite its generic name. Renaming it
accordingly would communicate its responsibility better; splitting each helper into a separate
service would not.

---

## 5. Existing boundaries worth preserving

An aggressive “SRP cleanup” could make several parts of this code worse. Preserve the following
foundations.

### 5.1 The composition root

`createEmulationSession()` constructs repositories and wires services. Having many dependencies
there is appropriate: **assembling the object graph is its responsibility**.

Keep construction out of the individual services.

### 5.2 Three distinct identity concepts

Canonical message identity, observer-specific Telegram message numbering, and Bot API update
sequencing are represented separately.

These are different concepts and should remain different owners. Do not consolidate them into a
generic message counter or merge canonical storage into the pending update queue.

### 5.3 Event-to-update delivery

`BotUpdateDeliveryService` selects whether an event produces an update, applies subscription rules,
projects it, and enqueues it.

That is a coherent application responsibility:

> Translate domain occurrences into bot-deliverable updates.

Subscription filtering does not control canonical message existence. Its orchestration is not a
reason to split it into a service for each step.

### 5.4 Shared identity allocation and username uniqueness

`TelegramIdentityRepository` coordinates ID allocation and username reservations across identity
kinds. Those operations protect a shared namespace invariant.

Do not split account and bot allocation into unrelated authorities merely because accounts and bots
are different types.

Similarly, `VirtualUserService` handling both account and bot provisioning is defensible at its
current size and scope.

### 5.5 HTTP decoding outside domain operations

The separate Bot API request decoder handles transport encodings and parameter extraction, while
routes validate method parameters and render responses.

Retain this boundary. Moving those concerns into message repositories or canonical domain objects
would be a regression.

### 5.6 The pure message projector

Preserve `projectPrivateTextMessageForBot()` as a pure projection function with explicit inputs.
Move responsibility for assembling those inputs; do not replace the pure function with a stateful
object unnecessarily.

---

## 6. Proposed ownership model

The target is the following ownership model—not necessarily one class for every row.

| Owner                                 | Responsibility                                                           |
| ------------------------------------- | ------------------------------------------------------------------------ |
| Virtual-user provisioning             | Create accounts and bots against the shared identity authority.          |
| Shared-chat administration            | Create shared chats and manage supported membership changes.             |
| Private messaging                     | Execute valid private-message interactions and commit canonical effects. |
| Message queries and bot-view assembly | Read history and produce the documented observer-specific presentation.  |
| Update delivery                       | Translate domain events into subscribed bot updates.                     |
| Update polling                        | Coordinate polling requests, supersession, and cancellation.             |
| HTTP adapters                         | Decode requests, invoke capabilities, and render protocol responses.     |

The key invariants remain deliberately grouped:

| Invariant                                                                         | Appropriate ownership                                          |
| --------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| Shared-chat creation establishes intended ownership and initial participation     | Shared-chat administration and its shared-chat state boundary. |
| A committed message has participant numbering before observers receive its event  | Canonical private-message commit operation.                    |
| A pending update queue remains ordered and wakes the appropriate waiters          | Stateful update queue.                                         |
| Bot-facing projections use the documented observer's numbering and representation | Explicit bot-view assembly plus the pure projector.            |
| IDs and usernames respect the shared namespace                                    | Shared identity authority.                                     |

## 7. Recommended implementation sequence

Use separate, reviewable changes rather than one repository-wide redesign.

### PR 1: move Bot API view assembly out of canonical message commands

Return canonical results from private-message operations and apply the documented bot view at the
appropriate application/query boundary.

**Acceptance criteria:** command responses, history, and updates remain consistent with the current
public bot-view contract; canonical message storage, participant numbering, and event ordering
remain coordinated.

### PR 2: extract polling coordination and clarify queue operation names

Move the detailed held-poll state machine behind an explicit polling capability while retaining
cohesive queue behavior.

**Acceptance criteria:** existing polling semantics remain intact, including supersession behavior,
independent bots, negative-offset handling, and cancellation-cause distinctions.

Move contracts and improve naming alongside the relevant extraction rather than performing an
unrelated repository-wide directory reorganization.

## 8. Validation and limitations

The original review inspected source through the GitHub connector and made no repository changes.

The complete Deno suite and Fallow analysis were **not run**. In the original review environment,
Deno was unavailable and direct repository cloning was blocked by network resolution.

Consequently:

- The SRP recommendations are architectural judgments grounded in the reviewed component
  responsibilities and representative tests; they are not all claims of runtime failure.
- Proposed abstractions and acceptance criteria are recommendations, not completed or fully tested
  patches.

## Conclusion

**Organize around owned invariants and distinct policies, not around broad nouns such as “chat” or a
rule that every service must be a leaf.**

The canonical-state, observer-numbering, and event-delivery foundations are worth keeping. The
highest-value work is ensuring that producing a Bot API view is not part of committing canonical
domain state.

---

## Appendix: source and evidence guide

### Pinned repository references

All repository observations concern [commit `d0f166d212990d1594ef8530bf13eb47f9390308`][snapshot].
The following source files are central to the polling findings:

| Source                                                | Relevance                                                                              |
| ----------------------------------------------------- | -------------------------------------------------------------------------------------- |
| [`src/repositories/bot_update.ts`][bot-update-source] | Pending update state, waiting, timers, and cancellation cleanup.                       |
| [`src/services/bot_api.ts`][bot-api-source]           | Held polling, supersession, request cancellation, and Bot API façade responsibilities. |

### Additional inspected components identified by symbol

| Finding or assessment               | Relevant components and tests                                                                                                                                                |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Canonical state versus presentation | `PrivateTextMessage`, `ChatInteractionService`, `projectPrivateTextMessageForBot`, `BotUpdateDeliveryService`, observer message numbering, client private-message contracts. |
| Polling semantics                   | `BotApiService`, `BotUpdateRepository`, polling tests covering offsets, supersession, cancellation, and bot isolation.                                                       |
| Identity and provisioning           | `TelegramIdentityRepository`, `VirtualUserService`.                                                                                                                          |
| Adapter and client boundaries       | Bot API request decoder, HTTP routes, TypeScript client response schemas and request utilities.                                                                              |

### SRP reference

Robert C. Martin, [“The Single Responsibility Principle,” May 8, 2014][srp-reference]. This
reference supports the interpretation of responsibility used in the review; repository-specific
findings are based on the pinned source.

[snapshot]: https://github.com/KnightNiwrem/grammy-testing/tree/d0f166d212990d1594ef8530bf13eb47f9390308
[bot-update-source]: https://github.com/KnightNiwrem/grammy-testing/blob/d0f166d212990d1594ef8530bf13eb47f9390308/src/repositories/bot_update.ts
[bot-api-source]: https://github.com/KnightNiwrem/grammy-testing/blob/d0f166d212990d1594ef8530bf13eb47f9390308/src/services/bot_api.ts
[srp-reference]: https://blog.cleancoder.com/uncle-bob/2014/05/08/SingleReponsibilityPrinciple.html
