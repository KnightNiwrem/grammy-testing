/**
 * Routes `/bot-api/<session id>/bot<token>/<method>` to the emulated Bot API methods, decoding
 * the request the way Telegram does and encoding results in Telegram's response envelope.
 */
import { BOT_API_PATH_PREFIX } from '../shared/admin_protocol.ts';
import { botApiMethods, type BotApiPayload } from './bot_api_methods.ts';
import type { SessionStore } from './session_store.ts';
import { TelegramApiError, toErrorResponse, toSuccessResponse } from './telegram_error.ts';

const botApiRoutePattern = new URLPattern({
  pathname: `${BOT_API_PATH_PREFIX}/:sessionId/bot:token/:method`,
});

export async function handleBotApiRequest(
  store: SessionStore,
  request: Request,
): Promise<Response> {
  try {
    const route = botApiRoutePattern.exec(request.url);
    if (route === null) throw TelegramApiError.notFound();
    const { sessionId, token, method } = route.pathname.groups;
    const session = store.get(sessionId ?? '');
    if (session === undefined) throw TelegramApiError.notFound();
    const bot = session.findBotByToken(token ?? '');
    if (bot === undefined) throw TelegramApiError.unauthorized();
    const implementation = Object.hasOwn(botApiMethods, method ?? '')
      ? botApiMethods[method ?? '']
      : undefined;
    if (implementation === undefined) throw TelegramApiError.notFound();
    const payload = await decodePayload(request);
    return toSuccessResponse(implementation(session, bot, payload));
  } catch (error) {
    if (error instanceof TelegramApiError) return toErrorResponse(error);
    console.error('Unhandled error while emulating Bot API request', error);
    return toErrorResponse(new TelegramApiError(500, 'Internal Server Error'));
  }
}

/**
 * Merges query parameters with the request body. Telegram accepts JSON, URL-encoded, and
 * multipart bodies; all three are supported here, but only string form fields are decoded.
 */
async function decodePayload(request: Request): Promise<BotApiPayload> {
  const payload: BotApiPayload = {};
  for (const [key, value] of new URL(request.url).searchParams) payload[key] = value;
  if (request.body === null) return payload;
  const contentType = request.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    const body: unknown = await request.json().catch(() => {
      throw TelegramApiError.badRequest('request body is not valid JSON');
    });
    if (body === null || typeof body !== 'object' || Array.isArray(body)) {
      throw TelegramApiError.badRequest('request body must be a JSON object');
    }
    Object.assign(payload, body);
  } else if (
    contentType.includes('multipart/form-data') ||
    contentType.includes('application/x-www-form-urlencoded')
  ) {
    const form = await request.formData();
    for (const [key, value] of form) {
      if (typeof value === 'string') payload[key] = value;
    }
  }
  return payload;
}
