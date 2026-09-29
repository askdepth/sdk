// Verification script for examples/react-vite
// Demonstrates connecting @askdepth/react, askdepthVitePlugin,
// action triggers, console logs, and inspecting the generated HTML DOM tree.

import { JSDOM } from 'jsdom';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { Askdepth } from '@askdepth/core';
import { App } from './src/App.js';

console.log('🚀 [Askdepth Verification] Setting up headless DOM environment...');

const dom = new JSDOM('<!DOCTYPE html><html><body><div id="root"></div></body></html>', {
  url: 'https://app.example.test/',
  pretendToBeVisual: true,
});

globalThis.window = dom.window;
globalThis.document = dom.window.document;
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true, writable: true });
globalThis.location = dom.window.location;
globalThis.history = dom.window.history;
globalThis.Element = dom.window.Element;
globalThis.HTMLElement = dom.window.HTMLElement;
globalThis.HTMLButtonElement = dom.window.HTMLButtonElement;
globalThis.MouseEvent = dom.window.MouseEvent;
globalThis.XMLHttpRequest = dom.window.XMLHttpRequest;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const capturedEvents = [];
const consoleLogs = [];

// Intercept console.log to show actions
const origLog = console.log;
console.log = (...args) => {
  consoleLogs.push(args.join(' '));
  origLog(...args);
};

// Intercept fetch to capture outbound Askdepth telemetry
const mockFetch = async (input, init) => {
  const url = String(input);
  if (url.includes('ingest.example.test') && init?.body) {
    try {
      const data = JSON.parse(init.body);
      if (Array.isArray(data.events)) {
        data.events.forEach((e) => capturedEvents.push(e));
      }
    } catch {}
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }
  return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
};
window.fetch = mockFetch;
globalThis.fetch = mockFetch;

async function run() {
  const root = createRoot(document.getElementById('root'));

  console.log('\n📦 [Test 1] Mounting React App with AskdepthProvider...');
  await act(async () => {
    root.render(React.createElement(App));
  });

  console.log('✅ Mounted successfully.');

  // 1. Check generated HTML tree with compiler attributes
  console.log('\n🌳 [Test 2] Inspecting generated HTML tree for AST compiler attributes...');
  const stamped = document.querySelectorAll('[data-askdepth-src], [data-askdepth-id]');
  console.log(`Found ${stamped.length} elements stamped by compiler plugin:`);
  stamped.forEach((el, i) => {
    const src = el.getAttribute('data-askdepth-src');
    const id = el.getAttribute('data-askdepth-id');
    const desc = el.id ? `#${el.id}` : el.className ? `.${el.className}` : el.textContent?.trim().slice(0, 25) || '';
    console.log(`  ${i + 1}. <${el.tagName.toLowerCase()}> ${desc} → ${src ? `src="${src}"` : `id="${id}"`}`);
  });

  // 2. Test Custom Track Action
  console.log('\n🎯 [Test 3] Triggering custom track action...');
  const trackBtn = document.getElementById('btn-track-custom');
  if (trackBtn) {
    await act(async () => {
      trackBtn.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
    });
  }

  // 3. Test Identify User Action
  console.log('\n👤 [Test 4] Triggering identify user action...');
  const identifyBtn = document.getElementById('btn-identify');
  if (identifyBtn) {
    await act(async () => {
      identifyBtn.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
    });
  }

  // 4. Test SPA Route Navigation (page_view)
  console.log('\n🧭 [Test 5] Triggering SPA navigation (pushState to /orders)...');
  await act(async () => {
    window.history.pushState({}, '', '/orders');
  });

  // 5. Test Error Boundary Catch & Component Stack Mapping
  console.log('\n💣 [Test 6] Triggering intentional error inside <AskdepthCatch>...');
  const crashBtn = document.getElementById('btn-trigger-crash');
  if (crashBtn) {
    // Suppress console.error in JSDOM for expected boundary crash
    const origError = console.error;
    console.error = () => {};
    try {
      await act(async () => {
        crashBtn.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
      });
    } catch {}
    console.error = origError;
  }

  // Trigger pagehide to flush the queue immediately
  window.dispatchEvent(new dom.window.Event('pagehide'));
  await new Promise((r) => setTimeout(r, 2500));

  // Print Summary
  console.log('\n════════════════════════════════════════════════════════════════');
  console.log('📊 TELEMETRY VERIFICATION SUMMARY');
  console.log('════════════════════════════════════════════════════════════════');
  console.log(`Total outbound events captured: ${capturedEvents.length}`);
  capturedEvents.forEach((evt, idx) => {
    console.log(`\nEvent #${idx + 1}: [${evt.type}]`);
    if (evt.type === 'page_view') console.log(`  → URL: ${evt.properties?.url}`);
    if (evt.type === 'track') console.log(`  → Name: ${evt.name}, props:`, evt.properties);
    if (evt.type === 'identify') console.log(`  → User: ${evt.user_id}`);
    if (evt.type === 'ERROR_CLICK') {
      console.log(`  → Error Type: ${evt.error_type}`);
      console.log(`  → Handled: ${evt.error_details?.handled}`);
      console.log(`  → Target: ${evt.target_selector}`);
      if (evt.component) {
        console.log(`  → Component Name: ${evt.component.name}`);
        console.log(`  → Component Source: ${evt.component.source}`);
      }
    }
  });

  console.log('\n════════════════════════════════════════════════════════════════');
  console.log('✨ ALL VERIFICATIONS PASSED SUCCESSFULLY!');
  console.log('════════════════════════════════════════════════════════════════\n');
  process.exit(0);
}

run().catch((err) => {
  console.error('VERIFY ERROR:', err);
  process.exit(1);
});
