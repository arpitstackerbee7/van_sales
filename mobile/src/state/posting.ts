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
 * Ask for location access. Call this at a calm moment -- opening the app --
 * never in the middle of posting a document.
 *
 * Warming a fix here is the point: it populates the OS cache so a later
 * post can read a position without asking for anything.
 */
export async function requestLocationAccess(): Promise<boolean> {
  try {
    const current = await Location.getForegroundPermissionsAsync();
    let granted = current.granted;

    if (!granted && current.canAskAgain) {
      granted = (await Location.requestForegroundPermissionsAsync()).granted;
    }
    if (!granted) return false;

    // Fire and forget. This is the call that can raise Google's "turn on
    // Location Accuracy" dialog, so it happens here, once, rather than on
    // top of a customer waiting to pay.
    Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }).catch(
      () => {},
    );
    return true;
  } catch {
    return false;
  }
}

/**
 * Where the device was, as far as the OS already knows.
 *
 * Uses only the last known position: it returns immediately, and crucially
 * it never raises a system dialog. Requesting a live fix during a post put
 * an Android permission prompt and then a Google "Location Accuracy"
 * dialog on top of a rep mid-sale, with the document unposted behind them.
 * A coordinate on the invoice is useful; it is not worth stalling the sale
 * for, so if no position is cached the document posts without one.
 */
export async function captureGeo(enabled: boolean): Promise<Geo | null> {
  if (!enabled) return null;

  try {
    const { granted } = await Location.getForegroundPermissionsAsync();
    if (!granted) return null;

    const position = await Location.getLastKnownPositionAsync({ maxAge: 15 * 60 * 1000 });
    if (!position) return null;

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
