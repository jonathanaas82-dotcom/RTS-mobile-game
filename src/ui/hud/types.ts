import type { ResourceKind } from '../../data/balance/economy';

/** Data the game feeds to the DOM HUD. The HUD renders these generically. */
export interface ButtonSpec {
  /** Stable key; also used for change detection. */
  id: string;
  /** Image URL (sprite portrait) or inline SVG markup. */
  icon?: string;
  svg?: string;
  label: string;
  /** Second line, e.g. a cooldown. */
  sub?: string;
  /** Price, rendered as coloured resource chips (replaces `sub`). */
  cost?: Partial<Record<ResourceKind, number>>;
  disabled?: boolean;
  active?: boolean;
  badge?: string;
  /** 0..1 progress bar (cooldowns, training). */
  progress?: number;
  /** Long description shown in the info line when pressed while disabled / long-pressed. */
  hint?: string;
  onPress: () => void;
  onLongPress?: () => void;
}

export interface SelectionView {
  title: string;
  subtitle?: string;
  icon?: string;
  hp?: [number, number];
  /** Extra line: stats, carry, queue… */
  detail?: string;
  /** Counter hints. */
  strong?: string;
  weak?: string;
  /** Special traits (badges; tapping one shows its description). */
  traits?: Array<{ name: string; desc: string; glyph: string }>;
  /** Multi-selection: icon + count per type. */
  groups?: Array<{ key: string; icon: string; count: number; onPress: () => void }>;
  onDeselect: () => void;
}

export interface ModalChoice {
  id: string;
  title: string;
  subtitle?: string;
  body: string;
  icon?: string;
  disabled?: boolean;
  onChoose: () => void;
}

export interface ModalSpec {
  title: string;
  body?: string;
  choices?: ModalChoice[];
  actions?: Array<{ label: string; primary?: boolean; onPress: () => void }>;
  /** Can be dismissed with the close button / backdrop. */
  dismissable?: boolean;
}

export interface BannerSpec {
  text: string;
  /** Confirm button (e.g. place building). */
  onConfirm?: () => void;
  confirmDisabled?: boolean;
  onCancel: () => void;
}
