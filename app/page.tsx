'use client'

import dynamic from 'next/dynamic'

const DrawMap = dynamic(() => import('./components/DrawMap'), { ssr: false })

export default function Home() {
  return (
    <main style={{ width: '100vw', height: '100vh' }}>
      <DrawMap />
    </main>
  )
}