# grammY Testing

An HTTP server for emulating the Telegram Bot API in end-to-end tests. The server will expose both
the emulated Bot API and an admin API for controlling isolated test sessions.

The standalone server currently supports creating an isolated test session with `POST /sessions`.
The response identifies the session and its future Bot API root. Other routes described in
`openapi.yaml` are not implemented yet.

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
