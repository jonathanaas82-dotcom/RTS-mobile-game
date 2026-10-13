/** Tiny DOM helpers for the HUD. */
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  cls = '',
  parent?: HTMLElement,
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  parent?.append(e);
  return e;
}

/**
 * Attach tap + long-press handling to an element. Long press fires after `ms` without the
 * pointer leaving; a normal tap fires on release otherwise.
 */
export function onPress(
  target: HTMLElement,
  tap: () => void,
  longPress?: () => void,
  ms = 450,
): void {
  let timer = 0;
  let fired = false;
  let down = false;
  target.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
    down = true;
    fired = false;
    if (longPress) {
      timer = window.setTimeout(() => {
        fired = true;
        longPress();
      }, ms);
    }
  });
  const cancel = (): void => {
    down = false;
    window.clearTimeout(timer);
  };
  target.addEventListener('pointerup', (e) => {
    e.stopPropagation();
    window.clearTimeout(timer);
    if (down && !fired) tap();
    down = false;
  });
  target.addEventListener('pointerleave', cancel);
  target.addEventListener('pointercancel', cancel);
}
