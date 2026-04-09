'use client'

import dynamic from 'next/dynamic'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '../../../lib/supabase'

const DrawMap = dynamic(() => import('../../components/DrawMap'), { ssr: false })

function venueCenter(venue: any): [number, number] {
  if (venue.outdoor_area?.length) {
    const lats = venue.outdoor_area.map((c: number[]) => c[0])
    const lngs = venue.outdoor_area.map((c: number[]) => c[1])
    return [lats.reduce((a: number, b: number) => a + b) / lats.length, lngs.reduce((a: number, b: number) => a + b) / lngs.length]
  }
  return [venue.lat, venue.lng]
}

export default function BusinessMap() {
  const [venues, setVenues] = useState<any[]>([])
  const [userPos, setUserPos] = useState<[number, number] | null>(null)
  const router = useRouter()

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) router.push('/login')
    })

    async function loadVenues() {
      const { data } = await supabase.from('venues').select('*')
      if (!data) return
      const withSun = await Promise.all(
        data.map(async venue => {
          if (!venue.outdoor_area) return venue
          try {
            const res = await fetch('/api/sunshine', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ lat: venue.lat, lng: venue.lng, outdoor_area: venue.outdoor_area }),
            })
            const { is_sunny } = await res.json()
            return { ...venue, is_sunny }
          } catch { return venue }
        })
      )
      setVenues(withSun)
    }
    loadVenues()
  }, [])

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

  return (
    <main style={{ width: '100vw', height: '100vh', display: 'flex', flexDirection: 'column', fontFamily: 'Helvetica, Arial, sans-serif' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 16px', background: 'white', boxShadow: '0 1px 4px rgba(0,0,0,0.08)', zIndex: 10, flexShrink: 0 }}>
        <Link href="/dashboard" style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: '16px', color: '#666', textDecoration: 'none', paddingRight: '12px', borderRight: '1px solid #eee' }}>
          ← Dashboard
        </Link>
        <span style={{ fontSize: '15px', fontWeight: 600 }}>Business map</span>
        <span style={{ marginLeft: '8px', fontSize: '13px', color: '#888' }}>Draw your outdoor area using the polygon tool →</span>
      </div>

      {/* Map */}
      <div style={{ flex: 1, position: 'relative' }}>
        <DrawMap
          venues={venues}
          isOwner={true}
          search=""
          sunnyOnly={false}
          onVenueCreated={handleVenueCreated}
          onUserLocated={setUserPos}
        />
      </div>
    </main>
  )
}
