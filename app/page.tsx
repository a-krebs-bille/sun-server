'use client'

import dynamic from 'next/dynamic'

const Map = dynamic(() => import('./components/Map'), { ssr: false })

export default function Home() {
  return (
    <main style={{ width: '100vw', height: '100vh' }}>
      <Map />
    </main>
  )
}
