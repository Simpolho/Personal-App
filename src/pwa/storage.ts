/** True when the app was opened from its Home Screen icon rather than in a browser tab. */
export function isStandalone(): boolean {
  if (typeof window.matchMedia === 'function' && window.matchMedia('(display-mode: standalone)').matches) return true;
  return (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

/** Asks the browser to keep this app's data even when storage runs low. */
export async function requestPersistence(): Promise<boolean> {
  try {
    return (await navigator.storage?.persist?.()) ?? false;
  } catch {
    return false;
  }
}

export async function storageStatus(): Promise<{ persisted: boolean; usedMB: number | null }> {
  let persisted = false;
  let usedMB: number | null = null;
  try {
    persisted = (await navigator.storage?.persisted?.()) ?? false;
  } catch {
    // leave as "not saved permanently"
  }
  try {
    const usage = (await navigator.storage?.estimate?.())?.usage;
    if (typeof usage === 'number') usedMB = Math.round((usage / (1024 * 1024)) * 10) / 10;
  } catch {
    // usage unknown
  }
  return { persisted, usedMB };
}
