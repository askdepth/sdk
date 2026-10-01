'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useAskdepth, AskdepthCatch } from '@askdepth/react';
import { Card } from '../components/Card';

interface CapturedEvent {
  id: string;
  time: string;
  type: string;
  payload: Record<string, unknown>;
}

export default function HomePage() {
  const askdepth = useAskdepth();
  const [logs, setLogs] = useState<CapturedEvent[]>([]);
  const [networkStatus, setNetworkStatus] = useState<string>('Ready (Idle)');
  const [shouldCrash, setShouldCrash] = useState(false);

  // Monitor outgoing requests to Cloud Run
  useEffect(() => {
    const originalFetch = window.fetch;
    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const isIngest = url.includes('analytics-ingest');
      if (isIngest && init?.body && typeof init.body === 'string') {
        try {
          const body = JSON.parse(init.body) as { events?: Array<Record<string, unknown>> };
          if (Array.isArray(body.events)) {
            body.events.forEach((evt) => {
              const entry: CapturedEvent = {
                id: Math.random().toString(36).slice(2, 9),
                time: new Date().toLocaleTimeString(),
                type: String(evt.type || 'EVENT'),
                payload: evt,
              };
              console.log('📡 [Next.js Outbound Telemetry]:', evt.type, evt);
              setLogs((prev) => [entry, ...prev.slice(0, 19)]);
            });
          }
        } catch {
          // ignore parse errors
        }
      }

      try {
        const response = await originalFetch(input, init);
        if (isIngest) {
          setNetworkStatus(`Delivered: HTTP ${response.status} (${response.statusText || 'OK'})`);
          console.log(`📡 [Next.js Ingest Response]: HTTP ${response.status}`);
        }
        return response;
      } catch (err) {
        if (isIngest) {
          setNetworkStatus(`Delivery error: ${err}`);
        }
        throw err;
      }
    };

    return () => {
      window.fetch = originalFetch;
    };
  }, []);

  return (
    <div style={{ maxWidth: '1100px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Header */}
      <header style={{ paddingBottom: '16px' }}>
        <h1 style={{ fontSize: '1.75rem', fontWeight: 700, color: '#38bdf8', margin: 0 }}>
          Askdepth SDK — Next.js App Router Verification
        </h1>
        <p style={{ color: '#94a3b8', fontSize: '0.9rem', marginTop: '6px' }}>
          Testing @askdepth/react, App Router page views, Next.js webpack AST plugin, and session replay on Cloud Run.
        </p>
      </header>

      {/* Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px' }}>
        {/* Connection status card */}
        <Card title="1. Connection & Session Status" badge="Next.js Client" badgeColor="#4ade80">
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '0.875rem' }}>
            <div><strong>Endpoint:</strong> <code style={{ fontSize: '0.75rem', wordBreak: 'break-all' }}>https://analytics-ingest-927740258959.europe-west1.run.app/v1/telemetry</code></div>
            <div><strong>Write Key:</strong> <code>my_dynamic_key_99</code></div>
            <div><strong>Cloud Run Status:</strong> <span style={{ color: '#38bdf8' }}>{networkStatus}</span></div>
            <div><strong>SDK Ready:</strong> <span style={{ color: askdepth.isReady() ? '#4ade80' : '#fbbf24' }}>{String(askdepth.isReady())}</span></div>
            <div><strong>Session ID:</strong> <code>{askdepth.getSessionId() ?? 'pending...'}</code></div>
            <div><strong>Traceparent:</strong> <code>{askdepth.getTraceparent() ?? 'none'}</code></div>
            <div><strong>Current Route:</strong> <code>/</code> (Home)</div>
          </div>
        </Card>

        {/* Action Testing */}
        <Card title="2. Telemetry Actions" badge="useAskdepth" badgeColor="#38bdf8">
          <p style={{ fontSize: '0.85rem', color: '#94a3b8', marginBottom: '12px' }}>
            Dispatch custom telemetry events with type-safe metadata.
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
            <button
              id="btn-track-purchase"
              onClick={() => {
                askdepth.track('purchase_completed', { plan: 'enterprise', amount: 1499, currency: 'USD' });
                console.log('Action: track purchase_completed');
              }}
              style={btnStyle('#0284c7')}
            >
              Track Enterprise Purchase ($1499)
            </button>

            <button
              id="btn-identify"
              onClick={() => {
                askdepth.identify('usr_next_888', { email: 'founder@askdepth.com', team: 'product', tier: 'growth' });
                console.log('Action: identify usr_next_888');
              }}
              style={btnStyle('#7c3aed')}
            >
              Identify User (usr_next_888)
            </button>
          </div>
        </Card>

        {/* Route Navigation Testing */}
        <Card title="3. Next.js App Router Navigation" badge="Auto Page Views" badgeColor="#c084fc">
          <p style={{ fontSize: '0.85rem', color: '#94a3b8', marginBottom: '12px' }}>
            Next.js <code>&lt;Link&gt;</code> triggers client-side transitions, automatically emitting <code>page_view</code> without reloads.
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            {[
              { path: '/orders', label: '📦 Orders' },
              { path: '/billing', label: '💳 Billing' },
              { path: '/settings', label: '⚙️ Settings' },
            ].map((link) => (
              <Link
                key={link.path}
                href={link.path}
                style={{
                  ...btnStyle('#334155'),
                  textDecoration: 'none',
                  display: 'inline-flex',
                  alignItems: 'center',
                }}
              >
                {link.label}
              </Link>
            ))}
          </div>
        </Card>

        {/* Error Boundary */}
        <Card title="4. Error Boundary (<AskdepthCatch>)" badge="Caught Errors" badgeColor="#f87171">
          <p style={{ fontSize: '0.85rem', color: '#94a3b8', marginBottom: '12px' }}>
            Catches React component exceptions and sends <code>ERROR_CLICK</code> with stack and source location.
          </p>
          <AskdepthCatch
            fallback={(error, reset) => (
              <div style={{ background: '#7f1d1d30', borderRadius: '8px', padding: '14px' }}>
                <div style={{ color: '#f87171', fontWeight: 600 }}>Caught: {error.message}</div>
                <button
                  onClick={() => {
                    setShouldCrash(false);
                    reset();
                  }}
                  style={{ ...btnStyle('#ef4444'), marginTop: '10px' }}
                >
                  Reset Error Boundary
                </button>
              </div>
            )}
          >
            {shouldCrash ? (
              <BuggyComponent />
            ) : (
              <button
                id="btn-trigger-crash"
                onClick={() => setShouldCrash(true)}
                style={btnStyle('#dc2626')}
              >
                Trigger Runtime Error Bomb 💣
              </button>
            )}
          </AskdepthCatch>
        </Card>

        {/* Frustration Heuristics */}
        <Card title="5. Frustration Signals" badge="Heuristics" badgeColor="#fbbf24">
          <p style={{ fontSize: '0.85rem', color: '#94a3b8', marginBottom: '12px' }}>
            Automatic RUM detection for user friction points.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <button
              id="btn-rage-click"
              onClick={() => console.log('Click registered (click rapidly 4+ times)')}
              style={btnStyle('#d97706')}
            >
              Rage Click Target (Rapid clicks emit RAGE_CLICK)
            </button>
            <div
              id="div-dead-click"
              style={{
                padding: '12px',
                background: '#334155',
                borderRadius: '8px',
                textAlign: 'center',
                cursor: 'pointer',
                fontSize: '0.875rem',
              }}
            >
              Dead Click Target (Clickable styling, no DOM reaction)
            </div>
          </div>
        </Card>
      </div>

      {/* Live Event Stream Output */}
      <Card title="📡 Live Telemetry Event Stream" badge={`${logs.length} events`} badgeColor="#38bdf8">
        <div
          style={{
            maxHeight: '260px',
            overflowY: 'auto',
            background: '#020617',
            padding: '14px',
            borderRadius: '8px',
            fontFamily: 'monospace',
            fontSize: '0.8rem',
          }}
        >
          {logs.length === 0 ? (
            <div style={{ color: '#64748b' }}>No outbound telemetry yet. Perform actions above to see live events delivered to Cloud Run.</div>
          ) : (
            logs.map((log) => (
              <div key={log.id} style={{ marginBottom: '8px', paddingBottom: '8px' }}>
                <span style={{ color: '#64748b' }}>[{log.time}]</span>{' '}
                <span style={{ color: '#38bdf8', fontWeight: 600 }}>{log.type}</span>
                <pre style={{ color: '#cbd5e1', marginTop: '4px', overflowX: 'auto', margin: 0 }}>
                  {JSON.stringify(log.payload, null, 2)}
                </pre>
              </div>
            ))
          )}
        </div>
      </Card>
    </div>
  );
}

function BuggyComponent(): React.ReactElement {
  throw new Error('Simulated runtime exception inside Next.js component!');
}

function btnStyle(bg: string, color = '#ffffff'): React.CSSProperties {
  return {
    background: bg,
    color,
    border: 'none',
    padding: '9px 16px',
    borderRadius: '6px',
    fontWeight: 500,
    cursor: 'pointer',
    fontSize: '0.85rem',
  };
}
