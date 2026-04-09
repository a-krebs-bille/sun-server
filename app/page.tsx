'use client'

import dynamic from 'next/dynamic'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '../lib/supabase'

const DrawMap = dynamic(() => import('./components/DrawMap'), { ssr: false })

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

function VenueCard({ venue }: { venue: any }) {
  const [vlat, vlng] = venueCenter(venue)
  return (
    <div style={{
      background: 'white', margin: '8px 12px', borderRadius: '14px',
      boxShadow: '0 1px 4px rgba(0,0,0,0.08)', padding: '14px 16px',
      display: 'flex', alignItems: 'center', gap: '12px',
    }}>
      <div style={{ fontSize: '28px', flexShrink: 0 }}>
        {venue.sun_status === 'sunny' ? '☀️' : venue.sun_status === 'partial' ? '🌤️' : '⛅'}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: '15px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {venue.name}
        </div>
        <div style={{ color: '#888', fontSize: '13px', marginTop: '2px' }}>
          {venue.sun_status === 'sunny' ? 'In the sun' : venue.sun_status === 'partial' ? 'Partially sunny' : 'In the shade'}
          {venue.dist != null && ` · ${formatDist(venue.dist)}`}
        </div>
      </div>
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
  const [sunnyOnly, setSunnyOnly] = useState(false) // includes partial
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!showMap) return
    setLoading(true)

    supabase.auth.getSession().then(({ data }) => setIsOwner(!!data.session))

    async function loadVenues() {
      const { data } = await supabase.from('venues').select('*')
      if (!data) { setLoading(false); return }

      const withSun = await Promise.all(
        data.map(async venue => {
          if (!venue.outdoor_area) return venue
          try {
            const res = await fetch('/api/sunshine', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ lat: venue.lat, lng: venue.lng, outdoor_area: venue.outdoor_area }),
            })
            const { is_sunny, sun_status } = await res.json()
            return { ...venue, is_sunny, sun_status }
          } catch { return venue }
        })
      )
      setVenues(withSun)
      setLoading(false)
    }
    loadVenues()
  }, [showMap])

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
    .filter(v => v.outdoor_area && v.name.toLowerCase().includes(search.toLowerCase()) && (!sunnyOnly || v.sun_status === 'sunny' || v.sun_status === 'partial'))
    .map(v => ({ ...v, dist: userPos ? haversineKm(userPos[0], userPos[1], ...venueCenter(v)) : null }))
    .sort((a, b) => {
      const order = { sunny: 0, partial: 1, shaded: 2 }
      const aOrder = order[a.sun_status as keyof typeof order] ?? 2
      const bOrder = order[b.sun_status as keyof typeof order] ?? 2
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
            }}
          >
            ☀️ Sunny only
          </button>
        </div>

        {/* Body */}
        <div className="sun-body" style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>

          {/* Map */}
          <div className="sun-map" style={{ flex: '1 1 50%', position: 'relative', minHeight: 0 }}>
            <DrawMap
              venues={filtered}
              isOwner={false}
              search={search}
              sunnyOnly={sunnyOnly}
              onVenueCreated={handleVenueCreated}
              onUserLocated={setUserPos}
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
              <VenueCard key={venue.id} venue={venue} />
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
          <Link href="/login" style={{ color: 'white', textDecoration: 'none', fontSize: '15px' }}>Log in</Link>
          <Link href="/signup" style={{ background: 'white', color: '#f97316', padding: '8px 20px', borderRadius: '999px', textDecoration: 'none', fontSize: '15px', fontWeight: '500' }}>
            List your venue
          </Link>
        </div>
      </nav>

      <div style={{ background: 'linear-gradient(135deg, #f97316 0%, #fbbf24 50%, #fde68a 100%)', minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '40px 20px' }}>
        <h1 style={{ fontSize: '56px', fontWeight: '800', color: 'white', margin: '0 0 16px', lineHeight: 1.1 }}>
          YOUR GUIDE TO SUNSHINE.
        </h1>
        <p style={{ fontSize: '20px', color: 'white', opacity: 0.9, maxWidth: '480px', marginBottom: '40px', lineHeight: 1.6 }}>
          Outdoor seating in the sun — near you.
        </p>
        <button onClick={() => setShowMap(true)} style={{ background: 'white', color: '#f97316', border: 'none', padding: '18px 48px', borderRadius: '999px', fontSize: '18px', fontWeight: '700', cursor: 'pointer', boxShadow: '0 4px 20px rgba(0,0,0,0.15)' }}>
          Map
        </button>
      </div>

      <div style={{ background: '#fff', padding: '80px 40px', textAlign: 'center' }}>
        <h2 style={{ fontSize: '36px', fontWeight: '700', marginBottom: '8px' }}>How it works</h2>
        <p style={{ color: '#666', fontSize: '18px', marginBottom: '60px' }}>Three steps to the perfect sunny spot</p>
        <div style={{ display: 'flex', gap: '40px', justifyContent: 'center', flexWrap: 'wrap' }}>
          {[
            { icon: '🗺️', title: 'Find places', text: 'See all cafés and restaurants with outdoor seating on the map.' },
            { icon: '☀️', title: 'Check the sun', text: 'See exactly which outdoor areas are in the sun right now.' },
            { icon: '🪑', title: 'Sit down', text: 'Head straight there and enjoy the sun while it lasts.' },
          ].map(f => (
            <div key={f.title} style={{ flex: '1', minWidth: '220px', maxWidth: '260px', padding: '32px 24px', background: '#fff9f0', borderRadius: '20px', border: '2px solid #fed7aa' }}>
              <div style={{ fontSize: '40px', marginBottom: '16px' }}>{f.icon}</div>
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
