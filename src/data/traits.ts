import type { LocText, TraitId, UnitClass } from './types';

/** Numbers behind each trait (balance lives here, the simulation reads it). */
export const TRAIT = {
  /** Braced spears: extra damage dealt to cavalry and less taken from it. */
  braceDamage: 1.5,
  braceTaken: 0.75,
  /** Shield wall: damage taken from projectiles. */
  shieldwallTaken: 0.6,
  /** Frenzy: up to this much extra damage at (near) zero health. */
  frenzyMax: 0.6,
  /** Charge: first blow after this many seconds without attacking deals ×chargeDamage. */
  chargeIdle: 4,
  chargeDamage: 2,
  /** Cleave: share of the damage dealt to enemies near the target, and its radius. */
  cleaveShare: 0.35,
  cleaveRadius: 0.9,
  /** Phalanx: armour per nearby friendly infantry, capped. */
  phalanxArmor: 0.05,
  phalanxMax: 0.2,
  phalanxRadius: 1.6,
  /** Piercing: fraction of the target's armour ignored. */
  piercing: 0.5,
  /** Demolisher: damage multiplier against buildings. */
  demolisher: 1.6,
  /** Regenerate: hit points per second once out of combat. */
  regenerate: 2,
  /** Inspire: damage bonus for allies within the radius of an inspiring unit. */
  inspireDamage: 1.12,
  inspireRadius: 3.5,
  /** Harrier: damage multiplier against these classes. */
  harrier: 1.4,
  harrierVs: ['ranged', 'siege'] as UnitClass[],
} as const;

export interface TraitInfo {
  name: LocText;
  desc: LocText;
  /** 24×24 SVG path for the trait badge. */
  glyph: string;
}

export const TRAITS: Record<TraitId, TraitInfo> = {
  brace: {
    name: { en: 'Braced Spears', nb: 'Spydvegg' },
    desc: {
      en: '+50% damage to cavalry and takes 25% less from it.',
      nb: '+50 % skade mot kavaleri og tar 25 % mindre fra det.',
    },
    glyph: 'M4 21L14 4M10 21L20 4M12 3l3-1-1 3M18 3l3-1-1 3',
  },
  shieldwall: {
    name: { en: 'Shield Wall', nb: 'Skjoldborg' },
    desc: {
      en: 'Takes 40% less damage from arrows and missiles.',
      nb: 'Tar 40 % mindre skade fra piler og prosjektiler.',
    },
    glyph: 'M12 3l8 3v6c0 5-4 8-8 9-4-1-8-4-8-9V6z',
  },
  frenzy: {
    name: { en: 'Frenzy', nb: 'Raseri' },
    desc: {
      en: 'Deals more damage the more wounded it is (up to +60%).',
      nb: 'Gjør mer skade jo mer såret den er (opptil +60 %).',
    },
    glyph: 'M12 2c2 4 6 6 6 11a6 6 0 1 1-12 0c0-3 2-4 2-7 2 1 3 3 3 5 1-3 1-6 1-9z',
  },
  charge: {
    name: { en: 'Charge', nb: 'Stormangrep' },
    desc: {
      en: 'The first blow after 4 s out of combat deals double damage.',
      nb: 'Første slag etter 4 s uten kamp gjør dobbel skade.',
    },
    glyph: 'M3 12h12M11 6l6 6-6 6M17 6l4 6-4 6',
  },
  cleave: {
    name: { en: 'Cleave', nb: 'Kløyving' },
    desc: {
      en: 'Each blow also strikes enemies next to the target for 35%.',
      nb: 'Hvert slag treffer også fiender ved siden av målet for 35 %.',
    },
    glyph: 'M4 20C8 10 14 6 20 4c-2 6-6 12-16 16zM9 15l-4-4',
  },
  phalanx: {
    name: { en: 'Phalanx', nb: 'Falanks' },
    desc: {
      en: '+5% armour for each friendly infantry close by (max +20%).',
      nb: '+5 % rustning per vennlig infanterist i nærheten (maks +20 %).',
    },
    glyph: 'M3 8h5v10H3zM9.5 8h5v10h-5zM16 8h5v10h-5zM5 4v4M12 3v5M18 4v4',
  },
  piercing: {
    name: { en: 'Piercing', nb: 'Gjennomtrengende' },
    desc: {
      en: "Ignores half of the target's armour.",
      nb: 'Ignorerer halve rustningen til målet.',
    },
    glyph: 'M3 21L19 5M15 4h5v5M8 12l4 4',
  },
  demolisher: {
    name: { en: 'Demolisher', nb: 'Nedriver' },
    desc: { en: '+60% damage to buildings.', nb: '+60 % skade mot bygninger.' },
    glyph: 'M4 20h16M6 20v-8l6-5 6 5v8M14 4l3 3-6 6-3-3z',
  },
  regenerate: {
    name: { en: 'Regeneration', nb: 'Regenerering' },
    desc: {
      en: 'Slowly heals when not in combat.',
      nb: 'Helbreder seg sakte når den ikke er i kamp.',
    },
    glyph: 'M12 21s-8-5-8-11a4.5 4.5 0 0 1 8-3 4.5 4.5 0 0 1 8 3c0 6-8 11-8 11zM12 9v6M9 12h6',
  },
  inspire: {
    name: { en: 'Inspire', nb: 'Inspirere' },
    desc: {
      en: 'Allies within 3.5 tiles deal 12% more damage.',
      nb: 'Allierte innen 3,5 felt gjør 12 % mer skade.',
    },
    glyph: 'M6 21V3M7 4h11l-3 4 3 4H7z',
  },
  harrier: {
    name: { en: 'Harrier', nb: 'Plageånd' },
    desc: {
      en: '+40% damage to ranged units and siege engines.',
      nb: '+40 % skade mot bueskyttere og beleiringsvåpen.',
    },
    glyph: 'M4 20l8-8M10 6l8 8M14 4l6 6-2 2-6-6zM3 14l3 3',
  },
  scout: {
    name: { en: 'Scout', nb: 'Speider' },
    desc: {
      en: 'Very fast with long sight; good for finding the enemy.',
      nb: 'Svært rask med lang sikt; god til å finne fienden.',
    },
    glyph: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zm10-3a3 3 0 1 0 0 6 3 3 0 0 0 0-6z',
  },
};
