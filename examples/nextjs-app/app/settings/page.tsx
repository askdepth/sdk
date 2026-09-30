'use client';

import React from 'react';
import Link from 'next/link';
import { useAskdepth } from '@askdepth/react';
import { Card } from '../../components/Card';

export default function SettingsPage() {
  const askdepth = useAskdepth();

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <header>
        <Link href="/" style={{ color: '#38bdf8', textDecoration: 'none', fontSize: '0.9rem' }}>
          ← Back to Home
        </Link>
        <h1 style={{ fontSize: '1.75rem', fontWeight: 700, margin: '12px 0 4px 0' }}>
          ⚙️ Settings Page
        </h1>
        <p style={{ color: '#94a3b8', fontSize: '0.9rem', margin: 0 }}>
          Navigating to <code>/settings</code>.
        </p>
      </header>

      <Card title="User Preferences">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '0.875rem' }}>
          <div><strong>Session ID:</strong> <code>{askdepth.getSessionId() ?? 'pending...'}</code></div>
          <div>
            <button
              onClick={() => askdepth.track('settings_saved', { theme: 'dark', notifications: true })}
              style={{
                background: '#059669',
                color: '#ffffff',
                border: 'none',
                padding: '8px 14px',
                borderRadius: '6px',
                cursor: 'pointer',
                marginTop: '10px',
              }}
            >
              Save Settings
            </button>
          </div>
        </div>
      </Card>
    </div>
  );
}
