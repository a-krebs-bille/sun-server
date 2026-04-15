'use client'
import { useEffect, useState, useMemo, useCallback } from 'react'
import { Sun, CloudSun, Cloud, Moon, Heart, Tag, Clock, Armchair } from 'lucide-react'
import DeckGL from '@deck.gl/react'
import { TileLayer } from '@deck.gl/geo-layers'
import { BitmapLayer, PolygonLayer, ScatterplotLayer } from '@deck.gl/layers'
import { MapView } from '@deck.gl/core'
import SunCalc from 'suncalc'
import { destination } from '@turf/destination'
import { convex } from '@turf/convex'
import { point, featureCollection } from '@turf/helpers'

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
    return [point([lng, lat]), proj]
  })
  const hull = convex(featureCollection(pts))
  return (hull?.geometry?.coordinates[0] as [number,number][]) ?? null
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
      zIndex: 20, fontFamily: 'Helvetica Neue, Helvetica, Arial, sans-serif',
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
}

export default function ShadowMapView({
  venues, centerLat = 56.15, centerLng = 10.21,
  isCloudy = false, favorites = new Set(), onToggleFav = () => {}, userId = null,
  userPos = null, locateTrigger = 0, isOwner = false, onSaveArea = async () => {},
}: Props) {
  const [selectedVenue, setSelectedVenue] = useState<Venue | null>(null)
  const [venueBuildings, setVenueBuildings] = useState<Building[]>([])
  const [loadingBuildings, setLoadingBuildings] = useState(false)
  const [drawingForVenue, setDrawingForVenue] = useState<Venue | null>(null)
  const [drawPoints, setDrawPoints] = useState<[number, number][]>([]) // [lat, lng] pairs
  const [saving, setSaving] = useState(false)
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

    return layerList
  }, [venues, selectedVenue, shadowPolygons, handlePinClick, isCloudy, userPos, drawingForVenue, drawPoints])

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
          if (drawingForVenue) {
            if (info.coordinate) {
              const [lng, lat] = info.coordinate
              setDrawPoints(pts => [...pts, [lat, lng]])
            }
            return
          }
          if (!info.object) setSelectedVenue(null)
        }}
        getCursor={({ isHovering }: { isHovering: boolean }) => drawingForVenue ? 'crosshair' : isHovering ? 'pointer' : 'grab'}
      />

      {/* Loading indicator for buildings */}
      {loadingBuildings && (
        <div style={{
          position: 'absolute', top: 14, left: '50%', transform: 'translateX(-50%)',
          background: 'rgba(255,255,255,0.95)', borderRadius: 20,
          padding: '6px 16px', fontSize: 12,
          fontFamily: 'Helvetica Neue, Helvetica, Arial, sans-serif',
          color: '#666', boxShadow: '0 1px 8px rgba(0,0,0,0.1)', zIndex: 10,
        }}>
          Loading shadows…
        </div>
      )}

      {/* Drawing mode toolbar */}
      {drawingForVenue && (
        <div style={{
          position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 30,
          background: '#1a2744', color: 'white',
          padding: '16px 20px',
          fontFamily: 'Helvetica Neue, Helvetica, Arial, sans-serif',
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
