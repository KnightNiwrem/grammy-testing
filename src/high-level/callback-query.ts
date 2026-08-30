/** A captured `answerCallbackQuery` call correlated to one synthetic callback query. */
export interface CallbackQueryAnswer {
  /** The exact callback-query ID supplied to `answerCallbackQuery`. */
  callbackQueryId: string;
  /** Notification or alert text, when supplied. */
  text: string | undefined;
  /** Whether Telegram should show an alert instead of a notification. */
  showAlert: boolean | undefined;
  /** Client URL requested by the answer, when supplied. */
  url: string | undefined;
  /** Client-side cache duration in seconds, when supplied. */
  cacheTime: number | undefined;
  /** The original captured outgoing-API payload (escape hatch). */
  raw: Record<string, unknown>;
}

/**
 * Live handle for a synthetic callback query dispatched by `reply.clickButton`
 * or `user.sendCallbackQuery`.
 */
export class CallbackQueryHandle {
  readonly callbackData: string;

  /**
   * Constructs a callback-query handle.
   * @param id - The generated `callback_query.id`.
   * @param callbackData - The callback data carried by the query.
   * @param resolveAnswer - Live lookup for a strictly correlated answer.
   */
  constructor(
    readonly id: string,
    callbackData: string,
    private readonly resolveAnswer: () => CallbackQueryAnswer | undefined,
  ) {
    this.callbackData = callbackData;
  }

  /**
   * The captured answer for this exact query ID, or `undefined` when the bot did
   * not answer it. This is a live getter, so it can be read again after
   * `chats.idle()` when the bot issued a fire-and-forget answer.
   * @returns The correlated callback-query answer, or `undefined`.
   */
  get answer(): CallbackQueryAnswer | undefined {
    return this.resolveAnswer();
  }
}

/**
 * Produces a deterministic chat-instance token. Telegram documents this field
 * as stable for the chat, so it must not depend on a message or query ID.
 * @param chatId - The numeric chat identifier.
 * @returns A stable synthetic `chat_instance` value.
 * @internal
 */
export function callbackChatInstance(chatId: number): string {
  return `inst-${String(chatId)}`;
}
