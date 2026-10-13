import { isNative, nativeHaptic } from './native';

/** Browser/PWA integration: service worker, fullscreen, orientation and gesture suppression. */

export function registerServiceWorker(): void {
  // Native builds serve files from the app bundle: no service worker needed.
  if (!import.meta.env.PROD || !('serviceWorker' in navigator) || isNative()) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch((err: unknown) => {
      console.warn('Service worker registration failed', err);
    });
  });
}

export function isFullscreen(): boolean {
  return document.fullscreenElement != null;
}

interface LockableOrientation extends ScreenOrientation {
  lock?: (o: 'landscape') => Promise<void>;
}

/** Toggle fullscreen and (where supported, i.e. Android/Chrome) lock to landscape. */
export async function toggleFullscreen(): Promise<void> {
  try {
    if (isFullscreen()) {
      await document.exitFullscreen();
      return;
    }
    await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
    await (screen.orientation as LockableOrientation).lock?.('landscape');
  } catch {
    // iOS Safari has no Fullscreen API for documents; "Add to Home Screen" gives fullscreen.
  }
}

export function fullscreenSupported(): boolean {
  // Native apps are always fullscreen (configured in the native projects).
  return !isNative() && typeof document.documentElement.requestFullscreen === 'function';
}

/**
 * Stop the browser from hijacking game gestures: pinch-zoom of the page (iOS gesture events),
 * double-tap zoom, pull-to-refresh, long-press callouts and context menus. CSS `touch-action:
 * none` + `overscroll-behavior: none` in styles.css does most of the work; this covers the rest.
 */
export function suppressBrowserGestures(): void {
  const prevent = (e: Event): void => e.preventDefault();
  for (const ev of ['gesturestart', 'gesturechange', 'gestureend', 'dblclick', 'contextmenu']) {
    document.addEventListener(ev, prevent, { passive: false });
  }
  document.addEventListener(
    'touchmove',
    (e) => {
      // Allow scrolling only inside elements explicitly marked as scrollable (e.g. menus).
      const target = e.target as HTMLElement | null;
      if (!target?.closest('[data-scroll]')) e.preventDefault();
    },
    { passive: false },
  );
}

/** Short vibration for important events (no-op where unsupported, e.g. iOS Safari). */
export function haptic(pattern: number | number[] = 15): void {
  if (isNative()) {
    nativeHaptic(pattern);
    return;
  }
  try {
    navigator.vibrate?.(pattern);
  } catch {
    /* ignore */
  }
}
