import { NextRequest, NextResponse } from 'next/server'
import SunCalc from 'suncalc'
import { point, polygon, featureCollection } from '@turf/helpers'
import { destination } from '@turf/destination'
import { convex } from '@turf/convex'
import { booleanPointInPolygon } from '@turf/boolean-point-in-polygon'

const DEFAULT_BUILDING_HEIGHT = 15  // metres — typical 5-storey Danish city-centre building
const MAX_SHADOW_LENGTH = 500       // cap at 500m (very low sun)
const BUILDING_SEARCH_RADIUS = 300  // metres around venue centre
const PARTIAL_THRESHOLD = 0.4       // ≥40% shaded (≤60% sunshine) → partially sunny
const SHADE_THRESHOLD = 0.7         // ≥70% shaded (≤30% sunshine) → in shade
const GRID_SIZE = 5                 // 5×5 = up to 25 sample points across the venue

// Parse height from OSM tags — tries 'height', 'building:height', then levels × 3.5m
function parseHeight(tags: Record<string, string>): number {
  const raw = tags['height'] ?? tags['building:height']
  if (raw) {
    const n = parseFloat(raw)
    if (!isNaN(n) && n > 0) return n
  }
  const levels = parseInt(tags['building:levels'] ?? '')
  if (!isNaN(levels) && levels > 0) return levels * 3.5  // 3.5m/floor for older DK buildings
  return DEFAULT_BUILDING_HEIGHT
}

// Build shadow polygon: project all vertices in shadow direction, take convex hull
function buildShadowPolygon(
  vertices: [number, number][],
  shadowBearingDeg: number,
  shadowLengthKm: number,
) {
  const allPoints = vertices.flatMap(([lng, lat]) => {
    const proj = destination(point([lng, lat]), shadowLengthKm, shadowBearingDeg)
    return [point([lng, lat]), proj]
  })
  return convex(featureCollection(allPoints))
}

// Sample a grid of points inside the venue polygon
function sampleVenuePoints(venueCoords: [number, number][], venuePolygon: any): any[] {
  const lngs = venueCoords.map(c => c[0])
  const lats = venueCoords.map(c => c[1])
  const minLng = Math.min(...lngs), maxLng = Math.max(...lngs)
  const minLat = Math.min(...lats), maxLat = Math.max(...lats)

  const samples: any[] = []
  for (let i = 0; i < GRID_SIZE; i++) {
    for (let j = 0; j < GRID_SIZE; j++) {
      const lng = minLng + (maxLng - minLng) * (i + 0.5) / GRID_SIZE
      const lat = minLat + (maxLat - minLat) * (j + 0.5) / GRID_SIZE
      const p = point([lng, lat])
      if (booleanPointInPolygon(p, venuePolygon)) samples.push(p)
    }
  }

  // Always include the centre; if grid found nothing, use centre only
  const cLng = (minLng + maxLng) / 2
  const cLat = (minLat + maxLat) / 2
  if (samples.length === 0) samples.push(point([cLng, cLat]))
  return samples
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { lat, lng, outdoor_area, buildings: clientBuildings } = body as {
      lat: number
      lng: number
      outdoor_area: [number, number][]  // Leaflet [lat, lng]
      buildings?: any[] | null          // pre-fetched by browser (optional)
    }

    // 1. Sun position
    const sunPos = SunCalc.getPosition(new Date(), lat, lng)
    if (sunPos.altitude <= 0) {
      return NextResponse.json({ is_sunny: false, sun_status: 'shaded', reason: 'night' })
    }

    // 2. Use client-provided buildings (fetched by browser where Overpass works),
    //    or fall back to server-side Overpass if not provided.
    let buildings: any[] = []
    if (clientBuildings != null) {
      buildings = clientBuildings
    } else {
      const query = `[out:json][timeout:15];way["building"](around:${BUILDING_SEARCH_RADIUS},${lat},${lng});out geom;`
      const OVERPASS_MIRRORS = [
        'https://overpass-api.de/api/interpreter',
        'https://overpass.kumi.systems/api/interpreter',
        'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
      ]
      let overpassOk = false
      for (const mirror of OVERPASS_MIRRORS) {
        try {
          const controller = new AbortController()
          const t = setTimeout(() => controller.abort(), 10_000)
          const res = await fetch(mirror, { method: 'POST', body: query, signal: controller.signal })
          clearTimeout(t)
          if (!res.ok) continue
          const data = await res.json()
          buildings = data.elements ?? []
          overpassOk = true
          break
        } catch { /* try next */ }
      }
      if (!overpassOk) {
        return NextResponse.json({ is_sunny: null, sun_status: 'unknown', reason: 'overpass_unavailable' })
      }
    }

    // 3. Sun/shadow geometry
    const sunBearingDeg = ((sunPos.azimuth * 180) / Math.PI + 180 + 360) % 360
    const shadowBearingDeg = (sunBearingDeg + 180) % 360

    // 4. Build venue polygon + sample points
    const venueCoords = outdoor_area.map(([vlat, vlng]) => [vlng, vlat] as [number, number])
    venueCoords.push(venueCoords[0])
    const venuePolygon = polygon([venueCoords])
    const samplePoints = sampleVenuePoints(venueCoords, venuePolygon)

    // 5. Pre-build all shadow polygons
    const shadows = buildings.flatMap(building => {
      if (!building.geometry?.length) return []
      const verts: [number, number][] = building.geometry.map(
        (g: { lat: number; lon: number }) => [g.lon, g.lat]
      )
      if (verts.length < 3) return []
      const height = parseHeight(building.tags ?? {})
      const shadowLengthKm = Math.min(height / Math.tan(sunPos.altitude), MAX_SHADOW_LENGTH) / 1000
      const shadow = buildShadowPolygon(verts, shadowBearingDeg, shadowLengthKm)
      return shadow ? [shadow] : []
    })

    // 6. Count how many sample points are in shadow
    let shadedCount = 0
    for (const sample of samplePoints) {
      for (const shadow of shadows) {
        if (booleanPointInPolygon(sample, shadow)) {
          shadedCount++
          break  // no need to check other shadows for this point
        }
      }
    }

    const shadedFraction = shadedCount / samplePoints.length
    const sun_status =
      shadedFraction < PARTIAL_THRESHOLD ? 'sunny' :
      shadedFraction < SHADE_THRESHOLD   ? 'partial' :
                                           'shaded'

    return NextResponse.json({
      is_sunny: sun_status === 'sunny',
      sun_status,
      debug: { shadedFraction: Math.round(shadedFraction * 100) + '%', sampleCount: samplePoints.length, buildingCount: buildings.length }
    })

  } catch (err: any) {
    console.error('Sunshine API error:', err)
    return NextResponse.json({ is_sunny: true, reason: 'error', error: err?.message })
  }
}
