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

## Intentional deviations

- **Local webhook servers.** HTTP and HTTPS are accepted on arbitrary ports, including localhost, so
  tests can use local servers. The official cloud service requires HTTPS on ports 80, 88, 443 or
  8443 and disallows reserved/non-IPv4 addresses; its `--local` mode relaxes these restrictions. See
  [upstream setup and address checks][webhook-network].
- **Total attempt deadline.** Each delivery attempt has a 60-second total deadline. Telegram uses a
  60-second connection read inactivity timeout, which can allow a longer attempt while data keeps
  arriving. The simpler deadline is retained because matching that distinction has no demonstrated
  testing value yet. See [TDLib's HTTP connection implementation][http-connection].
- **Disposable configuration and retained updates.** Webhook configuration ends with the session and
  is not persisted across process restarts, keeping tests isolated. Unconfirmed updates do not
  expire, preserving events for test assertions. See
  [sessions](sessions-and-requests.md#intentional-deviations) and
  [update queues](updates.md#intentional-deviations).
- **No production rate thresholds.** Repeated `setWebhook` calls are not automatically throttled.
  Tests should control rate-limit scenarios explicitly; configurable 429 responses remain a
  [real gap](sessions-and-requests.md#real-gaps). Upstream throttles registration in
  [`Client::process_set_webhook_query`][webhook-throttle].
- **Registration before server startup.** `setWebhook` validates URL/token syntax and returns
  without verifying DNS or connectivity, allowing tests to register before starting their webhook
  server. Upstream [resolves and verifies the connection during setup][webhook-network]. A
  successful emulated registration therefore does not establish that Telegram's cloud service could
  connect to the URL.
- **Atomic rejection of invalid replacements.** A rejected webhook configuration leaves the existing
  registration and queued updates intact, preventing invalid test setup from discarding state. In
  [`Client::do_set_webhook`][set-webhook], some URL/token validation happens after removing the
  previous webhook and dropping updates.
- **Fixed retry cap.** A failed update is retried at once, then after 2, 4, 8, … seconds, capped at
  60 seconds. Upstream draws the cap at random between 60 and 120 seconds for each retry; see
  [retry calculation][webhook-retry]. The fixed cap keeps retry timing reproducible in tests, and a
  test reaches it only after about a minute of consecutive failures.
- **No removal after sustained HTTP 410.** Failed deliveries keep retrying until the webhook is
  deleted or replaced or the session ends. Upstream closes the webhook once HTTP 410 responses have
  continued for [23 hours][webhook-drop-timeout]; see [response handling][webhook-response]. Test
  sessions do not run that long, so the rule could not be exercised.
- **No custom certificate uploads.** Local HTTP or trusted TLS is sufficient for webhook tests, so
  `setWebhook` does not accept custom certificates and `getWebhookInfo` always reports
  `has_custom_certificate: false`. Upstream accepts certificate uploads in
  [`Client::do_set_webhook`][set-webhook].

There is no Telegram synchronization error state because sessions have no Telegram connection.

## Real gaps

- **Concurrent delivery.** Only one update is delivered at a time per bot, so a failing update
  blocks unrelated chats. `max_connections` defaults to 40, is clamped to 1–100 and is reported, but
  has no effect on concurrency. Tests need concurrent delivery across chats that honors this
  setting. Upstream uses [multiple connections and separate queues][webhook-queues]; its
  [`max_connections` limit][max-connections] rises to 100,000 in local mode.
- **`Retry-After`.** The emulator ignores `Retry-After` headers on failed deliveries. Upstream waits
  the header's number of seconds, up to an hour, instead of the next backoff delay. See
  [retry calculation][webhook-retry] and [`HttpQuery::get_retry_after`][retry-after].
- **Complete response before confirmation.** A 2xx response confirms delivery even if reading its
  body later fails or times out. Confirmation should require a complete response so tests can
  exercise incomplete deliveries. Upstream completes HTTP response parsing before delivering the
  response to the webhook actor. See TDLib's [HTTP connection implementation][http-connection].
- **Fixed IP addresses and address reporting.** `setWebhook` does not accept `ip_address`, and
  `getWebhookInfo` omits the resolved address. Tests cannot configure a fixed webhook IP or inspect
  address resolution. Upstream accepts the option in [`Client::do_set_webhook`][set-webhook] and
  uses it during [connection setup][webhook-network].

## Local evidence

[Webhook service](../../src/services/bot_webhook.ts),
[response method dispatcher](../../src/api/sessions/bot_api/webhook_reply.ts),
[webhook tests](../../tests/bot_webhook_service_test.ts) and
[HTTP tests](../../tests/emulation_api_test.ts).

[webhook-response]: https://github.com/tdlib/telegram-bot-api/blob/e3e9dd8e5b3d7ab8537cd5a10dc31d5ffa8f82d1/telegram-bot-api/WebhookActor.cpp#L608-L680
[webhook-network]: https://github.com/tdlib/telegram-bot-api/blob/e3e9dd8e5b3d7ab8537cd5a10dc31d5ffa8f82d1/telegram-bot-api/WebhookActor.cpp#L685-L790
[webhook-queues]: https://github.com/tdlib/telegram-bot-api/blob/e3e9dd8e5b3d7ab8537cd5a10dc31d5ffa8f82d1/telegram-bot-api/WebhookActor.cpp#L365-L425
[webhook-retry]: https://github.com/tdlib/telegram-bot-api/blob/e3e9dd8e5b3d7ab8537cd5a10dc31d5ffa8f82d1/telegram-bot-api/WebhookActor.cpp#L493-L520
[webhook-drop-timeout]: https://github.com/tdlib/telegram-bot-api/blob/e3e9dd8e5b3d7ab8537cd5a10dc31d5ffa8f82d1/telegram-bot-api/WebhookActor.h#L75-L76
[retry-after]: https://github.com/tdlib/td/blob/bc9c263e2bfee06aaab41e82db51a103376030bc/tdnet/td/net/HttpQuery.cpp#L36-L47
[max-connections]: https://github.com/tdlib/telegram-bot-api/blob/e3e9dd8e5b3d7ab8537cd5a10dc31d5ffa8f82d1/telegram-bot-api/Client.cpp#L17215-L17225
[set-webhook]: https://github.com/tdlib/telegram-bot-api/blob/e3e9dd8e5b3d7ab8537cd5a10dc31d5ffa8f82d1/telegram-bot-api/Client.cpp#L17227-L17340
[http-connection]: https://github.com/tdlib/td/blob/bc9c263e2bfee06aaab41e82db51a103376030bc/tdnet/td/net/HttpConnectionBase.cpp#L39-L154
[webhook-throttle]: https://github.com/tdlib/telegram-bot-api/blob/e3e9dd8e5b3d7ab8537cd5a10dc31d5ffa8f82d1/telegram-bot-api/Client.cpp#L16952-L16985
