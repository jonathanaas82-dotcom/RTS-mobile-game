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
  box: svg(
    '<rect x="4" y="4" width="16" height="16" rx="2" fill="none" stroke="currentColor" stroke-width="2.2" stroke-dasharray="4 3"/><path d="M14 13l6 6-2.5.5L16 22l-1.5-1.5 1.8-1.9z" />',
  ),
  idle: svg(
    '<circle cx="10" cy="7" r="3.5"/><path d="M4 21c0-4.5 3-7 6-7s6 2.5 6 7z"/><path d="M17 4l3 1-1 3M18 10h3" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linecap="round"/><path d="M15 3l2.2 1.6M14 15l6-7" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  ),
  army: svg(
    '<path d="M5 19L17 4l2 1-11 15z"/><path d="M19 19L7 4 5 5l11 15z" opacity=".8"/><circle cx="12" cy="17" r="3.5" fill="none" stroke="currentColor" stroke-width="2"/>',
  ),
  alert: svg(
    '<path d="M12 3l10 18H2z" fill="#e5484d"/><path d="M12 9v6M12 17.5v1" stroke="#fff" stroke-width="2.4" stroke-linecap="round"/>',
  ),
  stop: svg('<rect x="6" y="6" width="12" height="12" rx="2"/>'),
  build: svg(
    '<path d="M3 21h18M5 21V11l7-6 7 6v10" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"/><rect x="10" y="14" width="4" height="7"/>',
  ),
  back: svg(
    '<path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>',
  ),
  age: svg(
    '<path d="M12 2l3 6 6 .8-4.5 4.3 1.1 6.4L12 16.6 6.4 19.5l1.1-6.4L3 8.8 9 8z" fill="#f0cf72" stroke="#8a6a1a" stroke-width="1"/><path d="M12 21v-4" stroke="currentColor" stroke-width="2"/>',
  ),
  rally: svg(
    '<path d="M6 21V3" stroke="currentColor" stroke-width="2.2"/><path d="M7 4h11l-3 4 3 4H7z"/>',
  ),
  ability: svg(
    '<path d="M13 2L4 14h7l-2 8 9-12h-7z" fill="#ffe58a" stroke="#8a6a1a" stroke-width="1"/>',
  ),
  attackMove: svg(
    '<path d="M4 20L16 8" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/><path d="M13 4h7v7z"/>',
  ),
  menu: svg(
    '<path d="M4 6h16M4 12h16M4 18h16" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>',
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
