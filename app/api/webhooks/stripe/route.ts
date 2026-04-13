import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { supabaseAdmin } from '../../../../lib/supabase-server'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)

export async function POST(req: NextRequest) {
  const body = await req.text()
  const sig = req.headers.get('stripe-signature')!

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET!)
  } catch {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  const sub = (event.data.object as any)

  if (
    event.type === 'customer.subscription.created' ||
    event.type === 'customer.subscription.updated' ||
    event.type === 'customer.subscription.deleted'
  ) {
    // Get the customer's email to find the user
    const customer = await stripe.customers.retrieve(sub.customer) as Stripe.Customer
    if (!customer.email) return NextResponse.json({ ok: true })

    const { data: { users } } = await supabaseAdmin.auth.admin.listUsers()
    const user = users.find(u => u.email === customer.email)
    if (!user) return NextResponse.json({ ok: true })

    await supabaseAdmin.from('stripe_subscriptions').upsert({
      user_id: user.id,
      stripe_customer_id: sub.customer,
      stripe_sub_id: sub.id,
      status: sub.status,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' })
  }

  return NextResponse.json({ ok: true })
}
