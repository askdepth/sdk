import { Askdepth, SDK_VERSION } from '@askdepth/core';

const out = document.getElementById('out')!;

Askdepth.init({
  writeKey: '550e8400-e29b-41d4-a716-446655440000',
  projectId: '550e8400-e29b-41d4-a716-446655440000',
  endpoint: 'https://ingest.example.test/v1',
  consent: 'denied',
  sampleRate: 1,
  environment: 'development',
});

out.textContent = `SDK ${SDK_VERSION} ready (consent=denied)\n`;

document.getElementById('grant')!.onclick = () => {
  Askdepth.setConsent('granted');
  out.textContent += 'consent=granted\n';
};

document.getElementById('track')!.onclick = () => {
  Askdepth.track('vite_demo');
  out.textContent += `track → traceparent=${Askdepth.getTraceparent() ?? 'null'}\n`;
};
