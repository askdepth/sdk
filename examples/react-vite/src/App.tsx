import React, { useState, useEffect } from 'react';
import { AskdepthProvider, useAskdepth, AskdepthCatch } from '@askdepth/react';
import { Card } from './components/Card.js';

interface CapturedEvent {
  id: string;
  time: string;
  type: string;
  payload: Record<string, unknown>;
}

const LIVE_WRITE_KEY = 'my_dynamic_key_99';
const LIVE_ENDPOINT = 'https://analytics-ingest-927740258959.europe-west1.run.app/v1/telemetry';

export interface AppProps {
  writeKey?: string;
  endpoint?: string;
}

export function App({
  writeKey = typeof window !== 'undefined' && window.location.hostname.includes('example.test') ? '550e8400-e29b-41d4-a716-446655440000' : LIVE_WRITE_KEY,
  endpoint = typeof window !== 'undefined' && window.location.hostname.includes('example.test') ? 'https://ingest.example.test/v1' : LIVE_ENDPOINT,
}: AppProps = {}) {
  return (
    <AskdepthProvider
      writeKey={writeKey}
      endpoint={endpoint}
      consent="granted"
      sampleRate={1}
      environment="development"
    >
      <Dashboard writeKey={writeKey} endpoint={endpoint} />
    </AskdepthProvider>
  );
}

function Dashboard({ writeKey, endpoint }: { writeKey: string; endpoint: string }) {
  const askdepth = useAskdepth();
  const [logs, setLogs] = useState<CapturedEvent[]>([]);
  const [networkStatus, setNetworkStatus] = useState<string>('Ready (Idle)');
  const [currentPath, setCurrentPath] = useState(window.location.pathname || '/');
  const [shouldCrash, setShouldCrash] = useState(false);
  const [stampedElements, setStampedElements] = useState<Array<{ tag: string; label: string; src?: string; id?: string }>>([]);

  // Intercept fetch to show outgoing telemetry events live in console and UI
  useEffect(() => {
    const originalFetch = window.fetch;
    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const isIngest = url.includes('analytics-ingest') || url.includes('ingest.example.test');
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
              console.log('📡 [Askdepth Outbound Event]:', evt.type, evt);
              setLogs((prev) => [entry, ...prev.slice(0, 19)]);
            });
          }
        } catch {
          // ignore parse errors
        }
      }
      if (url.includes('ingest.example.test')) {
        return new Response(JSON.stringify({ status: 'ok' }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      try {
        const response = await originalFetch(input, init);
        if (isIngest) {
          setNetworkStatus(`Delivered: HTTP ${response.status} (${response.statusText || 'OK'})`);
          console.log(`📡 [Askdepth Delivery Response]: HTTP ${response.status}`);
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

  // Inspect HTML tree for Askdepth compiler attributes
  const inspectHtmlTree = () => {
    const elements = document.querySelectorAll('[data-askdepth-src], [data-askdepth-id]');
    const list: Array<{ tag: string; label: string; src?: string; id?: string }> = [];
    elements.forEach((el) => {
      list.push({
        tag: el.tagName.toLowerCase(),
        label: el.id ? `#${el.id}` : el.className ? `.${el.className}` : el.textContent?.slice(0, 20) || '',
        src: el.getAttribute('data-askdepth-src') || undefined,
        id: el.getAttribute('data-askdepth-id') || undefined,
      });
    });
    setStampedElements(list);
    console.log('🔍 [Askdepth Compiler Attributes Found in DOM]:', list);
  };

  useEffect(() => {
    // Initial inspection on mount
    const timer = setTimeout(inspectHtmlTree, 100);
    return () => clearTimeout(timer);
  }, []);

  const navigateTo = (path: string) => {
    window.history.pushState({}, '', path);
    setCurrentPath(path);
    console.log(`🧭 Navigated to ${path}`);
  };

  return (
    <div style={{ maxWidth: '1100px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Header */}
      <header style={{ borderBottom: '1px solid #334155', paddingBottom: '16px' }}>
        <h1 style={{ fontSize: '1.75rem', fontWeight: 700, color: '#38bdf8' }}>
          Askdepth SDK — React + Vite Verification
        </h1>
        <p style={{ color: '#94a3b8', fontSize: '0.9rem', marginTop: '4px' }}>
          Testing @askdepth/react, compiler AST plugins, fiber runtime mapping, and error boundary integration.
        </p>
      </header>

      {/* Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px' }}>
        {/* Connection status card */}
        <Card title="1. Connection & Session Status" badge="Core Ready" badgeColor="#4ade80">
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '0.875rem' }}>
            <div><strong>Endpoint:</strong> <code style={{ fontSize: '0.75rem', wordBreak: 'break-all' }}>{endpoint}</code></div>
            <div><strong>Write Key:</strong> <code>{writeKey}</code></div>
            <div><strong>Delivery:</strong> <span style={{ color: '#38bdf8' }}>{networkStatus}</span></div>
            <div><strong>Ready:</strong> <span style={{ color: askdepth.isReady() ? '#4ade80' : '#fbbf24' }}>{String(askdepth.isReady())}</span></div>
            <div><strong>Session ID:</strong> <code>{askdepth.getSessionId() ?? 'pending...'}</code></div>
            <div><strong>Traceparent:</strong> <code>{askdepth.getTraceparent() ?? 'none'}</code></div>
            <div><strong>Current Route:</strong> <code>{currentPath}</code></div>
          </div>
        </Card>

        {/* Action Testing */}
        <Card title="2. Telemetry Actions" badge="useAskdepth" badgeColor="#38bdf8">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
            <button
              id="btn-track-custom"
              onClick={() => {
                askdepth.track('purchase_completed', { plan: 'enterprise', amount: 999 });
                console.log('Action: track purchase_completed');
              }}
              style={btnStyle('#0284c7')}
            >
              Track Purchase ($999)
            </button>

            <button
              id="btn-identify"
              onClick={() => {
                askdepth.identify('usr_4242', { email: 'developer@example.com', role: 'admin' });
                console.log('Action: identify usr_4242');
              }}
              style={btnStyle('#7c3aed')}
            >
              Identify User
            </button>
          </div>
        </Card>

        {/* Route Navigation Testing */}
        <Card title="3. SPA Route Navigation" badge="Auto Page Views" badgeColor="#c084fc">
          <p style={{ fontSize: '0.85rem', color: '#94a3b8', marginBottom: '10px' }}>
            Clicking routes uses <code>history.pushState()</code> and triggers automatic <code>page_view</code> events.
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            {['/dashboard', '/orders', '/billing', '/settings'].map((path) => (
              <button
                key={path}
                onClick={() => navigateTo(path)}
                style={currentPath === path ? btnStyle('#38bdf8', '#0f172a') : btnStyle('#334155')}
              >
                {path}
              </button>
            ))}
          </div>
        </Card>

        {/* Error Boundary */}
        <Card title="4. Error Boundary (<AskdepthCatch>)" badge="Caught Errors" badgeColor="#f87171">
          <p style={{ fontSize: '0.85rem', color: '#94a3b8', marginBottom: '10px' }}>
            Catches runtime React errors, captures component stack, and reports <code>ERROR_CLICK</code> with source mapping.
          </p>
          <AskdepthCatch
            fallback={(error, reset) => (
              <div style={{ background: '#7f1d1d40', border: '1px solid #ef4444', borderRadius: '6px', padding: '12px' }}>
                <div style={{ color: '#f87171', fontWeight: 600 }}>Caught: {error.message}</div>
                <button onClick={() => { setShouldCrash(false); reset(); }} style={{ ...btnStyle('#ef4444'), marginTop: '8px' }}>
                  Reset Boundary
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
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <button
              id="btn-rage-click"
              onClick={() => console.log('Click registered (click rapidly for rage test)')}
              style={btnStyle('#d97706')}
            >
              Rage Click Me (Click 4+ times fast)
            </button>
            <div
              id="div-dead-click"
              style={{
                padding: '10px',
                background: '#334155',
                borderRadius: '6px',
                textAlign: 'center',
                cursor: 'pointer',
                fontSize: '0.875rem',
              }}
            >
              Dead Click Target (clickable style, no action)
            </div>
          </div>
        </Card>

        {/* Compiler Attribute Inspector */}
        <Card title="6. Stamped HTML Attributes" badge="Vite Plugin AST" badgeColor="#38bdf8">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ fontSize: '0.85rem', color: '#94a3b8' }}>
              Elements with <code>data-askdepth-src</code>:
            </span>
            <button onClick={inspectHtmlTree} style={btnStyle('#0284c7')}>
              Re-scan DOM
            </button>
          </div>
          <div style={{ maxHeight: '180px', overflowY: 'auto', background: '#0f172a', padding: '10px', borderRadius: '6px', fontSize: '0.75rem' }}>
            {stampedElements.length === 0 ? (
              <span style={{ color: '#64748b' }}>No stamped elements detected yet. Click Re-scan DOM.</span>
            ) : (
              stampedElements.map((item, idx) => (
                <div key={idx} style={{ marginBottom: '6px', borderBottom: '1px solid #1e293b', paddingBottom: '4px' }}>
                  <span style={{ color: '#38bdf8' }}>&lt;{item.tag}&gt;</span>{' '}
                  <span style={{ color: '#94a3b8' }}>{item.label}</span>
                  {item.src && <div style={{ color: '#4ade80' }}>src: {item.src}</div>}
                  {item.id && <div style={{ color: '#c084fc' }}>hash: {item.id}</div>}
                </div>
              ))
            )}
          </div>
        </Card>
      </div>

      {/* Live Event Stream Output */}
      <Card title="📡 Live Telemetry Event Stream" badge={`${logs.length} events`} badgeColor="#38bdf8">
        <div style={{ maxHeight: '250px', overflowY: 'auto', background: '#020617', padding: '12px', borderRadius: '8px', fontFamily: 'monospace', fontSize: '0.8rem' }}>
          {logs.length === 0 ? (
            <div style={{ color: '#64748b' }}>No outbound telemetry yet. Perform actions above to see live events.</div>
          ) : (
            logs.map((log) => (
              <div key={log.id} style={{ marginBottom: '8px', paddingBottom: '8px', borderBottom: '1px solid #1e293b' }}>
                <span style={{ color: '#64748b' }}>[{log.time}]</span>{' '}
                <span style={{ color: '#38bdf8', fontWeight: 600 }}>{log.type}</span>
                <pre style={{ color: '#cbd5e1', marginTop: '4px', overflowX: 'auto' }}>
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
  throw new Error('Simulated runtime exception inside React component!');
}

function btnStyle(bg: string, color = '#ffffff'): React.CSSProperties {
  return {
    background: bg,
    color,
    border: 'none',
    padding: '8px 14px',
    borderRadius: '6px',
    fontWeight: 500,
    cursor: 'pointer',
    fontSize: '0.85rem',
  };
}
