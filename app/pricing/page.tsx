'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

const plans = [
  {
    name: 'Starter',
    price: '€29/mo',
    description: '1 venue listing',
    features: ['Map listing', 'Draw outdoor zones', 'Basic profile'],
    priceId: 'price_1TDsoMA3UcVxTp2hRc3tMcif',
  },
  {
    name: 'Pro',
    price: '€79/mo',
    description: 'Up to 3 venues',
    features: ['Everything in Starter', 'Analytics dashboard', 'Photo gallery', 'Priority placement'],
    priceId: 'price_1TDsooA3UcVxTp2hjXsAL3ew',
    popular: true,
  },
  {
    name: 'Chain',
    price: '€199/mo',
    description: 'Unlimited venues',
    features: ['Everything in Pro', 'Booking module', 'API access', 'Dedicated support'],
    priceId: 'price_1TDspZA3UcVxTp2hOuMrlZZT',
  },
]

export default function Pricing() {
  const [loading, setLoading] = useState<string | null>(null)
  const router = useRouter()

  async function handleSubscribe(priceId: string) {
    setLoading(priceId)
    const res = await fetch('/api/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ priceId }),
    })
    const data = await res.json()
    console.log('Stripe response:', data)
    if (data.url) {
      router.push(data.url)
    } else {
      alert('Error: ' + data.error)
    }
    setLoading(null)
  }

  return (
    <main style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      padding: '60px 20px',
      fontFamily: 'Helvetica, Arial, sans-serif',
    }}>
      <h1 style={{ fontSize: '32px', marginBottom: '8px' }}>Simple pricing</h1>
      <p style={{ color: '#666', marginBottom: '48px' }}>Choose the plan that fits your business</p>
      <div style={{
        display: 'flex',
        gap: '24px',
        flexWrap: 'wrap',
        justifyContent: 'center',
      }}>
        {plans.map(plan => (
          <div key={plan.name} style={{
            border: plan.popular ? '2px solid orange' : '1px solid #ddd',
            borderRadius: '12px',
            padding: '32px',
            width: '260px',
            position: 'relative',
          }}>
            {plan.popular && (
              <div style={{
                position: 'absolute',
                top: '-14px',
                left: '50%',
                transform: 'translateX(-50%)',
                background: 'orange',
                color: 'white',
                padding: '4px 16px',
                borderRadius: '20px',
                fontSize: '12px',
                fontWeight: 'bold',
              }}>
                Most popular
              </div>
            )}
            <h2 style={{ fontSize: '20px', marginBottom: '4px' }}>{plan.name}</h2>
            <div style={{ fontSize: '28px', fontWeight: 'bold', marginBottom: '4px' }}>{plan.price}</div>
            <p style={{ color: '#666', fontSize: '14px', marginBottom: '20px' }}>{plan.description}</p>
            <ul style={{ listStyle: 'none', padding: 0, marginBottom: '24px' }}>
              {plan.features.map(feature => (
                <li key={feature} style={{ padding: '4px 0', fontSize: '14px' }}>
                  ✓ {feature}
                </li>
              ))}
            </ul>
            <button
              onClick={() => handleSubscribe(plan.priceId)}
              disabled={loading === plan.priceId}
              style={{
                width: '100%',
                padding: '12px',
                background: plan.popular ? 'orange' : 'white',
                color: plan.popular ? 'white' : 'black',
                border: '1px solid orange',
                borderRadius: '8px',
                fontSize: '16px',
                cursor: 'pointer',
              }}
            >
              {loading === plan.priceId ? 'Loading...' : 'Get started'}
            </button>
          </div>
        ))}
      </div>
    </main>
  )
}
