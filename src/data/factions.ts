import type { Cost, FactionDef, LocText } from './types';

export const FACTIONS: FactionDef[] = [
  {
    id: 'hrimfolk',
    // Viking Age Scandinavia (c. 793–1066) and the gods of the Poetic and Prose Edda.
    name: { en: 'The Norsemen', nb: 'De norrøne' },
    desc: {
      en: 'Viking Age Scandinavians. Cheap, tough infantry; every free farmer bears arms. Favor flows from battle.',
      nb: 'Skandinaver fra vikingtiden. Billig, seigt infanteri; hver fri bonde bærer våpen. Gunst kommer fra kamp.',
    },
    favorMode: 'combat',
    favorDesc: {
      en: 'Earn Favor by fighting: the gods honour the brave.',
      nb: 'Tjen gunst ved å kjempe: gudene ærer de modige.',
    },
    worker: 'hearthkin',
    bonuses: [
      { stat: 'cost', mul: 0.9, classes: ['infantry'] },
      { stat: 'hp', mul: 1.15, classes: ['infantry'] },
      { stat: 'speed', mul: 1.05, classes: ['infantry', 'worker'] },
    ],
    majorGods: ['thunrak', 'veyla'],
    minorGods: { 1: ['hrodna', 'skarn'], 2: ['brakka', 'eldra'], 3: ['gorm', 'sigrun'] },
    style: { wall: '#8a6a4a', roof: '#4e5a66', trim: '#d6d9e0' },
  },
  {
    id: 'aurelian',
    name: { en: 'The Aurelian League', nb: 'Det aureliske forbund' },
    desc: {
      en: 'Sea-faring city states. Balanced army and the strongest heroes. Favor flows from shrines.',
      nb: 'Sjøfarende bystater. Balansert hær og de sterkeste heltene. Gunst kommer fra helligdommer.',
    },
    favorMode: 'shrines',
    favorDesc: {
      en: 'Build Shrines; heroes add Favor.',
      nb: 'Bygg helligdommer; helter gir gunst.',
    },
    worker: 'citizen',
    bonuses: [
      { stat: 'damage', mul: 1.05, classes: ['hero'] },
      { stat: 'trainTime', mul: 0.85, classes: ['hero'] },
    ],
    majorGods: ['aetheon', 'thalassine'],
    minorGods: { 1: ['kalyra', 'dromos'], 2: ['lyssia', 'orros'], 3: ['phaedra', 'ourion'] },
    style: { wall: '#ece4d2', roof: '#b0473a', trim: '#c9a24a' },
  },
  {
    id: 'sahrun',
    name: { en: 'The Sahrun Dominion', nb: 'Sahrun-dominiet' },
    desc: {
      en: 'Desert kingdom. Strong economy and sturdy buildings, slower military. Favor flows from monuments.',
      nb: 'Ørkenrike. Sterk økonomi og solide bygninger, tregere militære. Gunst kommer fra monumenter.',
    },
    favorMode: 'monuments',
    favorDesc: { en: 'Build Monuments for steady Favor.', nb: 'Bygg monumenter for jevn gunst.' },
    worker: 'toiler',
    bonuses: [
      { stat: 'hp', mul: 1.15, classes: ['building'] },
      { stat: 'gather', mul: 1.05 },
      { stat: 'trainTime', mul: 1.05, classes: ['infantry', 'ranged', 'cavalry'] },
    ],
    majorGods: ['solenkh', 'merit_asha'],
    minorGods: { 1: ['hetepra', 'seshkar'], 2: ['nefrisa', 'ankharu'], 3: ['kheprion', 'nemur'] },
    style: { wall: '#d9b97a', roof: '#a0703c', trim: '#2f5fa0' },
  },
];

export interface AgeDef {
  name: LocText;
  /** Cost and time to advance INTO this age (index 0 is free/starting). */
  cost: Cost;
  time: number;
}

export const AGES: AgeDef[] = [
  { name: { en: 'Archaic Age', nb: 'Arkaisk tid' }, cost: {}, time: 0 },
  { name: { en: 'Classical Age', nb: 'Klassisk tid' }, cost: { food: 400, gold: 50 }, time: 40 },
  { name: { en: 'Heroic Age', nb: 'Heltetid' }, cost: { food: 650, gold: 400 }, time: 50 },
  {
    name: { en: 'Mythic Age', nb: 'Mytisk tid' },
    cost: { food: 900, gold: 750, favor: 25 },
    time: 70,
  },
];

/** Max heroes alive per age (Aurelian League gets +1). */
export const HERO_LIMIT_BY_AGE = [0, 1, 2, 3];
