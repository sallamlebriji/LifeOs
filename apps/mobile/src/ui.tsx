import { type ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { useTheme } from './theme';

export function Card({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  const t = useTheme();
  return <View style={[styles.card, { backgroundColor: t.raised }, style]}>{children}</View>;
}

export function SectionTitle({ children }: { children: ReactNode }) {
  const t = useTheme();
  return (
    <Text accessibilityRole="header" style={[styles.section, { color: t.primary }]}>
      {children}
    </Text>
  );
}

export function Muted({ children }: { children: ReactNode }) {
  const t = useTheme();
  return <Text style={{ color: t.secondary, fontSize: 15 }}>{children}</Text>;
}

/** Round completion toggle with a 44pt hit area. */
export function Check({ done, label, onPress, color }: { done: boolean; label: string; onPress: () => void; color?: string }) {
  const t = useTheme();
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: done }}
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={10}
      style={styles.checkHit}
    >
      <View style={[styles.check, { borderColor: done ? 'transparent' : t.tertiary, backgroundColor: done ? (color ?? t.positive) : 'transparent' }]}>
        {done ? <Text style={styles.tick}>✓</Text> : null}
      </View>
    </Pressable>
  );
}

export function PrimaryButton({ title, onPress, busy, disabled }: { title: string; onPress: () => void; busy?: boolean; disabled?: boolean }) {
  const t = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={busy || disabled}
      style={({ pressed }) => [styles.button, { backgroundColor: t.accent, opacity: disabled ? 0.45 : pressed ? 0.85 : 1 }]}
    >
      {busy ? <ActivityIndicator color={t.onAccent} /> : <Text style={[styles.buttonText, { color: t.onAccent }]}>{title}</Text>}
    </Pressable>
  );
}

export const styles = StyleSheet.create({
  card: { borderRadius: 14, padding: 16, marginBottom: 16 },
  section: { fontSize: 20, fontWeight: '600', marginBottom: 10 },
  checkHit: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginLeft: -10 },
  check: { width: 24, height: 24, borderRadius: 12, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  tick: { color: '#fff', fontWeight: '700', fontSize: 14 },
  button: { height: 50, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  buttonText: { fontSize: 17, fontWeight: '600' },
  row: { flexDirection: 'row', alignItems: 'center', minHeight: 44 },
});
