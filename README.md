# grammy-testing

An end-to-end testing tool for Telegram bots built with [grammY](https://grammy.dev): a standalone
server that emulates the Bot API, plus a client library that tests use to create an isolated
session, act as simulated users, and observe the bot's behavior.

The project is in its design phase. The intended usage — and the requirements it implies for the
emulator — are being worked out as example tests in [examples/](examples/README.md); the
implementation follows from them.

## Commands

- `deno task start` — run `src/main.ts`
- `deno task dev` — run `src/main.ts` with file watching
- `deno task test` — run tests
- `deno task lint` — lint files
- `deno task fmt` — format files
- `deno task fmt:check` — check formatting
- `deno task check` — type-check `src/` and the design examples in `examples/`
