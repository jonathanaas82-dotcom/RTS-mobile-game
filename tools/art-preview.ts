/** Dev-only contact sheet of all procedural art (open /tools/art-preview.html?sheet=units). */
import { BUILDINGS, FACTIONS, UNITS, factionDef } from '../src/data';
import { drawBuilding } from '../src/render/assets/procedural/buildings';
import {
  CARRY_ARTS,
  WORK_ACTS,
  drawUnit,
  poseName,
  type Pose,
} from '../src/render/assets/procedural/units';

const out = document.getElementById('out')!;
const sheet = new URLSearchParams(location.search).get('sheet') ?? 'units';
const add = (cv: HTMLCanvasElement, label: string, scale = 0.5): void => {
  const f = document.createElement('figure');
  cv.style.width = `${cv.width * scale}px`;
  cv.style.height = `${cv.height * scale}px`;
  f.append(cv);
  const cap = document.createElement('figcaption');
  cap.textContent = label;
  f.append(cap);
  out.append(f);
};
const teams = ['#3b82f6', '#e5484d'];
if (sheet === 'units') {
  for (const u of UNITS) add(drawUnit(u, teams[UNITS.indexOf(u) % 2]!), u.id, 0.75);
} else if (sheet === 'humans') {
  for (const u of UNITS.filter((d) => d.art.shape === 'humanoid' || d.art.shape === 'rider'))
    add(drawUnit(u, teams[0]!), u.id, 1.25);
} else if (sheet === 'poses') {
  for (const u of UNITS.filter((d) => d.cls === 'worker')) {
    const poses: Pose[] = [{}, { stride: true }];
    for (const act of WORK_ACTS) poses.push({ act, frame: 0 }, { act, frame: 1 });
    for (const carry of CARRY_ARTS) poses.push({ carry }, { carry, stride: true });
    for (const p of poses) add(drawUnit(u, teams[0]!, p), `${u.id}:${poseName(p) || 'idle'}`, 1);
  }
} else if (sheet === 'buildings') {
  for (const f of FACTIONS)
    for (const b of BUILDINGS)
      if (!b.factions || b.factions.includes(f.id))
        add(drawBuilding(b, factionDef(f.id), teams[0]!), `${f.id}:${b.id}`, 0.35);
}
(window as unknown as { ready: boolean }).ready = true;
