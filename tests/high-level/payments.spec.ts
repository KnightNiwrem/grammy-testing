import assert from 'node:assert';

import { Bot, InlineKeyboard } from 'grammy';
import type { Message, PreCheckoutQuery, ShippingQuery } from 'grammy/types';
import { describe, expect, it } from 'vitest';

import { type InvoicePayment, prepareBot } from '../../src/index';

const shippingAddress = {
  country_code: 'US',
  state: 'CA',
  city: 'San Francisco',
  street_line1: '1 Market Street',
  street_line2: '',
  post_code: '94105',
};

describe('Payments', () => {
  describe('sendInvoice', () => {
    describe('positive', () => {
      it('captures sendInvoice as a reply with only the public Invoice view', async () => {
        const bot = new Bot('test-token');
        let returnedMessage: Message.InvoiceMessage | undefined;

        bot.command('buy', async (ctx) => {
          returnedMessage = await ctx.replyWithInvoice(
            'Gym plan',
            'One month of training',
            'private-order-42',
            'USD',
            [
              { label: 'Membership', amount: 2500 },
              { label: 'Setup', amount: 500 },
            ],
            {
              provider_token: 'provider-token',
              start_parameter: 'buy-gym-plan',
            },
          );
        });

        const { chats } = await prepareBot(bot);
        const user = chats.newUser();

        await user.sendCommand('/buy');

        const reply = user.replies.byInvoiceTitle('Gym plan');

        assert.ok(reply);

        expect(reply.invoice).toEqual({
          title: 'Gym plan',
          description: 'One month of training',
          start_parameter: 'buy-gym-plan',
          currency: 'USD',
          total_amount: 3000,
        });

        expect(reply.invoice).not.toHaveProperty('payload');
        expect(reply.raw.payload).toBe('private-order-42');
        expect(reply.text).toBeUndefined();
        expect(returnedMessage).toMatchObject({ message_id: reply.messageId, invoice: reply.invoice });
        const globalMatcher = /Gym/g;
        const privateMessages = chats.newPrivateChat(user).messages;

        expect(user.replies.byInvoiceTitle(globalMatcher)).toBe(reply);
        expect(user.replies.byInvoiceTitle(globalMatcher)).toBe(reply);
        expect(privateMessages.byInvoiceTitle(globalMatcher)).toBe(reply);
        expect(privateMessages.byInvoiceTitle(globalMatcher)).toBe(reply);
      });

      it('captures group invoices in the chat message log', async () => {
        const bot = new Bot('test-token');
        const { chats } = await prepareBot(bot);
        const group = chats.newGroup();

        await bot.api.sendInvoice(
          group.id,
          'Group course',
          'Shared course invoice',
          'group-order',
          'USD',
          [{ label: 'Course', amount: 1000 }],
          { provider_token: 'provider-token' },
        );

        const invoice = group.messages.byInvoiceTitle('Group course');

        expect(invoice?.invoice?.title).toBe('Group course');
      });
    });

    describe('negative', () => {
      it('does not add an invoice field to ordinary callback-query messages', async () => {
        const bot = new Bot('test-token');
        let hasInvoiceField: boolean | undefined;

        bot.command('menu', async (ctx) => {
          await ctx.reply('Menu', { reply_markup: new InlineKeyboard().text('Open', 'open') });
        });

        bot.on('callback_query:data', (ctx) => {
          hasInvoiceField = Object.hasOwn(ctx.callbackQuery.message ?? {}, 'invoice');
        });

        const { chats } = await prepareBot(bot);
        const user = chats.newUser();

        await user.sendCommand('/menu');
        await user.replies.lastOrThrow().clickButton('Open');

        expect(hasInvoiceField).toBe(false);
      });

      it('does not derive invoices from invalid price breakdowns', async () => {
        const bot = new Bot('test-token');
        const { chats } = await prepareBot(bot);
        const user = chats.newUser();
        const privateChat = chats.newPrivateChat(user);

        await bot.api.sendInvoice(user.id, 'Fractional', 'Invalid amount', 'fractional', 'USD', [{ label: 'Item', amount: 1.5 }], {
          provider_token: 'provider-token',
        });

        await bot.api.sendInvoice(user.id, 'Infinite', 'Invalid amount', 'infinite', 'USD', [{ label: 'Item', amount: Infinity }], {
          provider_token: 'provider-token',
        });

        await bot.api.sendInvoice(
          user.id,
          'Unsafe total',
          'Invalid total',
          'unsafe-total',
          'USD',
          [
            { label: 'Item', amount: Number.MAX_SAFE_INTEGER },
            { label: 'Fee', amount: 1 },
          ],
          { provider_token: 'provider-token' },
        );

        await bot.api.sendInvoice(
          user.id,
          'Split Stars',
          'Invalid Stars prices',
          'split-stars',
          'XTR',
          [
            { label: 'First', amount: 1 },
            { label: 'Second', amount: 2 },
          ],
          { provider_token: '' },
        );

        await bot.api.sendInvoice(user.id, 'Empty', 'Missing price breakdown', 'empty', 'USD', [], {
          provider_token: 'provider-token',
        });

        expect(privateChat.messages.all.slice(-5).map((reply) => reply.invoice)).toEqual([
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
        ]);
      });
    });
  });

  describe('payInvoice', () => {
    describe('positive completion', () => {
      it('correlates flexible shipping and pre-checkout before explicit provider success', async () => {
        const bot = new Bot('test-token');
        let observedShipping: ShippingQuery | undefined;
        let observedPreCheckout: PreCheckoutQuery | undefined;
        let observedSuccessfulPayment: Message.SuccessfulPaymentMessage | undefined;

        bot.command('buy', async (ctx) => {
          await ctx.replyWithInvoice('Running shoes', 'A physical order', 'shoe-order-7', 'USD', [{ label: 'Shoes', amount: 7500 }], {
            provider_token: 'provider-token',
            max_tip_amount: 500,
            suggested_tip_amounts: [250],
            need_email: true,
            need_shipping_address: true,
            is_flexible: true,
          });
        });

        bot.on('shipping_query', async (ctx) => {
          observedShipping = ctx.shippingQuery;

          await ctx.answerShippingQuery(true, {
            shipping_options: [
              { id: 'standard', title: 'Standard', prices: [{ label: 'Delivery', amount: 500 }] },
              { id: 'express', title: 'Express', prices: [{ label: 'Delivery', amount: 1200 }] },
            ],
          });
        });

        bot.on('pre_checkout_query', async (ctx) => {
          observedPreCheckout = ctx.preCheckoutQuery;
          await ctx.answerPreCheckoutQuery(true);
        });

        bot.on('message:successful_payment', (ctx) => {
          observedSuccessfulPayment = ctx.message;
        });

        const { chats } = await prepareBot(bot);
        const user = chats.newUser({ first_name: 'Ada' });

        await user.sendCommand('/buy');

        const invoice = user.replies.byInvoiceTitle('Running shoes');

        assert.ok(invoice);

        const payment = await user.payInvoice(invoice, {
          orderInfo: { email: 'ada@example.com', shipping_address: shippingAddress },
          shippingOptionId: 'express',
          tipAmount: 250,
        });

        expect(observedShipping).toMatchObject({
          id: payment.shippingQueryId,
          invoice_payload: 'shoe-order-7',
          shipping_address: shippingAddress,
        });

        expect(payment.shippingAnswer).toMatchObject({
          shippingQueryId: payment.shippingQueryId,
          ok: true,
        });

        expect(payment.shippingAnswer?.shippingOptions?.map(({ id }) => id)).toContain('express');

        expect(observedPreCheckout).toMatchObject({
          id: payment.preCheckoutQueryId,
          currency: 'USD',
          total_amount: 8950,
          invoice_payload: 'shoe-order-7',
          shipping_option_id: 'express',
          order_info: { email: 'ada@example.com', shipping_address: shippingAddress },
        });

        expect(payment.preCheckoutAnswer).toMatchObject({ preCheckoutQueryId: payment.preCheckoutQueryId, ok: true });
        expect(payment.status).toBe('ready');
        expect(payment.successfulPayment).toBeUndefined();
        expect(observedSuccessfulPayment).toBeUndefined();

        const successfulMessage = await payment.completeSuccessfully({
          telegramPaymentChargeId: 'tg-charge-7',
          providerPaymentChargeId: 'provider-charge-7',
        });

        expect(successfulMessage.successful_payment).toEqual({
          currency: 'USD',
          total_amount: 8950,
          invoice_payload: 'shoe-order-7',
          shipping_option_id: 'express',
          order_info: { email: 'ada@example.com', shipping_address: shippingAddress },
          telegram_payment_charge_id: 'tg-charge-7',
          provider_payment_charge_id: 'provider-charge-7',
        });

        expect(observedSuccessfulPayment).toBe(successfulMessage);
        expect(payment.successfulPayment).toBe(successfulMessage);
        expect(payment.status).toBe('completed');
        await expect(payment.completeSuccessfully()).rejects.toThrow(/already completed/);
      });

      it('shares one in-flight successful-payment dispatch between concurrent callers', async () => {
        const bot = new Bot('test-token');
        let successfulPaymentCount = 0;

        bot.command('buy', async (ctx) => {
          await ctx.replyWithInvoice('Concurrent order', 'One charge only', 'concurrent-order', 'USD', [{ label: 'Item', amount: 100 }], {
            provider_token: 'provider-token',
          });
        });

        bot.on('pre_checkout_query', async (ctx) => {
          await ctx.answerPreCheckoutQuery(true);
        });

        bot.on('message:successful_payment', async () => {
          successfulPaymentCount += 1;
          await Promise.resolve();
        });

        const { chats } = await prepareBot(bot);
        const user = chats.newUser();

        await user.sendCommand('/buy');

        const payment = await user.payInvoice(user.replies.lastOrThrow());

        const [first, second] = await Promise.all([
          payment.completeSuccessfully({
            telegramPaymentChargeId: 'first-tg-charge',
            providerPaymentChargeId: 'first-provider-charge',
          }),
          payment.completeSuccessfully({
            telegramPaymentChargeId: 'second-tg-charge',
            providerPaymentChargeId: 'second-provider-charge',
          }),
        ]);

        expect(successfulPaymentCount).toBe(1);
        expect(second).toBe(first);
        expect(first.successful_payment?.telegram_payment_charge_id).toBe('first-tg-charge');
      });

      it('snapshots checkout information before pre-checkout middleware can mutate it', async () => {
        const bot = new Bot('test-token');
        const orderInfo = { email: 'original@example.com', shipping_address: { ...shippingAddress } };
        let observedEmail: string | undefined;
        let observedCity: string | undefined;

        bot.command('buy', async (ctx) => {
          await ctx.replyWithInvoice(
            'Snapshot order',
            'Immutable checkout details',
            'snapshot-order',
            'USD',
            [{ label: 'Item', amount: 100 }],
            {
              provider_token: 'provider-token',
              need_email: true,
            },
          );
        });

        bot.on('pre_checkout_query', async (ctx) => {
          observedEmail = ctx.preCheckoutQuery.order_info?.email;
          observedCity = ctx.preCheckoutQuery.order_info?.shipping_address?.city;
          orderInfo.email = 'mutated@example.com';
          orderInfo.shipping_address.city = 'Mutated City';
          await ctx.answerPreCheckoutQuery(true);
        });

        const { chats } = await prepareBot(bot);
        const user = chats.newUser();

        await user.sendCommand('/buy');

        const payment = await user.payInvoice(user.replies.lastOrThrow(), { orderInfo });
        const successful = await payment.completeSuccessfully();

        expect(observedEmail).toBe('original@example.com');
        expect(observedCity).toBe('San Francisco');

        expect(successful.successful_payment?.order_info).toMatchObject({
          email: 'original@example.com',
          shipping_address: { city: 'San Francisco' },
        });
      });

      it('snapshots accepted shipping options before the handler mutates them', async () => {
        const bot = new Bot('test-token');
        let observedTotal: number | undefined;
        const shippingOptions = [{ id: 'standard', title: 'Standard', prices: [{ label: 'Delivery', amount: 20 }] }];

        bot.command('buy', async (ctx) => {
          await ctx.replyWithInvoice(
            'Shipping snapshot',
            'Preserves the accepted price',
            'shipping-snapshot',
            'USD',
            [{ label: 'Item', amount: 100 }],
            {
              provider_token: 'provider-token',
              need_shipping_address: true,
              is_flexible: true,
            },
          );
        });

        bot.on('shipping_query', async (ctx) => {
          await ctx.answerShippingQuery(true, { shipping_options: shippingOptions });
          shippingOptions[0].prices[0].amount = 900;
        });

        bot.on('pre_checkout_query', async (ctx) => {
          observedTotal = ctx.preCheckoutQuery.total_amount;
          await ctx.answerPreCheckoutQuery(true);
        });

        const { chats } = await prepareBot(bot);
        const user = chats.newUser();

        await user.sendCommand('/buy');

        const payment = await user.payInvoice(user.replies.lastOrThrow(), {
          orderInfo: { shipping_address: shippingAddress },
          shippingOptionId: 'standard',
        });

        expect(payment.shippingAnswer?.shippingOptions?.[0].prices[0].amount).toBe(20);
        expect(observedTotal).toBe(120);

        const successful = await payment.completeSuccessfully();

        expect(successful.successful_payment?.total_amount).toBe(120);
      });

      it('waits for a pending successful sendInvoice settlement', async () => {
        const bot = new Bot('test-token');
        let resolveInvoice: ((value: { date: number; message_id: number }) => void) | undefined;
        let pendingSend: Promise<Message.InvoiceMessage> | undefined;

        const invoiceResponse = new Promise<{ date: number; message_id: number }>((resolve) => {
          resolveInvoice = resolve;
        });

        bot.command('buy', (ctx) => {
          pendingSend = ctx.replyWithInvoice(
            'Pending order',
            'The send is still settling',
            'pending-order',
            'USD',
            [{ label: 'Item', amount: 100 }],
            {
              provider_token: 'provider-token',
            },
          );
        });

        bot.on('pre_checkout_query', async (ctx) => {
          await ctx.answerPreCheckoutQuery(true);
        });

        const { chats } = await prepareBot(bot, {
          responses: { sendInvoice: async () => invoiceResponse },
        });

        const user = chats.newUser();

        await user.sendCommand('/buy');

        let isPaymentResolved = false;

        const paymentPromise = user.payInvoice(user.replies.lastOrThrow()).then((payment) => {
          isPaymentResolved = true;

          return payment;
        });

        await new Promise<void>((resolve) => {
          setImmediate(resolve);
        });

        expect(isPaymentResolved).toBe(false);

        resolveInvoice?.({ message_id: 7777, date: 0 });
        assert.ok(pendingSend);
        await pendingSend;

        const payment = await paymentPromise;

        expect(payment.status).toBe('ready');
      });
    });

    describe('negative completion', () => {
      it('allows a retry after successful-payment dispatch fails', async () => {
        const bot = new Bot('test-token');
        let successfulPaymentAttempts = 0;

        bot.command('buy', async (ctx) => {
          await ctx.replyWithInvoice('Retry order', 'Retry one failed dispatch', 'retry-order', 'USD', [{ label: 'Item', amount: 100 }], {
            provider_token: 'provider-token',
          });
        });

        bot.on('pre_checkout_query', async (ctx) => {
          await ctx.answerPreCheckoutQuery(true);
        });

        bot.on('message:successful_payment', () => {
          successfulPaymentAttempts += 1;

          if (successfulPaymentAttempts === 1) {
            throw new Error('successful-payment dispatch failed');
          }
        });

        const { chats } = await prepareBot(bot);
        const user = chats.newUser();

        await user.sendCommand('/buy');

        const payment = await user.payInvoice(user.replies.lastOrThrow());

        await expect(payment.completeSuccessfully()).rejects.toThrow(/dispatch failed/);

        const successful = await payment.completeSuccessfully();

        expect(successfulPaymentAttempts).toBe(2);
        expect(payment.successfulPayment).toBe(successful);
        expect(payment.status).toBe('completed');
      });

      it('rejects completion re-entry from its own successful-payment handler', async () => {
        const bot = new Bot('test-token');
        let payment: InvoicePayment | undefined;
        let reentrantError: unknown;

        bot.command('buy', async (ctx) => {
          await ctx.replyWithInvoice(
            'Reentrant order',
            'No self-waiting completion',
            'reentrant-order',
            'USD',
            [{ label: 'Item', amount: 100 }],
            {
              provider_token: 'provider-token',
            },
          );
        });

        bot.on('pre_checkout_query', async (ctx) => {
          await ctx.answerPreCheckoutQuery(true);
        });

        bot.on('message:successful_payment', async () => {
          assert.ok(payment);

          try {
            await payment.completeSuccessfully();
          } catch (error) {
            reentrantError = error;
          }
        });

        const { chats } = await prepareBot(bot);
        const user = chats.newUser();

        await user.sendCommand('/buy');

        payment = await user.payInvoice(user.replies.lastOrThrow());

        const successful = await payment.completeSuccessfully();

        expect(reentrantError).toBeInstanceOf(Error);
        expect((reentrantError as Error).message).toMatch(/successful_payment handler/);
        expect(payment.successfulPayment).toBe(successful);
      });
    });

    describe('negative shipping', () => {
      it('stops when shipping is declined and never emits pre-checkout', async () => {
        const bot = new Bot('test-token');
        let preCheckoutCount = 0;

        bot.command('buy', async (ctx) => {
          await ctx.replyWithInvoice('Poster', 'A shipped poster', 'poster-order', 'EUR', [{ label: 'Poster', amount: 2000 }], {
            provider_token: 'provider-token',
            need_shipping_address: true,
            is_flexible: true,
          });
        });

        bot.on('shipping_query', async (ctx) => {
          await ctx.answerShippingQuery(false, { error_message: 'We do not ship there' });
        });

        bot.on('pre_checkout_query', () => {
          preCheckoutCount += 1;
        });

        const { chats } = await prepareBot(bot);
        const user = chats.newUser();

        await user.sendCommand('/buy');

        const payment = await user.payInvoice(user.replies.lastOrThrow(), {
          orderInfo: { shipping_address: shippingAddress },
          shippingOptionId: 'standard',
        });

        expect(payment.shippingAnswer).toMatchObject({ ok: false, errorMessage: 'We do not ship there' });
        expect(payment.preCheckoutQueryId).toBeUndefined();
        expect(payment.status).toBe('shipping-declined');
        expect(preCheckoutCount).toBe(0);
        await expect(payment.completeSuccessfully()).rejects.toThrow(/not ready/);
      });

      it('does not accept a shipping answer when the mocked API call fails', async () => {
        const bot = new Bot('test-token');
        let preCheckoutCount = 0;

        bot.command('buy', async (ctx) => {
          await ctx.replyWithInvoice(
            'Failed shipping answer',
            'A shipped item',
            'failed-shipping-answer',
            'USD',
            [{ label: 'Item', amount: 100 }],
            {
              provider_token: 'provider-token',
              need_shipping_address: true,
              is_flexible: true,
            },
          );
        });

        bot.on('shipping_query', async (ctx) => {
          try {
            await ctx.answerShippingQuery(true, {
              shipping_options: [{ id: 'standard', title: 'Standard', prices: [{ label: 'Delivery', amount: 20 }] }],
            });
          } catch {
            // The bot may intentionally handle a failed Telegram answer call.
          }
        });

        bot.on('pre_checkout_query', () => {
          preCheckoutCount += 1;
        });

        const { chats } = await prepareBot(bot);
        const user = chats.newUser();

        chats.outgoing.failNext('answerShippingQuery', { code: 400, description: 'SHIPPING_QUERY_EXPIRED' });

        await user.sendCommand('/buy');

        const payment = await user.payInvoice(user.replies.lastOrThrow(), {
          orderInfo: { shipping_address: shippingAddress },
          shippingOptionId: 'standard',
        });

        expect(payment.shippingAnswer).toBeUndefined();
        expect(payment.preCheckoutQueryId).toBeUndefined();
        expect(payment.status).toBe('shipping-unanswered');
        expect(preCheckoutCount).toBe(0);
      });
    });

    describe('positive progression', () => {
      it('serializes concurrent progression after a late shipping answer', async () => {
        const bot = new Bot('test-token');
        let preCheckoutCount = 0;

        bot.command('buy', async (ctx) => {
          await ctx.replyWithInvoice(
            'Late shipping',
            'Waits for a shipping answer',
            'late-shipping-order',
            'USD',
            [{ label: 'Item', amount: 500 }],
            {
              provider_token: 'provider-token',
              need_shipping_address: true,
              is_flexible: true,
            },
          );
        });

        bot.on('shipping_query', () => {});

        bot.on('pre_checkout_query', async (ctx) => {
          preCheckoutCount += 1;
          await ctx.answerPreCheckoutQuery(true);
        });

        const { chats } = await prepareBot(bot);
        const user = chats.newUser();

        await user.sendCommand('/buy');

        const payment = await user.payInvoice(user.replies.lastOrThrow(), {
          orderInfo: { shipping_address: shippingAddress },
          shippingOptionId: 'late-option',
        });

        expect(payment.status).toBe('shipping-unanswered');
        assert.ok(payment.shippingQueryId);

        await bot.api.answerShippingQuery(payment.shippingQueryId, true, {
          shipping_options: [{ id: 'late-option', title: 'Late delivery', prices: [{ label: 'Delivery', amount: 100 }] }],
        });

        expect(payment.status).toBe('awaiting-pre-checkout');

        await Promise.all([payment.proceed(), payment.proceed()]);

        expect(payment.status).toBe('ready');
        expect(preCheckoutCount).toBe(1);
      });
    });

    describe('negative pre-checkout', () => {
      it('keeps declined and unanswered pre-checkout outcomes distinct', async () => {
        const declinedBot = new Bot('test-token');

        declinedBot.command('buy', async (ctx) => {
          await ctx.replyWithInvoice('Declined', 'Declined order', 'declined-order', 'USD', [{ label: 'Item', amount: 100 }], {
            provider_token: 'provider-token',
          });
        });

        declinedBot.on('pre_checkout_query', async (ctx) => {
          await ctx.answerPreCheckoutQuery(false, 'Inventory changed');
        });

        const { chats: declinedChats } = await prepareBot(declinedBot);
        const declinedUser = declinedChats.newUser();

        await declinedUser.sendCommand('/buy');

        const declined = await declinedUser.payInvoice(declinedUser.replies.lastOrThrow());

        expect(declined.preCheckoutAnswer).toMatchObject({ ok: false, errorMessage: 'Inventory changed' });
        expect(declined.status).toBe('pre-checkout-declined');

        const unansweredBot = new Bot('test-token');

        unansweredBot.command('buy', async (ctx) => {
          await ctx.replyWithInvoice('Unanswered', 'Unanswered order', 'unanswered-order', 'USD', [{ label: 'Item', amount: 100 }], {
            provider_token: 'provider-token',
          });
        });

        unansweredBot.on('pre_checkout_query', async (ctx) => {
          await ctx.api.answerPreCheckoutQuery(`${ctx.preCheckoutQuery.id}-wrong`, true);
        });

        const { chats: unansweredChats } = await prepareBot(unansweredBot);
        const unansweredUser = unansweredChats.newUser();

        await unansweredUser.sendCommand('/buy');

        const unanswered = await unansweredUser.payInvoice(unansweredUser.replies.lastOrThrow());

        expect(unanswered.preCheckoutAnswer).toBeUndefined();
        expect(unanswered.status).toBe('pre-checkout-unanswered');
      });

      it('does not approve pre-checkout when the mocked API call fails', async () => {
        const bot = new Bot('test-token');

        bot.command('buy', async (ctx) => {
          await ctx.replyWithInvoice(
            'Failed pre-checkout answer',
            'A failed approval',
            'failed-pre-checkout-answer',
            'USD',
            [{ label: 'Item', amount: 100 }],
            {
              provider_token: 'provider-token',
            },
          );
        });

        bot.on('pre_checkout_query', async (ctx) => {
          try {
            await ctx.answerPreCheckoutQuery(true);
          } catch {
            // The bot may intentionally handle a failed Telegram answer call.
          }
        });

        const { chats } = await prepareBot(bot);
        const user = chats.newUser();

        chats.outgoing.failNext('answerPreCheckoutQuery', { code: 400, description: 'PRE_CHECKOUT_QUERY_EXPIRED' });

        await user.sendCommand('/buy');

        const payment = await user.payInvoice(user.replies.lastOrThrow());

        expect(payment.preCheckoutAnswer).toBeUndefined();
        expect(payment.status).toBe('pre-checkout-unanswered');
        await expect(payment.completeSuccessfully()).rejects.toThrow(/pre-checkout-unanswered/);
      });
    });

    describe('positive Stars', () => {
      it('models Telegram Stars without shipping or personal information', async () => {
        const bot = new Bot('test-token');
        let shippingCount = 0;
        let observedPreCheckout: PreCheckoutQuery | undefined;

        bot.command('buy', async (ctx) => {
          await ctx.replyWithInvoice('Five boosts', 'Digital goods', 'stars-order', 'XTR', [{ label: 'Boosts', amount: 25 }], {
            provider_token: '',
            is_flexible: true,
            need_email: true,
          });
        });

        bot.on('shipping_query', () => {
          shippingCount += 1;
        });

        bot.on('pre_checkout_query', async (ctx) => {
          observedPreCheckout = ctx.preCheckoutQuery;
          await ctx.answerPreCheckoutQuery(true);
        });

        const { chats } = await prepareBot(bot);
        const user = chats.newUser();

        await user.sendCommand('/buy');

        const payment = await user.payInvoice(user.replies.lastOrThrow());

        expect(shippingCount).toBe(0);
        expect(payment.shippingQueryId).toBeUndefined();
        expect(observedPreCheckout).toMatchObject({ currency: 'XTR', total_amount: 25, invoice_payload: 'stars-order' });
        expect(payment.status).toBe('ready');

        const successful = await payment.completeSuccessfully();

        expect(successful.successful_payment).toMatchObject({ currency: 'XTR', total_amount: 25 });
      });
    });

    describe('negative validation', () => {
      it('rejects checkout totals that overflow safe integers', async () => {
        const bot = new Bot('test-token');

        bot.command('buy', async (ctx) => {
          await ctx.replyWithInvoice(
            'Unsafe checkout total',
            'The tip overflows the total',
            'unsafe-checkout-total',
            'USD',
            [{ label: 'Item', amount: Number.MAX_SAFE_INTEGER }],
            {
              provider_token: 'provider-token',
              max_tip_amount: 1,
            },
          );
        });

        const { chats } = await prepareBot(bot);
        const user = chats.newUser();

        await user.sendCommand('/buy');

        await expect(user.payInvoice(user.replies.lastOrThrow(), { tipAmount: 1 })).rejects.toThrow(
          /total_amount must remain a safe integer/,
        );
      });

      it('rejects shipping accumulation that temporarily leaves the safe-integer range', async () => {
        const bot = new Bot('test-token');

        bot.command('buy', async (ctx) => {
          await ctx.replyWithInvoice(
            'Unsafe shipping total',
            'The delivery cost overflows the total',
            'unsafe-shipping-total',
            'USD',
            [{ label: 'Item', amount: 1 }],
            {
              provider_token: 'provider-token',
              need_shipping_address: true,
              is_flexible: true,
            },
          );
        });

        bot.on('shipping_query', async (ctx) => {
          await ctx.answerShippingQuery(true, {
            shipping_options: [
              {
                id: 'unsafe',
                title: 'Unsafe',
                prices: [
                  { label: 'Delivery', amount: Number.MAX_SAFE_INTEGER },
                  { label: 'Discount', amount: -1 },
                ],
              },
            ],
          });
        });

        const { chats } = await prepareBot(bot);
        const user = chats.newUser();

        await user.sendCommand('/buy');

        await expect(
          user.payInvoice(user.replies.lastOrThrow(), {
            orderInfo: { shipping_address: shippingAddress },
            shippingOptionId: 'unsafe',
          }),
        ).rejects.toThrow(/total_amount must remain a safe integer/);
      });

      it('rejects checkout for an invoice whose send call failed', async () => {
        const bot = new Bot('test-token');
        let preCheckoutCount = 0;

        bot.command('buy', async (ctx) => {
          try {
            await ctx.replyWithInvoice(
              'Undelivered order',
              'The send fails',
              'undelivered-order',
              'USD',
              [{ label: 'Item', amount: 100 }],
              {
                provider_token: 'provider-token',
              },
            );
          } catch {
            // The bot may intentionally handle a failed Telegram send call.
          }
        });

        bot.on('pre_checkout_query', () => {
          preCheckoutCount += 1;
        });

        const { chats } = await prepareBot(bot);
        const user = chats.newUser();

        chats.outgoing.failNext('sendInvoice', { code: 400, description: 'INVOICE_PAYLOAD_INVALID' });

        await user.sendCommand('/buy');

        const invoice = user.replies.lastOrThrow();

        expect(invoice.invoice?.title).toBe('Undelivered order');
        await expect(user.payInvoice(invoice)).rejects.toThrow(/sendInvoice call did not settle successfully/);
        expect(preCheckoutCount).toBe(0);
      });

      it('rejects payment orchestration for a group invoice', async () => {
        const bot = new Bot('test-token');
        const { chats } = await prepareBot(bot);
        const user = chats.newUser();
        const group = chats.newGroup();

        await bot.api.sendInvoice(group.id, 'Group order', 'Group invoice', 'group-order', 'USD', [{ label: 'Item', amount: 100 }], {
          provider_token: 'provider-token',
        });

        const invoice = group.messages.byInvoiceTitle('Group order');

        assert.ok(invoice);
        await expect(user.payInvoice(invoice)).rejects.toThrow(/only for an invoice in this user's private chat/);
      });

      it('validates invoice ownership and requested checkout fields', async () => {
        const bot = new Bot('test-token');

        bot.command('buy', async (ctx) => {
          await ctx.replyWithInvoice('Receipt', 'Needs an email', 'receipt-order', 'USD', [{ label: 'Receipt', amount: 100 }], {
            provider_token: 'provider-token',
            need_email: true,
          });
        });

        const { chats } = await prepareBot(bot);
        const buyer = chats.newUser();
        const stranger = chats.newUser();

        await buyer.sendCommand('/buy');

        const invoice = buyer.replies.lastOrThrow();

        await expect(buyer.payInvoice(invoice)).rejects.toThrow(/orderInfo.email is required/);

        await expect(stranger.payInvoice(invoice, { orderInfo: { email: 'stranger@example.com' } })).rejects.toThrow(
          /only for an invoice in this user's private chat/,
        );

        await stranger.sendText('not an invoice');
        await bot.api.sendMessage(stranger.id, 'plain reply');

        await expect(stranger.payInvoice(stranger.replies.lastOrThrow())).rejects.toThrow(
          /does not contain a captured sendInvoice payload/,
        );
      });
    });
  });
});
