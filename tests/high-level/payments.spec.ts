import assert from 'node:assert';

import { Bot } from 'grammy';
import type { Message, PreCheckoutQuery, ShippingQuery } from 'grammy/types';
import { describe, expect, it } from 'vitest';

import { prepareBot } from '../../src/index';

const shippingAddress = {
  country_code: 'US',
  state: 'CA',
  city: 'San Francisco',
  street_line1: '1 Market Street',
  street_line2: '',
  post_code: '94105',
};

describe('invoice capture', () => {
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
    expect(chats.newPrivateChat(user).messages.byInvoiceTitle(/Gym/)).toBe(reply);
  });

  it('captures group invoices while keeping payment orchestration private-chat only', async () => {
    const bot = new Bot('test-token');
    const { chats } = await prepareBot(bot);
    const user = chats.newUser();
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

    assert.ok(invoice);
    await expect(user.payInvoice(invoice)).rejects.toThrow(/only for an invoice in this user's private chat/);
  });
});

describe('User.payInvoice', () => {
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

  it('can proceed after a previously unanswered shipping query is answered later', async () => {
    const bot = new Bot('test-token');

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

    await payment.proceed();

    expect(payment.status).toBe('ready');
  });

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

    await expect(stranger.payInvoice(stranger.replies.lastOrThrow())).rejects.toThrow(/does not contain a captured sendInvoice payload/);
  });
});
