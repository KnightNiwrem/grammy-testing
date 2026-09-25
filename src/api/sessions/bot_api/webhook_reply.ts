import type { BotApiMethodContext } from './method_call.ts';
import { findBotApiMethodHandler } from './mod.ts';
import { decodeBotApiBodyParameters } from './request_parameters.ts';

/** The parameter naming the method that a webhook's response asks Telegram to run. */
const METHOD_PARAMETER = 'method';

/**
 * Methods, by lowercase name, that a webhook's response cannot run, as the official Bot API
 * server's `WebhookActor` ignores them: those that change the webhook or end the bot's session.
 * Methods whose names start with `get` are ignored too, since nothing would receive their result.
 */
const WEBHOOK_REPLY_EXCLUDED_METHODS: ReadonlySet<string> = new Set([
  'deletewebhook',
  'setwebhook',
  'close',
  'logout',
]);

/**
 * Runs the Bot API method that a webhook names in its successful response to an update, with the
 * other parameters of the response, as Telegram does. Nothing receives the method's answer, since
 * the response ends the webhook's exchange with Telegram, so a failing method changes nothing.
 * A response that names no method, names one that cannot run this way, or cannot be decoded, runs
 * nothing.
 */
export async function runWebhookReply(
  context: BotApiMethodContext,
  reply: Response,
): Promise<void> {
  const decoding = await decodeBotApiBodyParameters(reply);
  if (!decoding.decoded) {
    return;
  }
  const { [METHOD_PARAMETER]: methodName = '', ...parameters } = decoding.parameters;
  const lowercaseMethodName = methodName.toLowerCase();
  if (
    WEBHOOK_REPLY_EXCLUDED_METHODS.has(lowercaseMethodName) ||
    lowercaseMethodName.startsWith('get')
  ) {
    return;
  }
  await findBotApiMethodHandler(lowercaseMethodName)?.(
    context,
    parameters,
    decoding.uploadedFiles,
  );
}
