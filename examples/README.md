# Examples: the testing library, designed from usage

This folder is a design artifact, not documentation of shipped behavior. It exists because the first
implementation attempt (PR #1) started from simulated-world entities and ran into design questions —
above all "what is a private chat?" — that entity modeling alone could not answer. This attempt
inverts the direction: first write the tests a bot author would actually want to write, then read
the constraints and requirements for the simulated world off those tests.

## How to read this folder

- Each numbered example is a complete, realistic test of a real grammY bot. The bot code in each
  file is the _system under test_; everything imported from [grammy_testing.ts](grammy_testing.ts)
  is the _library being designed_.
- [grammy_testing.ts](grammy_testing.ts) is the API surface the examples forced into existence:
  types plus entry points that throw `NotImplementedError`. Nothing in it was invented ahead of need
  — if an export has no example using it, it should not be there.
- [REQUIREMENTS.md](REQUIREMENTS.md) distills what the examples demand of the emulator, including
  the decisions that settle the private-chat questions left open by the first attempt.

The examples type-check as part of `deno task check`, which keeps the usage and the API sketch
consistent with each other and with real grammY types. They are not runnable — the library does not
exist yet. When it does, they become its acceptance tests.

## The examples

| Example                                                                | Establishes                                                                                                |
| ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| [01_echo_reply.ts](01_echo_reply.ts)                                   | The core loop: build a world, run a real bot against it, act as a user, await the reply race-free.         |
| [02_inline_keyboard_callbacks.ts](02_inline_keyboard_callbacks.ts)     | Button taps as user actions on received messages; observing `answerCallbackQuery` and message edits.       |
| [03_private_chat_boundaries.ts](03_private_chat_boundaries.ts)         | The private-chat model: (user, bot) pair ownership, user-only initiation, chat id = user id, blocking.     |
| [04_group_membership.ts](04_group_membership.ts)                       | Groups grow by actions; roles and promotion; privacy-mode delivery; moderation observed via member status. |
| [05_multi_turn_dialogue.ts](05_multi_turn_dialogue.ts)                 | Stateful dialogues need only ordered delivery per chat; concurrent conversations stay independent.         |
| [06_introspection_and_isolation.ts](06_introspection_and_isolation.ts) | The admin surface beyond Telegram: the recorded API call log, hermetic sessions, structural cleanup.       |

## Conventions the examples settled on

- **Actors act, chats observe.** World changes are phrased as actions of a simulated user, because
  actions are what synthesize updates for the bot. Chat handles only address and observe.
- **Every action returns its artifact**, and every wait anchors on one (`after: sent`, `of: menu`).
  Tests contain no sleeps and no polling loops of their own.
- **Assertions read Telegram shapes** (`Message`, `ChatMember` from `grammy/types`), so a test reads
  like the Bot API documentation rather than like this library's internals.
- **Cleanup is structural**: sessions and running bots are `await using` resources.
