import { z } from 'zod';

import { jsonParameter } from './request_parameters.ts';

/** A reply target as a bot specified it, before its chat is checked. */
export interface SpecifiedReplyTarget {
  /** The replied message's ID in the bot's chat. */
  readonly messageId: number;
  /** The replied message's chat; omitted for the chat the message is sent to. */
  readonly chatId?: number;
  readonly allowSendingWithoutReply: boolean;
}

/** A parsed `reply_parameters` parameter, which may specify no reply. */
interface ReplyParameters {
  readonly replyTarget: SpecifiedReplyTarget | undefined;
}

/** The parameters from which Telegram reads the message a sent message replies to. */
export interface ReplyTargetParameters {
  readonly reply_parameters?: ReplyParameters;
  readonly reply_to_message_id?: number;
  readonly allow_sending_without_reply: boolean;
}

/**
 * A `reply_parameters` parameter: a JSON `ReplyParameters` object. As on Telegram, an empty
 * object or a non-positive message ID specifies no reply.
 *
 * Quotes, checklist tasks, and poll options are not supported, and Telegram's `@username` chat
 * IDs resolve only for chats the emulator does not support, so those fields are rejected.
 */
export function replyParametersParameter() {
  return jsonParameter(
    z.strictObject({
      message_id: z.int().optional(),
      chat_id: z.int().optional(),
      allow_sending_without_reply: z.boolean().default(false),
    }),
  ).transform(({ message_id, chat_id, allow_sending_without_reply }): ReplyParameters => ({
    replyTarget: message_id === undefined || message_id <= 0 ? undefined : {
      messageId: message_id,
      ...(chat_id === undefined ? {} : { chatId: chat_id }),
      allowSendingWithoutReply: allow_sending_without_reply,
    },
  }));
}

/**
 * Selects the reply target as the official Bot API server's `get_reply_parameters` does:
 * `reply_parameters` when present, and otherwise the older `reply_to_message_id` with
 * `allow_sending_without_reply`, which Telegram still accepts. A non-positive message ID specifies
 * no reply.
 */
export function selectSpecifiedReplyTarget(
  { reply_parameters, reply_to_message_id, allow_sending_without_reply }: ReplyTargetParameters,
): SpecifiedReplyTarget | undefined {
  if (reply_parameters !== undefined) {
    return reply_parameters.replyTarget;
  }
  return reply_to_message_id === undefined || reply_to_message_id <= 0 ? undefined : {
    messageId: reply_to_message_id,
    allowSendingWithoutReply: allow_sending_without_reply,
  };
}
