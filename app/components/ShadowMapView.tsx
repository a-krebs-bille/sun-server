'use client'
import { useEffect, useState, useMemo, useCallback } from 'react'
import DeckGL from '@deck.gl/react'
import { TileLayer } from '@deck.gl/geo-layers'
import { BitmapLayer, PolygonLayer, ScatterplotLayer } from '@deck.gl/layers'
import { MapView } from '@deck.gl/core'
import SunCalc from 'suncalc'
import { destination } from '@turf/destination'
import { convex } from '@turf/convex'
import { point, featureCollection } from '@turf/helpers'
import { booleanPointInPolygon } from '@turf/boolean-point-in-polygon'

// ─── Types ────────────────────────────────────────────────────────────────────
type SunStatus = 'sunny' | 'partial' | 'shaded' | 'night'
interface Venue { id: string; name: string; lat: number; lng: number; outdoor_area: [number, number][] }
interface Building { geometry: { lat: number; lon: number }[]; tags?: Record<string, string> }

// ─── Constants ────────────────────────────────────────────────────────────────
const DEFAULT_HEIGHT  = 15
const MAX_SHADOW_M    = 500
const GRID_SIZE       = 5
const PARTIAL_T       = 0.4
const SHADE_T         = 0.7

const OVERPASS_MIRRORS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
]

// ─── Helpers ──────────────────────────────────────────────────────────────────
function parseHeight(tags: Record<string, string> = {}): number {
  const raw = tags['height'] ?? tags['building:height']
  if (raw) { const n = parseFloat(raw); if (n > 0) return n }
  const lv = parseInt(tags['building:levels'] ?? '')
  if (lv > 0) return lv * 3.5
  return DEFAULT_HEIGHT
}

function calcShadowPolygon(
  building: Building,
  shadowBearingDeg: number,
  shadowLengthKm: number
): [number, number][] | null {
  if (!building.geometry?.length) return null
  const verts = building.geometry.map(g => [g.lon, g.lat] as [number, number])
  const pts = verts.flatMap(([lng, lat]) => {
    const proj = destination(point([lng, lat]), shadowLengthKm, shadowBearingDeg)
    return [point([lng, lat]), proj]
  })
  const hull = convex(featureCollection(pts))
  return (hull?.geometry?.coordinates[0] as [number, number][]) ?? null
}

function getSunStatus(
  venueLeaflet: [number, number][],
  shadows: [number, number][][]
): SunStatus {
  const coords = venueLeaflet.map(([lat, lng]) => [lng, lat] as [number, number])
  const closed = [...coords, coords[0]]
  const vPoly = { type: 'Feature' as const, geometry: { type: 'Polygon' as const, coordinates: [closed] }, properties: {} }
  const lngs = coords.map(c => c[0])
  const lats = coords.map(c => c[1])
  const minLng = Math.min(...lngs), maxLng = Math.max(...lngs)
  const minLat = Math.min(...lats), maxLat = Math.max(...lats)

  let shaded = 0, total = 0
  for (let i = 0; i < GRID_SIZE; i++) {
    for (let j = 0; j < GRID_SIZE; j++) {
      const lng = minLng + (maxLng - minLng) * (i + 0.5) / GRID_SIZE
      const lat = minLat + (maxLat - minLat) * (j + 0.5) / GRID_SIZE
      const p = point([lng, lat])
      if (!booleanPointInPolygon(p, vPoly)) continue
      total++
      for (const s of shadows) {
        const sPoly = { type: 'Feature' as const, geometry: { type: 'Polygon' as const, coordinates: [s] }, properties: {} }
        if (booleanPointInPolygon(p, sPoly)) { shaded++; break }
      }
    }
  }
  if (total === 0) return 'sunny'
  const f = shaded / total
  return f < PARTIAL_T ? 'sunny' : f < SHADE_T ? 'partial' : 'shaded'
}

function toMinutes(date: Date) {
  return date.getHours() * 60 + date.getMinutes()
}

function minutesToDate(baseDate: Date, minutes: number): Date {
  const d = new Date(baseDate)
  d.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0)
  return d
}

function formatTime(minutes: number): string {
  const h = Math.floor(minutes / 60).toString().padStart(2, '0')
  const m = (minutes % 60).toString().padStart(2, '0')
  return `${h}:${m}`
}

// ─── Main Component ───────────────────────────────────────────────────────────
interface Props {
  venues: Venue[]
  centerLat?: number
  centerLng?: number
}

export default function ShadowMapView({ venues, centerLat = 56.15, centerLng = 10.21 }: Props) {
  const [buildings, setBuildings] = useState<Building[]>([])
  const [loadingBuildings, setLoadingBuildings] = useState(true)
  const [timeMinutes, setTimeMinutes] = useState(() => toMinutes(new Date()))
  const [isDragging, setIsDragging] = useState(false)

  const today = useMemo(() => new Date(), [])

  // Sunrise / sunset for slider range
  const { sunriseMin, sunsetMin } = useMemo(() => {
    const times = SunCalc.getTimes(today, centerLat, centerLng)
    return {
      sunriseMin: toMinutes(times.sunrise),
      sunsetMin: toMinutes(times.sunset),
    }
  }, [today, centerLat, centerLng])

  // Fetch all buildings once for the whole area
  useEffect(() => {
    if (venues.length === 0) { setLoadingBuildings(false); return }
    const lats = venues.map(v => v.lat)
    const lngs = venues.map(v => v.lng)
    const pad = 0.005
    const s = Math.min(...lats) - pad, n = Math.max(...lats) + pad
    const w = Math.min(...lngs) - pad, e = Math.max(...lngs) + pad
    const query = `[out:json][timeout:25];way["building"](${s},${w},${n},${e});out geom;`

    async function fetchBuildings() {
      for (const mirror of OVERPASS_MIRRORS) {
        try {
          const res = await fetch(mirror, { method: 'POST', body: query })
          if (!res.ok) continue
          const data = await res.json()
          setBuildings(data.elements ?? [])
          break
        } catch { /* try next */ }
      }
      setLoadingBuildings(false)
    }
    fetchBuildings()
  }, [venues])

  // Recalculate shadows + venue status whenever time changes
  const { shadowPolygons, venueStatuses } = useMemo(() => {
    const date = minutesToDate(today, timeMinutes)
    const sunPos = SunCalc.getPosition(date, centerLat, centerLng)

    if (sunPos.altitude <= 0) {
      return { shadowPolygons: [], venueStatuses: venues.map(() => 'night' as SunStatus) }
    }

    const sunBearingDeg = ((sunPos.azimuth * 180 / Math.PI) + 180 + 360) % 360
    const shadowBearingDeg = (sunBearingDeg + 180) % 360

    const shadows: [number, number][][] = []
    for (const b of buildings) {
      const height = parseHeight(b.tags)
      const lengthKm = Math.min(height / Math.tan(sunPos.altitude), MAX_SHADOW_M) / 1000
      const poly = calcShadowPolygon(b, shadowBearingDeg, lengthKm)
      if (poly) shadows.push(poly)
    }

    const statuses = venues.map(v =>
      v.outdoor_area ? getSunStatus(v.outdoor_area, shadows) : 'sunny'
    )

    return { shadowPolygons: shadows, venueStatuses: statuses }
  }, [timeMinutes, buildings, venues, centerLat, centerLng, today])

  // deck.gl layers
  const layers = useMemo(() => [
    // Basemap tiles — CartoDB Positron
    new TileLayer({
      id: 'basemap',
      data: 'https://a.basemaps.cartocdn.com/light_all/{z}/{x}/{y}@2x.png',
      minZoom: 0,
      maxZoom: 19,
      tileSize: 256,
      renderSubLayers: (props: any) => new BitmapLayer(props, {
        data: undefined,
        image: props.data,
        bounds: [props.tile.bbox.west, props.tile.bbox.south, props.tile.bbox.east, props.tile.bbox.north],
      }),
    }),

    // Building footprints — warm grey
    new PolygonLayer({
      id: 'buildings',
      data: buildings.filter(b => b.geometry?.length >= 3),
      getPolygon: (b: Building) => b.geometry.map(g => [g.lon, g.lat]),
      getFillColor: [215, 210, 200, 255],
      getLineColor: [180, 170, 160, 100],
      lineWidthMinPixels: 0.5,
      pickable: false,
    }),

    // Shadow polygons — dark navy, semi-transparent
    new PolygonLayer({
      id: 'shadows',
      data: shadowPolygons.map(coords => ({ coords })),
      getPolygon: (d: { coords: [number, number][] }) => d.coords,
      getFillColor: [15, 20, 45, 140],
      stroked: false,
      pickable: false,
    }),

    // Venue outdoor areas — coloured by sun status
    new PolygonLayer({
      id: 'venues',
      data: venues.filter(v => v.outdoor_area),
      getPolygon: (v: Venue) => v.outdoor_area.map(([lat, lng]) => [lng, lat]),
      getFillColor: (v: Venue, { index }: { index: number }) => {
        const s = venueStatuses[index]
        if (s === 'sunny')   return [255, 160, 40, 220]
        if (s === 'partial') return [255, 200, 80, 200]
        if (s === 'night')   return [60, 60, 100, 180]
        return [90, 105, 130, 200] // shaded
      },
      getLineColor: (v: Venue, { index }: { index: number }) => {
        const s = venueStatuses[index]
        if (s === 'sunny')   return [255, 130, 0, 255]
        if (s === 'partial') return [220, 170, 0, 255]
        if (s === 'night')   return [40, 40, 80, 200]
        return [60, 80, 110, 255]
      },
      lineWidthMinPixels: 2,
      pickable: true,
      updateTriggers: { getFillColor: venueStatuses, getLineColor: venueStatuses },
    }),

    // Venue centre dots
    new ScatterplotLayer({
      id: 'venue-dots',
      data: venues.map((v, i) => ({ ...v, status: venueStatuses[i] })),
      getPosition: (v: any) => [v.lng, v.lat],
      getRadius: 6,
      radiusUnits: 'pixels',
      getFillColor: (v: any) => {
        if (v.status === 'sunny')   return [255, 140, 20, 255]
        if (v.status === 'partial') return [220, 180, 0, 255]
        if (v.status === 'night')   return [60, 60, 100, 255]
        return [80, 100, 130, 255]
      },
      getLineColor: [255, 255, 255, 200],
      lineWidthMinPixels: 1.5,
      stroked: true,
      pickable: true,
      updateTriggers: { getFillColor: venueStatuses },
    }),
  ], [buildings, shadowPolygons, venues, venueStatuses])

  const initialViewState = {
    longitude: centerLng,
    latitude: centerLat,
    zoom: 15,
    pitch: 0,
    bearing: 0,
  }

  const isNight = timeMinutes < sunriseMin || timeMinutes > sunsetMin
  const sliderPct = Math.round(
    ((timeMinutes - sunriseMin) / (sunsetMin - sunriseMin)) * 100
  )

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <DeckGL
        initialViewState={initialViewState}
        controller={true}
        layers={layers}
        views={new MapView({ repeat: false })}
        style={{ background: '#f5f0e8' }}
      />

      {/* Time Slider */}
      <div style={{
        position: 'absolute',
        bottom: 24,
        left: '50%',
        transform: 'translateX(-50%)',
        background: 'rgba(255,255,255,0.96)',
        backdropFilter: 'blur(8px)',
        borderRadius: 16,
        padding: '12px 20px',
        boxShadow: '0 2px 16px rgba(0,0,0,0.12)',
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        minWidth: 280,
        fontFamily: 'Helvetica Neue, Helvetica, Arial, sans-serif',
        zIndex: 10,
      }}>
        {/* Sun icon */}
        <span style={{ fontSize: 18 }}>
          {isNight ? '🌙' : timeMinutes < (sunriseMin + sunsetMin) / 2 ? '🌅' : '☀️'}
        </span>

        {/* Slider */}
        <div style={{ flex: 1, position: 'relative' }}>
          <div style={{
            position: 'absolute', top: '50%', left: 0, right: 0,
            height: 4, background: '#eee', borderRadius: 2, transform: 'translateY(-50%)',
          }} />
          <div style={{
            position: 'absolute', top: '50%', left: 0,
            width: `${Math.max(0, Math.min(100, sliderPct))}%`,
            height: 4, background: isNight ? '#7090b0' : '#ff9a28',
            borderRadius: 2, transform: 'translateY(-50%)',
            transition: isDragging ? 'none' : 'width 0.1s',
          }} />
          <input
            type="range"
            min={sunriseMin - 60}
            max={sunsetMin + 60}
            value={timeMinutes}
            onChange={e => setTimeMinutes(Number(e.target.value))}
            onMouseDown={() => setIsDragging(true)}
            onMouseUp={() => setIsDragging(false)}
            onTouchStart={() => setIsDragging(true)}
            onTouchEnd={() => setIsDragging(false)}
            style={{
              position: 'relative', width: '100%', height: 20,
              opacity: 0, cursor: 'pointer', margin: 0, zIndex: 1,
            }}
          />
        </div>

        {/* Time display */}
        <span style={{
          fontSize: 15, fontWeight: 600, letterSpacing: '0.02em',
          color: isNight ? '#7090b0' : '#cc6600',
          minWidth: 40, textAlign: 'right',
        }}>
          {formatTime(timeMinutes)}
        </span>
      </div>

      {/* Loading indicator */}
      {loadingBuildings && (
        <div style={{
          position: 'absolute', top: 16, left: '50%', transform: 'translateX(-50%)',
          background: 'rgba(255,255,255,0.95)', borderRadius: 20,
          padding: '6px 16px', fontSize: 12, fontFamily: 'Helvetica Neue, Helvetica, Arial, sans-serif',
          color: '#666', boxShadow: '0 1px 8px rgba(0,0,0,0.1)', zIndex: 10,
        }}>
          Loading buildings…
        </div>
      )}

      {/* Legend */}
      <div style={{
        position: 'absolute', top: 16, right: 16,
        background: 'rgba(255,255,255,0.95)',
        backdropFilter: 'blur(8px)',
        borderRadius: 12, padding: '10px 14px',
        boxShadow: '0 1px 8px rgba(0,0,0,0.1)',
        fontFamily: 'Helvetica Neue, Helvetica, Arial, sans-serif',
        fontSize: 12, zIndex: 10,
        display: 'flex', flexDirection: 'column', gap: 6,
      }}>
        {[
          { color: '#ff9a28', label: 'In the sun' },
          { color: '#ffc840', label: 'Partially sunny' },
          { color: '#5a6982', label: 'In the shade' },
        ].map(({ color, label }) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 12, height: 12, borderRadius: 3, background: color, flexShrink: 0 }} />
            <span style={{ color: '#333' }}>{label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
