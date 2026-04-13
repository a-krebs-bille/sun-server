import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '../../../lib/supabase-server'
import Stripe from 'stripe'
import webpush from 'web-push'

const db = supabaseAdmin as any
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)

webpush.setVapidDetails(
  process.env.VAPID_EMAIL!,
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!
)

async function getUserId(req: NextRequest): Promise<string | null> {
  const token = req.headers.get('authorization')?.replace('Bearer ', '')
  if (!token) return null
  const { data: { user } } = await supabaseAdmin.auth.getUser(token)
  return user?.id ?? null
}

async function hasProSubscription(userEmail: string): Promise<boolean> {
  const customers = await stripe.customers.list({ email: userEmail, limit: 1 })
  if (!customers.data.length) return false
  const subs = await stripe.subscriptions.list({ customer: customers.data[0].id, status: 'active', limit: 5 })
  return subs.data.some(sub =>
    sub.items.data.some(item => {
      const name = (item.price.nickname ?? '').toLowerCase()
      return name.includes('pro') || name.includes('chain')
    })
  )
}

// GET /api/offers?venue_id=xxx — get active offers for a venue
export async function GET(req: NextRequest) {
  const venueId = req.nextUrl.searchParams.get('venue_id')
  if (!venueId) return NextResponse.json({ offers: [] })

  const { data } = await db
    .from('offers')
    .select('*')
    .eq('venue_id', venueId)
    .or('expires_at.is.null,expires_at.gt.now()')
    .order('created_at', { ascending: false })
    .limit(1)

  return NextResponse.json({ offers: data ?? [] })
}

// POST /api/offers — send an offer
export async function POST(req: NextRequest) {
  const userId = await getUserId(req)
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: { user } } = await supabaseAdmin.auth.admin.getUserById(userId)
  if (!user?.email) return NextResponse.json({ error: 'No email on account' }, { status: 400 })

  const isPro = await hasProSubscription(user.email)
  if (!isPro) {
    return NextResponse.json(
      { error: 'subscription_required', message: 'Upgrade to Pro or Chain to send offers.' },
      { status: 403 }
    )
  }

  const { venueId, title, expiresAt } = await req.json()
  if (!venueId || !title) return NextResponse.json({ error: 'Missing fields' }, { status: 400 })

  const { data: offer, error } = await db
    .from('offers')
    .insert({ venue_id: venueId, title, expires_at: expiresAt ?? null })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const { data: venue } = await db.from('venues').select('name').eq('id', venueId).single()

  const { data: favs } = await db
    .from('favorites')
    .select('user_id, push_subscriptions!inner(subscription)')
    .eq('venue_id', venueId)

  const payload = JSON.stringify({
    title: `🏷️ ${venue?.name ?? 'A venue'} has an offer!`,
    body: title,
    url: '/',
  })

  let sent = 0
  for (const fav of (favs ?? [])) {
    const sub = fav.push_subscriptions?.subscription
    if (!sub) continue
    try {
      await webpush.sendNotification(sub, payload)
      sent++
    } catch (err: any) {
      if (err.statusCode === 410) {
        await db.from('push_subscriptions').delete().eq('user_id', fav.user_id)
      }
    }
  }

  return NextResponse.json({ offer, notified: sent })
}
