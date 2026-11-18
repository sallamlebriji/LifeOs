import { Tabs } from 'expo-router';
import { type ColorValue, Text } from 'react-native';
import { useTheme } from '@/theme';

const icon = (glyph: string) =>
  function TabIcon({ color }: { color: ColorValue }) {
    return <Text style={{ color, fontSize: 20 }}>{glyph}</Text>;
  };

export default function TabsLayout() {
  const t = useTheme();
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: t.accent,
        tabBarInactiveTintColor: t.tertiary,
        tabBarStyle: { backgroundColor: t.raised, borderTopColor: t.separator },
        headerStyle: { backgroundColor: t.canvas },
        headerTitleStyle: { color: t.primary },
        headerShadowVisible: false,
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Today', tabBarIcon: icon('☀︎') }} />
      <Tabs.Screen name="tasks" options={{ title: 'Tasks', tabBarIcon: icon('☑︎') }} />
      <Tabs.Screen name="habits" options={{ title: 'Habits', tabBarIcon: icon('↻') }} />
      <Tabs.Screen name="settings" options={{ title: 'Settings', tabBarIcon: icon('⚙︎') }} />
    </Tabs>
  );
}
