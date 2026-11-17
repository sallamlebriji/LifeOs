'use client';

import {
  type AuthResponse,
  type MyDayResponse,
  type PublicUser,
  type UserPreferencesDto,
} from '@lifeos/shared';
import {
  type LoginInput,
  type QuickAddTaskInput,
  type RegisterInput,
  type SetTaskStatusInput,
  type UpdatePreferencesInput,
  type UpdateProfileInput,
} from '@lifeos/validation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api';

export const queryKeys = {
  me: ['me'] as const,
  myDay: (date?: string) => ['my-day', date ?? 'today'] as const,
};

export interface MeResponse {
  user: PublicUser;
  preferences: UserPreferencesDto | null;
}

export function useMe() {
  return useQuery({
    queryKey: queryKeys.me,
    queryFn: ({ signal }) => api<MeResponse>('/users/me', { signal }),
    staleTime: 5 * 60_000,
  });
}

export function useMyDay(date?: string) {
  return useQuery({
    queryKey: queryKeys.myDay(date),
    queryFn: ({ signal }) => api<MyDayResponse>('/my-day', { query: { date }, signal }),
    // Free time is relative to "now": keep it fresh while the page is open.
    refetchInterval: 60_000,
  });
}

export function useLogin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: LoginInput) =>
      api<AuthResponse>('/auth/login', { method: 'POST', body, noRefresh: true }),
    onSuccess: () => qc.clear(),
  });
}

export function useRegister() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: RegisterInput) =>
      api<AuthResponse>('/auth/register', { method: 'POST', body, noRefresh: true }),
    onSuccess: () => qc.clear(),
  });
}

export function useLogout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api<void>('/auth/logout', { method: 'POST', body: {}, noRefresh: true }),
    onSettled: () => {
      qc.clear();
      window.location.assign('/login');
    },
  });
}

export function useResendVerification() {
  return useMutation({
    mutationFn: () => api<void>('/auth/resend-verification', { method: 'POST', body: {} }),
  });
}

export function useUpdatePreferences() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: UpdatePreferencesInput) =>
      api<UserPreferencesDto>('/preferences', { method: 'PATCH', body }),
    onSuccess: (preferences) => {
      qc.setQueryData<MeResponse>(queryKeys.me, (old) => (old ? { ...old, preferences } : old));
      void qc.invalidateQueries({ queryKey: ['my-day'] });
    },
  });
}

export function useUpdateProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: UpdateProfileInput) => api<PublicUser>('/users/me', { method: 'PATCH', body }),
    onSuccess: (user) => {
      qc.setQueryData<MeResponse>(queryKeys.me, (old) => (old ? { ...old, user } : old));
      void qc.invalidateQueries({ queryKey: ['my-day'] });
    },
  });
}

export function useQuickAddTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: QuickAddTaskInput) => api<{ id: string }>('/tasks', { method: 'POST', body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['my-day'] }),
  });
}

/** Optimistic: the checkbox flips instantly; rolls back if the API refuses. */
export function useSetTaskStatus(date?: string) {
  const qc = useQueryClient();
  const key = queryKeys.myDay(date);
  return useMutation({
    mutationFn: ({ id, status }: { id: string } & SetTaskStatusInput) =>
      api(`/tasks/${id}/status`, { method: 'PATCH', body: { status } }),
    onMutate: async ({ id, status }) => {
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<MyDayResponse>(key);
      qc.setQueryData<MyDayResponse>(key, (old) =>
        old
          ? {
              ...old,
              tasks: old.tasks.map((t) =>
                t.id === id
                  ? { ...t, status, completedAt: status === 'COMPLETED' ? new Date().toISOString() : null }
                  : t,
              ),
            }
          : old,
      );
      return { previous };
    },
    onError: (_e, _v, ctx) => ctx?.previous && qc.setQueryData(key, ctx.previous),
    onSettled: () => qc.invalidateQueries({ queryKey: ['my-day'] }),
  });
}

export function useToggleHabit(date?: string) {
  const qc = useQueryClient();
  const key = queryKeys.myDay(date);
  return useMutation({
    mutationFn: ({ id, date: day, done }: { id: string; date: string; done: boolean }) =>
      api(`/habits/${id}/completion`, { method: 'PUT', body: { date: day, done } }),
    onMutate: async ({ id, done }) => {
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<MyDayResponse>(key);
      qc.setQueryData<MyDayResponse>(key, (old) =>
        old
          ? {
              ...old,
              habits: old.habits.map((h) =>
                h.id === id ? { ...h, doneToday: done, streak: Math.max(0, h.streak + (done ? 1 : -1)) } : h,
              ),
            }
          : old,
      );
      return { previous };
    },
    onError: (_e, _v, ctx) => ctx?.previous && qc.setQueryData(key, ctx.previous),
    onSettled: () => qc.invalidateQueries({ queryKey: ['my-day'] }),
  });
}
