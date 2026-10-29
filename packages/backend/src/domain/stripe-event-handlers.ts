import type Stripe from 'stripe'
import type { Knex } from 'knex'
import { db } from '../infrastructure/database/connection.js'
import { logger } from '../infrastructure/logger/logger.js'
import { invalidatePremiumCache } from './subscription-service.js'
import { recordSystemAction, type AdminAuditAction } from './admin-audit-log.js'

const handlerLogger = logger.child({ module: 'stripe-event-handlers' })

export function getSubscriptionPeriodEnd(items: { data: Array<{ current_period_end: number }> }): Date | null {
  const item = items.data[0]
  if (!item) return null
  return new Date(item.current_period_end * 1000)
}

export function getSubscriptionPricing(sub: Stripe.Subscription): {
  priceId: string | null
  amountCents: number | null
  currency: string | null
} {
  const item = sub.items.data[0]
  const price = item?.price
  if (!price) return { priceId: null, amountCents: null, currency: null }
  return {
    priceId: price.id,
    amountCents: typeof price.unit_amount === 'number' ? price.unit_amount : null,
    currency: typeof price.currency === 'string' ? price.currency : null,
  }
}

export function getInvoiceSubscriptionId(invoice: { parent?: { subscription_details?: { subscription?: string | { id: string } } | null } | null }): string | null {
  const sub = invoice.parent?.subscription_details?.subscription
  if (!sub) return null
  return typeof sub === 'string' ? sub : sub.id
}

export async function chargeSubscriptionId(stripe: Stripe, charge: Stripe.Charge): Promise<string | null> {
  const invoiceField = (charge as unknown as { invoice?: string | { id: string; parent?: { subscription_details?: { subscription?: string | { id: string } } | null } | null } | null }).invoice
  let invoice: { parent?: { subscription_details?: { subscription?: string | { id: string } } | null } | null } | null = null
  if (typeof invoiceField === 'string' && invoiceField.length > 0) {
    invoice = await stripe.invoices.retrieve(invoiceField) as unknown as typeof invoice
  } else if (invoiceField && typeof invoiceField === 'object') {
    invoice = invoiceField as unknown as typeof invoice
  }
  if (!invoice) return null
  return getInvoiceSubscriptionId(invoice)
}

export function getUserIdFromSubscription(sub: Stripe.Subscription): string | null {
  const metaUser = sub.metadata?.['userId']
  return typeof metaUser === 'string' && metaUser.length > 0 ? metaUser : null
}

export function mapStripeStatus(sub: Stripe.Subscription): {
  tier: 'free' | 'premium'
  status: 'active' | 'past_due' | 'canceled' | 'inactive'
  cancelAtPeriodEnd: boolean
} {
  const cancelAtPeriodEnd = !!sub.cancel_at_period_end

  if (sub.status === 'active' || sub.status === 'trialing') {
    return { tier: 'premium', status: 'active', cancelAtPeriodEnd }
  }
  if (sub.status === 'canceled' || sub.status === 'incomplete_expired') {
    return { tier: 'free', status: 'canceled', cancelAtPeriodEnd }
  }
  if (sub.status === 'incomplete') {
    return { tier: 'free', status: 'inactive', cancelAtPeriodEnd }
  }
  return { tier: 'free', status: 'past_due', cancelAtPeriodEnd }
}

export async function findLocalSubscriptionForUpdate(
  trx: Knex.Transaction,
  stripeSub: Stripe.Subscription,
): Promise<{ user_id: string; status: string | null; past_due_since: Date | null; stripe_subscription_id: string | null } | null> {
  const userId = getUserIdFromSubscription(stripeSub)
  if (userId) {
    const row = await trx('subscriptions')
      .where({ user_id: userId })
      .select('user_id', 'status', 'past_due_since', 'stripe_subscription_id')
      .forUpdate()
      .first()
    if (row) return row
  }
  const customer = typeof stripeSub.customer === 'string' ? stripeSub.customer : stripeSub.customer.id
  const row = await trx('subscriptions')
    .where({ stripe_customer_id: customer })
    .select('user_id', 'status', 'past_due_since', 'stripe_subscription_id')
    .forUpdate()
    .first()
  return row ?? null
}

export function isStaleSubscriptionEvent(
  local: { stripe_subscription_id: string | null } | null,
  stripeSub: Stripe.Subscription,
): boolean {
  if (!local?.stripe_subscription_id || local.stripe_subscription_id === stripeSub.id) return false
  return stripeSub.status !== 'active' && stripeSub.status !== 'trialing'
}

export async function applySubscriptionState(
  trx: Knex.Transaction,
  stripeSub: Stripe.Subscription,
  source: AdminAuditAction,
): Promise<void> {
  const local = await findLocalSubscriptionForUpdate(trx, stripeSub)
  const customer = typeof stripeSub.customer === 'string' ? stripeSub.customer : stripeSub.customer.id

  if (isStaleSubscriptionEvent(local, stripeSub)) {
    handlerLogger.info(
      { userId: local!.user_id, eventSubId: stripeSub.id, currentSubId: local!.stripe_subscription_id, stripeStatus: stripeSub.status },
      'event for a non-current subscription — ignored',
    )
    return
  }

  const { tier, status, cancelAtPeriodEnd } = mapStripeStatus(stripeSub)
  const periodEnd = getSubscriptionPeriodEnd(stripeSub.items)
  const pricing = getSubscriptionPricing(stripeSub)

  let pastDueSince: Date | null | undefined = undefined
  if (status === 'past_due') {
    if (local?.status === 'past_due') pastDueSince = undefined
    else if (!local || local.status === 'active') pastDueSince = new Date()
    else pastDueSince = null
  } else {
    pastDueSince = null
  }

  const update: Record<string, unknown> = {
    stripe_subscription_id: stripeSub.id,
    stripe_customer_id: customer,
    tier,
    status,
    cancel_at_period_end: cancelAtPeriodEnd,
    current_period_end: periodEnd,
    updated_at: trx.fn.now(),
  }
  if (pastDueSince !== undefined) update['past_due_since'] = pastDueSince
  if (pricing.priceId) {
    update['price_id'] = pricing.priceId
    update['amount_cents'] = pricing.amountCents
    update['currency'] = pricing.currency
  }

  if (local) {
    await trx('subscriptions').where({ user_id: local.user_id }).update(update)
    invalidatePremiumCache(local.user_id)
    await recordSystemAction(source, local.user_id, {
      stripeSubscriptionId: stripeSub.id,
      stripeStatus: stripeSub.status,
      tier,
      status,
      cancelAtPeriodEnd,
    }, trx)
  } else {
    const userId = getUserIdFromSubscription(stripeSub)
    if (userId) {
      await trx('subscriptions')
        .insert({
          user_id: userId,
          stripe_customer_id: customer,
          stripe_subscription_id: stripeSub.id,
          tier,
          status,
          cancel_at_period_end: cancelAtPeriodEnd,
          current_period_end: periodEnd,
          past_due_since: pastDueSince ?? null,
          price_id: pricing.priceId,
          amount_cents: pricing.amountCents,
          currency: pricing.currency,
        })
        .onConflict('user_id')
        .merge()
      invalidatePremiumCache(userId)
      await recordSystemAction(source, userId, {
        stripeSubscriptionId: stripeSub.id,
        stripeStatus: stripeSub.status,
        recovered: true,
      }, trx)
    } else {
      handlerLogger.error(
        { stripeSubscriptionId: stripeSub.id, customer },
        'subscription event for unknown user — cannot resolve userId',
      )
    }
  }
}

async function handleCheckoutCompleted(trx: Knex.Transaction, stripe: Stripe, event: Stripe.Event): Promise<void> {
  const session = event.data.object as Stripe.Checkout.Session
  if (session.mode !== 'subscription' || !session.subscription) return

  const subscriptionId = typeof session.subscription === 'string'
    ? session.subscription
    : session.subscription.id
  const stripeSub = await stripe.subscriptions.retrieve(subscriptionId)

  const userId = (session.client_reference_id as string | null)
    ?? getUserIdFromSubscription(stripeSub)

  if (!userId) {
    handlerLogger.error(
      { customerId: session.customer, subscriptionId },
      'checkout.session.completed without resolvable userId',
    )
    return
  }

  const customer = typeof session.customer === 'string'
    ? session.customer
    : session.customer?.id
  const { tier, status, cancelAtPeriodEnd } = mapStripeStatus(stripeSub)
  const periodEnd = getSubscriptionPeriodEnd(stripeSub.items)
  const pricing = getSubscriptionPricing(stripeSub)

  await trx('subscriptions')
    .insert({
      user_id: userId,
      stripe_customer_id: customer,
      stripe_subscription_id: subscriptionId,
      tier,
      status,
      cancel_at_period_end: cancelAtPeriodEnd,
      current_period_end: periodEnd,
      price_id: pricing.priceId,
      amount_cents: pricing.amountCents,
      currency: pricing.currency,
    })
    .onConflict('user_id')
    .merge([
      'stripe_customer_id',
      'stripe_subscription_id',
      'tier',
      'status',
      'cancel_at_period_end',
      'current_period_end',
      'price_id',
      'amount_cents',
      'currency',
      'updated_at',
    ])

  invalidatePremiumCache(userId)
  await recordSystemAction('subscription.system.activate', userId, {
    stripeSubscriptionId: subscriptionId,
    stripeStatus: stripeSub.status,
  }, trx)
  handlerLogger.info({ userId, subscriptionId }, 'activated premium')
}

async function handleSubscriptionEvent(trx: Knex.Transaction, stripe: Stripe, event: Stripe.Event): Promise<void> {
  const incoming = event.data.object as Stripe.Subscription
  const fresh = await stripe.subscriptions.retrieve(incoming.id)
  const action: AdminAuditAction = event.type === 'customer.subscription.created'
    ? 'subscription.system.update'
    : (fresh.cancel_at_period_end ? 'subscription.system.cancel_scheduled' : 'subscription.system.update')
  await applySubscriptionState(trx, fresh, action)
}

async function handleSubscriptionDeleted(trx: Knex.Transaction, event: Stripe.Event): Promise<void> {
  const subscription = event.data.object as Stripe.Subscription
  const local = await findLocalSubscriptionForUpdate(trx, subscription)
  if (local?.stripe_subscription_id && local.stripe_subscription_id !== subscription.id) {
    handlerLogger.info(
      { userId: local.user_id, deletedSubId: subscription.id, currentSubId: local.stripe_subscription_id },
      'deleted subscription is not the current one — premium retained',
    )
    return
  }
  if (local) {
    await trx('subscriptions')
      .where({ user_id: local.user_id })
      .update({
        tier: 'free',
        status: 'canceled',
        cancel_at_period_end: false,
        past_due_since: null,
        updated_at: trx.fn.now(),
      })
    invalidatePremiumCache(local.user_id)
    await recordSystemAction('subscription.system.canceled', local.user_id, {
      stripeSubscriptionId: subscription.id,
    }, trx)
  }
  handlerLogger.info({ subscriptionId: subscription.id }, 'subscription canceled/deleted')
}

async function handleTrialWillEnd(trx: Knex.Transaction, event: Stripe.Event): Promise<void> {
  const subscription = event.data.object as Stripe.Subscription
  const local = await findLocalSubscriptionForUpdate(trx, subscription)
  if (local) {
    await recordSystemAction('subscription.system.trial_started', local.user_id, {
      stripeSubscriptionId: subscription.id,
      trialEnd: subscription.trial_end,
    }, trx)
  }
}

async function handleInvoicePaymentFailed(trx: Knex.Transaction, stripe: Stripe, event: Stripe.Event): Promise<void> {
  const invoice = event.data.object as Stripe.Invoice
  const subscriptionId = getInvoiceSubscriptionId(
    invoice as unknown as Parameters<typeof getInvoiceSubscriptionId>[0],
  )
  if (!subscriptionId) return
  const fresh = await stripe.subscriptions.retrieve(subscriptionId)
  await applySubscriptionState(trx, fresh, 'subscription.system.past_due')
  handlerLogger.warn({ subscriptionId }, 'payment failed')
}

async function handleInvoicePaymentSucceeded(trx: Knex.Transaction, stripe: Stripe, event: Stripe.Event): Promise<void> {
  const invoice = event.data.object as Stripe.Invoice
  const subscriptionId = getInvoiceSubscriptionId(
    invoice as unknown as Parameters<typeof getInvoiceSubscriptionId>[0],
  )
  if (!subscriptionId) return
  const fresh = await stripe.subscriptions.retrieve(subscriptionId)
  await applySubscriptionState(trx, fresh, 'subscription.system.recovered')
}

async function handleChargeRefunded(trx: Knex.Transaction, stripe: Stripe, event: Stripe.Event): Promise<void> {
  const charge = event.data.object as Stripe.Charge
  const subscriptionId = await chargeSubscriptionId(stripe, charge)
  const customer = typeof charge.customer === 'string' ? charge.customer : charge.customer?.id
  if (!customer || !subscriptionId) return

  const local = await trx('subscriptions')
    .where({ stripe_customer_id: customer })
    .select('user_id', 'stripe_subscription_id')
    .forUpdate()
    .first()
  if (!local) return

  if (local.stripe_subscription_id !== subscriptionId) {
    handlerLogger.info(
      { chargeId: charge.id, userId: local.user_id, chargeSubId: subscriptionId, currentSubId: local.stripe_subscription_id },
      'refund for a non-current subscription — premium retained',
    )
    return
  }

  const fullyRefunded = charge.refunded === true || charge.amount_refunded >= charge.amount
  if (!fullyRefunded) {
    handlerLogger.info(
      { chargeId: charge.id, userId: local.user_id, amountRefunded: charge.amount_refunded, amount: charge.amount },
      'partial refund — premium retained',
    )
    return
  }

  await trx('subscriptions')
    .where({ user_id: local.user_id })
    .update({ tier: 'free', status: 'canceled', updated_at: trx.fn.now() })
  invalidatePremiumCache(local.user_id)
  await recordSystemAction('subscription.system.refunded', local.user_id, {
    chargeId: charge.id,
    amount: charge.amount_refunded,
    stripeSubscriptionId: local.stripe_subscription_id,
  }, trx)
  handlerLogger.warn({ chargeId: charge.id, userId: local.user_id }, 'charge refunded — premium revoked')
}

async function handleChargeDispute(trx: Knex.Transaction, stripe: Stripe, event: Stripe.Event): Promise<void> {
  const dispute = event.data.object as Stripe.Dispute
  const chargeId = typeof dispute.charge === 'string' ? dispute.charge : dispute.charge.id
  const stripeCharge = await stripe.charges.retrieve(chargeId)
  const customer = typeof stripeCharge.customer === 'string' ? stripeCharge.customer : stripeCharge.customer?.id
  const subscriptionId = await chargeSubscriptionId(stripe, stripeCharge)
  if (!customer || !subscriptionId) return

  const local = await trx('subscriptions')
    .where({ stripe_customer_id: customer })
    .select('user_id', 'stripe_subscription_id')
    .forUpdate()
    .first()
  if (!local) return

  if (local.stripe_subscription_id !== subscriptionId) {
    handlerLogger.warn(
      { disputeId: dispute.id, userId: local.user_id, chargeSubId: subscriptionId, currentSubId: local.stripe_subscription_id },
      'dispute for a non-current subscription — premium retained',
    )
    return
  }

  await trx('subscriptions')
    .where({ user_id: local.user_id })
    .update({ tier: 'free', status: 'canceled', updated_at: trx.fn.now() })
  invalidatePremiumCache(local.user_id)
  await recordSystemAction('subscription.system.disputed', local.user_id, {
    disputeId: dispute.id,
    reason: dispute.reason,
    stripeSubscriptionId: local.stripe_subscription_id,
  }, trx)
  handlerLogger.error({ disputeId: dispute.id, userId: local.user_id }, 'dispute opened — premium revoked')
}

export async function handleStripeEvent(
  trx: Knex.Transaction,
  stripe: Stripe,
  event: Stripe.Event,
): Promise<void> {
  switch (event.type) {
    case 'checkout.session.completed':
      await handleCheckoutCompleted(trx, stripe, event)
      return
    case 'customer.subscription.created':
    case 'customer.subscription.updated':
      await handleSubscriptionEvent(trx, stripe, event)
      return
    case 'customer.subscription.deleted':
      await handleSubscriptionDeleted(trx, event)
      return
    case 'customer.subscription.trial_will_end':
      await handleTrialWillEnd(trx, event)
      return
    case 'invoice.payment_failed':
      await handleInvoicePaymentFailed(trx, stripe, event)
      return
    case 'invoice.payment_succeeded':
      await handleInvoicePaymentSucceeded(trx, stripe, event)
      return
    case 'charge.refunded':
      await handleChargeRefunded(trx, stripe, event)
      return
    case 'charge.dispute.created':
    case 'charge.dispute.funds_withdrawn':
      await handleChargeDispute(trx, stripe, event)
      return
    default:
      handlerLogger.debug({ eventType: event.type, eventId: event.id }, 'unhandled stripe event')
  }
}

export async function claimStripeEvent(eventId: string, eventType: string): Promise<boolean> {
  return db.transaction(async (trx) => {
    const inserted = await trx('stripe_events')
      .insert({
        event_id: eventId,
        event_type: eventType,
        status: 'pending',
        attempt_count: 1,
      })
      .onConflict('event_id')
      .merge({
        attempt_count: trx.raw('stripe_events.attempt_count + 1'),
        last_attempted_at: trx.fn.now(),
      })
      .returning(['status', 'attempt_count'])

    const row = inserted[0]
    return row?.status !== 'success'
  })
}
