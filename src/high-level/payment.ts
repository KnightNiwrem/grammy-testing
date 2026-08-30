import type { Context } from 'grammy';
import type { Message, OrderInfo, ShippingOption } from 'grammy/types';

import type { Reply } from './reply';

/** A captured `answerShippingQuery` call correlated to one synthetic shipping query. */
export interface ShippingQueryAnswer {
  /** The exact shipping-query ID supplied to `answerShippingQuery`. */
  shippingQueryId: string;
  /** Whether the bot accepted delivery to the supplied address. */
  ok: boolean;
  /** Delivery options offered by the bot when `ok` is true. */
  shippingOptions: readonly ShippingOption[] | undefined;
  /** Human-readable rejection reason when `ok` is false. */
  errorMessage: string | undefined;
  /** The original captured outgoing-API payload. */
  raw: Record<string, unknown>;
}

/** A captured `answerPreCheckoutQuery` call correlated to one synthetic checkout query. */
export interface PreCheckoutQueryAnswer {
  /** The exact pre-checkout-query ID supplied to `answerPreCheckoutQuery`. */
  preCheckoutQueryId: string;
  /** Whether the bot approved the order for provider processing. */
  ok: boolean;
  /** Human-readable rejection reason when `ok` is false. */
  errorMessage: string | undefined;
  /** The original captured outgoing-API payload. */
  raw: Record<string, unknown>;
}

/** Options supplied while the user enters invoice checkout details. */
export interface PayInvoiceOptions {
  /** Personal or shipping details requested by the invoice. */
  orderInfo?: OrderInfo;
  /** Delivery option the user selects from the bot's shipping-query answer. */
  shippingOptionId?: string;
  /** Optional tip in the smallest currency unit. */
  tipAmount?: number;
}

/** Fixture values for the explicit successful-payment simulation step. */
export interface CompleteSuccessfulPaymentOptions {
  /** Telegram-side payment identifier. Defaults to a deterministic query-derived fixture. */
  telegramPaymentChargeId?: string;
  /** Provider-side payment identifier. Defaults to a deterministic query-derived fixture. */
  providerPaymentChargeId?: string;
}

/** Current observable stage of an invoice payment simulation. */
export type InvoicePaymentStatus =
  | 'awaiting-pre-checkout'
  | 'completed'
  | 'pre-checkout-declined'
  | 'pre-checkout-unanswered'
  | 'ready'
  | 'shipping-declined'
  | 'shipping-unanswered';

interface InvoicePaymentSnapshot {
  requiresShipping: boolean;
  shippingQueryId: string | undefined;
  preCheckoutQueryId: string | undefined;
  shippingAnswer: ShippingQueryAnswer | undefined;
  preCheckoutAnswer: PreCheckoutQueryAnswer | undefined;
  successfulPayment: Message | undefined;
}

interface InvoicePaymentOperations {
  snapshot: () => InvoicePaymentSnapshot;
  proceed: () => Promise<void>;
  completeSuccessfully: (options: CompleteSuccessfulPaymentOptions) => Promise<Message>;
}

/**
 * Live handle for a payment attempt anchored to one captured invoice.
 * Shipping and pre-checkout answers stay correlated by their generated query
 * IDs. Provider completion remains an explicit step because an approved
 * pre-checkout query does not guarantee that payment succeeds.
 */
export class InvoicePayment<TContext extends Context = Context> {
  /**
   * Creates a live handle backed by orchestrator-owned payment state.
   * @param invoice - Captured invoice reply anchoring this payment.
   * @param operations - Internal state readers and transition operations.
   * @internal
   */
  constructor(
    readonly invoice: Reply<TContext>,
    private readonly operations: InvoicePaymentOperations,
  ) {}

  /**
   * Generated shipping-query ID, when the invoice uses flexible shipping.
   * @returns The generated ID, or `undefined` before that stage.
   */
  get shippingQueryId(): string | undefined {
    return this.operations.snapshot().shippingQueryId;
  }

  /**
   * Generated pre-checkout-query ID, once checkout has reached that stage.
   * @returns The generated ID, or `undefined` before that stage.
   */
  get preCheckoutQueryId(): string | undefined {
    return this.operations.snapshot().preCheckoutQueryId;
  }

  /**
   * Strictly correlated shipping answer, or `undefined` when unanswered.
   * @returns The captured correlated shipping answer.
   */
  get shippingAnswer(): ShippingQueryAnswer | undefined {
    return this.operations.snapshot().shippingAnswer;
  }

  /**
   * Strictly correlated pre-checkout answer, or `undefined` when unanswered.
   * @returns The captured correlated pre-checkout answer.
   */
  get preCheckoutAnswer(): PreCheckoutQueryAnswer | undefined {
    return this.operations.snapshot().preCheckoutAnswer;
  }

  /**
   * Successful-payment service message created by `completeSuccessfully`.
   * @returns The dispatched message, or `undefined` before completion.
   */
  get successfulPayment(): Message | undefined {
    return this.operations.snapshot().successfulPayment;
  }

  /**
   * Current payment-flow stage derived from the live correlated answers.
   * @returns The current payment status.
   */
  get status(): InvoicePaymentStatus {
    const snapshot = this.operations.snapshot();

    if (snapshot.successfulPayment !== undefined) {
      return 'completed';
    }

    if (snapshot.requiresShipping) {
      if (snapshot.shippingQueryId === undefined || snapshot.shippingAnswer === undefined) {
        return 'shipping-unanswered';
      }

      if (!snapshot.shippingAnswer.ok) {
        return 'shipping-declined';
      }
    }

    if (snapshot.preCheckoutQueryId === undefined) {
      return 'awaiting-pre-checkout';
    }

    if (snapshot.preCheckoutAnswer === undefined) {
      return 'pre-checkout-unanswered';
    }

    return snapshot.preCheckoutAnswer.ok ? 'ready' : 'pre-checkout-declined';
  }

  /**
   * Re-attempts progression after a previously unanswered shipping query.
   * Existing queries are never dispatched twice.
   * @returns This live handle after progression settles.
   */
  async proceed(): Promise<this> {
    await this.operations.proceed();

    return this;
  }

  /**
   * Explicitly simulates provider success after the bot approved pre-checkout.
   * @param options - Optional payment charge-ID fixtures.
   * @returns The dispatched successful-payment service message.
   */
  async completeSuccessfully(options: CompleteSuccessfulPaymentOptions = {}): Promise<Message> {
    return this.operations.completeSuccessfully(options);
  }
}
