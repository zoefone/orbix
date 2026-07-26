// Orbix design tokens — same as web (zinc monochrome + blue accent)
export interface Theme {
  dark: boolean;
  bg: string; card: string; card2: string;
  ink: string; ink2: string; ink3: string;
  line: string; line2: string;
  accent: string; accentSoft: string;
  ok: string; warn: string; err: string;
  bubble: string; codeBg: string;
}

export const lightTheme: Theme = {
  dark: false,
  bg: '#FAFAFA', card: '#FFFFFF', card2: '#F4F4F5',
  ink: '#18181B', ink2: '#71717A', ink3: '#A1A1AA',
  line: '#E4E4E7', line2: '#F0F0F1',
  accent: '#2F6FED', accentSoft: '#EBF1FE',
  ok: '#16A34A', warn: '#D97706', err: '#DC2626',
  bubble: '#F4F4F5', codeBg: '#F4F4F5',
};

export const darkTheme: Theme = {
  dark: true,
  bg: '#09090B', card: '#131316', card2: '#1C1C1F',
  ink: '#FAFAFA', ink2: '#A1A1AA', ink3: '#52525B',
  line: '#27272A', line2: '#1C1C1F',
  accent: '#5B8DEF', accentSoft: '#16233D',
  ok: '#4ADE80', warn: '#FBBF24', err: '#F87171',
  bubble: '#1C1C1F', codeBg: '#0E0E11',
};

export type ThemeMode = 'light' | 'dark' | 'system';
