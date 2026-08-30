# reaction-change-capture Specification

## Purpose

Requirements for capturing outgoing `setMessageReaction` attempts as normalized global
and per-chat projections without conflating them with reaction-moderation removals or
synthetic incoming updates.

## Requirements

### Requirement: Reaction changes are captured globally and per chat

The system SHALL record every captured `setMessageReaction` call in dispatch order in
`chats.reactionChanges`. When the target chat is registered, the same `ReactionChange`
record SHALL also appear in `chat.reactionChanges`. Each record SHALL expose `chatId`,
`messageId`, `reaction`, `isBig`, `reply`, and `raw`. `reply` SHALL resolve through the
chat-scoped `(chat_id, message_id)` reply registry when the target is a bot message
captured during the test, and SHALL otherwise be `undefined`.

#### Scenario: Registered-chat reaction is projected globally and locally

- **WHEN** the bot calls `setMessageReaction` for a registered chat
- **THEN** `chats.reactionChanges.length` increases by `1`
- **AND** `chat.reactionChanges.length` increases by `1`
- **AND** both logs contain the same `ReactionChange` object

#### Scenario: Captured bot reply is resolved

- **WHEN** the bot sends a reply and then targets its `(chat_id, message_id)` with `setMessageReaction`
- **THEN** the reaction-change record's `reply` is that captured `Reply` object

#### Scenario: Unregistered-chat reaction remains globally observable

- **WHEN** the bot calls `setMessageReaction` for an unregistered chat
- **THEN** the call appears in `chats.reactionChanges`
- **AND** its `reply` is `undefined`
- **AND** the normal unregistered-chat warning policy applies

### Requirement: Reaction payloads model replacement semantics

The `reaction` field SHALL represent the bot's complete replacement reaction set from the
outgoing payload, not an additive delta. When the payload omits `reaction`, the normalized
record SHALL expose an empty array. `is_big` SHALL be normalized as `isBig`. The original
payload SHALL remain available as `raw`.

#### Scenario: Omitted reactions mean an empty replacement set

- **WHEN** the bot calls raw `setMessageReaction` without a `reaction` field
- **THEN** the captured record's `reaction` equals `[]`

### Requirement: Capture records attempts without simulating reaction state

Reaction-change records SHALL be appended at capture time even when the mocked API call
later fails. Capturing `setMessageReaction` SHALL NOT synthesize an incoming
`message_reaction` update and SHALL NOT merge with `chats.reactionRemovals`, because the
latter models moderation of another actor's reactions.

#### Scenario: Failed calls remain assertable

- **WHEN** `setMessageReaction` is configured to fail
- **THEN** the returned API promise rejects
- **AND** the attempted change remains present in the global and registered-chat logs

### Requirement: Reaction-change logs can be cleared

`ReactionChangesLog` SHALL expose `.length`, `.last`, `.all`, `.lastOrThrow()`, and
`.clear()`. Calling `chats.clear()` SHALL empty the orchestrator-wide log and every
registered chat's scoped log while preserving the chat actors.

#### Scenario: chats.clear resets reaction-change projections

- **WHEN** reaction changes have been captured globally and for a registered chat
- **AND** the test calls `chats.clear()`
- **THEN** both `chats.reactionChanges.length` and `chat.reactionChanges.length` equal `0`
