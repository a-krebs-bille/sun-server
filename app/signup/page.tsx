'use client'

import { useState } from 'react'
import { supabase } from '../../lib/supabase'

export default function SignUp() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [businessName, setBusinessName] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')

  async function handleSignUp() {
    setLoading(true)
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { business_name: businessName }
      }
    })

    if (error) {
      setMessage(error.message)
    } else {
      setMessage('Check your email to confirm your account!')
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
      <h1>Register your business</h1>
      <input
        type="text"
        placeholder="Business name"
        value={businessName}
        onChange={e => setBusinessName(e.target.value)}
        style={{ padding: '8px', width: '300px', fontSize: '16px' }}
      />
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
        onClick={handleSignUp}
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
        {loading ? 'Creating account...' : 'Sign up'}
      </button>
      {message && <p>{message}</p>}
    </main>
  )
}
