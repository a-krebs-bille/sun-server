'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '../../../lib/supabase'

const SUGGESTED_FIELDS = [
  { key: 'description',   label: 'Description',     type: 'textarea', placeholder: 'A cozy spot with sun from morning to afternoon…' },
  { key: 'price_range',   label: 'Price range',     type: 'select',   options: ['', '€', '€€', '€€€'] },
  { key: 'outdoor_seats', label: 'Outdoor seats',   type: 'number',   placeholder: '40' },
  { key: 'opening_hours', label: 'Opening hours',   type: 'text',     placeholder: 'Mon–Fri 11:00–22:00, Sat–Sun 10:00–23:00' },
  { key: 'menu_url',      label: 'Menu URL',        type: 'url',      placeholder: 'https://yourrestaurant.com/menu' },
]

export default function VenueProfilePage() {
  const router = useRouter()
  const [venues, setVenues] = useState<any[]>([])
  const [selected, setSelected] = useState<any>(null)
  const [profile, setProfile] = useState<Record<string, any>>({})
  const [custom, setCustom] = useState<{ label: string; value: string }[]>([])
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      const { data } = await supabase.from('venues').select('*')
      if (data?.length) {
        setVenues(data)
        pickVenue(data[0])
      }
    }
    load()
  }, [])

  function pickVenue(v: any) {
    setSelected(v)
    const p = v.profile ?? {}
    setProfile(p)
    setCustom(p.custom ?? [])
    setSaved(false)
  }

  function setField(key: string, value: any) {
    setProfile(prev => ({ ...prev, [key]: value }))
  }

  function addCustomField() {
    setCustom(prev => [...prev, { label: '', value: '' }])
  }

  function updateCustom(index: number, field: 'label' | 'value', val: string) {
    setCustom(prev => prev.map((f, i) => i === index ? { ...f, [field]: val } : f))
  }

  function removeCustom(index: number) {
    setCustom(prev => prev.filter((_, i) => i !== index))
  }

  async function save() {
    if (!selected) return
    setSaving(true)
    const merged = { ...profile, custom: custom.filter(f => f.label.trim()) }
    await supabase.from('venues').update({ profile: merged }).eq('id', selected.id)
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  if (!selected) return <p style={{ padding: 40, fontFamily: 'Helvetica, Arial, sans-serif' }}>Loading…</p>

  return (
    <main style={{ minHeight: '100vh', background: '#f9f7f4', fontFamily: 'Helvetica, Arial, sans-serif' }}>
      <div style={{ background: 'white', borderBottom: '1px solid #eee', padding: '20px 32px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <Link href="/dashboard" style={{ fontSize: 13, color: '#888', textDecoration: 'none' }}>← Dashboard</Link>
          <div style={{ fontSize: 20, fontWeight: 700, marginTop: 4 }}>Venue profile</div>
        </div>
        {venues.length > 1 && (
          <select
            value={selected.id}
            onChange={e => pickVenue(venues.find(v => v.id === e.target.value))}
            style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #ddd', fontSize: 14 }}
          >
            {venues.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
          </select>
        )}
      </div>

      <div style={{ maxWidth: 600, margin: '32px auto', padding: '0 24px 48px' }}>
        <div style={{ background: 'white', borderRadius: 16, padding: 32, boxShadow: '0 1px 4px rgba(0,0,0,0.07)' }}>
          <p style={{ color: '#555', fontSize: 14, lineHeight: 1.6, marginTop: 0 }}>
            This info appears when users tap your venue on the map. Add what's useful — there are no required fields.
          </p>

          {/* Suggested fields */}
          {SUGGESTED_FIELDS.map(f => (
            <div key={f.key} style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6, color: '#333' }}>{f.label}</label>
              {f.type === 'textarea' ? (
                <textarea
                  rows={3}
                  placeholder={f.placeholder}
                  value={profile[f.key] ?? ''}
                  onChange={e => setField(f.key, e.target.value)}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #ddd', fontSize: 14, resize: 'vertical', boxSizing: 'border-box', fontFamily: 'inherit' }}
                />
              ) : f.type === 'select' ? (
                <select
                  value={profile[f.key] ?? ''}
                  onChange={e => setField(f.key, e.target.value)}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #ddd', fontSize: 14 }}
                >
                  {f.options!.map(o => <option key={o} value={o}>{o || 'Select…'}</option>)}
                </select>
              ) : (
                <input
                  type={f.type}
                  placeholder={f.placeholder}
                  value={profile[f.key] ?? ''}
                  onChange={e => setField(f.key, e.target.value)}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #ddd', fontSize: 14, boxSizing: 'border-box' }}
                />
              )}
            </div>
          ))}

          {/* Custom fields */}
          <div style={{ borderTop: '1px solid #f0f0f0', paddingTop: 20, marginTop: 8 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#333', marginBottom: 12 }}>Custom fields</div>
            {custom.map((f, i) => (
              <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                <input
                  placeholder="Label (e.g. Dog friendly)"
                  value={f.label}
                  onChange={e => updateCustom(i, 'label', e.target.value)}
                  style={{ flex: 1, padding: '9px 12px', borderRadius: 8, border: '1px solid #ddd', fontSize: 14 }}
                />
                <input
                  placeholder="Value (e.g. Yes)"
                  value={f.value}
                  onChange={e => updateCustom(i, 'value', e.target.value)}
                  style={{ flex: 1, padding: '9px 12px', borderRadius: 8, border: '1px solid #ddd', fontSize: 14 }}
                />
                <button
                  onClick={() => removeCustom(i)}
                  style={{ background: 'none', border: '1px solid #ddd', borderRadius: 8, padding: '0 12px', cursor: 'pointer', color: '#999', fontSize: 16 }}
                >×</button>
              </div>
            ))}
            <button
              onClick={addCustomField}
              style={{ background: 'none', border: '1px dashed #ccc', borderRadius: 8, padding: '8px 16px', fontSize: 13, cursor: 'pointer', color: '#888', marginTop: 4 }}
            >
              + Add custom field
            </button>
          </div>

          {/* Save */}
          <button
            onClick={save}
            disabled={saving}
            style={{
              width: '100%', marginTop: 28,
              background: saved ? '#16a34a' : '#f97316',
              color: 'white', border: 'none', borderRadius: 12,
              padding: 14, fontSize: 15, fontWeight: 700,
              cursor: saving ? 'not-allowed' : 'pointer',
              transition: 'background 0.2s',
            }}
          >
            {saving ? 'Saving…' : saved ? '✓ Saved' : 'Save profile'}
          </button>
        </div>
      </div>
    </main>
  )
}
