import { BotUpdateRepository } from '../src/repositories/bot_update.ts';
import { BotUpdateSubscriptionRepository } from '../src/repositories/bot_update_subscription.ts';
import { BotWebhookRepository } from '../src/repositories/bot_webhook.ts';
import { BotWebhookService, type SetWebhookRequest } from '../src/services/bot_webhook.ts';
import type { BotApiPrivateMessage } from '../src/types/bot_api.ts';

const BOT_ID = 10;
const NOW_UNIX_SECONDS = 1_700_000_000;
const WEBHOOK_URL = 'https://bot.example/webhook';

Deno.test('BotWebhookService sets, keeps, replaces, and deletes webhooks as Telegram does', () => {
  const { botWebhooks } = createWebhookFixture(() => new Response(null));
  const setWebhook = (request: Partial<SetWebhookRequest>) =>
    botWebhooks.setWebhook(BOT_ID, { ...webhookRequest(), ...request });

  try {
    const outcomes = [
      setWebhook({ url: '' }),
      setWebhook({}),
      setWebhook({}),
      setWebhook({ secretToken: 'other_secret' }),
      setWebhook({ secretToken: 'other_secret', dropPendingUpdates: true }),
      setWebhook({ url: '' }),
      setWebhook({ url: '' }),
    ].map((result) => result.accepted ? result.outcome : result.reason);
    const expectedOutcomes = [
      'webhook_already_deleted',
      'webhook_set',
      'webhook_already_set',
      'webhook_set',
      'webhook_set',
      'webhook_deleted',
      'webhook_already_deleted',
    ];
    if (JSON.stringify(outcomes) !== JSON.stringify(expectedOutcomes)) {
      throw new Error(`Expected Telegram's setWebhook outcomes, received ${outcomes}`);
    }

    setWebhook({});
    const deleteOutcomes = [
      botWebhooks.deleteWebhook(BOT_ID, { dropPendingUpdates: false }),
      botWebhooks.deleteWebhook(BOT_ID, { dropPendingUpdates: true }),
    ];
    if (
      JSON.stringify(deleteOutcomes) !==
        JSON.stringify(['webhook_deleted', 'webhook_already_deleted'])
    ) {
      throw new Error(`Expected deleteWebhook to delete once, received ${deleteOutcomes}`);
    }

    // A URL without a scheme is an HTTPS URL, and is reported as the bot specified it.
    setWebhook({ url: 'bot.example/webhook' });
    if (botWebhooks.getWebhookInfo(BOT_ID).url !== 'bot.example/webhook') {
      throw new Error('Expected a URL without a scheme to be accepted and reported unchanged');
    }
  } finally {
    botWebhooks.endDelivery();
  }
});

Deno.test('BotWebhookService rejects invalid URLs and secret tokens without changing the webhook', () => {
  const { botWebhooks } = createWebhookFixture(() => new Response(null));

  try {
    botWebhooks.setWebhook(BOT_ID, webhookRequest());
    const rejections = [
      { url: 'https://bot example/webhook' },
      { url: 'ftp://bot.example/webhook' },
      { secretToken: 'a'.repeat(257) },
      { secretToken: 'not allowed!' },
    ].map((request) => {
      const result = botWebhooks.setWebhook(BOT_ID, { ...webhookRequest(), ...request });
      return result.accepted ? result.outcome : result.reason;
    });
    if (
      JSON.stringify(rejections) !==
        JSON.stringify([
          'url_invalid',
          'url_invalid',
          'secret_token_too_long',
          'secret_token_invalid',
        ])
    ) {
      throw new Error(`Expected Telegram's setWebhook rejections, received ${rejections}`);
    }
    if (botWebhooks.getWebhookInfo(BOT_ID).url !== WEBHOOK_URL) {
      throw new Error('Expected a rejected request to keep the current webhook');
    }

    const longestSecretToken = botWebhooks.setWebhook(BOT_ID, {
      ...webhookRequest(),
      secretToken: 'a'.repeat(256),
    });
    if (!longestSecretToken.accepted) {
      throw new Error('Expected a secret token of 256 characters to be accepted');
    }
  } finally {
    botWebhooks.endDelivery();
  }
});

Deno.test('BotWebhookService posts pending updates in order and confirms accepted ones', async () => {
  const { botUpdates, botWebhooks, receivedRequests, waitForRequestCount } = createWebhookFixture(
    () => new Response('ignored body'),
  );

  try {
    botUpdates.enqueueMessageUpdate(BOT_ID, createPrivateMessage(1));
    botUpdates.enqueueMessageUpdate(BOT_ID, createPrivateMessage(2));
    botWebhooks.setWebhook(BOT_ID, {
      ...webhookRequest(),
      url: 'https://user:pass@bot.example/webhook?token=1',
      secretToken: 'secret_1',
    });
    await waitForRequestCount(2);
    botUpdates.enqueueMessageUpdate(BOT_ID, createPrivateMessage(3));
    await waitForRequestCount(3);

    if (
      JSON.stringify(receivedRequests.map(({ body }) => body.update_id)) !==
        JSON.stringify([1, 2, 3])
    ) {
      throw new Error('Expected each pending update to be posted once, in order');
    }
    const [firstRequest] = receivedRequests;
    if (
      firstRequest.method !== 'POST' ||
      firstRequest.url !== 'https://bot.example/webhook?token=1' ||
      firstRequest.headers.get('Content-Type') !== 'application/json' ||
      firstRequest.headers.get('X-Telegram-Bot-Api-Secret-Token') !== 'secret_1' ||
      firstRequest.headers.get('Authorization') !== `Basic ${btoa('user:pass')}` ||
      firstRequest.redirect !== 'manual'
    ) {
      throw new Error('Expected a JSON POST with the secret token and URL credentials as headers');
    }
    // Only the update in flight is still pending.
    if (botWebhooks.getWebhookInfo(BOT_ID).pending_update_count !== 1) {
      throw new Error('Expected accepted updates to be confirmed');
    }
  } finally {
    botWebhooks.endDelivery();
  }
});

Deno.test('BotWebhookService retries a failed update and reports the latest failure', async () => {
  const { botUpdates, botWebhooks, receivedRequests, waitForRequestCount } = createWebhookFixture(
    (_request, requestIndex) =>
      requestIndex === 0
        ? new Response(null, { status: 500, statusText: 'Internal Server Error' })
        : new Response(null),
  );

  try {
    botUpdates.enqueueMessageUpdate(BOT_ID, createPrivateMessage(1));
    botWebhooks.setWebhook(BOT_ID, webhookRequest());
    await waitForRequestCount(2);
    botUpdates.enqueueMessageUpdate(BOT_ID, createPrivateMessage(2));
    await waitForRequestCount(3);

    if (
      JSON.stringify(receivedRequests.map(({ body }) => body.update_id)) !==
        JSON.stringify([1, 1, 2])
    ) {
      throw new Error('Expected a failed update to be sent again at once, before later ones');
    }
    const webhookInfo = botWebhooks.getWebhookInfo(BOT_ID);
    if (
      webhookInfo.last_error_date !== NOW_UNIX_SECONDS ||
      webhookInfo.last_error_message !==
        'Wrong response from the webhook: 500 Internal Server Error'
    ) {
      throw new Error('Expected the failure to be reported after later successes');
    }

    botWebhooks.setWebhook(BOT_ID, { ...webhookRequest(), url: `${WEBHOOK_URL}/new` });
    if ('last_error_message' in botWebhooks.getWebhookInfo(BOT_ID)) {
      throw new Error('Expected a new webhook to forget the failure of the previous one');
    }
  } finally {
    botWebhooks.endDelivery();
  }
});

Deno.test('BotWebhookService reports a webhook it cannot connect to', async () => {
  const { botUpdates, botWebhooks, receivedRequests, waitForRequestCount } = createWebhookFixture(
    () => {
      throw new TypeError('fetch failed');
    },
  );

  try {
    botUpdates.enqueueMessageUpdate(BOT_ID, createPrivateMessage(1));
    botWebhooks.setWebhook(BOT_ID, webhookRequest());
    // The first failure is retried at once; the second waits 2 seconds.
    await waitForRequestCount(2);

    if (receivedRequests.some(({ body }) => body.update_id !== 1)) {
      throw new Error('Expected the failed update to be sent again');
    }
    const webhookInfo = botWebhooks.getWebhookInfo(BOT_ID);
    if (
      webhookInfo.last_error_message !== "Can't connect to the webhook" ||
      webhookInfo.pending_update_count !== 1
    ) {
      throw new Error("Expected Telegram's connection failure and the update to stay pending");
    }
  } finally {
    botWebhooks.endDelivery();
  }
});

Deno.test('BotWebhookService ends delivery and keeps the update in flight pending', async () => {
  const { botUpdates, botWebhooks, receivedRequests, waitForRequestCount } = createWebhookFixture(
    respondOnlyByAborting,
  );

  botUpdates.enqueueMessageUpdate(BOT_ID, createPrivateMessage(1));
  botWebhooks.setWebhook(BOT_ID, webhookRequest());
  await waitForRequestCount(1);
  botWebhooks.endDelivery();
  botWebhooks.setWebhook(BOT_ID, { ...webhookRequest(), url: `${WEBHOOK_URL}/new` });
  botUpdates.enqueueMessageUpdate(BOT_ID, createPrivateMessage(2));
  await new Promise((resolve) => setTimeout(resolve, 10));

  if (receivedRequests.length !== 1) {
    throw new Error('Expected no delivery after delivery ended');
  }
  const webhookInfo = botWebhooks.getWebhookInfo(BOT_ID);
  if (webhookInfo.pending_update_count !== 2 || 'last_error_message' in webhookInfo) {
    throw new Error('Expected the interrupted update to stay pending without a failure');
  }
});

Deno.test('BotWebhookService reports getWebhookInfo fields in Telegram order', () => {
  const { botUpdates, botWebhooks } = createWebhookFixture(respondOnlyByAborting);

  try {
    if (
      JSON.stringify(botWebhooks.getWebhookInfo(BOT_ID)) !==
        JSON.stringify({ url: '', has_custom_certificate: false, pending_update_count: 0 })
    ) {
      throw new Error('Expected only the URL, certificate, and pending count without a webhook');
    }

    botUpdates.enqueueMessageUpdate(BOT_ID, createPrivateMessage(1));
    botUpdates.enqueueMessageUpdate(BOT_ID, createPrivateMessage(2));
    botWebhooks.setWebhook(BOT_ID, {
      ...webhookRequest(),
      allowedUpdates: ['CALLBACK_QUERY', 'message', 'custom_event'],
    });
    const expectedInfo = {
      url: WEBHOOK_URL,
      has_custom_certificate: false,
      pending_update_count: 2,
      max_connections: 40,
      allowed_updates: ['message', 'callback_query'],
    };
    if (JSON.stringify(botWebhooks.getWebhookInfo(BOT_ID)) !== JSON.stringify(expectedInfo)) {
      throw new Error('Expected the webhook, its pending updates, and the listed subscription');
    }

    // A request that changes no webhook still changes the subscription.
    const unchanged = botWebhooks.setWebhook(BOT_ID, {
      ...webhookRequest(),
      allowedUpdates: ['message'],
    });
    const dropping = botWebhooks.setWebhook(BOT_ID, {
      ...webhookRequest(),
      dropPendingUpdates: true,
    });
    const webhookInfo = botWebhooks.getWebhookInfo(BOT_ID);
    if (
      !unchanged.accepted || unchanged.outcome !== 'webhook_already_set' ||
      !dropping.accepted || dropping.outcome !== 'webhook_set' ||
      JSON.stringify(webhookInfo.allowed_updates) !== JSON.stringify(['message']) ||
      webhookInfo.pending_update_count !== 0
    ) {
      throw new Error('Expected allowed updates to apply and dropped updates to be discarded');
    }
  } finally {
    botWebhooks.endDelivery();
  }
});

interface ReceivedWebhookRequest {
  readonly method: string;
  readonly url: string;
  readonly headers: Headers;
  readonly redirect: RequestRedirect;
  readonly body: { readonly update_id: number };
}

/**
 * Creates a webhook service whose requests `respond` answers in place of the network, and which
 * records each request it receives.
 */
function createWebhookFixture(
  respond: (request: Request, requestIndex: number) => Response | Promise<Response>,
) {
  const botUpdates = new BotUpdateRepository();
  const receivedRequests: ReceivedWebhookRequest[] = [];
  const requestListeners = new Set<() => void>();
  const botWebhooks = new BotWebhookService({
    webhooks: new BotWebhookRepository(),
    pendingUpdates: botUpdates,
    updateSubscriptions: new BotUpdateSubscriptionRepository(),
    sendWebhookRequest: async (request) => {
      const { method, url, headers, redirect } = request;
      receivedRequests.push({ method, url, headers, redirect, body: await request.json() });
      for (const notify of requestListeners) {
        notify();
      }
      return await respond(request, receivedRequests.length - 1);
    },
    currentUnixTimeSeconds: () => NOW_UNIX_SECONDS,
  });

  /** Resolves once the webhook has received `count` requests, failing after a second. */
  const waitForRequestCount = (count: number): Promise<void> => {
    const received = new Promise<void>((resolve) => {
      const check = () => {
        if (receivedRequests.length >= count) {
          requestListeners.delete(check);
          resolve();
        }
      };
      requestListeners.add(check);
      check();
    });
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_resolve, reject) => {
      timeoutId = setTimeout(
        () =>
          reject(
            new Error(`Expected ${count} webhook requests, received ${receivedRequests.length}`),
          ),
        1_000,
      );
    });
    return Promise.race([received, timeout]).finally(() => clearTimeout(timeoutId));
  };

  return { botUpdates, botWebhooks, receivedRequests, waitForRequestCount };
}

/** Leaves the webhook request unanswered until it is aborted, as a hanging webhook would. */
function respondOnlyByAborting(request: Request): Promise<Response> {
  return new Promise((_resolve, reject) => {
    request.signal.addEventListener('abort', () => reject(request.signal.reason));
  });
}

function webhookRequest(): SetWebhookRequest {
  return { url: WEBHOOK_URL, secretToken: '', maxConnections: 40, dropPendingUpdates: false };
}

function createPrivateMessage(messageId: number): BotApiPrivateMessage {
  const author = { id: 1, is_bot: false as const, first_name: 'Ada' };
  return {
    message_id: messageId,
    from: author,
    chat: { id: author.id, type: 'private', first_name: author.first_name },
    date: NOW_UNIX_SECONDS,
    text: 'Hello',
  };
}
