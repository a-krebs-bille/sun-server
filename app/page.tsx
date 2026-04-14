'use client'

import dynamic from 'next/dynamic'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '../lib/supabase'
import { Sun, CloudSun, Cloud, Heart, Tag, Bell, MapPin, Armchair, Map, Navigation } from 'lucide-react'

const DrawMap = dynamic(() => import('./components/DrawMap'), { ssr: false })
const ShadowMapView = dynamic(() => import('./components/ShadowMapView'), { ssr: false })

// ── Helpers ──────────────────────────────────────────────────────────────────

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function venueCenter(venue: any): [number, number] {
  if (venue.outdoor_area?.length) {
    const lats = venue.outdoor_area.map((c: number[]) => c[0])
    const lngs = venue.outdoor_area.map((c: number[]) => c[1])
    return [lats.reduce((a: number, b: number) => a + b) / lats.length, lngs.reduce((a: number, b: number) => a + b) / lngs.length]
  }
  return [venue.lat, venue.lng]
}

function formatDist(km: number) {
  return km < 1 ? `${Math.round(km * 1000)}m` : `${km.toFixed(1)}km`
}

// ── Venue card ────────────────────────────────────────────────────────────────

function VenueCard({ venue, cloudy, isFav, onToggleFav, userId }: {
  venue: any; cloudy: boolean; isFav: boolean; onToggleFav: (id: string) => void; userId: string | null
}) {
  const [vlat, vlng] = venueCenter(venue)
  const status = cloudy ? 'cloudy' : (venue.sun_status ?? (venue.is_sunny ? 'sunny' : 'shaded'))
  const iconColor = status === 'sunny' ? '#f97316' : status === 'partial' ? '#ca8a04' : status === 'cloudy' ? '#6b90b0' : '#9ca3af'
  const StatusIcon = status === 'sunny' ? Sun : status === 'partial' ? CloudSun : Cloud
  const label = status === 'sunny' ? 'In the sun' : status === 'partial' ? 'Partially sunny' : status === 'cloudy' ? 'Cloudy' : status === 'unknown' ? 'Status unavailable' : 'In the shade'
  return (
    <div style={{
      background: 'white', margin: '8px 12px', borderRadius: '14px',
      boxShadow: '0 1px 4px rgba(0,0,0,0.08)', padding: '14px 16px',
      display: 'flex', alignItems: 'center', gap: '12px',
    }}>
      <div style={{ flexShrink: 0, color: iconColor }}><StatusIcon size={26} strokeWidth={1.8} /></div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ fontWeight: 700, fontSize: '15px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {venue.name}
          </span>
          {venue.active_offer && (
            <Tag size={13} color="#f97316" strokeWidth={2} style={{ flexShrink: 0 }} />
          )}
        </div>
        <div style={{ color: '#888', fontSize: '13px', marginTop: '2px' }}>
          {label}
          {venue.dist != null && ` · ${formatDist(venue.dist)}`}
          {venue.active_offer && (
            <span style={{ color: '#f97316', marginLeft: '6px', fontWeight: 500 }}>{venue.active_offer}</span>
          )}
        </div>
      </div>
      {/* Heart button */}
      <button
        onClick={() => onToggleFav(venue.id)}
        title={userId ? (isFav ? 'Remove favourite' : 'Save as favourite') : 'Sign in to save favourites'}
        style={{
          background: 'none', border: 'none', cursor: 'pointer',
          padding: '4px', flexShrink: 0, opacity: userId ? 1 : 0.4,
          color: isFav ? '#ef4444' : '#ccc', display: 'flex',
        }}
      >
        <Heart size={20} strokeWidth={2} fill={isFav ? '#ef4444' : 'none'} />
      </button>
      <a
        href={`https://www.google.com/maps/dir/?api=1&destination=${vlat},${vlng}`}
        target="_blank" rel="noopener noreferrer"
        style={{
          background: '#f97316', color: 'white', padding: '8px 14px',
          borderRadius: '8px', textDecoration: 'none', fontSize: '13px',
          fontWeight: 600, whiteSpace: 'nowrap', flexShrink: 0,
        }}
      >
        Directions
      </a>
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function Home() {
  const [showMap, setShowMap] = useState(false)
  const [venues, setVenues] = useState<any[]>([])
  const [userPos, setUserPos] = useState<[number, number] | null>(null)
  const [isOwner, setIsOwner] = useState(false)
  const [search, setSearch] = useState('')
  const [sunnyOnly, setSunnyOnly] = useState(false)
  const [favsOnly, setFavsOnly] = useState(false)
  const [loading, setLoading] = useState(true)
  const [isCloudy, setIsCloudy] = useState(false)
  const [userId, setUserId] = useState<string | null>(null)
  const [sessionToken, setSessionToken] = useState<string | null>(null)
  const [favorites, setFavorites] = useState<Set<string>>(new Set())
  const [pushEnabled, setPushEnabled] = useState(false)

  useEffect(() => {
    if (!showMap) return
    setLoading(true)

    supabase.auth.getSession().then(async ({ data }) => {
      setIsOwner(!!data.session)
      if (data.session) {
        setUserId(data.session.user.id)
        setSessionToken(data.session.access_token)
        // Load favorites
        const res = await fetch('/api/favorites', {
          headers: { Authorization: `Bearer ${data.session.access_token}` },
        })
        const json = await res.json()
        setFavorites(new Set(json.favorites ?? []))
        // Register service worker for push
        if ('serviceWorker' in navigator) {
          navigator.serviceWorker.register('/sw.js').then(async reg => {
            const existing = await reg.pushManager.getSubscription()
            if (existing) setPushEnabled(true)
          })
        }
      }
    })

    // Fetch ALL buildings in one bbox query covering all venues — much faster than one request per venue
    async function fetchAllBuildings(venues: any[]): Promise<any[] | null> {
      const lats = venues.map(v => v.lat)
      const lngs = venues.map(v => v.lng)
      const pad = 0.004 // ~300m padding
      const south = Math.min(...lats) - pad
      const north = Math.max(...lats) + pad
      const west  = Math.min(...lngs) - pad
      const east  = Math.max(...lngs) + pad
      const query = `[out:json][timeout:25];way["building"](${south},${west},${north},${east});out geom;`
      const mirrors = [
        'https://overpass-api.de/api/interpreter',
        'https://overpass.kumi.systems/api/interpreter',
        'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
      ]
      for (const mirror of mirrors) {
        try {
          const res = await fetch(mirror, { method: 'POST', body: query })
          if (!res.ok) continue
          const data = await res.json()
          return data.elements ?? []
        } catch { /* try next */ }
      }
      return null
    }

    // Filter the global building list to only those within ~300m of a venue
    function buildingsNear(allBuildings: any[], lat: number, lng: number): any[] {
      return allBuildings.filter(b => {
        if (!b.geometry?.length) return false
        const bLat = b.geometry[0].lat
        const bLng = b.geometry[0].lon
        const dLat = (bLat - lat) * 111000
        const dLng = (bLng - lng) * 111000 * Math.cos(lat * Math.PI / 180)
        return Math.sqrt(dLat * dLat + dLng * dLng) < 350
      })
    }

    async function checkCloudy(lat: number, lng: number): Promise<boolean> {
      try {
        const res = await fetch(
          `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=cloud_cover&forecast_days=1`
        )
        const data = await res.json()
        const cloudCover = data?.current?.cloud_cover ?? 0
        return cloudCover >= 80 // ≥80% cloud cover = cloudy
      } catch { return false }
    }

    async function loadVenues() {
      const { data } = await supabase.from('venues').select('*')
      if (!data) { setLoading(false); return }

      // Show venues immediately — sun status loads in the background
      setVenues(data)
      setLoading(false)

      const venuesWithArea = data.filter(v => v.outdoor_area)
      if (venuesWithArea.length === 0) return

      // Check cloud cover for the area (use first venue as location proxy)
      const cloudy = await checkCloudy(venuesWithArea[0].lat, venuesWithArea[0].lng)
      setIsCloudy(cloudy)
      if (cloudy) return // skip shadow calc on cloudy days

      // ONE Overpass request for all venues
      const allBuildings = await fetchAllBuildings(venuesWithArea)

      // Update each venue's sun status as results come in
      await Promise.all(
        venuesWithArea.map(async venue => {
          try {
            const buildings = allBuildings ? buildingsNear(allBuildings, venue.lat, venue.lng) : null
            const res = await fetch('/api/sunshine', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ lat: venue.lat, lng: venue.lng, outdoor_area: venue.outdoor_area, buildings }),
            })
            const { is_sunny, sun_status } = await res.json()
            setVenues(prev => prev.map(v => v.id === venue.id ? { ...v, is_sunny, sun_status } : v))
          } catch { /* leave venue as-is */ }
        })
      )
    }
    loadVenues()
  }, [showMap])

  async function toggleFavorite(venueId: string) {
    if (!sessionToken) {
      // Prompt sign in — redirect to login
      window.location.href = '/login'
      return
    }
    // Optimistic update
    setFavorites(prev => {
      const next = new Set(prev)
      if (next.has(venueId)) next.delete(venueId)
      else next.add(venueId)
      return next
    })
    await fetch('/api/favorites', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sessionToken}` },
      body: JSON.stringify({ venueId }),
    })
  }

  async function enablePushNotifications() {
    if (!('serviceWorker' in navigator) || !sessionToken) return
    try {
      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
      })
      await fetch('/api/push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sessionToken}` },
        body: JSON.stringify(sub.toJSON()),
      })
      setPushEnabled(true)
    } catch (e) {
      console.error('Push subscribe failed', e)
    }
  }

  function handleVenueCreated(venue: any) {
    fetch('/api/sunshine', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lat: venue.lat, lng: venue.lng, outdoor_area: venue.outdoor_area }),
    })
      .then(r => r.json())
      .then(({ is_sunny }) => setVenues(prev => [...prev, { ...venue, is_sunny }]))
      .catch(() => setVenues(prev => [...prev, venue]))
  }

  const filtered = venues
    .filter(v => v.outdoor_area
      && v.name.toLowerCase().includes(search.toLowerCase())
      && (!sunnyOnly || v.is_sunny || v.sun_status === 'sunny' || v.sun_status === 'partial')
      && (!favsOnly || favorites.has(v.id))
    )
    .map(v => ({ ...v, dist: userPos ? haversineKm(userPos[0], userPos[1], ...venueCenter(v)) : null, _status: v.sun_status ?? (v.is_sunny ? 'sunny' : 'shaded') }))
    .sort((a, b) => {
      const order = { sunny: 0, partial: 1, shaded: 2 }
      const aOrder = order[a._status as keyof typeof order] ?? 2
      const bOrder = order[b._status as keyof typeof order] ?? 2
      if (aOrder !== bOrder) return aOrder - bOrder
      if (a.dist != null && b.dist != null) return a.dist - b.dist
      return 0
    })

  // ── Map view ──────────────────────────────────────────────────────────────

  if (showMap) {
    return (
      <main style={{ display: 'flex', flexDirection: 'column', height: '100vh', fontFamily: 'Helvetica, Arial, sans-serif', background: '#f9f7f4' }}>
        <style>{`
          @media (min-width: 768px) {
            .sun-body { flex-direction: row !important; }
            .sun-map  { width: 60% !important; height: 100% !important; flex: unset !important; }
            .sun-list { width: 40% !important; height: 100% !important; flex: unset !important; }
          }
        `}</style>

        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: '8px',
          padding: '10px 12px', background: 'white',
          boxShadow: '0 1px 4px rgba(0,0,0,0.08)', zIndex: 10, flexShrink: 0,
        }}>
          <button onClick={() => setShowMap(false)} style={{
            border: 'none', background: 'none', cursor: 'pointer',
            fontSize: '16px', color: '#666', padding: '6px 10px 6px 4px',
            borderRight: '1px solid #eee', marginRight: '4px', flexShrink: 0,
          }}>
            ←
          </button>
          <input
            type="text" placeholder="Search..."
            value={search} onChange={e => setSearch(e.target.value)}
            style={{ flex: 1, border: 'none', outline: 'none', fontSize: '16px', minWidth: 0 }}
          />
          <button
            onClick={() => setSunnyOnly(s => !s)}
            style={{
              border: 'none', borderRadius: '999px', padding: '6px 14px',
              fontSize: '13px', fontWeight: 600, cursor: 'pointer', flexShrink: 0,
              background: sunnyOnly ? '#f97316' : '#f1f5f9',
              color: sunnyOnly ? 'white' : '#555',
              display: 'flex', alignItems: 'center', gap: '5px',
            }}
          >
            <Sun size={14} strokeWidth={2} /> Sunny
          </button>
          <button
            onClick={() => setFavsOnly(s => !s)}
            style={{
              border: 'none', borderRadius: '999px', padding: '6px 14px',
              fontSize: '13px', fontWeight: 600, cursor: 'pointer', flexShrink: 0,
              background: favsOnly ? '#ef4444' : '#f1f5f9',
              color: favsOnly ? 'white' : '#555',
              display: 'flex', alignItems: 'center', gap: '5px',
            }}
          >
            <Heart size={14} strokeWidth={2} fill={favsOnly ? 'white' : 'none'} /> Saved
          </button>
          {userId && !pushEnabled && (
            <button
              onClick={enablePushNotifications}
              title="Get notified when a favourite is in the sun"
              style={{
                border: 'none', borderRadius: '999px', padding: '6px 10px',
                cursor: 'pointer', flexShrink: 0,
                background: '#f1f5f9', color: '#555',
                display: 'flex', alignItems: 'center',
              }}
            >
              <Bell size={15} strokeWidth={2} />
            </button>
          )}
        </div>

        {/* Cloudy banner */}
        {isCloudy && (
          <div style={{
            background: '#e8edf2', color: '#445566', textAlign: 'center',
            padding: '8px 16px', fontSize: '13px', fontWeight: 500,
            borderBottom: '1px solid #d0d8e0', flexShrink: 0,
          }}>
            <Cloud size={14} strokeWidth={2} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 5 }} /> It's cloudy right now — sun tracking is paused
          </div>
        )}

        {/* Body */}
        <div className="sun-body" style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>

          {/* Map */}
          <div className="sun-map" style={{ flex: '1 1 50%', position: 'relative', minHeight: 0 }}>
            <ShadowMapView
              venues={venues.filter(v => v.outdoor_area)}
              centerLat={userPos ? userPos[0] : 56.1572}
              centerLng={userPos ? userPos[1] : 10.2107}
              isCloudy={isCloudy}
              favorites={favorites}
              onToggleFav={toggleFavorite}
              userId={userId}
            />
          </div>

          {/* Venue list */}
          <div className="sun-list" style={{ flex: '0 0 auto', height: '45%', overflowY: 'auto', paddingTop: '8px', paddingBottom: '8px' }}>
            {loading ? (
              <div style={{ textAlign: 'center', padding: '32px', color: '#aaa', fontSize: '14px' }}>Loading venues…</div>
            ) : filtered.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '32px', color: '#aaa', fontSize: '14px' }}>
                {sunnyOnly ? 'No sunny spots right now ☁️' : 'No venues found'}
              </div>
            ) : filtered.map(venue => (
              <VenueCard
                key={venue.id}
                venue={venue}
                cloudy={isCloudy}
                isFav={favorites.has(venue.id)}
                onToggleFav={toggleFavorite}
                userId={userId}
              />
            ))}
          </div>
        </div>
      </main>
    )
  }

  // ── Landing page ──────────────────────────────────────────────────────────

  return (
    <main style={{ fontFamily: 'Helvetica, Arial, sans-serif', overflowX: 'hidden' }}>
      <nav style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '20px 40px', position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10,
      }}>
        <div style={{ fontSize: '22px', fontWeight: 'bold', color: 'white' }}>Sun Server</div>
        <div style={{ display: 'flex', gap: '16px' }}>
          <Link href="/login" style={{ background: 'rgba(255,255,255,0.15)', color: 'white', padding: '8px 20px', borderRadius: '999px', textDecoration: 'none', fontSize: '15px', fontWeight: '500' }}>Log in</Link>
          <Link href="/signup" style={{ background: 'white', color: '#f97316', padding: '8px 20px', borderRadius: '999px', textDecoration: 'none', fontSize: '15px', fontWeight: '500' }}>
            List your venue
          </Link>
        </div>
      </nav>

      <div style={{ background: 'linear-gradient(135deg, #f97316 0%, #fbbf24 50%, #fde68a 100%)', minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '40px 20px' }}>
        <h1 style={{ fontSize: '56px', fontWeight: '800', color: 'white', margin: '0 0 16px', lineHeight: 1.1 }}>
          GUIDE TO SUNSHINE
        </h1>
        <p style={{ fontSize: '20px', color: 'white', opacity: 0.9, maxWidth: '480px', marginBottom: '40px', lineHeight: 1.6 }}>
          Outdoor seating in the sun — near you.
        </p>
        <button onClick={() => setShowMap(true)} style={{ background: 'white', color: '#f97316', border: 'none', padding: '18px 48px', borderRadius: '999px', fontSize: '18px', fontWeight: '700', cursor: 'pointer', boxShadow: '0 4px 20px rgba(0,0,0,0.15)' }}>
          MAP
        </button>
      </div>

      <div style={{ background: '#fff', padding: '80px 40px', textAlign: 'center' }}>
        <h2 style={{ fontSize: '36px', fontWeight: '700', marginBottom: '8px' }}>How it works</h2>
        <p style={{ color: '#666', fontSize: '18px', marginBottom: '60px' }}>Three steps to the perfect sunny spot</p>
        <div style={{ display: 'flex', gap: '40px', justifyContent: 'center', flexWrap: 'wrap' }}>
          {[
            { Icon: Map,        title: 'Find places',   text: 'See all cafés and restaurants with outdoor seating on the map.' },
            { Icon: Sun,        title: 'Check the sun', text: 'See exactly which outdoor areas are in the sun right now.' },
            { Icon: Navigation, title: 'Sit down',      text: 'Head straight there and enjoy the sun while it lasts.' },
          ].map(f => (
            <div key={f.title} style={{ flex: '1', minWidth: '220px', maxWidth: '260px', padding: '32px 24px', background: '#fff9f0', borderRadius: '20px', border: '2px solid #fed7aa' }}>
              <div style={{ marginBottom: '16px', color: '#f97316' }}><f.Icon size={36} strokeWidth={1.5} /></div>
              <h3 style={{ fontSize: '17px', fontWeight: '700', margin: '0 0 8px' }}>{f.title}</h3>
              <p style={{ color: '#666', lineHeight: 1.6, fontSize: '15px', margin: 0 }}>{f.text}</p>
            </div>
          ))}
        </div>
      </div>

      <div style={{ background: '#1a1a1a', padding: '80px 40px', textAlign: 'center' }}>
        <h2 style={{ fontSize: '36px', fontWeight: '700', color: 'white', marginBottom: '16px' }}>Own a café or restaurant?</h2>
        <p style={{ color: '#999', fontSize: '18px', marginBottom: '40px' }}>List your venue and get discovered by sun-seeking guests.</p>
        <Link href="/pricing" style={{ background: '#f97316', color: 'white', padding: '18px 48px', borderRadius: '999px', textDecoration: 'none', fontSize: '18px', fontWeight: '700' }}>
          See pricing
        </Link>
      </div>

      <div style={{ background: '#111', padding: '24px 40px', textAlign: 'center', color: '#555', fontSize: '14px' }}>
        2026 Sun Server — Find sunshine
      </div>
    </main>
  )
}
