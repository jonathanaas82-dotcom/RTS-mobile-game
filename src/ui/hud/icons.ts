/** Inline SVG icons (original, simple shapes) for the HUD. */
const svg = (body: string, vb = '0 0 24 24'): string =>
  `<svg viewBox="${vb}" aria-hidden="true" focusable="false">${body}</svg>`;

export const ICONS = {
  pause: svg(
    '<rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/>',
  ),
  play: svg('<path d="M7 5l12 7-12 7z"/>'),
  fullscreen: svg(
    '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>',
  ),
  debug: svg(
    '<circle cx="12" cy="13" r="5"/><path d="M12 8V5M7 10L4 8M17 10l3-2M7 15H3M17 15h4M8 18l-3 2M16 18l3 2" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  ),
  food: svg(
    '<circle cx="9" cy="14" r="5" fill="#c0303f"/><circle cx="15" cy="12" r="5" fill="#e04858"/><path d="M12 7c1-3 4-4 6-3" stroke="#3a8a3f" stroke-width="2" fill="none"/>',
  ),
  wood: svg(
    '<rect x="3" y="8" width="18" height="8" rx="4" fill="#8a5a33"/><ellipse cx="19" cy="12" rx="3" ry="4" fill="#d4a46a"/><circle cx="19" cy="12" r="1.4" fill="#8a5a33"/>',
  ),
  gold: svg(
    '<circle cx="12" cy="12" r="8" fill="#e8b830"/><circle cx="12" cy="12" r="5.5" fill="none" stroke="#9c7414" stroke-width="1.5"/><circle cx="10" cy="9.5" r="1.6" fill="#ffe58a"/>',
  ),
  favor: svg(
    '<path d="M12 2l2.6 6.4L21 9l-5 4.3L17.5 20 12 16.6 6.5 20 8 13.3 3 9l6.4-.6z" fill="#b48cf2" stroke="#6d4bb3" stroke-width="1"/>',
  ),
  pop: svg(
    '<circle cx="12" cy="7" r="4" fill="#e9dcc0"/><path d="M4 21c0-5 4-8 8-8s8 3 8 8z" fill="#e9dcc0"/>',
  ),
} as const;
