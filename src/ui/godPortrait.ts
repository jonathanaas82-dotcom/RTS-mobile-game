import { powerDef } from '../data';
import type { GodDef } from '../data/types';
import { createCanvas } from '../render/assets/procedural/draw';
import { drawGodBust } from '../render/assets/procedural/gods';
import { GLYPH } from './commandCard';

/** Medallion size in canvas pixels (drawn at 2× the largest display size, ~180 CSS px). */
const S = 360;
const cache = new Map<string, string>();

/**
 * God medallion (data URL, cached): a glowing disc in the colour of the god's power with rays,
 * the god's painted bust on it, a gold ring and a badge with the power glyph.
 */
export function godPortrait(g: GodDef): string {
  let url = cache.get(g.id);
  if (url) return url;
  const [cv, c] = createCanvas(S, S);
  const pw = powerDef(g.power);
  const R = S / 2 - 12;
  const bg = c.createRadialGradient(S / 2, S * 0.42, 12, S / 2, S / 2, S / 2);
  bg.addColorStop(0, '#fff6dc');
  bg.addColorStop(0.25, pw.color);
  bg.addColorStop(1, '#120e16');
  c.fillStyle = bg;
  c.beginPath();
  c.arc(S / 2, S / 2, R, 0, Math.PI * 2);
  c.fill();
  c.save();
  c.globalCompositeOperation = 'lighter';
  c.fillStyle = 'rgba(255,240,200,0.08)';
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    c.beginPath();
    c.moveTo(S / 2, S * 0.42);
    c.lineTo(S / 2 + Math.cos(a - 0.09) * S, S * 0.42 + Math.sin(a - 0.09) * S);
    c.lineTo(S / 2 + Math.cos(a + 0.09) * S, S * 0.42 + Math.sin(a + 0.09) * S);
    c.closePath();
    c.fill();
  }
  c.restore();
  c.save();
  c.beginPath();
  c.arc(S / 2, S / 2, R, 0, Math.PI * 2);
  c.clip();
  c.drawImage(drawGodBust(g.id, S), 0, 0);
  // Soft vignette so the bust sits inside the ring.
  const v = c.createRadialGradient(S / 2, S / 2, R * 0.7, S / 2, S / 2, R);
  v.addColorStop(0, 'rgba(18,14,22,0)');
  v.addColorStop(1, 'rgba(18,14,22,0.45)');
  c.fillStyle = v;
  c.fillRect(0, 0, S, S);
  c.restore();
  c.lineWidth = 12;
  const ring = c.createLinearGradient(0, 0, 0, S);
  ring.addColorStop(0, '#fff1b8');
  ring.addColorStop(0.5, '#c9a24a');
  ring.addColorStop(1, '#7a5418');
  c.strokeStyle = ring;
  c.beginPath();
  c.arc(S / 2, S / 2, S / 2 - 8, 0, Math.PI * 2);
  c.stroke();
  // Badge with the power glyph at the lower right.
  const bx = S * 0.83;
  const by = S * 0.83;
  c.fillStyle = pw.color;
  c.strokeStyle = '#2b2116';
  c.lineWidth = 6;
  c.beginPath();
  c.arc(bx, by, S * 0.12, 0, Math.PI * 2);
  c.fill();
  c.stroke();
  c.save();
  c.translate(bx - S * 0.08, by - S * 0.08);
  c.scale((S * 0.16) / 24, (S * 0.16) / 24);
  c.fillStyle = '#2b2116';
  c.strokeStyle = '#2b2116';
  c.lineWidth = 2.2;
  const glyph = new Path2D(GLYPH[pw.kind]);
  if (pw.kind === 'freeze' || pw.kind === 'slow') c.stroke(glyph);
  else c.fill(glyph);
  c.restore();
  url = cv.toDataURL();
  cache.set(g.id, url);
  return url;
}
