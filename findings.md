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

## Executive assessment

**The architecture has a sound foundation, but several boundaries are broader than their names
suggest.** The main issue is not a shortage of classes or files. Some components own policies that
should be independently understandable and changeable.

| Priority  | Finding and recommendation                                                                       | Nature of the finding                                  |
| --------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------ |
| **Lower** | Improve ownership of application contracts and distinguish fixture setup from simulated actions. | Targeted refinements, not reasons for a large rewrite. |

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

## 2. Targeted refinements

These recommendations are useful, but they are not equally severe findings and do not justify a
broad rewrite.

### 2.1 Put contracts with the responsibility that owns them

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

### 2.2 Clarify what “activate private conversation” means

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

### 2.3 Keep the SDK independent while maintaining wire-contract alignment

The TypeScript client has its own response types and schemas. Its request utilities own HTTP
execution, response validation, and client error construction. That is a sensible client boundary.

Do not make the SDK import server services or repositories simply to remove duplication.

As contracts grow, use an explicitly owned wire-contract layer or contract tests to keep the two
sides aligned. This is different from sharing canonical domain objects.

The client's `utils.ts` is largely an HTTP transport module despite its generic name. Renaming it
accordingly would communicate its responsibility better; splitting each helper into a separate
service would not.

---

## 3. Existing boundaries worth preserving

An aggressive “SRP cleanup” could make several parts of this code worse. Preserve the following
foundations.

### 3.1 The composition root

`createEmulationSession()` constructs repositories and wires services. Having many dependencies
there is appropriate: **assembling the object graph is its responsibility**.

Keep construction out of the individual services.

### 3.2 Three distinct identity concepts

Canonical message identity, observer-specific Telegram message numbering, and Bot API update
sequencing are represented separately.

These are different concepts and should remain different owners. Do not consolidate them into a
generic message counter or merge canonical storage into the pending update queue.

### 3.3 Event-to-update delivery

`BotUpdateDeliveryService` selects whether an event produces an update, applies subscription rules,
projects it, and enqueues it.

That is a coherent application responsibility:

> Translate domain occurrences into bot-deliverable updates.

Subscription filtering does not control canonical message existence. Its orchestration is not a
reason to split it into a service for each step.

### 3.4 Shared identity allocation and username uniqueness

`TelegramIdentityRepository` coordinates ID allocation and username reservations across identity
kinds. Those operations protect a shared namespace invariant.

Do not split account and bot allocation into unrelated authorities merely because accounts and bots
are different types.

Similarly, `VirtualUserService` handling both account and bot provisioning is defensible at its
current size and scope.

### 3.5 HTTP decoding outside domain operations

The separate Bot API request decoder handles transport encodings and parameter extraction, while
routes validate method parameters and render responses.

Retain this boundary. Moving those concerns into message repositories or canonical domain objects
would be a regression.

### 3.6 The pure message projector

Preserve `projectPrivateTextMessageForBot()` as a pure projection function with explicit inputs. Do
not replace the pure function with a stateful object unnecessarily.

---

## 4. Proposed ownership model

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

## 5. Validation and limitations

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

The canonical-state, observer-numbering, and event-delivery foundations are worth keeping.

---

## Appendix: source and evidence guide

### Pinned repository references

All repository observations concern [commit `d0f166d212990d1594ef8530bf13eb47f9390308`][snapshot].

### Inspected components identified by symbol

| Finding or assessment         | Relevant components and tests                                                                   |
| ----------------------------- | ----------------------------------------------------------------------------------------------- |
| Identity and provisioning     | `TelegramIdentityRepository`, `VirtualUserService`.                                             |
| Adapter and client boundaries | Bot API request decoder, HTTP routes, TypeScript client response schemas and request utilities. |

### SRP reference

Robert C. Martin, [“The Single Responsibility Principle,” May 8, 2014][srp-reference]. This
reference supports the interpretation of responsibility used in the review; repository-specific
findings are based on the pinned source.

[snapshot]: https://github.com/KnightNiwrem/grammy-testing/tree/d0f166d212990d1594ef8530bf13eb47f9390308
[srp-reference]: https://blog.cleancoder.com/uncle-bob/2014/05/08/SingleReponsibilityPrinciple.html
