'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '../../lib/supabase'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const router = useRouter()

  async function handleLogin() {
    setLoading(true)
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error) {
      setMessage(error.message)
    } else {
      router.push('/dashboard')
    }
    setLoading(false)
  }

  return (
    <main style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      height: '100vh',
      gap: '16px',
      fontFamily: 'Helvetica, Arial, sans-serif'
    }}>
      <h1>Business login</h1>
      <input
        type="email"
        placeholder="Email"
        value={email}
        onChange={e => setEmail(e.target.value)}
        style={{ padding: '8px', width: '300px', fontSize: '16px' }}
      />
      <input
        type="password"
        placeholder="Password"
        value={password}
        onChange={e => setPassword(e.target.value)}
        style={{ padding: '8px', width: '300px', fontSize: '16px' }}
      />
      <button
        onClick={handleLogin}
        disabled={loading}
        style={{
          padding: '10px 24px',
          fontSize: '16px',
          background: 'orange',
          border: 'none',
          borderRadius: '8px',
          cursor: 'pointer',
          width: '300px'
        }}
      >
        {loading ? 'Logging in...' : 'Log in'}
      </button>
      {message && <p style={{ color: 'red' }}>{message}</p>}
    </main>
  )
}
