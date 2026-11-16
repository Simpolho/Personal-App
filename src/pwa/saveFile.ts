type Outcome = 'shared' | 'downloaded' | 'cancelled' | 'blocked';

/** True when the phone can hand files to its share sheet (Save to Files, AirDrop…). */
export function canShareFile(file: File): boolean {
  const nav = navigator as Navigator & { canShare?: (data: ShareData) => boolean };
  return typeof nav.share === 'function' && Boolean(nav.canShare?.({ files: [file] }));
}

/**
 * Opens the share sheet for a file. 'cancelled': the person dismissed it. 'blocked': the phone
 * refused to open it (Safari only allows it right after a tap), so ask for another tap.
 */
export async function shareFile(file: File): Promise<Exclude<Outcome, 'downloaded'>> {
  try {
    await navigator.share({ files: [file] });
    return 'shared';
  } catch (error) {
    return (error as { name?: string } | null)?.name === 'AbortError' ? 'cancelled' : 'blocked';
  }
}

export function downloadFile(file: File): void {
  const url = URL.createObjectURL(file);
  const link = document.createElement('a');
  link.href = url;
  link.download = file.name;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL?.(url), 30_000);
}

export function readText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error('Could not read the file'));
    reader.readAsText(file);
  });
}
