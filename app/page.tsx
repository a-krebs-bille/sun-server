'use client'

import dynamic from 'next/dynamic'
import { useState } from 'react'
import Link from 'next/link'

const DrawMap = dynamic(() => import('./components/DrawMap'), { ssr: false })

export default function Home() {
  const [showMap, setShowMap] = useState(false)
  const [search, setSearch] = useState('')

  if (showMap) {
    return (
      <main style={{ width: '100vw', height: '100vh', position: 'relative' }}>
        <div style={{
          position: 'absolute', top: '16px', left: '50%',
          transform: 'translateX(-50%)', zIndex: 1000,
          display: 'flex', gap: '8px', background: 'white',
          padding: '10px 16px', borderRadius: '12px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
        }}>
          <button onClick={() => setShowMap(false)}
            style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: '16px', color: '#666', paddingRight: '8px', borderRight: '1px solid #eee' }}>
            ← Back
          </button>
          <input
            type="text" placeholder="Search venues..."
            value={search} onChange={e => setSearch(e.target.value)}
            style={{ border: 'none', outline: 'none', fontSize: '16px', width: '240px' }}
          />
        </div>
        <DrawMap search={search} />
      </main>
    )
  }

  return (
    <main style={{ fontFamily: 'sans-serif', overflowX: 'hidden' }}>
      <nav style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '20px 40px', position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10,
      }}>
        <div style={{ fontSize: '22px', fontWeight: 'bold', color: 'white' }}>Sun Server</div>
        <div style={{ display: 'flex', gap: '16px' }}>
          <Link href="/login" style={{ color: 'white', textDecoration: 'none', fontSize: '15px' }}>
            Log in
          </Link>
          <Link href="/signup" style={{
            background: 'white', color: '#f97316', padding: '8px 20px',
            borderRadius: '999px', textDecoration: 'none', fontSize: '15px', fontWeight: '500',
          }}>
            List your venue
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <div style={{
        background: 'linear-gradient(135deg, #f97316 0%, #fbbf24 50%, #fde68a 100%)',
        minHeight: '100vh', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '40px 20px',
      }}>
        <h1 style={{
          fontSize: '56px', fontWeight: '800', color: 'white',
          margin: '0 0 16px', lineHeight: 1.1,
        }}>
          Your guide to sunshine.
        </h1>
        <p style={{ fontSize: '20px', color: 'white', opacity: 0.9, maxWidth: '480px', marginBottom: '40px', lineHeight: 1.6 }}>
          Outdoor seating in the sun — near you.
        </p>
        <button onClick={() => setShowMap(true)} style={{
          background: 'white', color: '#f97316', border: 'none',
          padding: '18px 48px', borderRadius: '999px', fontSize: '18px',
          fontWeight: '700', cursor: 'pointer',
          boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
        }}>
          Sun map
        </button>
      </div>

      {/* Feature cards */}
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

      {/* Business CTA */}
      <div style={{ background: '#1a1a1a', padding: '80px 40px', textAlign: 'center' }}>
        <h2 style={{ fontSize: '36px', fontWeight: '700', color: 'white', marginBottom: '16px' }}>
          Own a café or restaurant?
        </h2>
        <p style={{ color: '#999', fontSize: '18px', marginBottom: '40px' }}>
          List your venue and get discovered by sun-seeking guests.
        </p>
        <Link href="/pricing" style={{
          background: '#f97316', color: 'white', padding: '18px 48px',
          borderRadius: '999px', textDecoration: 'none', fontSize: '18px', fontWeight: '700',
        }}>
          See pricing
        </Link>
      </div>

      <div style={{ background: '#111', padding: '24px 40px', textAlign: 'center', color: '#555', fontSize: '14px' }}>
        2026 Sun Server — Find sunshine
      </div>
    </main>
  )
}
