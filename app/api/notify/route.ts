import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '../../../lib/supabase-server'
import webpush from 'web-push'
import SunCalc from 'suncalc'

const db = supabaseAdmin as any

webpush.setVapidDetails(
  process.env.VAPID_EMAIL!,
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!
)

export async function GET(req: NextRequest) {
  // Protect from public calls — Vercel passes this automatically from vercel.json
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: venues } = await db
    .from('venues')
    .select('id, name, lat, lng, outdoor_area')
    .not('outdoor_area', 'is', null)

  if (!venues?.length) return NextResponse.json({ sent: 0 })

  let sent = 0

  for (const venue of venues) {
    const sunPos = SunCalc.getPosition(new Date(), venue.lat, venue.lng)
    if (sunPos.altitude <= 0.05) continue

    const { data: favs } = await db
      .from('favorites')
      .select('user_id, push_subscriptions!inner(subscription)')
      .eq('venue_id', venue.id)

    if (!favs?.length) continue

    const payload = JSON.stringify({
      title: `☀️ ${venue.name} is in the sun!`,
      body: 'Your favourite spot just got sunny. Head over now.',
      url: '/',
    })

    for (const fav of favs) {
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
  }

  return NextResponse.json({ sent })
}
