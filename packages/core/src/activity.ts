let network = 0;
let navigation = 0;

export function markNetwork(): void {
  network += 1;
}

export function markNavigation(): void {
  navigation += 1;
}

export function networkToken(): number {
  return network;
}

export function navigationToken(): number {
  return navigation;
}

export function resetActivity(): void {
  network = 0;
  navigation = 0;
}
