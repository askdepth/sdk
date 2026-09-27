export interface AnomalySignal {
  anomaly_id: string;
  type: 'RAGE_CLICK' | 'DEAD_CLICK' | 'ERROR_CLICK';
  timestamp: number;
}

type Listener = (signal: AnomalySignal) => void;

const listeners = new Set<Listener>();

export function onAnomaly(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function publishAnomaly(signal: AnomalySignal): void {
  for (const listener of listeners) listener(signal);
}

export function resetAnomalyBus(): void {
  listeners.clear();
}
