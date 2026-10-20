/**
 * Whether the page is running inside the iPhone app (B11). The native
 * shell injects `window.Capacitor`; in a browser or the home-screen web
 * app it is absent. Client-only; false on the server.
 */
export function isNativeApp(): boolean {
  if (typeof window === "undefined") return false;
  const cap = (window as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
  try {
    return cap?.isNativePlatform?.() === true;
  } catch {
    return false;
  }
}
