import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '../../../lib/supabase-server'
import webpush from 'web-push'
import SunCalc from 'suncalc'

webpush.setVapidDetails(
  process.env.VAPID_EMAIL!,
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!
)

const PARTIAL_THRESHOLD = 0.4
const SHADE_THRESHOLD   = 0.7

function quickSunStatus(lat: number, lng: number): 'night' | 'day' {
  const pos = SunCalc.getPosition(new Date(), lat, lng)
  return pos.altitude > 0 ? 'day' : 'night'
}

export async function GET(req: NextRequest) {
  // Protect from public calls — Vercel passes this automatically from vercel.json
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Fetch all venues that have at least one favourite and have an outdoor area
  const { data: venues } = await supabaseAdmin
    .from('venues')
    .select('id, name, lat, lng, outdoor_area')
    .not('outdoor_area', 'is', null)

  if (!venues?.length) return NextResponse.json({ sent: 0 })

  // For each sunny venue, get the favouriting users + their push subscriptions
  let sent = 0

  for (const venue of venues) {
    if (quickSunStatus(venue.lat, venue.lng) === 'night') continue

    // Check sun status via our API (simple altitude check for cron — good enough)
    const sunPos = SunCalc.getPosition(new Date(), venue.lat, venue.lng)
    if (sunPos.altitude <= 0.05) continue // not sunny enough

    // Find users who favourited this venue AND have push subscriptions
    const { data: favs } = await supabaseAdmin
      .from('favorites')
      .select('user_id, push_subscriptions!inner(subscription)')
      .eq('venue_id', venue.id)

    if (!favs?.length) continue

    const payload = JSON.stringify({
      title: `☀️ ${venue.name} is in the sun!`,
      body: 'Your favourite spot just got sunny. Head over now.',
      url: '/',
    })

    for (const fav of favs as any[]) {
      const sub = fav.push_subscriptions?.subscription
      if (!sub) continue
      try {
        await webpush.sendNotification(sub, payload)
        sent++
      } catch (err: any) {
        // Subscription expired — clean it up
        if (err.statusCode === 410) {
          await supabaseAdmin
            .from('push_subscriptions')
            .delete()
            .eq('user_id', fav.user_id)
        }
      }
    }
  }

  return NextResponse.json({ sent })
}
