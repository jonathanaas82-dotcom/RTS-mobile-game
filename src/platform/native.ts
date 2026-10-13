import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle } from '@capacitor/haptics';

/** True when running inside the Capacitor Android/iOS shell (not a browser/PWA). */
export function isNative(): boolean {
  return Capacitor.isNativePlatform();
}

/**
 * Native haptic feedback (works on iOS, where navigator.vibrate doesn't exist).
 * Short patterns map to impact strengths; longer patterns to a vibration.
 */
export function nativeHaptic(pattern: number | number[]): void {
  const total = Array.isArray(pattern) ? pattern.reduce((a, b) => a + b, 0) : pattern;
  const style =
    total < 20 ? ImpactStyle.Light : total < 60 ? ImpactStyle.Medium : ImpactStyle.Heavy;
  void Haptics.impact({ style }).catch(() => undefined);
}
