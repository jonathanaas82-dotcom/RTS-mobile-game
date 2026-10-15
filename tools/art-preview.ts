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
  cv.style.outline = '1px dashed rgba(0,0,0,0.25)';
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
} else if (sheet === 'buildings' || sheet === 'buildings-big') {
  // Time a full match's worth of generation (every building, two teams) a few times.
  const gen = (team: string): HTMLCanvasElement[] =>
    FACTIONS.flatMap((f) =>
      BUILDINGS.filter((b) => !b.factions || b.factions.includes(f.id)).map((b) => {
        const cv = drawBuilding(b, factionDef(f.id), team);
        // Read a pixel back so deferred (GPU) rasterisation is included in the timing.
        cv.getContext('2d')!.getImageData(0, 0, 1, 1);
        return cv;
      }),
    );
  const runs: number[] = [];
  gen(teams[0]!); // warm-up
  for (let i = 0; i < 5; i++) {
    const t0 = performance.now();
    gen(teams[0]!);
    gen(teams[1]!);
    runs.push(performance.now() - t0);
  }
  runs.sort((a, b) => a - b);
  const msg = `buildings: ${runs[2]!.toFixed(1)} ms median for all factions x 2 teams (runs ${runs.map((r) => r.toFixed(0)).join(', ')})`;
  console.log(msg);
  const p = document.createElement('div');
  p.id = 'timing';
  p.style.width = '100%';
  p.textContent = msg;
  out.append(p);
  const scale = sheet === 'buildings-big' ? 0.75 : 0.35;
  const only = new URLSearchParams(location.search).get('faction');
  for (const f of FACTIONS.filter((x) => !only || x.id === only))
    for (const b of BUILDINGS)
      if (!b.factions || b.factions.includes(f.id))
        add(
          drawBuilding(b, factionDef(f.id), teams[FACTIONS.indexOf(f) % 2]!),
          `${f.id}:${b.id}`,
          scale,
        );
}
(window as unknown as { ready: boolean }).ready = true;
