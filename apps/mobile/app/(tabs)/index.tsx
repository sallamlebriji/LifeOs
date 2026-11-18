import { type MyDayResponse } from '@lifeos/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { RefreshControl, ScrollView, Text, View } from 'react-native';
import { api } from '@/api';
import { useTheme } from '@/theme';
import { Card, Check, Muted, SectionTitle, styles } from '@/ui';

const time = (iso: string, tz: string) => new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(iso));

export default function Today() {
  const t = useTheme();
  const qc = useQueryClient();
  const day = useQuery({ queryKey: ['my-day'], queryFn: () => api<MyDayResponse>('/my-day'), refetchInterval: 60_000 });
  const setTask = useMutation({
    mutationFn: ({ id, done }: { id: string; done: boolean }) => api(`/tasks/${id}/status`, { method: 'PATCH', body: { status: done ? 'COMPLETED' : 'TODO' } }),
    onSettled: () => qc.invalidateQueries({ queryKey: ['my-day'] }),
  });
  const setHabit = useMutation({
    mutationFn: ({ id, done, date }: { id: string; done: boolean; date: string }) => api(`/habits/${id}/completion`, { method: 'PUT', body: { date, done } }),
    onSettled: () => qc.invalidateQueries({ queryKey: ['my-day'] }),
  });
  const d = day.data;

  return (
    <ScrollView
      style={{ backgroundColor: t.canvas }}
      contentContainerStyle={{ padding: 16 }}
      refreshControl={<RefreshControl refreshing={day.isFetching} onRefresh={() => void day.refetch()} />}
    >
      {day.isError && !d ? <Muted>Couldn’t load your day. Pull to retry.</Muted> : null}
      {d ? (
        <>
          <Text accessibilityRole="header" style={{ color: t.primary, fontSize: 30, fontWeight: '700', marginBottom: 4 }}>
            Hello, {d.greetingName.split(' ')[0]}
          </Text>
          <Text style={{ color: t.secondary, fontSize: 15, marginBottom: 16 }}>
            {d.stats.tasksCompleted} of {d.stats.tasksTotal} tasks done · {Math.round(d.stats.freeMinutes / 60)} h free
          </Text>

          {d.topPriority ? (
            <Card>
              <Text style={{ color: t.secondary, fontSize: 13, fontWeight: '600', marginBottom: 4 }}>TOP PRIORITY</Text>
              <Text style={{ color: t.primary, fontSize: 17, fontWeight: '600' }}>{d.topPriority.title}</Text>
            </Card>
          ) : null}

          <Card>
            <SectionTitle>Agenda</SectionTitle>
            {d.agenda.length === 0 ? <Muted>No events today.</Muted> : null}
            {d.agenda.map((e) => (
              <View key={`${e.id}${e.startAt}`} style={[styles.row, { gap: 12 }]}>
                <Text style={{ color: t.secondary, width: 92, fontVariant: ['tabular-nums'] }}>
                  {e.allDay ? 'All day' : `${time(e.startAt, d.timezone)}–${time(e.endAt, d.timezone)}`}
                </Text>
                <Text style={{ color: t.primary, fontSize: 16, flex: 1 }}>
                  {e.locked ? '🔒 ' : ''}
                  {e.title}
                </Text>
              </View>
            ))}
          </Card>

          <Card>
            <SectionTitle>Tasks</SectionTitle>
            {d.tasks.length === 0 ? <Muted>Nothing planned for today.</Muted> : null}
            {d.tasks.map((task) => {
              const done = task.status === 'COMPLETED';
              return (
                <View key={task.id} style={styles.row}>
                  <Check done={done} label={`${done ? 'Mark not done' : 'Mark done'}: ${task.title}`} onPress={() => setTask.mutate({ id: task.id, done: !done })} />
                  <Text style={{ color: done ? t.tertiary : t.primary, fontSize: 16, flex: 1, textDecorationLine: done ? 'line-through' : 'none' }}>{task.title}</Text>
                  {task.overdue ? <Text style={{ color: t.critical, fontSize: 13 }}>Overdue</Text> : null}
                </View>
              );
            })}
          </Card>

          {d.habits.length ? (
            <Card>
              <SectionTitle>Habits</SectionTitle>
              {d.habits.map((h) => (
                <View key={h.id} style={styles.row}>
                  <Check done={h.doneToday} color={h.color ?? undefined} label={`${h.name}: ${h.doneToday ? 'done' : 'not done'}`} onPress={() => setHabit.mutate({ id: h.id, done: !h.doneToday, date: d.date })} />
                  <Text style={{ color: t.primary, fontSize: 16, flex: 1 }}>{h.name}</Text>
                  {h.streak ? <Text style={{ color: t.warning, fontSize: 13 }}>{h.streak}-day streak</Text> : null}
                </View>
              ))}
            </Card>
          ) : null}
        </>
      ) : null}
    </ScrollView>
  );
}
