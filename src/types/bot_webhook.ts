/** The longest `secret_token` Telegram accepts. */
export const MAX_WEBHOOK_SECRET_TOKEN_LENGTH = 256;

/** The characters of a `secret_token`, which TDLib's `is_base64url_characters` allows. */
const WEBHOOK_SECRET_TOKEN_PATTERN = /^[A-Za-z0-9_-]*$/;

/** Telegram reads a webhook URL without a scheme as an HTTPS URL. */
const DEFAULT_WEBHOOK_URL_SCHEME = 'https://';
const WEBHOOK_URL_SCHEME_PATTERN = /^[^:/?#]*:\/\//;
const WEBHOOK_URL_PROTOCOLS: readonly string[] = ['http:', 'https:'];

/** Where and how a bot's updates are delivered while its webhook is set. */
export interface BotWebhook {
  /** The URL as the bot specified it, which `getWebhookInfo` reports unchanged. */
  readonly url: string;
  /** Sent in the `X-Telegram-Bot-Api-Secret-Token` header; empty sends no header. */
  readonly secretToken: string;
  /** Reported by `getWebhookInfo`; the emulator delivers one update at a time regardless. */
  readonly maxConnections: number;
}

/** The latest failure to deliver an update to a webhook, which `getWebhookInfo` reports. */
export interface WebhookDeliveryError {
  readonly dateUnixSeconds: number;
  readonly message: string;
}

/**
 * Reads a webhook URL as TDLib's `parse_url` does: `http` and `https` URLs, with a missing scheme
 * meaning `https`. Returns `undefined` for any other text.
 *
 * Unlike Telegram, which delivers only to HTTPS URLs on ports 80, 88, 443, and 8443, the emulator
 * accepts any port and plain HTTP, so that tests can deliver to a bot on their own machine.
 */
export function parseWebhookUrl(url: string): URL | undefined {
  const absoluteUrl = WEBHOOK_URL_SCHEME_PATTERN.test(url)
    ? url
    : `${DEFAULT_WEBHOOK_URL_SCHEME}${url}`;
  const parsedUrl = URL.parse(absoluteUrl);
  return parsedUrl !== null && WEBHOOK_URL_PROTOCOLS.includes(parsedUrl.protocol)
    ? parsedUrl
    : undefined;
}

export function hasOnlyWebhookSecretTokenCharacters(secretToken: string): boolean {
  return WEBHOOK_SECRET_TOKEN_PATTERN.test(secretToken);
}
