'use client';

import React from 'react';
import Link from 'next/link';
import { useAskdepth } from '@askdepth/react';
import { Card } from '../../components/Card';

export default function OrdersPage() {
  const askdepth = useAskdepth();

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <header>
        <Link href="/" style={{ color: '#38bdf8', textDecoration: 'none', fontSize: '0.9rem' }}>
          ← Back to Home
        </Link>
        <h1 style={{ fontSize: '1.75rem', fontWeight: 700, margin: '12px 0 4px 0' }}>
          📦 Orders Page
        </h1>
        <p style={{ color: '#94a3b8', fontSize: '0.9rem', margin: 0 }}>
          Notice that navigating here automatically triggered an Askdepth <code>page_view</code> event for <code>/orders</code>!
        </p>
      </header>

      <Card title="Active Session Details">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '0.875rem' }}>
          <div><strong>Session ID:</strong> <code>{askdepth.getSessionId() ?? 'pending...'}</code></div>
          <div><strong>Traceparent:</strong> <code>{askdepth.getTraceparent() ?? 'none'}</code></div>
          <div>
            <button
              onClick={() => askdepth.track('order_viewed', { order_id: 'ord_999', total: 49.99 })}
              style={{
                background: '#0284c7',
                color: '#ffffff',
                border: 'none',
                padding: '8px 14px',
                borderRadius: '6px',
                cursor: 'pointer',
                marginTop: '10px',
              }}
            >
              Track Order Viewed ($49.99)
            </button>
          </div>
        </div>
      </Card>
    </div>
  );
}
