export type OrbixThemePreference = 'system' | 'light' | 'dark';
export type OrbixThemeName = 'light' | 'dark';

const palettes = {
  light: {
    name: 'light' as const,
    colors: {
      bg: '#F7F7F5',
      bgElevated: '#FFFFFF',
      bgSoft: '#F0F0EE',
      bgInset: '#ECECEA',
      border: '#DEDEDB',
      borderStrong: '#C9C9C5',
      text: '#101010',
      textSoft: '#4F4F4F',
      textMuted: '#858585',
      primary: '#111111',
      primaryText: '#FFFFFF',
      modeBlue: '#2F7DA8',
      modeBlueBg: '#E8F4FB',
      diffAdd: '#16803A',
      diffAddBg: '#EEF8F1',
      diffDel: '#C43845',
      diffDelBg: '#FBEFEF',
      danger: '#C43845',
      warning: '#9D6B16'
    },
    radius: { card: 26, panel: 20, control: 16, pill: 999 }
  },
  dark: {
    name: 'dark' as const,
    colors: {
      bg: '#08090A',
      bgElevated: '#111214',
      bgSoft: '#17181B',
      bgInset: '#0D0E10',
      border: 'rgba(255,255,255,0.08)',
      borderStrong: 'rgba(255,255,255,0.14)',
      text: '#F3F4F4',
      textSoft: '#C8CACC',
      textMuted: '#85898F',
      primary: '#F3F4F4',
      primaryText: '#08090A',
      modeBlue: '#82C7EC',
      modeBlueBg: 'rgba(92,169,211,0.14)',
      diffAdd: '#45B66A',
      diffAddBg: 'rgba(34,197,94,0.10)',
      diffDel: '#FF7D86',
      diffDelBg: 'rgba(239,68,68,0.11)',
      danger: '#FF7D86',
      warning: '#E2B15B'
    },
    radius: { card: 26, panel: 20, control: 16, pill: 999 }
  }
};

export type OrbixTheme = (typeof palettes)[OrbixThemeName];

export function resolveThemeName(preference: OrbixThemePreference, systemScheme: 'light' | 'dark' | null | undefined): OrbixThemeName {
  if (preference === 'system') return systemScheme === 'dark' ? 'dark' : 'light';
  return preference;
}

export function getTheme(preference: OrbixThemePreference, systemScheme: 'light' | 'dark' | null | undefined): OrbixTheme {
  return palettes[resolveThemeName(preference, systemScheme)];
}
