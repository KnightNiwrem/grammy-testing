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

## Validation deviations

The emulator deliberately rejects several requests the C++ implementation reads leniently. This
helps expose accidental input in tests but can also reject valid Telegram requests.

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

Only numeric chat IDs work. The official server also resolves username targets in
[`Client::check_chat`][check-chat]; the emulator exposes no public supergroup/channel usernames.
Unsupported options such as `business_connection_id`, `message_thread_id`,
`direct_messages_topic_id`, message effects, ephemeral parameters and `allow_paid_broadcast` are
rejected rather than simulated.

## Accepted options without their Telegram effects

| Option or method                                          | Emulator behavior                                                                 |
| --------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `disable_notification`                                    | Validated; notifications are not modeled                                          |
| `link_preview_options`, `disable_web_page_preview`        | Validated; no preview is fetched or returned                                      |
| `sendChatAction`                                          | Checks the action and chat access, returns true; no typing/upload state is stored |
| `disable_content_type_detection`                          | Validated; documents always remain documents                                      |
| Webhook `max_connections`                                 | Clamped and reported; delivery remains serial                                     |
| Inline `cache_time`, `is_personal`; callback `cache_time` | Recorded for inspection; answers are not reused from a cache                      |
| Ban `until_date`                                          | Normalized and reported; no automatic unban                                       |
| Ban `revoke_messages`                                     | Validated; no separate effect in the supported supergroups                        |

The linked feature pages describe these differences in context. Telegram's flood control, `429`
responses and `parameters.retry_after` are not simulated. The official server has explicit flood
control and retry error handling in [`Client::fail_query_with_error`][api-errors] and
[`Client::fail_query_flood_limit_exceeded`][flood-control]. Tests that pass here therefore do not
establish production throughput limits.

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
