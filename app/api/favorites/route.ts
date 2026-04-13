import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '../../../lib/supabase-server'

const db = supabaseAdmin as any

async function getUserId(req: NextRequest): Promise<string | null> {
  const token = req.headers.get('authorization')?.replace('Bearer ', '')
  if (!token) return null
  const { data: { user } } = await supabaseAdmin.auth.getUser(token)
  return user?.id ?? null
}

// GET /api/favorites — list all venue_ids favourited by the current user
export async function GET(req: NextRequest) {
  const userId = await getUserId(req)
  if (!userId) return NextResponse.json({ favorites: [] })

  const { data } = await db.from('favorites').select('venue_id').eq('user_id', userId)
  return NextResponse.json({ favorites: (data ?? []).map((r: any) => r.venue_id) })
}

// POST /api/favorites — toggle a favourite { venueId }
export async function POST(req: NextRequest) {
  const userId = await getUserId(req)
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { venueId } = await req.json()
  if (!venueId) return NextResponse.json({ error: 'Missing venueId' }, { status: 400 })

  const { data: existing } = await db.from('favorites').select('id').eq('user_id', userId).eq('venue_id', venueId).maybeSingle()

  if (existing) {
    await db.from('favorites').delete().eq('id', existing.id)
    return NextResponse.json({ favorited: false })
  } else {
    await db.from('favorites').insert({ user_id: userId, venue_id: venueId })
    return NextResponse.json({ favorited: true })
  }
}
