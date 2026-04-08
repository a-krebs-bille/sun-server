'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '../../lib/supabase'

export default function Dashboard() {
  const [user, setUser] = useState<any>(null)
  const router = useRouter()

  useEffect(() => {
    async function getUser() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/login')
      } else {
        setUser(user)
      }
    }
    getUser()
  }, [])

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  if (!user) return <p>Loading...</p>

  return (
    <main style={{
      padding: '40px',
      fontFamily: 'Helvetica, Arial, sans-serif'
    }}>
      <h1>Welcome, {user.user_metadata?.business_name || user.email}!</h1>
      <p>This is your business dashboard.</p>
      <button
        onClick={handleLogout}
        style={{
          padding: '10px 24px',
          fontSize: '16px',
          background: 'orange',
          border: 'none',
          borderRadius: '8px',
          cursor: 'pointer',
          marginTop: '16px'
        }}
      >
        Log out
      </button>
    </main>
  )
}