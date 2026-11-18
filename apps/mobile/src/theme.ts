/** Mirrors packages/ui/src/tokens.css so mobile and web share one visual language. */
import { useColorScheme } from 'react-native';

const light = {
  canvas: '#f2f2f7',
  raised: '#ffffff',
  sunken: '#e9e9ee',
  primary: '#1c1c1e',
  secondary: '#4b4b52',
  tertiary: '#6e6e76',
  separator: 'rgba(60,60,67,0.18)',
  accent: '#3451d1',
  onAccent: '#ffffff',
  positive: '#1a7f37',
  warning: '#9a5b00',
  critical: '#c4271d',
};

const dark: typeof light = {
  canvas: '#000000',
  raised: '#1c1c1e',
  sunken: '#2c2c2e',
  primary: '#f5f5f7',
  secondary: '#c7c7cc',
  tertiary: '#a1a1a8',
  separator: 'rgba(84,84,88,0.6)',
  accent: '#8197ff',
  onAccent: '#0b0d1a',
  positive: '#4cd964',
  warning: '#ffb340',
  critical: '#ff6961',
};

export type Theme = typeof light;

export function useTheme(): Theme {
  return useColorScheme() === 'dark' ? dark : light;
}
