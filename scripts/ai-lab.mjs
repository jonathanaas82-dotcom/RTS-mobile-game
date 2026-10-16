#!/usr/bin/env node
/**
 * Parallel headless AI lab. Bundles tests/balance/lab.ts with esbuild and runs matches on all
 * CPU cores.
 *
 *   node scripts/ai-lab.mjs ladder [seeds]   difficulty ladder (hard/normal/easy pairings)
 *   node scripts/ai-lab.mjs factions [seeds] Normal vs Normal faction win rates
 *   node scripts/ai-lab.mjs health [seeds]   AI health check (all difficulties x factions)
 *   node scripts/ai-lab.mjs match a:fac b:fac seed   one match, JSON result
 *   node scripts/ai-lab.mjs pair a:fac[:god] b:fac[:god] [seeds] one pairing, seats alternate
 *
 * seeds: comma list or a range like 1-8. Set JOBS to limit worker threads.
 */
import { build } from 'esbuild';
import { mkdtempSync } from 'node:fs';
import { cpus, tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function parseSeeds(s, def) {
  const out = [];
  for (const part of (s ?? def).split(',')) {
    const [a, b] = part.split('-').map(Number);
    if (b === undefined) out.push(a);
    else for (let i = a; i <= b; i++) out.push(i);
  }
  return out;
}

async function bundle() {
  const dir = mkdtempSync(join(tmpdir(), 'ai-lab-'));
  const out = join(dir, 'lab.mjs');
  await build({
    entryPoints: [join(root, 'tests/balance/lab.ts')],
    bundle: true,
    platform: 'node',
    format: 'esm',
    outfile: out,
    logLevel: 'warning',
  });
  return pathToFileURL(out).href;
}

async function runAll(jobs) {
  const href = await bundle();
  const n = Math.min(Number(process.env.JOBS) || cpus().length, jobs.length);
  const results = new Array(jobs.length);
  let next = 0;
  let done = 0;
  await Promise.all(
    Array.from({ length: n }, () => {
      const wk = new Worker(fileURLToPath(import.meta.url), { workerData: { bundle: href } });
      return new Promise((resolve, reject) => {
        let cur = -1;
        const feed = () => {
          if (next >= jobs.length) {
            wk.postMessage(null);
            return;
          }
          cur = next++;
          wk.postMessage(jobs[cur]);
        };
        wk.on('message', (r) => {
          results[cur] = r;
          done++;
          if (done % 12 === 0) process.stderr.write(`  ${done}/${jobs.length}\n`);
          feed();
        });
        wk.on('error', reject);
        wk.on('exit', resolve);
        feed();
      });
    }),
  );
  return results;
}

const FACTIONS = ['hrimfolk', 'aurelian', 'sahrun'];
const pct = (a, b) => (b ? `${((100 * a) / b).toFixed(0)}%` : '-');

async function ladder(seeds) {
  const ups = [
    ['hard', 'normal'],
    ['normal', 'easy'],
    ['hard', 'easy'],
  ];
  const jobs = [];
  for (const [hi, lo] of ups)
    for (const seed of seeds)
      for (const fa of FACTIONS)
        for (const fb of FACTIONS) {
          // Higher difficulty alternates seats.
          const hiFirst = (seed + FACTIONS.indexOf(fa)) % 2 === 0;
          const seats = hiFirst
            ? [
                { faction: fa, ai: hi },
                { faction: fb, ai: lo },
              ]
            : [
                { faction: fb, ai: lo },
                { faction: fa, ai: hi },
              ];
          jobs.push({ seed, seats, maxMin: 45, tag: `${hi}>${lo}`, hiSeat: hiFirst ? 0 : 1 });
        }
  const res = await runAll(jobs);
  console.log('matchup        games  hiWin  loWin  draw  avgMin  hiWin by hi-faction');
  for (const [hi, lo] of ups) {
    const rs = res.map((r, i) => ({ r, j: jobs[i] })).filter((x) => x.j.tag === `${hi}>${lo}`);
    let hw = 0;
    let lw = 0;
    let dr = 0;
    let mins = 0;
    const byF = {};
    for (const { r, j } of rs) {
      mins += r.minutes;
      const hf = j.seats[j.hiSeat].faction;
      byF[hf] ??= [0, 0];
      byF[hf][1]++;
      if (r.winner === j.hiSeat) {
        hw++;
        byF[hf][0]++;
      } else if (r.winner >= 0) lw++;
      else dr++;
    }
    const f = Object.entries(byF)
      .map(([k, [a, b]]) => `${k} ${pct(a, b)}`)
      .join(' ');
    console.log(
      `${(hi + '>' + lo).padEnd(14)} ${String(rs.length).padStart(5)} ${pct(hw, rs.length).padStart(6)} ${pct(lw, rs.length).padStart(6)} ${String(dr).padStart(5)} ${(mins / rs.length).toFixed(1).padStart(7)}  ${f}`,
    );
  }
  const ups2 = res
    .map((r, i) => ({ r, j: jobs[i] }))
    .filter(({ r, j }) => r.winner !== j.hiSeat)
    .map(
      ({ r, j }) =>
        `${j.tag} s${r.seed} ${r.seats.map((x) => x.ai[0] + ':' + x.faction).join('-')} w${r.winner} ${r.minutes}m`,
    );
  if (process.env.UPSETS) console.log('upsets:\n  ' + ups2.join('\n  '));
  const errs = res.filter((r) => r.error);
  if (errs.length) console.log('ERRORS', errs.map((r) => r.error).join('\n'));
}

async function factions(seeds, ai = 'normal') {
  const jobs = [];
  for (const seed of seeds)
    for (const a of FACTIONS)
      for (const b of FACTIONS)
        if (a !== b)
          jobs.push({
            seed,
            seats: [
              { faction: a, ai },
              { faction: b, ai },
            ],
            maxMin: 45,
          });
  const res = await runAll(jobs);
  const wins = {};
  const games = {};
  let draws = 0;
  let mins = 0;
  const seat = [0, 0];
  for (const r of res) {
    mins += r.minutes;
    for (const s of r.seats) games[s.faction] = (games[s.faction] ?? 0) + 1;
    if (r.winner >= 0) {
      wins[r.seats[r.winner].faction] = (wins[r.seats[r.winner].faction] ?? 0) + 1;
      seat[r.winner]++;
    } else draws++;
  }
  console.log(
    `${ai} vs ${ai}: ${res.length} games, ${draws} draws, avg ${(mins / res.length).toFixed(1)} min, seat0 ${seat[0]} seat1 ${seat[1]}`,
  );
  for (const f of FACTIONS)
    console.log(`  ${f.padEnd(10)} ${pct(wins[f] ?? 0, games[f])} (${wins[f] ?? 0}/${games[f]})`);
  const dr = res
    .filter((r) => r.winner < 0)
    .map(
      (r) =>
        `s${r.seed} ${r.seats.map((x) => x.faction).join('-')} ages ${r.players.map((p) => p.age).join('/')}${r.disconnected ? ' (map disconnected)' : ''}`,
    );
  if (dr.length) console.log(`  draws: ${dr.join(', ')}`);
  profile(res);
}

/** Per faction/difficulty averages of timings and snapshots. */
function profile(res) {
  const groups = {};
  for (const r of res) for (const p of r.players) (groups[`${p.ai}/${p.faction}`] ??= []).push(p);
  const avgOf = (xs) => {
    const v = xs.filter((x) => x !== undefined && x >= 0);
    return v.length ? (v.reduce((a, b) => a + b, 0) / v.length).toFixed(1) : '-';
  };
  console.log('  group            age1  age2  age3  barr  temp  wk/army/gath @4  @8  @12');
  for (const [k, ps] of Object.entries(groups).sort()) {
    const snap = [0, 1, 2]
      .map((i) => [0, 1, 2].map((j) => avgOf(ps.map((p) => p.snap[i]?.[j]))).join('/'))
      .join('  ');
    console.log(
      `  ${k.padEnd(16)} ${avgOf(ps.map((p) => p.ageAt[1])).padStart(5)} ${avgOf(ps.map((p) => p.ageAt[2])).padStart(5)} ${avgOf(ps.map((p) => p.ageAt[3])).padStart(5)} ${avgOf(ps.map((p) => p.firstBuilt.barracks)).padStart(5)} ${avgOf(ps.map((p) => p.firstBuilt.temple)).padStart(5)}  ${snap}`,
    );
  }
}

async function pair(a, b, seeds) {
  const seat = (s) => {
    const [ai, faction, god] = s.split(':');
    return god ? { ai, faction, god } : { ai, faction };
  };
  const jobs = seeds.map((seed) => ({
    seed,
    seats: seed % 2 ? [seat(b), seat(a)] : [seat(a), seat(b)],
    aSeat: seed % 2 ? 1 : 0,
    maxMin: 45,
  }));
  const res = await runAll(jobs);
  let aw = 0;
  let bw = 0;
  let mins = 0;
  const seatWins = [0, 0];
  res.forEach((r, i) => {
    mins += r.minutes;
    if (r.winner >= 0) seatWins[r.winner]++;
    if (r.winner === jobs[i].aSeat) aw++;
    else if (r.winner >= 0) bw++;
  });
  console.log(
    `${a} vs ${b}: ${res.length} games, ${a} ${pct(aw, res.length)}, ${b} ${pct(bw, res.length)}, draws ${res.length - aw - bw}, avg ${(mins / res.length).toFixed(1)} min, seat0 ${seatWins[0]} seat1 ${seatWins[1]}`,
  );
  profile(res);
}

async function health(seeds) {
  const diffs = ['easy', 'normal', 'hard'];
  const jobs = [];
  for (const seed of seeds)
    for (const d of diffs)
      for (const fa of FACTIONS) {
        // Each difficulty vs a same-level mirror opponent of a rotating faction, plus a passive.
        const fb = FACTIONS[(FACTIONS.indexOf(fa) + seed) % 3];
        jobs.push({
          seed,
          seats: [
            { faction: fa, ai: d },
            { faction: fb, ai: d },
          ],
          maxMin: 45,
          health: true,
        });
      }
  for (const seed of seeds.slice(0, 3))
    jobs.push({
      seed,
      seats: [
        { faction: FACTIONS[seed % 3], ai: 'passive' },
        { faction: FACTIONS[(seed + 1) % 3], ai: 'easy' },
      ],
      maxMin: 30,
      health: true,
    });
  const res = await runAll(jobs);
  const kinds = {};
  for (const r of res)
    for (const is of r.issues) {
      const ai = is.player >= 0 ? r.seats[is.player].ai : r.seats[0].ai;
      const k = `${is.kind} [${ai}]`;
      kinds[k] ??= [];
      kinds[k].push(
        `s${r.seed} ${r.seats.map((s) => s.faction[0] + s.ai[0]).join('v')} p${is.player} @${is.at}m ${is.detail.split('\n')[0]}`,
      );
    }
  console.log(`health: ${res.length} games`);
  for (const [k, v] of Object.entries(kinds).sort())
    console.log(`  ${k}: ${v.length}\n    ${v.slice(0, 6).join('\n    ')}`);
  // Per-difficulty stats.
  for (const d of [...diffs, 'passive']) {
    const ps = res.flatMap((r) => r.players.filter((p) => p.ai === d));
    if (!ps.length) continue;
    const avg = (f) => (ps.reduce((a, p) => a + f(p), 0) / ps.length).toFixed(1);
    const a1 = ps.filter((p) => p.ageAt[1] >= 0);
    const fa = ps.filter((p) => p.firstAttackMin >= 0);
    console.log(
      `  ${d.padEnd(8)} n=${ps.length} age1 ${a1.length}/${ps.length} @${(a1.reduce((a, p) => a + p.ageAt[1], 0) / (a1.length || 1)).toFixed(1)}m  maxAge ${avg((p) => p.age)}  firstAttack ${fa.length}/${ps.length} @${(fa.reduce((a, p) => a + p.firstAttackMin, 0) / (fa.length || 1)).toFixed(1)}m (min ${fa.length ? Math.min(...fa.map((p) => p.firstAttackMin)) : '-'})  workers ${avg((p) => p.maxWorkers)}  peakArmy ${avg((p) => p.peakArmyPop)}  hallLost ${ps.reduce((a, p) => a + p.townHallLost, 0)} rebuilt ${ps.reduce((a, p) => a + p.townHallRebuilt, 0)}`,
    );
  }
  const g = {};
  for (const r of res) {
    const k = r.seats[0].ai;
    g[k] ??= [0, 0, 0];
    g[k][0]++;
    g[k][1] += r.minutes;
    if (r.winner < 0) g[k][2]++;
  }
  for (const [k, [n, m, dr]] of Object.entries(g))
    console.log(`  ${k} mirror: avg ${(m / n).toFixed(1)} min, draws ${dr}/${n}`);
}

async function main() {
  const [mode, ...args] = process.argv.slice(2);
  const t0 = Date.now();
  if (mode === 'ladder') await ladder(parseSeeds(args[0], '1-4'));
  else if (mode === 'factions') await factions(parseSeeds(args[0], '21-28'), args[1] ?? 'normal');
  else if (mode === 'health') await health(parseSeeds(args[0], '1-4'));
  else if (mode === 'pair') await pair(args[0], args[1], parseSeeds(args[2], '1-48'));
  else if (mode === 'match') {
    const seat = (s) => ({ ai: s.split(':')[0], faction: s.split(':')[1] });
    const [r] = await runAll([
      { seed: Number(args[2] ?? 1), seats: [seat(args[0]), seat(args[1])], health: true },
    ]);
    console.log(JSON.stringify(r, null, 1));
  } else {
    console.log('usage: node scripts/ai-lab.mjs ladder|factions|health|match ...');
    process.exit(1);
  }
  console.error(`done in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
}

if (!isMainThread) {
  const lab = await import(workerData.bundle);
  parentPort.on('message', (job) => {
    if (job === null) process.exit(0);
    parentPort.postMessage(lab.runMatch(job));
  });
} else {
  await main();
}
