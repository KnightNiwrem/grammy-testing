# grammY Testing

An HTTP server for emulating the Telegram Bot API in end-to-end tests. The server will expose both
the emulated Bot API and an admin API for controlling isolated test sessions.

The standalone server currently supports creating and ending isolated test sessions, adding virtual
bots and accounts to them, and calling the Bot API `getMe` method for a virtual bot. The session
creation response identifies its Bot API root. Other routes described in `openapi.yaml` are not
implemented yet.

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

  // Configure grammY with token and session.botApiRoot.
  console.log(token, bot, account, session.botApiRoot);
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
