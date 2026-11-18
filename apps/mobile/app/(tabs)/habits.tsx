import { type HabitDto } from '@lifeos/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FlatList, Text, View } from 'react-native';
import { api } from '@/api';
import { useTheme } from '@/theme';
import { Check, Muted, styles } from '@/ui';

const todayKey = () => new Date().toLocaleDateString('en-CA');

export default function Habits() {
  const t = useTheme();
  const qc = useQueryClient();
  const habits = useQuery({ queryKey: ['habits'], queryFn: () => api<HabitDto[]>('/habits') });
  const toggle = useMutation({
    mutationFn: ({ id, done }: { id: string; done: boolean }) => api(`/habits/${id}/completion`, { method: 'PUT', body: { date: todayKey(), done } }),
    onSettled: () => Promise.all([qc.invalidateQueries({ queryKey: ['habits'] }), qc.invalidateQueries({ queryKey: ['my-day'] })]),
  });

  return (
    <FlatList
      style={{ backgroundColor: t.canvas }}
      contentContainerStyle={{ padding: 16 }}
      data={habits.data ?? []}
      keyExtractor={(h) => h.id}
      onRefresh={() => void habits.refetch()}
      refreshing={habits.isFetching}
      ListEmptyComponent={habits.isPending ? undefined : <Muted>No habits yet — add them on the web.</Muted>}
      renderItem={({ item }) => {
        const done = item.recent.includes(todayKey());
        return (
          <View style={[styles.row, { backgroundColor: t.raised, borderRadius: 12, paddingHorizontal: 14, marginBottom: 8 }]}>
            <Check done={done} color={item.color ?? undefined} label={`${item.name}: ${done ? 'done today' : 'not done today'}`} onPress={() => toggle.mutate({ id: item.id, done: !done })} />
            <View style={{ flex: 1, paddingVertical: 10 }}>
              <Text style={{ color: t.primary, fontSize: 16 }}>{item.name}</Text>
              <Text style={{ color: t.secondary, fontSize: 13 }}>
                {item.stats.currentStreak ? `${item.stats.currentStreak} streak · ` : ''}
                {Math.round(item.stats.consistency28 * 100)}% over 4 weeks
              </Text>
            </View>
          </View>
        );
      }}
    />
  );
}
