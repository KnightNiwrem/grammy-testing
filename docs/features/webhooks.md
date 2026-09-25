# Webhooks

[Feature index and comparison baseline](README.md) · [Update queues and polling](updates.md)

## Supported behavior

`setWebhook` registers or replaces a bot's webhook. The emulator posts updates as JSON and adds
`X-Telegram-Bot-Api-Secret-Token` when `secret_token` is set. URL credentials become HTTP Basic
authorization. Redirects are treated as delivery failures. A 2xx response confirms the update; other
statuses and connection failures leave it pending for another attempt.

`deleteWebhook`, or `setWebhook` with an empty URL, removes the registration. Both support
`drop_pending_updates`. `setWebhook` also accepts `allowed_updates`. `getWebhookInfo` reports the
URL, pending count, configured maximum connections, non-default subscription and most recent
delivery error. Ending a session aborts its webhook requests.

A webhook can answer with a Bot API method call in a JSON, URL-encoded or multipart 2xx response.
The emulator executes its `method` using the receiving bot's identity and discards the result.
Methods starting with `get`, plus `setWebhook`, `deleteWebhook`, `close` and `logOut`, are excluded,
following [`WebhookActor::handle`][webhook-response]. A failed or unimplemented method does not make
the delivered update pending again. This supports framework webhook replies, including those used by
grammY and Telegraf.

## Gaps and deviations

| Concern                           | Emulator                                                                | Official C++ server                                                                                                                    |
| --------------------------------- | ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| URL/network restrictions          | HTTP or HTTPS on any port, including localhost                          | Cloud mode requires HTTPS on ports 80, 88, 443 or 8443 and disallows reserved/non-IPv4 addresses; `--local` relaxes these restrictions |
| Parallel delivery                 | One update at a time per bot; one failing update blocks later updates   | Multiple connections and separate queues allow unrelated updates to progress                                                           |
| `max_connections`                 | Default 40; clamped to 1–100 and reported, without changing concurrency | Governs concurrency; local mode allows up to 100,000                                                                                   |
| Retry delays                      | Immediately, then 2, 4, 8, … seconds, capped at 60                      | Similar doubling, with a randomized cap between 60 and 120 seconds and support for `Retry-After`                                       |
| Persistent delivery failure       | Retries until deletion, replacement or session end                      | Updates expire; sustained HTTP 410 responses can cause the webhook to be dropped                                                       |
| Timeout                           | 60 seconds for the whole attempt                                        | 60-second connection read inactivity timeout                                                                                           |
| Registration                      | Validates URL/token syntax and returns without verifying connectivity   | Resolves and verifies the webhook connection during setup                                                                              |
| Invalid replacement               | Leaves the existing webhook and queue intact                            | Some URL/token validation happens after removing the previous webhook and dropping updates                                             |
| 2xx with unfinished response body | Confirms even if reading the reply body later fails or times out        | HTTP response parsing completes before the response is delivered to the webhook actor                                                  |

These comparisons follow [`WebhookActor` setup and address checks][webhook-network],
[queue selection][webhook-queues], [retry calculation][webhook-retry],
[response handling][webhook-response], [`Client::get_webhook_max_connections`][max-connections],
[`Client::do_set_webhook`][set-webhook], and TDLib's
[HTTP connection implementation][http-connection]. Thus a successful emulated `setWebhook` does not
establish that Telegram's cloud service could connect to the URL.

`ip_address` and custom certificate uploads are unsupported. `getWebhookInfo` consequently omits
`ip_address`, always reports `has_custom_certificate: false`, and has no Telegram synchronization
error state. Configuration is not persisted across process restarts. Rate limiting of repeated
`setWebhook` calls is also absent; upstream applies it in
[`Client::process_set_webhook_query`][webhook-throttle].

## Local evidence

[Webhook service](../../src/services/bot_webhook.ts),
[response method dispatcher](../../src/api/sessions/bot_api/webhook_reply.ts),
[webhook tests](../../tests/bot_webhook_service_test.ts) and
[HTTP tests](../../tests/emulation_api_test.ts).

[webhook-response]: https://github.com/tdlib/telegram-bot-api/blob/e3e9dd8e5b3d7ab8537cd5a10dc31d5ffa8f82d1/telegram-bot-api/WebhookActor.cpp#L608-L680
[webhook-network]: https://github.com/tdlib/telegram-bot-api/blob/e3e9dd8e5b3d7ab8537cd5a10dc31d5ffa8f82d1/telegram-bot-api/WebhookActor.cpp#L685-L790
[webhook-queues]: https://github.com/tdlib/telegram-bot-api/blob/e3e9dd8e5b3d7ab8537cd5a10dc31d5ffa8f82d1/telegram-bot-api/WebhookActor.cpp#L365-L425
[webhook-retry]: https://github.com/tdlib/telegram-bot-api/blob/e3e9dd8e5b3d7ab8537cd5a10dc31d5ffa8f82d1/telegram-bot-api/WebhookActor.cpp#L493-L520
[max-connections]: https://github.com/tdlib/telegram-bot-api/blob/e3e9dd8e5b3d7ab8537cd5a10dc31d5ffa8f82d1/telegram-bot-api/Client.cpp#L17215-L17225
[set-webhook]: https://github.com/tdlib/telegram-bot-api/blob/e3e9dd8e5b3d7ab8537cd5a10dc31d5ffa8f82d1/telegram-bot-api/Client.cpp#L17227-L17340
[http-connection]: https://github.com/tdlib/td/blob/bc9c263e2bfee06aaab41e82db51a103376030bc/tdnet/td/net/HttpConnectionBase.cpp#L39-L154
[webhook-throttle]: https://github.com/tdlib/telegram-bot-api/blob/e3e9dd8e5b3d7ab8537cd5a10dc31d5ffa8f82d1/telegram-bot-api/Client.cpp#L16952-L16985
