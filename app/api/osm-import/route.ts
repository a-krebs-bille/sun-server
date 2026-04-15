import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '../../../lib/supabase-server'

const OVERPASS_MIRRORS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
]

const QUERY = `[out:json][timeout:25];(node["amenity"~"^(cafe|restaurant|bar)$"]["name"](56.13,10.17,56.20,10.25);way["amenity"~"^(cafe|restaurant|bar)$"]["name"](56.13,10.17,56.20,10.25););out center;`

function normalizeName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '')
}

function haversineM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

export async function GET() {
  // 1. Fetch OSM venues
  let osmElements: any[] = []
  for (const mirror of OVERPASS_MIRRORS) {
    try {
      const res = await fetch(mirror, {
        method: 'POST',
        body: QUERY,
        headers: { 'Content-Type': 'text/plain' },
      })
      if (!res.ok) continue
      const data = await res.json()
      osmElements = data.elements ?? []
      break
    } catch { /* try next mirror */ }
  }

  // Extract name + coords from each element
  const osmVenues = osmElements
    .map((el: any) => {
      const name: string | undefined = el.tags?.name
      if (!name) return null
      const lat: number = el.type === 'node' ? el.lat : el.center?.lat
      const lng: number = el.type === 'node' ? el.lon : el.center?.lon
      if (lat == null || lng == null) return null
      return { name, lat, lng }
    })
    .filter(Boolean) as { name: string; lat: number; lng: number }[]

  // 2. Load existing venues from Supabase
  const supabase = getSupabaseAdmin() as any
  const { data: existingVenues } = await supabase.from('venues').select('id, name, lat, lng')
  const existing: { id: string; name: string; lat: number; lng: number }[] = existingVenues ?? []

  // 3. Match and insert
  let inserted = 0
  let skipped = 0
  const total = osmVenues.length

  for (const osm of osmVenues) {
    const osmNorm = normalizeName(osm.name)

    // Name match first
    const nameMatch = existing.some(e => {
      const eNorm = normalizeName(e.name)
      return eNorm.includes(osmNorm) || osmNorm.includes(eNorm)
    })

    if (nameMatch) {
      skipped++
      continue
    }

    // Proximity fallback — within 80m
    const proximityMatch = existing.some(e =>
      haversineM(osm.lat, osm.lng, e.lat, e.lng) <= 80
    )

    if (proximityMatch) {
      skipped++
      continue
    }

    // Insert new venue
    await supabase.from('venues').insert({ name: osm.name, lat: osm.lat, lng: osm.lng })
    inserted++
  }

  return NextResponse.json({ inserted, skipped, total })
}
