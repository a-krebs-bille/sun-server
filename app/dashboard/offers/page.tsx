'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '../../../lib/supabase'
import { Tag, Check } from 'lucide-react'

export default function OffersPage() {
  const router = useRouter()
  const [user, setUser] = useState<any>(null)
  const [venues, setVenues] = useState<any[]>([])
  const [selectedVenue, setSelectedVenue] = useState('')
  const [title, setTitle] = useState('')
  const [expiresAt, setExpiresAt] = useState('')
  const [sending, setSending] = useState(false)
  const [result, setResult] = useState<{ ok?: boolean; error?: string } | null>(null)

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      setUser(user)

      const { data } = await supabase.from('venues').select('id, name')
      setVenues(data ?? [])
      if (data?.length) setSelectedVenue(data[0].id)
    }
    load()
  }, [])

  async function sendOffer() {
    if (!title.trim() || !selectedVenue) return
    setSending(true)
    setResult(null)

    const { data: { session } } = await supabase.auth.getSession()

    const res = await fetch('/api/offers', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session?.access_token}`,
      },
      body: JSON.stringify({
        venueId: selectedVenue,
        title: title.trim(),
        expiresAt: expiresAt || null,
      }),
    })

    const data = await res.json()
    setSending(false)

    if (res.ok) {
      setResult({ ok: true })
      setTitle('')
      setExpiresAt('')
    } else if (data.error === 'subscription_required') {
      setResult({ error: 'You need a Pro or Chain plan to send offers. Upgrade from the dashboard.' })
    } else {
      setResult({ error: data.message ?? 'Something went wrong.' })
    }
  }

  if (!user) return null

  return (
    <main style={{ minHeight: '100vh', background: '#f9f7f4', fontFamily: 'Helvetica, Arial, sans-serif' }}>
      <div style={{ background: 'white', borderBottom: '1px solid #eee', padding: '20px 32px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <Link href="/dashboard" style={{ fontSize: '13px', color: '#888', textDecoration: 'none' }}>← Dashboard</Link>
          <div style={{ fontSize: '20px', fontWeight: 700, marginTop: '4px' }}>Send an offer</div>
        </div>
      </div>

      <div style={{ maxWidth: 560, margin: '40px auto', padding: '0 24px' }}>
        <div style={{ background: 'white', borderRadius: '16px', padding: '32px', boxShadow: '0 1px 4px rgba(0,0,0,0.07)' }}>
          <p style={{ color: '#555', fontSize: '14px', lineHeight: 1.6, marginTop: 0 }}>
            Send a special offer to everyone who has favourited your venue. They'll get a push notification instantly. <strong>Available on Pro and Chain plans.</strong>
          </p>

          {/* Venue selector */}
          {venues.length > 1 && (
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px', color: '#333' }}>Venue</label>
              <select
                value={selectedVenue}
                onChange={e => setSelectedVenue(e.target.value)}
                style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #ddd', fontSize: '15px' }}
              >
                {venues.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
              </select>
            </div>
          )}

          {/* Offer title */}
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px', color: '#333' }}>
              Offer title <span style={{ color: '#aaa', fontWeight: 400 }}>({title.length}/80)</span>
            </label>
            <input
              type="text"
              maxLength={80}
              placeholder="e.g. 2 for 1 drinks until the sun goes away"
              value={title}
              onChange={e => setTitle(e.target.value)}
              style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #ddd', fontSize: '15px', boxSizing: 'border-box' }}
            />
          </div>

          {/* Optional expiry */}
          <div style={{ marginBottom: '24px' }}>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px', color: '#333' }}>
              Expires at <span style={{ color: '#aaa', fontWeight: 400 }}>(optional)</span>
            </label>
            <input
              type="datetime-local"
              value={expiresAt}
              onChange={e => setExpiresAt(e.target.value)}
              style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #ddd', fontSize: '15px', boxSizing: 'border-box' }}
            />
          </div>

          {result?.error && (
            <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '12px 16px', marginBottom: '16px', fontSize: '14px', color: '#b91c1c' }}>
              {result.error}
              {result.error.includes('Pro') && (
                <div style={{ marginTop: '8px' }}>
                  <Link href="/pricing" style={{ color: '#f97316', fontWeight: 600, textDecoration: 'none' }}>View plans →</Link>
                </div>
              )}
            </div>
          )}

          {result?.ok && (
            <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px', padding: '12px 16px', marginBottom: '16px', fontSize: '14px', color: '#15803d' }}>
              <Check size={14} strokeWidth={2.5} style={{display:'inline',verticalAlign:'middle',marginRight:4}}/> Offer sent! Your favourited customers have been notified.
            </div>
          )}

          <button
            onClick={sendOffer}
            disabled={sending || !title.trim()}
            style={{
              width: '100%', background: sending || !title.trim() ? '#e5e7eb' : '#f97316',
              color: sending || !title.trim() ? '#9ca3af' : 'white',
              border: 'none', borderRadius: '10px', padding: '14px',
              fontSize: '15px', fontWeight: 700, cursor: sending || !title.trim() ? 'not-allowed' : 'pointer',
            }}
          >
            {sending ? 'Sending…' : 'Send offer to favourited users'}
          </button>
        </div>
      </div>
    </main>
  )
}
