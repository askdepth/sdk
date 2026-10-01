'use client';

import React from 'react';
import Link from 'next/link';
import { useAskdepth } from '@askdepth/react';
import { Card } from '../../components/Card';

export default function BillingPage() {
  const askdepth = useAskdepth();

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <header>
        <Link href="/" style={{ color: '#38bdf8', textDecoration: 'none', fontSize: '0.9rem' }}>
          ← Back to Home
        </Link>
        <h1 style={{ fontSize: '1.75rem', fontWeight: 700, margin: '12px 0 4px 0' }}>
          💳 Billing Page
        </h1>
        <p style={{ color: '#94a3b8', fontSize: '0.9rem', margin: 0 }}>
          Navigating to <code>/billing</code> fired another automatic <code>page_view</code> event.
        </p>
      </header>

      <Card title="Subscription Actions">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '0.875rem' }}>
          <div><strong>Session ID:</strong> <code>{askdepth.getSessionId() ?? 'pending...'}</code></div>
          <div>
            <button
              onClick={() => askdepth.track('subscription_updated', { plan: 'scale', interval: 'yearly' })}
              style={{
                background: '#7c3aed',
                color: '#ffffff',
                border: 'none',
                padding: '8px 14px',
                borderRadius: '6px',
                cursor: 'pointer',
                marginTop: '10px',
              }}
            >
              Update Subscription to Scale ($2,400/yr)
            </button>
          </div>
        </div>
      </Card>
    </div>
  );
}
