import { useState } from 'react';
import { Platform, Pressable, ScrollView, Text } from 'react-native';
import { API_URL } from '@/api';
import { useAuth } from '@/auth';
import { importDeviceCalendar, registerForPush } from '@/device';
import { useTheme } from '@/theme';
import { Card, Muted, PrimaryButton, SectionTitle } from '@/ui';

export default function Settings() {
  const t = useTheme();
  const { signOut } = useAuth();
  const [push, setPush] = useState<string>();
  const [cal, setCal] = useState<string>();
  const [busy, setBusy] = useState<'push' | 'cal' | null>(null);

  return (
    <ScrollView style={{ backgroundColor: t.canvas }} contentContainerStyle={{ padding: 16 }}>
      <Card>
        <SectionTitle>Reminders on this phone</SectionTitle>
        <Muted>Event, deadline and habit reminders arrive as notifications when the LifeOS server runs its background worker.</Muted>
        <Text style={{ height: 12 }} />
        <PrimaryButton
          title="Turn on notifications"
          busy={busy === 'push'}
          onPress={async () => {
            setBusy('push');
            const res = await registerForPush().catch((e: unknown) => ({ ok: false as const, reason: e instanceof Error ? e.message : 'Failed' }));
            setPush(res.ok ? 'This phone will receive reminders.' : res.reason);
            setBusy(null);
          }}
        />
        {push ? <Text style={{ color: t.secondary, marginTop: 8 }}>{push}</Text> : null}
      </Card>

      <Card>
        <SectionTitle>{Platform.OS === 'ios' ? 'Apple Calendar' : 'Device calendar'}</SectionTitle>
        <Muted>Bring the events on this phone into LifeOS so the planner works around them. LifeOS only reads; it never changes your calendar.</Muted>
        <Text style={{ height: 12 }} />
        <PrimaryButton
          title="Import calendar events"
          busy={busy === 'cal'}
          onPress={async () => {
            setBusy('cal');
            const res = await importDeviceCalendar().catch((e: unknown) => ({ error: e instanceof Error ? e.message : 'Failed' }));
            setCal('error' in res ? res.error : `${res.imported} events updated, ${res.removed} removed.`);
            setBusy(null);
          }}
        />
        {cal ? <Text style={{ color: t.secondary, marginTop: 8 }}>{cal}</Text> : null}
      </Card>

      <Card>
        <Muted>Server: {API_URL}</Muted>
        <Pressable accessibilityRole="button" onPress={signOut} style={{ marginTop: 12, minHeight: 44, justifyContent: 'center' }}>
          <Text style={{ color: t.critical, fontSize: 17 }}>Sign out</Text>
        </Pressable>
      </Card>
    </ScrollView>
  );
}
