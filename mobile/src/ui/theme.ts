/**
 * One place for colour, spacing and type.
 *
 * Two rules drive the numbers below. Touch targets are never smaller than
 * 48pt because the people using this are wearing gloves in a chiller. And
 * every figure that represents money is set in a monospace face, so digits
 * line up column-wise and a misread 1,240 vs 12,40 is much harder.
 */

export const colors = {
  // surfaces
  bg: '#F5F7FA',
  card: '#FFFFFF',
  border: '#E8EBF1',
  borderStrong: '#DCE1E9',
  subtle: '#EFF2F7',

  // ink
  text: '#101828',
  muted: '#667085',
  faint: '#8792A4',
  placeholder: '#98A2B3',

  // brand
  primary: '#1E5EFF',
  primaryDark: '#1741B8',
  primaryWash: '#EEF3FF',
  primaryBorder: '#C9D8FF',
  ink: '#111A2E',

  // state
  success: '#0E9F6E',
  successWash: '#E9F5EF',
  successBorder: '#BFE3D3',
  successInk: '#0B6B4A',

  warning: '#DC6803',
  warningWash: '#FDF3E7',
  warningBorder: '#F0D5AC',
  warningInk: '#8A5209',

  danger: '#D92D20',
  dangerWash: '#FDECEC',
  dangerBorder: '#F2C7C7',
  dangerInk: '#9B2C2C',

  white: '#FFFFFF',
} as const;

/** The dark card used for every "this is the money" panel. */
export const gradient = {
  from: '#152142',
  to: '#101828',
} as const;

export const space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 28,
} as const;

export const radius = {
  sm: 9,
  md: 12,
  lg: 14,
  xl: 18,
  pill: 999,
} as const;

/** Minimum comfortable target for a gloved hand. */
export const TOUCH = 48;

export const mono =
  process.env.EXPO_OS === 'ios' ? 'Menlo' : 'monospace';

export const shadow = {
  card: {
    shadowColor: '#101828',
    shadowOpacity: 0.05,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  raised: {
    shadowColor: '#101828',
    shadowOpacity: 0.16,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  button: {
    shadowColor: '#1E5EFF',
    shadowOpacity: 0.28,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
} as const;
