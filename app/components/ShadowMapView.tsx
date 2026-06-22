'use client'
import { useEffect, useState, useMemo, useCallback } from 'react'
import { Sun, CloudSun, Cloud, Moon, Heart, Tag, Clock, Armchair, Plus, MapPin } from 'lucide-react'
import DeckGL from '@deck.gl/react'
import { TileLayer } from '@deck.gl/geo-layers'
import { BitmapLayer, PolygonLayer, ScatterplotLayer } from '@deck.gl/layers'
import { MapView } from '@deck.gl/core'
import SunCalc from 'suncalc'
import { destination } from '@turf/destination'
import { point } from '@turf/helpers'
import { convexHull } from '../../lib/hull'

// ─── Types ────────────────────────────────────────────────────────────────────
type SunStatus = 'sunny' | 'partial' | 'shaded' | 'night'

interface Venue {
  id: string
  name: string
  lat: number
  lng: number
  outdoor_area?: [number, number][]
  sun_status?: SunStatus
  is_sunny?: boolean
  active_offer?: string
  profile?: Record<string, any>
}

interface Building { geometry: { lat: number; lon: number }[]; tags?: Record<string, string> }

// ─── Constants ────────────────────────────────────────────────────────────────
const DEFAULT_HEIGHT = 15
const MAX_SHADOW_M   = 500
const OVERPASS_MIRRORS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
]

// ─── Pin colours ─────────────────────────────────────────────────────────────
function pinColor(status: SunStatus | undefined): [number,number,number,number] {
  if (status === 'sunny')   return [255, 160, 30, 255]
  if (status === 'partial') return [255, 200, 60, 255]
  if (status === 'night')   return [80, 90, 130, 255]
  return [150, 160, 175, 255] // shaded
}

// ─── Shadow helpers ───────────────────────────────────────────────────────────
function parseHeight(tags: Record<string, string> = {}): number {
  const raw = tags['height'] ?? tags['building:height']
  if (raw) { const n = parseFloat(raw); if (n > 0) return n }
  const lv = parseInt(tags['building:levels'] ?? '')
  if (lv > 0) return lv * 3.5
  return DEFAULT_HEIGHT
}

function buildShadow(b: Building, bearingDeg: number, lengthKm: number): [number,number][] | null {
  if (!b.geometry?.length) return null
  const verts = b.geometry.map(g => [g.lon, g.lat] as [number,number])
  const pts = verts.flatMap(([lng, lat]) => {
    const proj = destination(point([lng, lat]), lengthKm, bearingDeg)
    const [plng, plat] = proj.geometry.coordinates
    return [[lng, lat], [plng, plat]] as [number, number][]
  })
  return convexHull(pts)
}

async function fetchBuildingsNear(lat: number, lng: number): Promise<Building[]> {
  const pad = 0.005
  const q = `[out:json][timeout:20];way["building"](${lat-pad},${lng-pad},${lat+pad},${lng+pad});out geom;`
  for (const mirror of OVERPASS_MIRRORS) {
    try {
      const r = await fetch(mirror, { method: 'POST', body: q })
      if (!r.ok) continue
      const d = await r.json()
      return d.elements ?? []
    } catch { /* try next */ }
  }
  return []
}

// Public-venue lookup for user submissions — runs in the browser because
// server-side Overpass is blocked on Vercel. A user can only add a venue that
// already exists as a public place in OSM, which keeps out spam/private spots.
const PUBLIC_AMENITIES = '^(cafe|restaurant|bar|pub|fast_food|biergarten|ice_cream|food_court)$'
const AMENITY_LABELS: Record<string, string> = {
  cafe: 'Café', restaurant: 'Restaurant', bar: 'Bar', pub: 'Pub',
  fast_food: 'Fast food', biergarten: 'Beer garden', ice_cream: 'Ice cream', food_court: 'Food court',
}

async function fetchNearbyPublicVenues(lat: number, lng: number): Promise<NearbyVenue[]> {
  const q =
    `[out:json][timeout:15];(` +
    `node["amenity"~"${PUBLIC_AMENITIES}"]["name"](around:70,${lat},${lng});` +
    `way["amenity"~"${PUBLIC_AMENITIES}"]["name"](around:70,${lat},${lng});` +
    `);out center;`
  for (const mirror of OVERPASS_MIRRORS) {
    try {
      const r = await fetch(mirror, { method: 'POST', body: q })
      if (!r.ok) continue
      const d = await r.json()
      return (d.elements ?? [])
        .map((el: any) => {
          const vlat = el.lat ?? el.center?.lat
          const vlng = el.lon ?? el.center?.lon
          if (vlat == null || vlng == null) return null
          const amenity = el.tags?.amenity ?? ''
          const dLat = (vlat - lat) * 111000
          const dLng = (vlng - lng) * 111000 * Math.cos((lat * Math.PI) / 180)
          return {
            name: el.tags.name as string,
            type: amenity,
            typeLabel: AMENITY_LABELS[amenity] ?? 'Venue',
            lat: vlat, lng: vlng,
            dist: Math.round(Math.sqrt(dLat * dLat + dLng * dLng)),
          } as NearbyVenue
        })
        .filter((v: NearbyVenue | null): v is NearbyVenue => v != null)
        .sort((a: NearbyVenue, b: NearbyVenue) => a.dist - b.dist)
    } catch { /* try next */ }
  }
  return []
}

function calcShadows(buildings: Building[], lat: number, lng: number): [number,number][][] {
  const sunPos = SunCalc.getPosition(new Date(), lat, lng)
  if (sunPos.altitude <= 0) return []
  const sunBearing = ((sunPos.azimuth * 180 / Math.PI) + 180 + 360) % 360
  const shadowBearing = (sunBearing + 180) % 360
  const shadows: [number,number][][] = []
  for (const b of buildings) {
    const h = parseHeight(b.tags)
    const len = Math.min(h / Math.tan(sunPos.altitude), MAX_SHADOW_M) / 1000
    const poly = buildShadow(b, shadowBearing, len)
    if (poly) shadows.push(poly)
  }
  return shadows
}

// ─── Venue detail panel ───────────────────────────────────────────────────────
function VenuePanel({
  venue, status, isFav, onToggleFav, userId, onClose, isOwner, onDraw,
}: {
  venue: Venue; status: SunStatus; isFav: boolean
  onToggleFav: (id: string) => void; userId: string | null; onClose: () => void
  isOwner: boolean; onDraw: () => void
}) {
  const statusColor = status === 'sunny' ? '#f97316' : status === 'partial' ? '#ca8a04' : '#6b7280'
  const StatusIcon = status === 'sunny' ? Sun : status === 'partial' ? CloudSun : status === 'night' ? Moon : Cloud
  const statusLabel = status === 'sunny' ? 'In the sun' : status === 'partial' ? 'Partially sunny' : status === 'night' ? 'Night' : 'In the shade'

  const profile = venue.profile ?? {}
  const custom: { label: string; value: string }[] = profile.custom ?? []

  const [vlat, vlng] = venue.outdoor_area?.length
    ? [
        venue.outdoor_area.reduce((s, c) => s + c[0], 0) / venue.outdoor_area.length,
        venue.outdoor_area.reduce((s, c) => s + c[1], 0) / venue.outdoor_area.length,
      ]
    : [venue.lat, venue.lng]

  return (
    <div style={{
      position: 'absolute', bottom: 0, left: 0, right: 0,
      background: 'white', borderRadius: '20px 20px 0 0',
      boxShadow: '0 -4px 24px rgba(0,0,0,0.13)',
      padding: '0 0 env(safe-area-inset-bottom)',
      zIndex: 20, fontFamily: "'DM Sans', Helvetica, Arial, sans-serif",
      maxHeight: '65vh', display: 'flex', flexDirection: 'column',
    }}>
      {/* Drag handle */}
      <div style={{ display: 'flex', justifyContent: 'center', padding: '10px 0 4px' }}>
        <div style={{ width: 36, height: 4, borderRadius: 2, background: '#e5e7eb' }} />
      </div>

      <div style={{ overflowY: 'auto', padding: '0 20px 24px' }}>
        {/* Header row */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 12 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 20, fontWeight: 700, lineHeight: 1.2 }}>{venue.name}</div>
            <div style={{ fontSize: 14, color: statusColor, fontWeight: 600, marginTop: 4, display: 'flex', alignItems: 'center', gap: 5 }}>
              <StatusIcon size={14} strokeWidth={2} /> {statusLabel}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{ background: '#f3f4f6', border: 'none', borderRadius: '50%', width: 32, height: 32, cursor: 'pointer', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#666' }}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 1l12 12M13 1L1 13"/></svg>
          </button>
        </div>

        {/* Active offer */}
        {venue.active_offer && (
          <div style={{ background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 10, padding: '10px 14px', marginBottom: 14, fontSize: 14, display: 'flex', gap: 8, alignItems: 'flex-start' }}>
            <Tag size={14} color="#f97316" strokeWidth={2} style={{ flexShrink: 0, marginTop: 2 }} />
            <span><strong>Offer:</strong> {venue.active_offer}</span>
          </div>
        )}

        {/* Profile fields */}
        {profile.description && (
          <p style={{ fontSize: 14, color: '#555', lineHeight: 1.6, margin: '0 0 12px' }}>{profile.description}</p>
        )}

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
          {profile.price_range && (
            <span style={{ background: '#f3f4f6', borderRadius: 8, padding: '4px 10px', fontSize: 13, fontWeight: 600 }}>{profile.price_range}</span>
          )}
          {profile.outdoor_seats && (
            <span style={{ background: '#f3f4f6', borderRadius: 8, padding: '4px 10px', fontSize: 13, display: 'flex', alignItems: 'center', gap: 5 }}>
              <Armchair size={13} strokeWidth={2} /> {profile.outdoor_seats} seats
            </span>
          )}
          {profile.opening_hours && (
            <span style={{ background: '#f3f4f6', borderRadius: 8, padding: '4px 10px', fontSize: 13, display: 'flex', alignItems: 'center', gap: 5 }}>
              <Clock size={13} strokeWidth={2} /> {profile.opening_hours}
            </span>
          )}
        </div>

        {/* Custom fields */}
        {custom.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 14 }}>
            {custom.map((f, i) => (
              <div key={i} style={{ fontSize: 13, color: '#555' }}>
                <strong>{f.label}:</strong> {f.value}
              </div>
            ))}
          </div>
        )}

        {/* Menu link */}
        {profile.menu_url && (
          <a href={profile.menu_url} target="_blank" rel="noopener noreferrer"
            style={{ display: 'inline-block', color: '#f97316', fontSize: 13, fontWeight: 600, textDecoration: 'none', marginBottom: 16 }}>
            View menu
          </a>
        )}

        {/* Actions */}
        <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
          <a
            href={`https://www.google.com/maps/dir/?api=1&destination=${vlat},${vlng}`}
            target="_blank" rel="noopener noreferrer"
            style={{ flex: 1, background: '#f97316', color: 'white', padding: '12px', borderRadius: 12, textDecoration: 'none', fontSize: 14, fontWeight: 700, textAlign: 'center' }}
          >
            Directions
          </a>
          <button
            onClick={() => onToggleFav(venue.id)}
            title={userId ? (isFav ? 'Remove favourite' : 'Save as favourite') : 'Sign in to save'}
            style={{ background: '#f3f4f6', border: 'none', borderRadius: 12, width: 50, cursor: 'pointer', opacity: userId ? 1 : 0.5, display: 'flex', alignItems: 'center', justifyContent: 'center', color: isFav ? '#ef4444' : '#9ca3af' }}
          >
            <Heart size={20} strokeWidth={2} fill={isFav ? '#ef4444' : 'none'} />
          </button>
          {isOwner && !venue.outdoor_area && (
            <button
              onClick={onDraw}
              style={{
                flex: 1, background: '#1a2744', color: 'white', border: 'none',
                borderRadius: 12, padding: '12px', fontSize: 14, fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              Draw outdoor area
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────
interface Props {
  venues: Venue[]
  centerLat?: number
  centerLng?: number
  isCloudy?: boolean
  favorites?: Set<string>
  onToggleFav?: (id: string) => void
  userId?: string | null
  userPos?: [number, number] | null
  locateTrigger?: number
  isOwner?: boolean
  onSaveArea?: (venueId: string, area: [number, number][]) => Promise<void>
  onCreateVenue?: (v: { name: string; lat: number; lng: number; type?: string; opening_hours?: string }) => Promise<void>
}

// A public venue candidate returned by the OSM lookup
interface NearbyVenue { name: string; type: string; typeLabel: string; lat: number; lng: number; dist: number }

export default function ShadowMapView({
  venues, centerLat = 56.15, centerLng = 10.21,
  isCloudy = false, favorites = new Set(), onToggleFav = () => {}, userId = null,
  userPos = null, locateTrigger = 0, isOwner = false, onSaveArea = async () => {},
  onCreateVenue = async () => {},
}: Props) {
  const [selectedVenue, setSelectedVenue] = useState<Venue | null>(null)
  const [venueBuildings, setVenueBuildings] = useState<Building[]>([])
  const [loadingBuildings, setLoadingBuildings] = useState(false)
  const [drawingForVenue, setDrawingForVenue] = useState<Venue | null>(null)
  const [drawPoints, setDrawPoints] = useState<[number, number][]>([]) // [lat, lng] pairs
  const [saving, setSaving] = useState(false)
  // Add-venue flow
  const [addMode, setAddMode] = useState(false)
  const [pendingPoint, setPendingPoint] = useState<[number, number] | null>(null) // [lat, lng]
  const [nearbyOptions, setNearbyOptions] = useState<NearbyVenue[] | null>(null)
  const [loadingNearby, setLoadingNearby] = useState(false)
  const [chosenVenue, setChosenVenue] = useState<NearbyVenue | null>(null)
  const [openingHours, setOpeningHours] = useState('')
  const [creating, setCreating] = useState(false)

  function resetAddFlow() {
    setAddMode(false)
    setPendingPoint(null)
    setNearbyOptions(null)
    setChosenVenue(null)
    setOpeningHours('')
    setLoadingNearby(false)
  }

  async function handleAddTap(lat: number, lng: number) {
    setPendingPoint([lat, lng])
    setNearbyOptions(null)
    setChosenVenue(null)
    setLoadingNearby(true)
    // Query Overpass from the browser (server-side Overpass is blocked on Vercel),
    // so a user can only add a real public place that already exists in OSM.
    const found = await fetchNearbyPublicVenues(lat, lng)
    // Hide venues already on the map (match by name within ~40m)
    const fresh = found.filter(nv =>
      !venues.some(v => v.name.toLowerCase() === nv.name.toLowerCase()
        && Math.abs(v.lat - nv.lat) < 0.0004 && Math.abs(v.lng - nv.lng) < 0.0004)
    )
    setNearbyOptions(fresh)
    setLoadingNearby(false)
  }
  const [viewState, setViewState] = useState({
    longitude: centerLng, latitude: centerLat, zoom: 14, pitch: 0, bearing: 0,
    transitionDuration: 0,
  })

  // Fly to user position when locateTrigger fires
  useEffect(() => {
    if (locateTrigger && userPos) {
      setViewState(v => ({ ...v, latitude: userPos[0], longitude: userPos[1], zoom: 15, transitionDuration: 800 }))
    }
  }, [locateTrigger])

  // Fetch buildings when a venue is selected
  useEffect(() => {
    if (!selectedVenue?.outdoor_area) return
    setVenueBuildings([])
    setLoadingBuildings(true)
    fetchBuildingsNear(selectedVenue.lat, selectedVenue.lng).then(b => {
      setVenueBuildings(b)
      setLoadingBuildings(false)
    })
  }, [selectedVenue?.id])

  // Shadow polygons for the selected venue
  const shadowPolygons = useMemo(() => {
    if (!selectedVenue || isCloudy) return []
    return calcShadows(venueBuildings, selectedVenue.lat, selectedVenue.lng)
  }, [venueBuildings, selectedVenue, isCloudy])

  const handlePinClick = useCallback((info: any) => {
    if (!info.object) return
    setSelectedVenue(info.object)
  }, [])

  const layers = useMemo(() => {
    const layerList: any[] = [
      // Basemap
      new TileLayer({
        id: 'basemap',
        data: 'https://a.basemaps.cartocdn.com/light_all/{z}/{x}/{y}@2x.png',
        minZoom: 0, maxZoom: 19, tileSize: 256,
        renderSubLayers: (props: any) => new BitmapLayer(props, {
          data: undefined,
          image: props.data,
          bounds: [props.tile.bbox.west, props.tile.bbox.south, props.tile.bbox.east, props.tile.bbox.north],
        }),
      }),
    ]

    // Selected venue: shadow polygons
    if (selectedVenue && shadowPolygons.length > 0) {
      layerList.push(new PolygonLayer({
        id: 'shadows',
        data: shadowPolygons.map(c => ({ coords: c })),
        getPolygon: (d: any) => d.coords,
        getFillColor: [15, 20, 45, 130],
        stroked: false,
        pickable: false,
      }))
    }

    // Selected venue: outdoor area polygon
    if (selectedVenue?.outdoor_area) {
      layerList.push(new PolygonLayer({
        id: 'selected-venue',
        data: [selectedVenue],
        getPolygon: (v: Venue) => v.outdoor_area!.map(([lat, lng]) => [lng, lat]),
        getFillColor: (() => {
          const s = selectedVenue.sun_status ?? (selectedVenue.is_sunny ? 'sunny' : 'shaded')
          if (s === 'sunny')   return [255, 160, 30, 180]
          if (s === 'partial') return [255, 200, 60, 160]
          return [100, 120, 150, 150]
        })(),
        getLineColor: [255, 255, 255, 200],
        lineWidthMinPixels: 2,
        pickable: false,
      }))
    }

    // Glow rings for sunny/partial pins
    layerList.push(new ScatterplotLayer({
      id: 'pin-glow',
      data: venues.filter(v => !isCloudy && (v.sun_status === 'sunny' || v.sun_status === 'partial' || v.is_sunny)),
      getPosition: (v: Venue) => [v.lng, v.lat],
      getRadius: (v: Venue) => v.sun_status === 'sunny' || v.is_sunny ? 20 : 14,
      radiusUnits: 'pixels',
      getFillColor: (v: Venue) => v.sun_status === 'sunny' || v.is_sunny ? [255, 150, 20, 55] : [255, 200, 60, 45],
      stroked: false,
      pickable: false,
      updateTriggers: { getFillColor: [isCloudy, venues], getRadius: venues },
    }))

    // All venue pins
    layerList.push(new ScatterplotLayer({
      id: 'pins',
      data: venues,
      getPosition: (v: Venue) => [v.lng, v.lat],
      getRadius: (v: Venue) => v.id === selectedVenue?.id ? 11 : (v.sun_status === 'sunny' || (v.is_sunny && !v.sun_status)) ? 9 : 7,
      radiusUnits: 'pixels',
      getFillColor: (v: Venue) => {
        if (v.id === selectedVenue?.id) return [255, 255, 255, 255]
        if (isCloudy) return [160, 170, 185, 255]
        const s = v.sun_status ?? (v.is_sunny ? 'sunny' : 'shaded') as SunStatus
        return pinColor(s)
      },
      getLineColor: (v: Venue) => {
        if (isCloudy) return [130, 140, 155, 255]
        const s = v.sun_status ?? (v.is_sunny ? 'sunny' : 'shaded') as SunStatus
        return pinColor(s)
      },
      lineWidthMinPixels: 3,
      stroked: true,
      pickable: true,
      onClick: handlePinClick,
      updateTriggers: { getFillColor: [selectedVenue?.id, venues, isCloudy], getRadius: [selectedVenue?.id, venues], getLineColor: isCloudy },
    }))

    // User location dot
    if (userPos) {
      layerList.push(new ScatterplotLayer({
        id: 'user-dot',
        data: [{ position: [userPos[1], userPos[0]] }],
        getPosition: (d: any) => d.position,
        getRadius: 9,
        radiusUnits: 'pixels',
        getFillColor: [255, 255, 255, 255],
        getLineColor: [37, 99, 235, 255],
        lineWidthMinPixels: 3,
        stroked: true,
        pickable: false,
      }))
      // Blue glow around user dot
      layerList.push(new ScatterplotLayer({
        id: 'user-dot-glow',
        data: [{ position: [userPos[1], userPos[0]] }],
        getPosition: (d: any) => d.position,
        getRadius: 20,
        radiusUnits: 'pixels',
        getFillColor: [37, 99, 235, 40],
        stroked: false,
        pickable: false,
      }))
    }

    // Drawing mode — points
    if (drawingForVenue && drawPoints.length > 0) {
      layerList.push(new ScatterplotLayer({
        id: 'draw-points',
        data: drawPoints.map(([lat, lng]) => ({ position: [lng, lat] })),
        getPosition: (d: any) => d.position,
        getRadius: 8,
        radiusUnits: 'pixels',
        getFillColor: [249, 115, 22, 255],
        getLineColor: [255, 255, 255, 255],
        lineWidthMinPixels: 2,
        stroked: true,
        pickable: false,
      }))
    }

    // Drawing mode — polygon preview
    if (drawingForVenue && drawPoints.length >= 3) {
      layerList.push(new PolygonLayer({
        id: 'draw-polygon',
        data: [{ coords: drawPoints.map(([lat, lng]) => [lng, lat]) }],
        getPolygon: (d: any) => d.coords,
        getFillColor: [249, 115, 22, 60],
        getLineColor: [249, 115, 22, 255],
        lineWidthMinPixels: 2,
        stroked: true,
        pickable: false,
      }))
    }

    // Add-venue mode — pending point marker
    if (addMode && pendingPoint) {
      layerList.push(new ScatterplotLayer({
        id: 'pending-point',
        data: [{ position: [pendingPoint[1], pendingPoint[0]] }],
        getPosition: (d: any) => d.position,
        getRadius: 9,
        radiusUnits: 'pixels',
        getFillColor: [26, 39, 68, 255],
        getLineColor: [255, 255, 255, 255],
        lineWidthMinPixels: 3,
        stroked: true,
        pickable: false,
      }))
    }

    return layerList
  }, [venues, selectedVenue, shadowPolygons, handlePinClick, isCloudy, userPos, drawingForVenue, drawPoints, addMode, pendingPoint])

  const status: SunStatus = selectedVenue
    ? (selectedVenue.sun_status ?? (selectedVenue.is_sunny ? 'sunny' : 'shaded'))
    : 'sunny'

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <DeckGL
        viewState={viewState}
        onViewStateChange={({ viewState: vs }: any) => setViewState(vs)}
        controller={true}
        layers={layers}
        views={new MapView({ repeat: false })}
        style={{ background: '#f5f0e8' }}
        onClick={(info: any) => {
          if (addMode) {
            if (info.coordinate) {
              const [lng, lat] = info.coordinate
              handleAddTap(lat, lng)
            }
            return
          }
          if (drawingForVenue) {
            if (info.coordinate) {
              const [lng, lat] = info.coordinate
              setDrawPoints(pts => [...pts, [lat, lng]])
            }
            return
          }
          if (!info.object) setSelectedVenue(null)
        }}
        getCursor={({ isHovering }: { isHovering: boolean }) => (addMode || drawingForVenue) ? 'crosshair' : isHovering ? 'pointer' : 'grab'}
      />

      {/* Loading indicator for buildings */}
      {loadingBuildings && (
        <div style={{
          position: 'absolute', top: 14, left: '50%', transform: 'translateX(-50%)',
          background: 'rgba(255,255,255,0.95)', borderRadius: 20,
          padding: '6px 16px', fontSize: 12,
          fontFamily: "'DM Sans', Helvetica, Arial, sans-serif",
          color: '#666', boxShadow: '0 1px 8px rgba(0,0,0,0.1)', zIndex: 10,
        }}>
          Loading shadows…
        </div>
      )}

      {/* Add-venue floating button (logged-in users) */}
      {userId && !addMode && !drawingForVenue && !selectedVenue && (
        <button
          onClick={() => { setSelectedVenue(null); setAddMode(true) }}
          style={{
            position: 'absolute', bottom: 24, left: 16, zIndex: 20,
            background: '#1a2744', color: 'white', border: 'none',
            borderRadius: '999px', padding: '12px 18px', cursor: 'pointer',
            boxShadow: '0 4px 16px rgba(0,0,0,0.18)',
            display: 'flex', alignItems: 'center', gap: 7,
            fontSize: 14, fontWeight: 700,
            fontFamily: "'DM Sans', Helvetica, Arial, sans-serif",
          }}
        >
          <Plus size={17} strokeWidth={2.5} /> Add venue
        </button>
      )}

      {/* Add-venue: instruction banner while waiting for a tap */}
      {addMode && !pendingPoint && (
        <div style={{
          position: 'absolute', top: 80, left: '50%', transform: 'translateX(-50%)',
          background: '#1a2744', color: 'white', borderRadius: 999,
          padding: '10px 20px', fontSize: 14, fontWeight: 600, zIndex: 30,
          boxShadow: '0 4px 16px rgba(0,0,0,0.18)', whiteSpace: 'nowrap',
          fontFamily: "'DM Sans', Helvetica, Arial, sans-serif",
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <MapPin size={15} strokeWidth={2} /> Tap the map on the venue
          <button
            onClick={resetAddFlow}
            style={{ background: 'rgba(255,255,255,0.15)', color: 'white', border: 'none', borderRadius: 999, padding: '4px 10px', fontSize: 12, cursor: 'pointer', marginLeft: 4 }}
          >
            Cancel
          </button>
        </div>
      )}

      {/* Add-venue: bottom sheet (pick public venue, then confirm) */}
      {addMode && pendingPoint && (
        <div style={{
          position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 30,
          background: 'white', borderRadius: '20px 20px 0 0',
          boxShadow: '0 -4px 24px rgba(0,0,0,0.15)',
          maxHeight: '60vh', display: 'flex', flexDirection: 'column',
          fontFamily: "'DM Sans', Helvetica, Arial, sans-serif",
        }}>
          <div style={{ display: 'flex', justifyContent: 'center', padding: '10px 0 4px' }}>
            <div style={{ width: 36, height: 4, borderRadius: 2, background: '#e5e7eb' }} />
          </div>

          <div style={{ overflowY: 'auto', padding: '4px 20px 24px' }}>
            {loadingNearby ? (
              <div style={{ textAlign: 'center', padding: '28px', color: '#999', fontSize: 14 }}>
                Finding public venues here…
              </div>
            ) : chosenVenue ? (
              // Confirm step — optional details + create
              <div>
                <div style={{ fontSize: 19, fontWeight: 700, marginBottom: 2 }}>{chosenVenue.name}</div>
                <div style={{ fontSize: 13, color: '#888', marginBottom: 18 }}>{chosenVenue.typeLabel}</div>

                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6, color: '#333' }}>
                  Opening hours <span style={{ color: '#aaa', fontWeight: 400 }}>(optional)</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. Mon–Sun 9:00–22:00"
                  value={openingHours}
                  onChange={e => setOpeningHours(e.target.value)}
                  style={{ width: '100%', padding: '11px 13px', borderRadius: 10, border: '1px solid #ddd', fontSize: 14, boxSizing: 'border-box', marginBottom: 18 }}
                />

                <div style={{ display: 'flex', gap: 10 }}>
                  <button
                    onClick={async () => {
                      setCreating(true)
                      await onCreateVenue({
                        name: chosenVenue.name,
                        lat: chosenVenue.lat,
                        lng: chosenVenue.lng,
                        type: chosenVenue.type,
                        opening_hours: openingHours.trim() || undefined,
                      })
                      setCreating(false)
                      resetAddFlow()
                    }}
                    disabled={creating}
                    style={{
                      flex: 1, background: '#f97316', color: 'white', border: 'none',
                      borderRadius: 12, padding: '13px', fontSize: 15, fontWeight: 700,
                      cursor: creating ? 'not-allowed' : 'pointer',
                    }}
                  >
                    {creating ? 'Adding…' : 'Add to map'}
                  </button>
                  <button
                    onClick={() => setChosenVenue(null)}
                    style={{ background: '#f3f4f6', color: '#555', border: 'none', borderRadius: 12, padding: '13px 18px', fontSize: 14, cursor: 'pointer' }}
                  >
                    Back
                  </button>
                </div>
              </div>
            ) : nearbyOptions && nearbyOptions.length > 0 ? (
              // Pick step — choose from nearby public venues
              <div>
                <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>Which place is this?</div>
                <div style={{ fontSize: 13, color: '#888', marginBottom: 14 }}>
                  Pick the public venue you want to add to the map.
                </div>
                {nearbyOptions.map((nv, i) => (
                  <button
                    key={i}
                    onClick={() => setChosenVenue(nv)}
                    style={{
                      width: '100%', textAlign: 'left', background: 'white',
                      border: '1px solid #eee', borderRadius: 12, padding: '13px 14px',
                      marginBottom: 8, cursor: 'pointer', display: 'flex',
                      alignItems: 'center', justifyContent: 'space-between', gap: 10,
                    }}
                  >
                    <div>
                      <div style={{ fontSize: 15, fontWeight: 600 }}>{nv.name}</div>
                      <div style={{ fontSize: 12, color: '#999', marginTop: 2 }}>{nv.typeLabel}</div>
                    </div>
                    <span style={{ fontSize: 12, color: '#bbb', flexShrink: 0 }}>{nv.dist}m</span>
                  </button>
                ))}
                <button
                  onClick={resetAddFlow}
                  style={{ background: 'none', border: 'none', color: '#888', fontSize: 13, cursor: 'pointer', marginTop: 6, padding: 4 }}
                >
                  Cancel
                </button>
              </div>
            ) : (
              // No public venue found near the tap
              <div style={{ textAlign: 'center', padding: '8px 0 4px' }}>
                <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 6 }}>No public venue found here</div>
                <div style={{ fontSize: 13, color: '#888', marginBottom: 18, lineHeight: 1.5 }}>
                  We can only add real, public places. Tap closer to a café, bar, or restaurant.
                </div>
                <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
                  <button
                    onClick={() => setPendingPoint(null)}
                    style={{ background: '#f97316', color: 'white', border: 'none', borderRadius: 12, padding: '11px 20px', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}
                  >
                    Try again
                  </button>
                  <button
                    onClick={resetAddFlow}
                    style={{ background: '#f3f4f6', color: '#555', border: 'none', borderRadius: 12, padding: '11px 20px', fontSize: 14, cursor: 'pointer' }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Drawing mode toolbar */}
      {drawingForVenue && (
        <div style={{
          position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 30,
          background: '#1a2744', color: 'white',
          padding: '16px 20px',
          fontFamily: "'DM Sans', Helvetica, Arial, sans-serif",
        }}>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>
            Drawing: {drawingForVenue.name}
          </div>
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)', marginBottom: 14 }}>
            {drawPoints.length < 3
              ? `Tap the map to add points (${drawPoints.length} so far, need 3+)`
              : `${drawPoints.length} points — tap more or save`}
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button
              onClick={async () => {
                if (drawPoints.length < 3) return
                setSaving(true)
                await onSaveArea(drawingForVenue.id, drawPoints)
                setSaving(false)
                setDrawingForVenue(null)
                setDrawPoints([])
              }}
              disabled={drawPoints.length < 3 || saving}
              style={{
                flex: 1, background: drawPoints.length >= 3 ? '#f97316' : '#334155',
                color: 'white', border: 'none', borderRadius: 10,
                padding: '12px', fontSize: 14, fontWeight: 700,
                cursor: drawPoints.length >= 3 ? 'pointer' : 'not-allowed',
              }}
            >
              {saving ? 'Saving…' : 'Save area'}
            </button>
            <button
              onClick={() => {
                if (drawPoints.length > 0) setDrawPoints(pts => pts.slice(0, -1))
              }}
              style={{
                background: 'rgba(255,255,255,0.1)', color: 'white', border: 'none',
                borderRadius: 10, padding: '12px 16px', fontSize: 13, cursor: 'pointer',
              }}
            >
              Undo
            </button>
            <button
              onClick={() => { setDrawingForVenue(null); setDrawPoints([]) }}
              style={{
                background: 'rgba(255,255,255,0.1)', color: 'white', border: 'none',
                borderRadius: 10, padding: '12px 16px', fontSize: 13, cursor: 'pointer',
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Venue detail panel */}
      {selectedVenue && (
        <VenuePanel
          venue={selectedVenue}
          status={status}
          isFav={favorites.has(selectedVenue.id)}
          onToggleFav={onToggleFav}
          userId={userId}
          onClose={() => setSelectedVenue(null)}
          isOwner={isOwner}
          onDraw={() => {
            setDrawingForVenue(selectedVenue)
            setDrawPoints([])
            setSelectedVenue(null)
          }}
        />
      )}
    </div>
  )
}
