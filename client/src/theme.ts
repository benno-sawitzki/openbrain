/**
 * Open Brain Design System
 *
 * Single source of truth for all colors used in inline styles.
 * Tailwind classes use CSS variables from index.css — this file
 * covers the JS side (inline style={{}}, dynamic values, etc.).
 *
 * To change the accent color, update `accent` and its variants below.
 * Everything else derives from the zinc scale.
 */

// ─── Core Palette ──────────────────────────────────────────
export const palette = {
  black:    '#09090B',   // zinc-950
  dark:     '#18181B',   // zinc-900
  mid:      '#3F3F46',   // zinc-700
  muted:    '#71717A',   // zinc-500
  subtle:   '#A1A1AA',   // zinc-400
  light:    '#D4D4D8',   // zinc-300
  white:    '#FAFAFA',   // zinc-50
  accent:   '#DC2626',   // red-600
  accentDim:'#B91C1C',   // red-700
} as const;

// ─── Semantic Tokens ───────────────────────────────────────
export const colors = {
  // Surfaces
  bg:               palette.black,
  bgElevated:       palette.dark,
  bgCard:           `rgba(24, 24, 27, 0.8)`,
  bgCardHover:      `rgba(24, 24, 27, 0.9)`,
  bgDialog:         palette.dark,

  // Text
  text:             palette.white,
  textSecondary:    palette.subtle,
  textMuted:        palette.muted,
  textAccent:       palette.accent,

  // Borders
  border:           `rgba(63, 63, 70, 0.4)`,
  borderSubtle:     `rgba(63, 63, 70, 0.2)`,

  // Primary accent
  accent:           palette.accent,
  accentDim:        palette.accentDim,
  accentMuted:      `rgba(220, 38, 38, 0.12)`,
  accentSubtle:     `rgba(220, 38, 38, 0.06)`,
  accentGlow:       `rgba(220, 38, 38, 0.15)`,

  // Buttons
  btnPrimary:       palette.accent,
  btnPrimaryText:   palette.white,
  btnSecondary:     `rgba(63, 63, 70, 0.3)`,
  btnSecondaryText: palette.white,
} as const;

// ─── Status Colors (semantic — intentionally NOT the accent) ─
export const status = {
  success:  { color: '#22C55E', bg: 'rgba(34, 197, 94, 0.08)',  border: 'rgba(34, 197, 94, 0.2)' },
  warning:  { color: '#EAB308', bg: 'rgba(234, 179, 8, 0.08)',  border: 'rgba(234, 179, 8, 0.2)' },
  error:    { color: '#EF4444', bg: 'rgba(239, 68, 68, 0.08)',  border: 'rgba(239, 68, 68, 0.2)' },
  info:     { color: '#A1A1AA', bg: 'rgba(161, 161, 170, 0.08)',border: 'rgba(161, 161, 170, 0.2)' },
  idle:     { color: '#71717A', bg: 'rgba(113, 113, 122, 0.06)',border: 'rgba(113, 113, 122, 0.15)' },
  active:   { color: '#DC2626', bg: 'rgba(220, 38, 38, 0.08)',  border: 'rgba(220, 38, 38, 0.2)' },
} as const;

// ─── Section Accent Dots ───────────────────────────────────
// Used for section headers — all use accent or neutral shades
// to avoid the "candy shop" multi-color problem.
export const section = {
  primary:   palette.accent,   // main sections
  secondary: palette.muted,    // secondary sections
  tertiary:  palette.subtle,   // tertiary sections
} as const;

// ─── RGBA Helpers ──────────────────────────────────────────
export function accentAlpha(opacity: number): string {
  return `rgba(220, 38, 38, ${opacity})`;
}

export function zincAlpha(opacity: number): string {
  return `rgba(63, 63, 70, ${opacity})`;
}

export function mutedAlpha(opacity: number): string {
  return `rgba(113, 113, 122, ${opacity})`;
}

export function subtleAlpha(opacity: number): string {
  return `rgba(161, 161, 170, ${opacity})`;
}

export function blackAlpha(opacity: number): string {
  return `rgba(9, 9, 11, ${opacity})`;
}

export function whiteAlpha(opacity: number): string {
  return `rgba(250, 250, 250, ${opacity})`;
}

export function errorAlpha(opacity: number): string {
  return `rgba(239, 68, 68, ${opacity})`;
}
