# Sessions and Bot API requests

[Feature index and comparison baseline](README.md)

## Supported behavior

Create a session with `POST /sessions`, then create its bots and accounts through the emulation API
or [TypeScript client](../typescript-client.md). The response supplies `botApiRoot`; a virtual bot's
token authenticates calls under `<botApiRoot>/bot<token>/<method>`. `getMe` returns its profile.

Sessions isolate users, chats, messages, files, update queues and bot settings. Bot creation accepts
`can_read_all_group_messages`, `supports_inline_queries` and `receives_chosen_inline_results`, all
false by default. These stand in for selected BotFather settings. Account profiles can include a
username and language code. Usernames are unique within a session, compared without case.

`DELETE /sessions/{sessionId}` or `session.end()` discards the session and stops webhook delivery
and waiting long polls. State lives in memory and is lost on process restart. There is no account
login, Telegram connection, persistence, clock advancement API, or snapshot/restore facility.
Individual bot/account resource paths marked unimplemented in [openapi.yaml](../../openapi.yaml)
have no profile read, update or deletion operations; use the profiles returned at creation.

Bot API requests support GET and POST, case-insensitive method names, query parameters, and JSON,
URL-encoded or multipart bodies. The first value of a parameter wins, with the query string before
the body. Top-level JSON values are converted to parameter text: `chat_id: 123` and `chat_id: "123"`
work alike, and structured parameters may be JSON values or JSON-encoded strings. This follows
TDLib's [HTTP parameter reader][http-reader] and the Bot API's [query handling][query-source].

Responses use Telegram's `ok`/`result` or `ok`/`error_code`/`description` envelope. An unknown
virtual token gives `401 Unauthorized`; an unimplemented method gives
`404 Not Found: method not found`. Requests under an absent session use the emulation API's plain
`404`, not a Bot API envelope.

## Intentional deviations

- **Virtual identities and no Telegram connection.** Accounts and bot tokens belong to the test
  session. Tests must run independently of Telegram, without real account login or remote service
  availability.
- **Disposable in-memory state.** Session data is not persisted across restarts. Fresh, disposable
  sessions keep tests isolated and prevent state from leaking between runs.
- **Ordinary time and fresh fixtures.** The emulation API intentionally has no clock-advance or
  snapshot/restore facility. Ordinary time and fresh fixtures are sufficient for the intended tests.
- **Session lifecycle control.** `close` and `logOut` are intentionally unsupported. Session
  teardown is sufficient for emulator lifecycle control.
- **Strict request fields and types.** Unknown parameters and nested fields, integer parameters with
  trailing text, unrecognized boolean spellings, and wrongly typed nested JSON fields are rejected.
  These checks expose accidental or unsupported input and malformed values in tests, even when
  Telegram would ignore or coerce them. The comparison below describes the parsing differences.
- **No production rate thresholds.** Telegram's traffic limits are not reproduced automatically.
  Rate-limit scenarios should be controlled by the test, so bot developers can exercise error
  handling without generating production-scale traffic or depending on Telegram's limit figures.
- **No link previews or preview metadata.** Tests should not depend on fetching third-party websites
  to generate previews. Returned messages also omit `link_preview_options`, whose value Telegram
  derives from the generated preview; see
  [text formatting](text-formatting.md#intentional-deviations).

### Strict request validation

The emulator deliberately rejects several requests the C++ implementation reads leniently. Rejecting
malformed bodies, subscriptions and out-of-range polling options exposes mistakes that Telegram's
fallbacks or clamping could hide. This strictness can also reject requests Telegram accepts.

| Input                                                        | Emulator                                                                       | Official implementation                                                                  |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| Unknown method parameters or fields in most nested objects   | `400`, usually `invalid <method> parameters`                                   | Handlers read recognized fields without a general unknown-field rejection                |
| Integer parameter containing trailing text                   | Rejected                                                                       | Integer conversion reads the leading numeric portion                                     |
| Boolean parameter                                            | Accepts `true`, `false`, `yes`, `no`, `1`, `0`, after trimming and lowercasing | Only the true spellings yield true; other text yields false                              |
| Wrongly typed fields inside a JSON parameter                 | Usually rejected, e.g. an entity offset written as a string                    | Some JSON field readers coerce numbers and strings                                       |
| Invalid JSON body or unrecognized nonempty body content type | `400`                                                                          | Some parsing errors are logged and ignored; undecoded bodies supply no method parameters |
| Malformed `allowed_updates`                                  | `400`                                                                          | Keeps the previous subscription                                                          |
| `getUpdates` limit outside 1–100 or timeout outside 0–50     | `400`                                                                          | Values are clamped                                                                       |

The corresponding upstream paths are [`HttpReader::read_next`][http-reader],
[`Client::to_bool`][booleans], [`Client::get_integer_arg`][integers], TDLib's
[`JsonObject` field readers][json-fields], [`Client::get_allowed_update_types`][subscriptions] and
[`Client::process_get_updates_query`][polling]. This does not imply that all malformed requests are
accepted upstream; low-level HTTP errors and size limits can still fail there.

## Accepted options without their Telegram effects

| Option or method                                          | Emulator behavior                             | Classification and details                                                                      |
| --------------------------------------------------------- | --------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `disable_notification`                                    | Validated; no notification state              | [Real gap](#real-gaps)                                                                          |
| `link_preview_options`, `disable_web_page_preview`        | Validated; no preview or returned options     | [Intentional](#intentional-deviations)                                                          |
| `disable_content_type_detection`                          | Documents always remain documents             | [Real gap](media-and-files.md#real-gaps)                                                        |
| Webhook `max_connections`                                 | Clamped and reported; delivery remains serial | [Real gap](webhooks.md#real-gaps)                                                               |
| Inline `cache_time`, `is_personal`; callback `cache_time` | Recorded; no cache reuse                      | Real gaps: [inline](inline-mode.md#real-gaps), [callback](keyboards-and-callbacks.md#real-gaps) |
| Ban `until_date`                                          | Normalized and reported; no automatic unban   | [Intentional](supergroups.md#intentional-deviations)                                            |
| Ban `revoke_messages`                                     | Validated; no separate effect in supergroups  | [Upstream evidence limit](supergroups.md#administrator-operations)                              |

The linked feature pages describe these differences in context.

## Real gaps

**Public usernames and chat targets.** Only numeric chat IDs work; public supergroup/channel
usernames and username targets are missing. The official server resolves username targets in
[`Client::check_chat`][check-chat].

**Additional feature parameters.** Options for unimplemented features, including
`business_connection_id`, `message_thread_id`, `direct_messages_topic_id`, ephemeral parameters and
`allow_paid_broadcast`, are rejected. These belong to the
[broader feature gaps](README.md#unimplemented-areas).

**Mutable bot settings.** Supported BotFather-style settings can only be chosen at bot creation.
Tests need to change these settings during a session.

**Individual profile management.** The emulation API has no individual bot/account profile read,
update or deletion operations. Tests currently rely on creation responses and session teardown;
managing individual profiles is missing.

**Observable notification behavior.** `disable_notification` is accepted and validated, but tests
cannot inspect its effect on notification state. The emulator needs to make that behavior
observable.

**Configurable rate-limit responses.** There is no test configuration that makes selected Bot API
calls return `429` with `parameters.retry_after`. Bot developers need this control to test
rate-limit handling. The intended mechanism is explicit test configuration; reproducing Telegram's
production rate thresholds is intentionally out of scope.

The official server's error handling is in [`Client::fail_query_with_error`][api-errors] and
[`Client::fail_query_flood_limit_exceeded`][flood-control].

## Local evidence

[Session lifecycle](../../src/services/session_lifecycle.ts),
[request decoding](../../src/api/sessions/bot_api/request_parameters.ts),
[method schemas](../../src/api/sessions/bot_api/mod.ts),
[request decoding tests](../../tests/bot_api_request_parameters_test.ts) and
[HTTP tests](../../tests/emulation_api_test.ts).

[http-reader]: https://github.com/tdlib/td/blob/bc9c263e2bfee06aaab41e82db51a103376030bc/tdnet/td/net/HttpReader.cpp#L110-L233
[query-source]: https://github.com/tdlib/telegram-bot-api/blob/e3e9dd8e5b3d7ab8537cd5a10dc31d5ffa8f82d1/telegram-bot-api/Query.cpp
[booleans]: https://github.com/tdlib/telegram-bot-api/blob/e3e9dd8e5b3d7ab8537cd5a10dc31d5ffa8f82d1/telegram-bot-api/Client.cpp#L10051-L10057
[integers]: https://github.com/tdlib/telegram-bot-api/blob/e3e9dd8e5b3d7ab8537cd5a10dc31d5ffa8f82d1/telegram-bot-api/Client.cpp#L13457-L13462
[json-fields]: https://github.com/tdlib/td/blob/bc9c263e2bfee06aaab41e82db51a103376030bc/tdutils/td/utils/JsonBuilder.cpp#L625-L740
[subscriptions]: https://github.com/tdlib/telegram-bot-api/blob/e3e9dd8e5b3d7ab8537cd5a10dc31d5ffa8f82d1/telegram-bot-api/Client.cpp#L18310-L18364
[polling]: https://github.com/tdlib/telegram-bot-api/blob/e3e9dd8e5b3d7ab8537cd5a10dc31d5ffa8f82d1/telegram-bot-api/Client.cpp#L16926-L16949
[check-chat]: https://github.com/tdlib/telegram-bot-api/blob/e3e9dd8e5b3d7ab8537cd5a10dc31d5ffa8f82d1/telegram-bot-api/Client.cpp#L8869-L8895
[api-errors]: https://github.com/tdlib/telegram-bot-api/blob/e3e9dd8e5b3d7ab8537cd5a10dc31d5ffa8f82d1/telegram-bot-api/Client.cpp#L71-L110
[flood-control]: https://github.com/tdlib/telegram-bot-api/blob/e3e9dd8e5b3d7ab8537cd5a10dc31d5ffa8f82d1/telegram-bot-api/Client.cpp#L17529-L17535
