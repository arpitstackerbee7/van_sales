/**
 * The two things every posted document carries: an idempotency key and,
 * where policy asks for it, where the device was standing.
 */

import * as Crypto from 'expo-crypto';
import * as Location from 'expo-location';

/**
 * Generated once per document, before it is queued -- never per attempt.
 * If a retry generated a fresh key the server would have no way to tell the
 * retry from a genuine second sale, which is the whole failure this guards.
 */
export function newClientUid(): string {
  return Crypto.randomUUID();
}

export interface Geo {
  latitude: number;
  longitude: number;
  accuracy: number | null;
}

/**
 * Best-effort position. Never blocks a sale: if permission is refused or the
 * fix times out, the document posts without coordinates rather than
 * stranding the rep at the door.
 */
export async function captureGeo(enabled: boolean): Promise<Geo | null> {
  if (!enabled) return null;

  try {
    const { status } = await Location.getForegroundPermissionsAsync();
    let granted = status === 'granted';

    if (!granted) {
      const request = await Location.requestForegroundPermissionsAsync();
      granted = request.status === 'granted';
    }
    if (!granted) return null;

    const position = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });

    return {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
      accuracy: position.coords.accuracy ?? null,
    };
  } catch {
    return null;
  }
}

/** ISO timestamp in the shape Frappe's Datetime field accepts. */
export function capturedAt(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
    `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  );
}
