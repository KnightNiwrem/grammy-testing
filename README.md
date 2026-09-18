# grammy-testing

An emulation server for the Telegram Bot API, built for end-to-end testing of Telegram bots. A test
opens an isolated session on the server, declares the bots, users, and chats that should exist, and
points the bot under test at the session's API root instead of `https://api.telegram.org`. The bot
then talks to the emulator exactly as it would talk to Telegram.

The project is at its first, deliberately minimal step. It emulates enough for one flow: a bot sends
a text message to a private chat it is a member of and receives a Telegram-shaped `Message` back.

## Running the server

```sh
deno task serve            # listens on http://localhost:8081
PORT=9000 deno task serve  # or any other port
```

The server keeps all state in memory. Every session is namespaced under its own randomly generated
path, so many tests can run against one server without seeing each other's entities.

| Path                                        | Purpose                                                                   |
| ------------------------------------------- | ------------------------------------------------------------------------- |
| `/admin/sessions` and below                 | Creating and destroying sessions, declaring entities, inspecting messages |
| `/bot-api/<session id>/bot<token>/<method>` | The emulated Bot API for one session                                      |

## Writing a test

Import the client, open a session, declare entities, then construct the bot with the session's
`apiRoot`. The example uses grammY, but any Bot API client that lets you change the API root works.

```ts
import { Bot } from 'grammy';
import { EmulationClient } from './src/client/mod.ts';

const client = new EmulationClient({ serverUrl: 'http://localhost:8081' });
const session = await client.createSession();

const testBot = await session.createBot({ username: 'test_bot', first_name: 'Test' });
const alice = await session.createUser({ first_name: 'Alice' });
const chat = await session.createPrivateChat({ user: alice, bot: testBot });

const bot = new Bot(testBot.token, { client: { apiRoot: session.apiRoot } });
await bot.init(); // served by the emulated getMe
const sent = await bot.api.sendMessage(chat.id, 'hello');

console.log(await chat.listMessages()); // [sent]
await session.destroy();
```

Membership is stored on the chat. A private chat created through the client always contains both the
user and the bot, which corresponds to the user having started the bot.

### Emulated methods

- `getMe`: returns the bot declared with `createBot`.
- `sendMessage`: requires `chat_id` and non-empty `text`; the bot must be a member of the chat.
  Returns the stored `Message` with a per-chat sequential `message_id`.

Any other method answers `404 Not Found` in Telegram's `{ ok: false, error_code, description }`
envelope. Unknown tokens answer `401 Unauthorized`.

### Identifiers

User ids and chat ids are drawn independently from the range Telegram documents (positive integers
of at most 52 bits). A private chat's id is therefore unrelated to its user's id. Telegram does not
guarantee that these match, and the emulator makes sure tests cannot accidentally depend on it.

## Current limitations

- Only private chats, only text messages, only `getMe` and `sendMessage`.
- Chat membership can only be declared when the chat is created. The client cannot yet declare a
  private chat the bot is not a member of, so the `403 Forbidden` path is only reachable through the
  admin API directly.
- Declaring several bots in a private chat with the same user is not validated.
- Uploads (multipart file fields) are ignored; only string form fields are decoded.

## Development

```sh
deno task test        # unit tests plus an in-process grammY flow
deno task check       # type-check src/ and tests/
deno task lint
deno task fmt:check
```

The end-to-end test against a real standalone server runs only when `BOT_API_EMULATOR_URL` is set:

```sh
deno task serve &
BOT_API_EMULATOR_URL=http://localhost:8081 deno task test
```

grammY and its types are imported from jsdelivr at `^1.46.0`; the lockfile is disabled because the
semver range resolves to a new release over time.
