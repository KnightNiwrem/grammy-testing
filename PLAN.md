# Plan: Telegram Bot API emulation server, minimal first step

This document records the design of the first implementation step and the reasoning behind its
decisions. The README describes how to use the result; this file explains why it is shaped the way
it is, so later steps can extend it without re-deriving the constraints.

## Context

The goal is an end-to-end testing tool for Telegram bots: a standalone emulation server that
impersonates the Bot API, plus a client library that tests import to create an isolated session,
declare entities, and point the bot under test at the session's fake API root.

The first step covers only the smallest complete flow. A test creates a session, declares a bot, a
user, and a private chat whose members are that user and that bot. The bot (for example a grammY
bot) then sends a message to that chat through the emulated API and receives a Telegram-shaped
`Message` back.

## Decisions

- **The server is standalone only.** Tests connect to an already-running server by URL. There is no
  in-process "start server" helper. Unit tests reach the handler directly through a `fetch` override
  instead, which needs no socket.
- **Emulated methods are `sendMessage`, `getMe`, `deleteWebhook`, and `getUpdates`.** `getMe` makes
  `bot.init()` work in grammY. `bot.start()` additionally calls `deleteWebhook` and then long-polls
  `getUpdates`, so both are stubbed: `deleteWebhook` always answers `true`, and `getUpdates` holds
  the response for `timeout` seconds or until the client aborts the request, then answers an empty
  batch. No update is ever produced and `offset` is ignored; update generation and delivery are
  future work. Every other method answers a Telegram-style `404 Not Found` envelope.
- **Membership lives on the Chat record, not on the session.** Members are declared when the chat is
  created. Adding a member mid-test is a later feature, but the `memberIds` set on the record is the
  seam that operation will mutate. For private chats the client takes `{ user, bot }`, because a
  private chat has exactly those two parties and no roles. When group chats arrive, their creation
  options should carry roles from the start, along the lines of `{ owner, admins, members }`, so
  that privilege handling can be added without changing the signature.
- **Messages belong to the Chat record.** Every Telegram `Message` carries a `chat`; nothing
  chat-less is a `Message`. Message ids are sequential per chat.
- **Chat ids are unrelated to user ids.** Telegram does not guarantee that a private chat's id
  equals the user's id, so the server never makes them match. User ids and chat ids come from two
  independent random draws over the documented identifier range (positive integers of at most 52
  significant bits, `1 .. 2^52 - 1`). A match would be pure coincidence. This tightens the code
  under test by making the convention unavailable to rely on. No entity accepts a tester-supplied
  id; explicit ids can be added for users and chats together if a concrete test needs them.
- **The session generates bot tokens.** `createBot` returns a `<bot id>:<35 char secret>` token. One
  session may hold several bots.
- **Returned client objects are handles.** `TestBot`, `TestUser`, and `TestChat` carry the raw
  Telegram object plus the operations that concern that entity, so a test writes
  `chat.listMessages()` rather than `session.listMessages(chat.id)`.
- **grammY resolves from jsdelivr at a semver range.** Both `grammy` and `grammy/types` map to
  `https://cdn.jsdelivr.net/gh/grammyjs/grammY@^1.46.0/src/...`. Types are imported through grammY's
  own `src/types.ts` rather than the types repository directly, so the Telegram shapes stay in
  lockstep with the grammY version under test. The floor is 1.46.0 because earlier releases resolved
  their dependencies from deno.land/x. The lockfile is disabled because Deno records a content hash
  per remote URL, which a floating range would invalidate on every grammY release.

## Routing model

grammY builds every request URL as `${apiRoot}/bot${token}/${method}`. A session's API root is
therefore `${serverUrl}/bot-api/${sessionId}`, and a test passes it through
`new Bot(token, { client: { apiRoot } })`. The session id is a random UUID and doubles as the path
prefix that isolates sessions from each other.

## Architecture

```
src/
  main.ts                    server entry: Deno.serve on PORT (default 8081)
  server/
    handler.ts               createEmulationServerHandler(store) → (Request) => Promise<Response>
    admin_routes.ts          session and entity lifecycle endpoints (JSON in/out)
    bot_api_routes.ts        /bot-api/:sessionId/bot:token/:method, payload decoding, envelope
    bot_api_methods.ts       getMe and sendMessage against a Session
    session_store.ts         SessionStore, Session, BotRecord, ChatRecord (memberIds, messages)
    telegram_error.ts        TelegramApiError and the { ok: false } envelope
  client/
    mod.ts                   EmulationClient and TestSession
    handles.ts               TestBot, TestUser, TestChat
    admin_transport.ts       HTTP transport for the admin API
  shared/
    admin_protocol.ts        request and response types shared by client and server
tests/
  session_store_test.ts      entity creation, token format, membership, message ids
  bot_api_handler_test.ts    handler(new Request(...)): envelope, errors, sendMessage flow
  client_test.ts             client wired to the handler through its fetch option
  e2e_grammy_test.ts         real grammY bot; in-process always, standalone when
                             BOT_API_EMULATOR_URL is set
```

## Admin protocol

| Method | Path                                                  | Body                                       | Response                 |
| ------ | ----------------------------------------------------- | ------------------------------------------ | ------------------------ |
| POST   | `/admin/sessions`                                     | –                                          | `{ sessionId, apiRoot }` |
| DELETE | `/admin/sessions/:id`                                 | –                                          | 204                      |
| POST   | `/admin/sessions/:id/bots`                            | `{ username, first_name }`                 | `{ token, user }`        |
| POST   | `/admin/sessions/:id/users`                           | `{ first_name, last_name?, username? }`    | `User`                   |
| POST   | `/admin/sessions/:id/chats`                           | `{ type: 'private', user_id, member_ids }` | `{ chat, member_ids }`   |
| GET    | `/admin/sessions/:id/chats/:chatId/messages?from_id=` | –                                          | `Message[]`              |

Input is validated at the boundary: unknown session or chat answers 404, malformed bodies and
inconsistent entity definitions answer 400 with `{ error }`.

## Emulated Bot API

- Payload decoding merges query parameters with a JSON, URL-encoded, or multipart body. Only string
  form fields are decoded.
- Success answers `{ ok: true, result }`. Failure answers `{ ok: false, error_code, description }`
  with the HTTP status equal to `error_code`, as Telegram does.
- Error wording follows Telegram: unknown session or method `404 Not Found`, unknown token
  `401 Unauthorized`, missing `chat_id` `400 Bad Request: chat_id is empty`, unknown chat
  `400 Bad Request: chat not found`, empty text `400 Bad Request: message text is empty`, bot not a
  member of the private chat `403 Forbidden: bot can't initiate conversation with a user`.

## Client usage

```ts
const client = new EmulationClient({ serverUrl: 'http://localhost:8081' });
const session = await client.createSession();
const bot = await session.createBot({ username: 'test_bot', first_name: 'Test' });
const user = await session.createUser({ first_name: 'Alice' });
const chat = await session.createPrivateChat({ user, bot });
const sent = await chat.listMessages({ fromId: bot.id });
await session.destroy();
```

## Verification performed

1. `deno task fmt:check`, `deno task lint`, and `deno task check` pass.
2. `deno task test` without the environment variable: 17 tests pass, the standalone test is ignored.
3. With `deno task serve` running and `BOT_API_EMULATOR_URL` set, the standalone grammY test passes:
   `bot.init()` is served by `getMe`, `sendMessage` returns the stored message, and
   `chat.listMessages()` matches it.
4. A curl smoke test confirmed a 200 for a chat containing the bot, the 403 envelope for a chat
   without it, and 204 on session delete.

## Known limitations of this step

- Only private chats, only text messages, only `getMe`, `sendMessage`, and the polling stubs.
- A polling bot never receives an update; `getUpdates` only idles and answers an empty batch.
- Chat membership can only be declared at creation, and the client cannot declare a private chat
  without the bot; the `403 Forbidden` path is covered at the handler level only.
- Several bots sharing a private chat with the same user is not validated.
- Uploads are ignored.
