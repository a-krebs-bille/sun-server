'use client'

import dynamic from 'next/dynamic'
import { useState } from 'react'

const DrawMap = dynamic(() => import('./components/DrawMap'), { ssr: false })

export default function Home() {
  const [search, setSearch] = useState('')

  return (
    <main style={{ width: '100vw', height: '100vh', position: 'relative' }}>
      <div style={{
        position: 'absolute',
        top: '16px',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 1000,
        display: 'flex',
        gap: '8px',
        background: 'white',
        padding: '10px 16px',
        borderRadius: '12px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
      }}>
        <input
          type="text"
          placeholder="Search venues..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{
            border: 'none',
            outline: 'none',
            fontSize: '16px',
            width: '240px',
          }}
        />
      </div>
      <DrawMap search={search} />
    </main>
  )
}
