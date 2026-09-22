# Code readability review

Overall the codebase is in good shape: small files, explicit types, a consistent `XRepository` /
`createXRoutes` / `CreateXInput` vocabulary, and a deliberate rule of keeping Telegram wire fields
in `snake_case` while TypeScript code stays `camelCase`. The findings below are the places where
that consistency breaks down, produced with support from Fallow (`dead-code`, `dupes`, `health`).

## Naming

### 1. `EmulationSession` names two different shapes

`src/repositories/session.ts:8`, `clients/typescript/types.ts:2` — server-side it's the aggregate of
`AccountRepository`/`BotRepository`; client-side it's the wire DTO `{ id, botApiRoot }`. Both names
are locally sensible, but anyone reading across the boundary (which the client tests do) meets one
word with two meanings. Renaming the client DTO to something like `EmulationSessionInfo` /
`CreatedEmulationSession` would keep the wire role explicit.

### 2. Asymmetric result field names: `CreatedVirtualBot.bot` vs `CreatedVirtualAccount.account`

`clients/typescript/types.ts:29-52` — both fields hold a _profile_, but one is named after the
entity and implies it includes the token while sitting next to `token`. This mirrors the server-side
wrapper asymmetry (`VirtualBot` = token + profile, `VirtualAccount` = profile only). Naming both
response fields `bot`/`account` is defensible, but then the server wrappers earn their keep; right
now the two sides use the same words (`VirtualAccount`, `VirtualBotProfile`) for different
structures, which is the confusing part.

### 3. "identity" vs "user" vocabulary inside `TelegramIdentityRepository`

`src/repositories/telegram_identity.ts` — the public API says "identity" (`reserveIdentity`,
`IdentityReservationResult`) while internals say "user" (`#nextUserId`, `MAX_TELEGRAM_USER_ID`). The
IDs genuinely are Telegram user IDs, so either rename internals to `#nextIdentityId` or — arguably
better — rename the repository concept to the Telegram term (`TelegramUserIdAllocator`-style), since
"identity" adds a third synonym next to "user" and "account".

### 4. Minor: `main.ts:16` assigns the result of `.start()` to `server`

That's the raw `Deno.HttpServer`, not the `TelegramEmulationServer`, which is discarded. Same
shadowing pattern in `tests/server_test.ts:4`. A name like `httpServer` would distinguish the two.

## Placement and boundaries

The layering is otherwise clean: `main` → `config`/`api` → `sessions` routes → repositories →
virtual entities, with no upward imports. Three spots worth attention:

### 5. `config.ts` imports `DEFAULT_PORT` from `server.ts`

`src/config.ts:3` — configuration depends on the HTTP listener module, which inverts the expected
direction (server is the outermost layer). Also, port-range validation now lives in _two_ places:
the zod schema in `config.ts:9` and the `RangeError` check in `server.ts:18`. Moving `DEFAULT_PORT`
(and the port-range knowledge) into `config.ts`, or a small shared constants module, would give one
owner.

### 6. `repositories/session.ts` holds two concepts

`src/repositories/session.ts` — `EmulationSession` (the per-session aggregate root wiring the
repositories together) and `SessionRepository` (the collection of sessions). The file name only
advertises the second. It's small enough that this is not urgent, but `emulation_session.ts` +
`repositories/session.ts` would make the boundary match the names — especially since
`EmulationSession` is imported by name from three route files and `session_route_variables.ts`.

### 7. Failure-reason → HTTP-status mapping is duplicated

`src/api/sessions/accounts/mod.ts:32`, `src/api/sessions/bots/mod.ts:30` —
`result.reason === 'username_taken' ? 409 : 507` is shared knowledge (the HTTP contract for
`IdentityReservationFailureReason`) copy-pasted in both route files, along with the identical
12-line JSON-parse-and-validate preamble. If a third reason is ever added, both sites must change in
lockstep — a small shared helper in `src/api/sessions/` would own that mapping once.

### 8. Client `utils.ts` and `constants.ts` are grab-bags

`clients/typescript/utils.ts`, `constants.ts` — `utils.ts` mixes URL validation (`normalizeUrlRoot`)
with the whole HTTP request pipeline; `constants.ts` mixes HTTP status codes with a Telegram domain
limit. Renaming `utils.ts` to `http_requests.ts` and grouping the constants by domain would make the
client module boundaries as clear as the server's.

## Fallow triage (signal vs noise)

Fallow ran successfully but does not read Deno import maps (it looks for `package.json`), so its
import graph is partially blind:

- **False positives**: `AccountRepository.create` "unused class member" — it's called at
  `src/api/sessions/accounts/mod.ts:30` via Hono's typed context, which the analyzer can't trace.
  The 10 "unused type exports" in `clients/typescript/mod.ts` are the library's public entry point —
  by definition consumed externally. `zod` "unlisted dependency" — it's in `deno.json` imports, not
  `package.json`.
- **Real but minor**: `DEFAULT_DOMAIN` (`config.ts:5`) and the two profile schemas
  (`schemas.ts:14,31`) are exported but only used inside their own module — they could drop
  `export`.
- **Real, in tests**: the session-setup preamble is duplicated 3–4× in `tests/emulation_api_test.ts`
  (16-line clone group) and once in `clients/typescript/client_test.ts`; a `createTestSession(api)`
  helper would remove it. The three "high complexity" functions are all test bodies/guards —
  inherent to assertion-heavy tests, low priority.
