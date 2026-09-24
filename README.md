# grammY Testing

An HTTP server for emulating the Telegram Bot API in end-to-end tests. The server will expose both
the emulated Bot API and an admin API for controlling isolated test sessions.

The standalone server currently supports creating and ending isolated test sessions, adding virtual
bots and accounts, sending private text messages as an account, inspecting private conversation
history, and receiving account messages through the Bot API `getUpdates` method, which honors its
`allowed_updates` subscription. As on Telegram, a bot has at most one waiting long poll: a newer one
ends the earlier request with a `409 Conflict`, so tests notice when two bot instances poll at once.
Ending a session answers its bots' waiting long polls at once, without updates. Bots reply with the
Bot API `sendMessage` method, which sends plain text to an account that has written to the bot;
formatting and keyboards are not supported yet. Replies appear in conversation history, and, as on
Telegram, the bot receives no update for them. With `deleteWebhook` and `getMe` also implemented, a
grammY bot can run with `bot.start()` and stop with `bot.stop()`. As Telegram does in private chats
with bots, the emulator marks bot commands such as `/start` with `bot_command` entities, so
framework command handlers match them; other entity types are not detected yet. Bot API requests
follow Telegram's conventions: GET or POST, case-insensitive method names, and parameters in the
query string or a JSON, URL-encoded, or multipart body. Bot API failures, including calls to methods
the emulator does not implement, return Telegram-shaped JSON errors that clients report as API
errors. The session creation response identifies its Bot API root. Other routes described in
`openapi.yaml` are not implemented yet.

## TypeScript client

Tests can use the TypeScript client instead of constructing emulation server URLs directly:

```ts
import { TelegramEmulationClient } from './clients/typescript/mod.ts';

const emulator = new TelegramEmulationClient('http://localhost:8081');
const session = await emulator.createSession();

try {
  const { token, bot } = await session.createBot({
    first_name: 'Test Bot',
    username: 'test_bot',
  });
  const { account } = await session.createAccount({ first_name: 'Ada' });

  const incomingMessage = await account.sendMessage({
    to: { type: 'private', botId: bot.id },
    text: 'Hello!',
  });

  // Run a grammY bot with token and session.botApiRoot as its apiRoot. Its polling
  // receives the message above, and its replies appear in the stored history.
  const history = await account.getMessages({
    chat: { type: 'private', botId: bot.id },
  });
  console.log(token, session.botApiRoot, incomingMessage, history);
} finally {
  await session.end();
}
```

## Commands

- `deno task start` — start the server using the environment described below
- `deno task dev` — start the server with file watching
- `deno task test` — run tests
- `deno task lint` — lint files
- `deno task fmt` — format files
- `deno task fmt:check` — check formatting
- `deno task check` — type-check source and test files

## Environment

- `DOMAIN` — domain advertised to clients; defaults to `localhost`
- `PORT` — listening and advertised port; defaults to `8081`
