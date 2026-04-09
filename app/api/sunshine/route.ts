import { NextRequest, NextResponse } from 'next/server'
import SunCalc from 'suncalc'
import { point, polygon, featureCollection } from '@turf/helpers'
import destination from '@turf/destination'
import convex from '@turf/convex'
import booleanPointInPolygon from '@turf/boolean-point-in-polygon'
import center from '@turf/center'

const DEFAULT_BUILDING_HEIGHT = 8 // metres, when OSM has no height tag
const MAX_SHADOW_LENGTH = 500     // cap shadows at 500m (very low sun)
const BUILDING_SEARCH_RADIUS = 150 // metres around venue centre

// Parse height from OSM tags — tries 'height', 'building:height', then levels * 3m
function parseHeight(tags: Record<string, string>): number {
  const raw = tags['height'] ?? tags['building:height']
  if (raw) {
    const n = parseFloat(raw)
    if (!isNaN(n) && n > 0) return n
  }
  const levels = parseInt(tags['building:levels'] ?? '')
  if (!isNaN(levels) && levels > 0) return levels * 3
  return DEFAULT_BUILDING_HEIGHT
}

// Project all vertices of a building polygon by shadowLength in shadowBearing,
// then return the convex hull of original + projected points as a shadow polygon.
function buildShadowPolygon(
  vertices: [number, number][], // [lng, lat]
  shadowBearingDeg: number,
  shadowLengthKm: number,
) {
  const allPoints = vertices.flatMap(([lng, lat]) => {
    const proj = destination(point([lng, lat]), shadowLengthKm, shadowBearingDeg)
    return [point([lng, lat]), proj]
  })
  const hull = convex(featureCollection(allPoints))
  return hull
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { lat, lng, outdoor_area } = body as {
    lat: number
    lng: number
    outdoor_area: [number, number][] // Leaflet format: [lat, lng]
  }

  // 1. Sun position at this location right now
  const sunPos = SunCalc.getPosition(new Date(), lat, lng)

  if (sunPos.altitude <= 0) {
    // Sun is below the horizon
    return NextResponse.json({ is_sunny: false, reason: 'night' })
  }

  // 2. Fetch buildings within radius from Overpass
  const query = `[out:json][timeout:10];way["building"](around:${BUILDING_SEARCH_RADIUS},${lat},${lng});out geom;`
  let buildings: any[] = []
  try {
    const res = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      body: query,
    })
    const data = await res.json()
    buildings = data.elements ?? []
  } catch {
    // If Overpass is unavailable, fall back to "sunny if daytime"
    return NextResponse.json({ is_sunny: true, reason: 'overpass_unavailable' })
  }

  // 3. Compute sun/shadow geometry
  // suncalc azimuth: 0 = south, clockwise. Convert to compass bearing from north.
  const sunBearingDeg = ((sunPos.azimuth * 180) / Math.PI + 180 + 360) % 360
  const shadowBearingDeg = (sunBearingDeg + 180) % 360
  const shadowLengthM = Math.min(
    DEFAULT_BUILDING_HEIGHT / Math.tan(sunPos.altitude),
    MAX_SHADOW_LENGTH,
  )
  const shadowLengthKm = shadowLengthM / 1000

  // 4. Build venue polygon and get its centre point
  // (convert from Leaflet [lat,lng] to GeoJSON [lng,lat])
  const venueCoords = outdoor_area.map(([vlat, vlng]) => [vlng, vlat] as [number, number])
  venueCoords.push(venueCoords[0]) // close the ring
  const venuePolygon = polygon([venueCoords])
  const venueCentre = center(venuePolygon)

  // 5. Check if the venue's centre point falls inside any building's shadow
  for (const building of buildings) {
    if (!building.geometry?.length) continue

    const verts: [number, number][] = building.geometry.map(
      (g: { lat: number; lon: number }) => [g.lon, g.lat],
    )
    if (verts.length < 3) continue

    const height = parseHeight(building.tags ?? {})
    const buildingShadowLengthKm = Math.min(height / Math.tan(sunPos.altitude), MAX_SHADOW_LENGTH) / 1000

    const shadow = buildShadowPolygon(verts, shadowBearingDeg, buildingShadowLengthKm)
    if (!shadow) continue

    if (booleanPointInPolygon(venueCentre, shadow)) {
      return NextResponse.json({ is_sunny: false, reason: 'shadow' })
    }
  }

  return NextResponse.json({ is_sunny: true, reason: 'clear' })
}
