import type {
  CallbackQuery,
  CallbackQueryAnswer,
  CallbackQueryId,
} from '../types/callback_query.ts';
import type { PrivateConversationKey } from '../types/virtual_chat.ts';
import type { CanonicalMessageId } from '../types/virtual_message.ts';

export interface AddCallbackQueryInput {
  readonly conversation: PrivateConversationKey;
  readonly messageId: CanonicalMessageId;
  readonly chatInstance: string;
  readonly callbackData: string;
}

/** Stores callback queries and their answers under session-unique identifiers. */
export class CallbackQueryRepository {
  readonly #callbackQueriesById = new Map<CallbackQueryId, CallbackQuery>();
  #nextCallbackQueryNumber = 1;

  addCallbackQuery(input: AddCallbackQueryInput): CallbackQuery {
    const callbackQuery: CallbackQuery = {
      id: String(this.#nextCallbackQueryNumber++),
      conversation: { ...input.conversation },
      messageId: input.messageId,
      chatInstance: input.chatInstance,
      callbackData: input.callbackData,
    };
    this.#callbackQueriesById.set(callbackQuery.id, callbackQuery);
    return callbackQuery;
  }

  getCallbackQuery(callbackQueryId: CallbackQueryId): CallbackQuery | undefined {
    return this.#callbackQueriesById.get(callbackQueryId);
  }

  /** Records the answer to an unanswered callback query and returns the answered query. */
  recordAnswer(callbackQueryId: CallbackQueryId, answer: CallbackQueryAnswer): CallbackQuery {
    const callbackQuery = this.#callbackQueriesById.get(callbackQueryId);
    if (callbackQuery === undefined) {
      throw new Error(`Callback query ${callbackQueryId} does not exist`);
    }
    if (callbackQuery.answer !== undefined) {
      throw new Error(`Callback query ${callbackQueryId} is already answered`);
    }

    const answeredCallbackQuery: CallbackQuery = { ...callbackQuery, answer: { ...answer } };
    this.#callbackQueriesById.set(callbackQueryId, answeredCallbackQuery);
    return answeredCallbackQuery;
  }
}
