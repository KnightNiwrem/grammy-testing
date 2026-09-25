import type {
  InlineQuery,
  InlineQueryAnswer,
  InlineQueryChat,
  InlineQueryId,
} from '../types/inline_query.ts';

export interface AddInlineQueryInput {
  readonly accountId: number;
  readonly botId: number;
  readonly chat: InlineQueryChat;
  readonly query: string;
  readonly offset: string;
}

/** Stores inline queries and their answers under session-unique identifiers. */
export class InlineQueryRepository {
  readonly #inlineQueriesById = new Map<InlineQueryId, InlineQuery>();
  #nextInlineQueryNumber = 1;

  addInlineQuery(input: AddInlineQueryInput): InlineQuery {
    const inlineQuery: InlineQuery = {
      id: String(this.#nextInlineQueryNumber++),
      accountId: input.accountId,
      botId: input.botId,
      chat: { ...input.chat },
      query: input.query,
      offset: input.offset,
      state: { status: 'awaiting_answer' },
    };
    this.#inlineQueriesById.set(inlineQuery.id, inlineQuery);
    return inlineQuery;
  }

  getInlineQuery(inlineQueryId: InlineQueryId): InlineQuery | undefined {
    return this.#inlineQueriesById.get(inlineQueryId);
  }

  /** Returns the bot's answered queries, the latest query first. */
  listAnsweredInlineQueries(botId: number): readonly InlineQuery[] {
    return [...this.#inlineQueriesById.values()]
      .filter((inlineQuery) =>
        inlineQuery.botId === botId && inlineQuery.state.status === 'answered'
      )
      .reverse();
  }

  /**
   * Records the answer to a query awaiting one, given when stated, and returns the answered
   * query.
   */
  recordAnswer(
    inlineQueryId: InlineQueryId,
    answer: InlineQueryAnswer,
    answeredAtMilliseconds: number,
  ): InlineQuery {
    const inlineQuery = this.#inlineQueriesById.get(inlineQueryId);
    if (inlineQuery === undefined) {
      throw new Error(`Inline query ${inlineQueryId} does not exist`);
    }
    if (inlineQuery.state.status !== 'awaiting_answer') {
      throw new Error(`Inline query ${inlineQueryId} is already ${inlineQuery.state.status}`);
    }

    const answeredInlineQuery: InlineQuery = {
      ...inlineQuery,
      state: { status: 'answered', answer: structuredClone(answer), answeredAtMilliseconds },
    };
    this.#inlineQueriesById.set(inlineQueryId, answeredInlineQuery);
    return answeredInlineQuery;
  }
}
