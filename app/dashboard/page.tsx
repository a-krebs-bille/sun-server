'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '../../lib/supabase'

export default function Dashboard() {
  const [user, setUser] = useState<any>(null)
  const router = useRouter()

  useEffect(() => {
    async function getUser() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) router.push('/login')
      else setUser(user)
    }
    getUser()
  }, [])

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  if (!user) return <p style={{ padding: '40px', fontFamily: 'Helvetica, Arial, sans-serif' }}>Loading...</p>

  const name = user.user_metadata?.business_name || user.email

  return (
    <main style={{ minHeight: '100vh', background: '#f9f7f4', fontFamily: 'Helvetica, Arial, sans-serif' }}>
      {/* Header */}
      <div style={{ background: 'white', borderBottom: '1px solid #eee', padding: '20px 32px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontSize: '13px', color: '#888', marginBottom: '2px' }}>Business dashboard</div>
          <div style={{ fontSize: '20px', fontWeight: 700 }}>{name}</div>
        </div>
        <button onClick={handleLogout} style={{ background: 'none', border: '1px solid #ddd', borderRadius: '8px', padding: '8px 18px', fontSize: '14px', cursor: 'pointer', color: '#555' }}>
          Log out
        </button>
      </div>

      {/* Cards */}
      <div style={{ padding: '32px', display: 'flex', gap: '16px', flexWrap: 'wrap' }}>

        {/* Draw venue card */}
        <div style={{ background: 'white', borderRadius: '16px', padding: '28px', flex: '1', minWidth: '240px', boxShadow: '0 1px 4px rgba(0,0,0,0.07)' }}>
          <div style={{ fontSize: '36px', marginBottom: '12px' }}>🗺️</div>
          <h2 style={{ fontSize: '18px', fontWeight: 700, margin: '0 0 8px' }}>Draw your venue</h2>
          <p style={{ color: '#666', fontSize: '14px', lineHeight: 1.5, margin: '0 0 20px' }}>
            Open the business map and draw the outline of your outdoor seating area.
          </p>
          <Link href="/dashboard/map" style={{ display: 'inline-block', background: '#f97316', color: 'white', padding: '10px 22px', borderRadius: '8px', textDecoration: 'none', fontSize: '14px', fontWeight: 600 }}>
            Open map
          </Link>
        </div>

        {/* View as user card */}
        <div style={{ background: 'white', borderRadius: '16px', padding: '28px', flex: '1', minWidth: '240px', boxShadow: '0 1px 4px rgba(0,0,0,0.07)' }}>
          <div style={{ fontSize: '36px', marginBottom: '12px' }}>☀️</div>
          <h2 style={{ fontSize: '18px', fontWeight: 700, margin: '0 0 8px' }}>See user view</h2>
          <p style={{ color: '#666', fontSize: '14px', lineHeight: 1.5, margin: '0 0 20px' }}>
            See how your venue appears to customers looking for sunny spots.
          </p>
          <Link href="/" style={{ display: 'inline-block', background: '#f1f5f9', color: '#333', padding: '10px 22px', borderRadius: '8px', textDecoration: 'none', fontSize: '14px', fontWeight: 600 }}>
            View app
          </Link>
        </div>

      </div>
    </main>
  )
}
