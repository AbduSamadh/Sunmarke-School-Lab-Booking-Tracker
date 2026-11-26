/** The code is the last part of the lab door QR link (…/checkin/<code>), or the code typed by hand. */
export function codeFromScan(data: string): string | null {
  const m = data.trim().match(/(?:^|\/)([A-Za-z0-9_-]{4,40})\/?$/);
  return m ? m[1] : null;
}
