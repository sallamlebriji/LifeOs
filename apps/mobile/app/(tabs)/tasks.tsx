import { type Page, type TaskDto } from '@lifeos/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { FlatList, Text, TextInput, View } from 'react-native';
import { api, ApiError } from '@/api';
import { useTheme } from '@/theme';
import { Check, Muted, styles } from '@/ui';

export default function Tasks() {
  const t = useTheme();
  const qc = useQueryClient();
  const [title, setTitle] = useState('');
  const [error, setError] = useState<string>();
  const tasks = useQuery({ queryKey: ['tasks', 'open'], queryFn: () => api<Page<TaskDto>>('/tasks', { query: { status: 'OPEN', limit: '100' } }) });
  const refresh = () => Promise.all([qc.invalidateQueries({ queryKey: ['tasks'] }), qc.invalidateQueries({ queryKey: ['my-day'] })]);
  const complete = useMutation({ mutationFn: (id: string) => api(`/tasks/${id}/status`, { method: 'PATCH', body: { status: 'COMPLETED' } }), onSettled: refresh });
  const add = useMutation({ mutationFn: (value: string) => api('/tasks', { method: 'POST', body: { title: value } }), onSettled: refresh });

  return (
    <FlatList
      style={{ backgroundColor: t.canvas }}
      contentContainerStyle={{ padding: 16 }}
      data={tasks.data?.items ?? []}
      keyExtractor={(x) => x.id}
      onRefresh={() => void tasks.refetch()}
      refreshing={tasks.isFetching}
      ListHeaderComponent={
        <View style={{ marginBottom: 12 }}>
          <TextInput
            accessibilityLabel="Add a task"
            placeholder="Add a task…"
            placeholderTextColor={t.tertiary}
            value={title}
            returnKeyType="done"
            onChangeText={setTitle}
            onSubmitEditing={async () => {
              if (!title.trim()) return;
              setError(undefined);
              try {
                await add.mutateAsync(title.trim());
                setTitle('');
              } catch (err) {
                setError(err instanceof ApiError ? err.message : 'Couldn’t add the task.');
              }
            }}
            style={{ height: 48, borderRadius: 12, paddingHorizontal: 14, fontSize: 17, backgroundColor: t.raised, color: t.primary }}
          />
          {error ? <Text style={{ color: t.critical, marginTop: 6 }}>{error}</Text> : null}
        </View>
      }
      ListEmptyComponent={tasks.isPending ? undefined : <Muted>Nothing to do.</Muted>}
      renderItem={({ item }) => (
        <View style={[styles.row, { backgroundColor: t.raised, borderRadius: 12, paddingHorizontal: 14, marginBottom: 8 }]}>
          <Check done={false} label={`Mark done: ${item.title}`} onPress={() => complete.mutate(item.id)} />
          <View style={{ flex: 1, paddingVertical: 10 }}>
            <Text style={{ color: t.primary, fontSize: 16 }}>{item.title}</Text>
            {item.dueAt ? <Text style={{ color: t.secondary, fontSize: 13 }}>Due {new Date(item.dueAt).toLocaleString()}</Text> : null}
          </View>
          {item.priority === 'URGENT' || item.priority === 'HIGH' ? <Text style={{ color: item.priority === 'URGENT' ? t.critical : t.warning, fontSize: 13 }}>{item.priority === 'URGENT' ? 'Urgent' : 'High'}</Text> : null}
        </View>
      )}
    />
  );
}
