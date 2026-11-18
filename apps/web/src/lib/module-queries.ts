'use client';

/** TanStack Query hooks for the Phase 2 modules. */
import {
  type AvailabilityRuleDto,
  type CalendarRangeResponse,
  type CategoryDto,
  type EventMutationResponse,
  type GoalDto,
  type HabitDto,
  type Page,
  type PlannerChatResponse,
  type PlannerStatusDto,
  type ProposalDto,
  type ProjectDto,
  type TaskDetailDto,
  type TaskDto,
} from '@lifeos/shared';
import {
  type AvailabilityRuleInput,
  type ChangeDecisionInput,
  type PlanRequestInput,
  type CreateEventInput,
  type CreateGoalInput,
  type CreateHabitInput,
  type CreateMilestoneInput,
  type CreateProjectInput,
  type CreateTaskInput,
  type UpdateEventInput,
  type UpdateGoalInput,
  type UpdateHabitInput,
  type UpdateMilestoneInput,
  type UpdateProjectInput,
  type UpdateTaskInput,
} from '@lifeos/validation';
import {
  type QueryKey,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { api } from './api';

/** Mutations that refresh every listed query family when they settle. */
function useMutate<TVars, TData>(fn: (vars: TVars) => Promise<TData>, families: string[]) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSettled: () => Promise.all(families.map((f) => qc.invalidateQueries({ queryKey: [f] }))),
  });
}

const TASK_FAMILIES = ['tasks', 'task', 'projects', 'project', 'my-day', 'goals'];

// ─── Categories ──────────────────────────────────────────────────────────

export function useCategories() {
  return useQuery({
    queryKey: ['categories'],
    queryFn: ({ signal }) => api<CategoryDto[]>('/categories', { signal }),
    staleTime: 5 * 60_000,
  });
}

// ─── Tasks ───────────────────────────────────────────────────────────────

export interface TaskFilters {
  status?: 'OPEN' | 'TODO' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
  priority?: string;
  projectId?: string;
  goalId?: string;
  categoryId?: string;
  q?: string;
  sort?: 'smart' | 'due' | 'created' | 'manual';
  limit?: number;
}

export function useTasks(filters: TaskFilters) {
  return useInfiniteQuery({
    queryKey: ['tasks', filters] as QueryKey,
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam, signal }) =>
      api<Page<TaskDto>>('/tasks', {
        query: { ...filters, limit: filters.limit ?? 50, cursor: pageParam },
        signal,
      }),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
}

export function useTask(id: string | null) {
  return useQuery({
    queryKey: ['task', id],
    queryFn: ({ signal }) => api<TaskDetailDto>(`/tasks/${id}`, { signal }),
    enabled: !!id,
  });
}

export const useCreateTask = () =>
  useMutate((body: CreateTaskInput) => api<TaskDto>('/tasks', { method: 'POST', body }), TASK_FAMILIES);
export const useUpdateTask = () =>
  useMutate(({ id, ...body }: UpdateTaskInput & { id: string }) => api<TaskDto>(`/tasks/${id}`, { method: 'PATCH', body }), TASK_FAMILIES);
export const useDeleteTask = () =>
  useMutate((id: string) => api<void>(`/tasks/${id}`, { method: 'DELETE' }), TASK_FAMILIES);
export const useTaskStatus = () =>
  useMutate(
    ({ id, status }: { id: string; status: TaskDto['status'] }) => api(`/tasks/${id}/status`, { method: 'PATCH', body: { status } }),
    TASK_FAMILIES,
  );
export const useAddDependency = () =>
  useMutate(
    ({ id, dependsOnId }: { id: string; dependsOnId: string }) =>
      api<TaskDetailDto>(`/tasks/${id}/dependencies`, { method: 'POST', body: { dependsOnId } }),
    ['task', 'tasks'],
  );
export const useRemoveDependency = () =>
  useMutate(
    ({ id, dependsOnId }: { id: string; dependsOnId: string }) =>
      api<void>(`/tasks/${id}/dependencies/${dependsOnId}`, { method: 'DELETE' }),
    ['task', 'tasks'],
  );
export const useLogTime = () =>
  useMutate(
    ({ id, minutes }: { id: string; minutes: number }) => api<TaskDto>(`/tasks/${id}/time`, { method: 'POST', body: { minutes } }),
    TASK_FAMILIES,
  );
export const useReorderTasks = () =>
  useMutate((ids: string[]) => api<void>('/tasks/order', { method: 'PUT', body: { ids } }), ['tasks']);

// ─── Goals ───────────────────────────────────────────────────────────────

export function useGoals() {
  return useQuery({
    queryKey: ['goals'],
    queryFn: ({ signal }) => api<Page<GoalDto>>('/goals', { query: { limit: 100 }, signal }),
  });
}

const GOAL_FAMILIES = ['goals', 'my-day'];
export const useCreateGoal = () =>
  useMutate((body: CreateGoalInput) => api<GoalDto>('/goals', { method: 'POST', body }), GOAL_FAMILIES);
export const useUpdateGoal = () =>
  useMutate(({ id, ...body }: UpdateGoalInput & { id: string }) => api<GoalDto>(`/goals/${id}`, { method: 'PATCH', body }), GOAL_FAMILIES);
export const useDeleteGoal = () =>
  useMutate((id: string) => api<void>(`/goals/${id}`, { method: 'DELETE' }), GOAL_FAMILIES);
export const useRecordProgress = () =>
  useMutate(
    ({ id, value, note }: { id: string; value: number; note?: string }) =>
      api<GoalDto>(`/goals/${id}/progress`, { method: 'POST', body: { value, ...(note ? { note } : {}) } }),
    GOAL_FAMILIES,
  );

/** Milestone CRUD shared by goals and projects. */
export function useMilestones(kind: 'goals' | 'projects') {
  const families = kind === 'goals' ? GOAL_FAMILIES : ['projects', 'project'];
  return {
    add: useMutate(
      ({ parentId, ...body }: CreateMilestoneInput & { parentId: string }) =>
        api(`/${kind}/${parentId}/milestones`, { method: 'POST', body }),
      families,
    ),
    update: useMutate(
      ({ parentId, id, ...body }: UpdateMilestoneInput & { parentId: string; id: string }) =>
        api(`/${kind}/${parentId}/milestones/${id}`, { method: 'PATCH', body }),
      families,
    ),
    remove: useMutate(
      ({ parentId, id }: { parentId: string; id: string }) => api(`/${kind}/${parentId}/milestones/${id}`, { method: 'DELETE' }),
      families,
    ),
  };
}

// ─── Projects ────────────────────────────────────────────────────────────

export function useProjects(status?: string) {
  return useQuery({
    queryKey: ['projects', status ?? 'current'],
    queryFn: ({ signal }) => api<Page<ProjectDto>>('/projects', { query: { limit: 100, status }, signal }),
  });
}

export function useProject(id: string) {
  return useQuery({
    queryKey: ['project', id],
    queryFn: ({ signal }) => api<ProjectDto>(`/projects/${id}`, { signal }),
  });
}

export const useCreateProject = () =>
  useMutate((body: CreateProjectInput) => api<ProjectDto>('/projects', { method: 'POST', body }), ['projects']);
export const useUpdateProject = () =>
  useMutate(
    ({ id, ...body }: UpdateProjectInput & { id: string }) => api<ProjectDto>(`/projects/${id}`, { method: 'PATCH', body }),
    ['projects', 'project'],
  );
export const useDeleteProject = () =>
  useMutate((id: string) => api<void>(`/projects/${id}`, { method: 'DELETE' }), ['projects', 'tasks']);

// ─── Calendar & availability ─────────────────────────────────────────────

export function useCalendarRange(from: string, to: string) {
  return useQuery({
    queryKey: ['calendar', from, to],
    queryFn: ({ signal }) => api<CalendarRangeResponse>('/calendar/events', { query: { from, to }, signal }),
    placeholderData: (prev) => prev,
  });
}

const EVENT_FAMILIES = ['calendar', 'my-day'];
export const useCreateEvent = () =>
  useMutate((body: CreateEventInput) => api<EventMutationResponse>('/calendar/events', { method: 'POST', body }), EVENT_FAMILIES);
export const useUpdateEvent = () =>
  useMutate(
    ({ id, ...body }: UpdateEventInput & { id: string }) =>
      api<EventMutationResponse>(`/calendar/events/${id}`, { method: 'PATCH', body }),
    EVENT_FAMILIES,
  );
export const useDeleteEvent = () =>
  useMutate((id: string) => api<void>(`/calendar/events/${id}`, { method: 'DELETE' }), EVENT_FAMILIES);

export function useAvailability() {
  return useQuery({
    queryKey: ['availability'],
    queryFn: ({ signal }) => api<AvailabilityRuleDto[]>('/availability', { signal }),
  });
}
export const useCreateRule = () =>
  useMutate((body: AvailabilityRuleInput) => api<AvailabilityRuleDto>('/availability', { method: 'POST', body }), ['availability']);
export const useDeleteRule = () =>
  useMutate((id: string) => api<void>(`/availability/${id}`, { method: 'DELETE' }), ['availability']);

// ─── Habits ──────────────────────────────────────────────────────────────

export function useHabits(archived = false) {
  return useQuery({
    queryKey: ['habits', archived],
    queryFn: ({ signal }) => api<HabitDto[]>('/habits', { query: { archived: archived ? 'true' : undefined, days: 35 }, signal }),
  });
}

const HABIT_FAMILIES = ['habits', 'my-day'];
export const useCreateHabit = () =>
  useMutate((body: CreateHabitInput) => api<HabitDto>('/habits', { method: 'POST', body }), HABIT_FAMILIES);
export const useUpdateHabit = () =>
  useMutate(({ id, ...body }: UpdateHabitInput & { id: string }) => api<HabitDto>(`/habits/${id}`, { method: 'PATCH', body }), HABIT_FAMILIES);
export const useDeleteHabit = () =>
  useMutate((id: string) => api<void>(`/habits/${id}`, { method: 'DELETE' }), HABIT_FAMILIES);

/** Optimistic check-off on the habits grid. */
export function useHabitDay() {
  const qc = useQueryClient();
  const key = ['habits', false];
  return useMutation({
    mutationFn: ({ id, date, done }: { id: string; date: string; done: boolean }) =>
      api(`/habits/${id}/completion`, { method: 'PUT', body: { date, done } }),
    onMutate: async ({ id, date, done }) => {
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<HabitDto[]>(key);
      qc.setQueryData<HabitDto[]>(key, (old) =>
        old?.map((h) =>
          h.id === id ? { ...h, recent: done ? [...h.recent, date] : h.recent.filter((d) => d !== date) } : h,
        ),
      );
      return { previous };
    },
    onError: (_e, _v, ctx) => ctx?.previous && qc.setQueryData(key, ctx.previous),
    onSettled: () => Promise.all(HABIT_FAMILIES.map((f) => qc.invalidateQueries({ queryKey: [f] }))),
  });
}

// ─── Planner (Phase 3) ───────────────────────────────────────────────────

export function usePlannerStatus() {
  return useQuery({
    queryKey: ['planner-status'],
    queryFn: ({ signal }) => api<PlannerStatusDto>('/planner/status', { signal }),
    staleTime: 5 * 60_000,
  });
}

export function useProposals() {
  return useQuery({
    queryKey: ['proposals'],
    queryFn: ({ signal }) => api<ProposalDto[]>('/planner/proposals', { signal }),
  });
}

export function useProposal(id: string | null) {
  return useQuery({
    queryKey: ['proposal', id],
    queryFn: ({ signal }) => api<ProposalDto>(`/planner/proposals/${id}`, { signal }),
    enabled: !!id,
  });
}

const PLAN_FAMILIES = ['proposals', 'proposal', 'calendar', 'my-day', 'tasks'];

function useSetProposal() {
  const qc = useQueryClient();
  return (p: ProposalDto) => {
    qc.setQueryData(['proposal', p.id], p);
    void qc.invalidateQueries({ queryKey: ['proposals'] });
  };
}

export function usePropose() {
  const set = useSetProposal();
  return useMutation({
    mutationFn: (body: PlanRequestInput) => api<ProposalDto>('/planner/proposals', { method: 'POST', body }),
    onSuccess: set,
  });
}

export function useDecideChange() {
  const set = useSetProposal();
  return useMutation({
    mutationFn: ({ proposalId, changeId, ...body }: ChangeDecisionInput & { proposalId: string; changeId: string }) =>
      api<ProposalDto>(`/planner/proposals/${proposalId}/changes/${changeId}`, { method: 'PATCH', body }),
    onSuccess: set,
  });
}

export const useProposalAction = (action: 'apply' | 'reject' | 'regenerate' | 'revert') =>
  useMutate((id: string) => api<ProposalDto>(`/planner/proposals/${id}/${action}`, { method: 'POST', body: {} }), PLAN_FAMILIES);

export function usePlannerChat() {
  const set = useSetProposal();
  return useMutation({
    mutationFn: (body: { message: string; conversationId?: string }) => api<PlannerChatResponse>('/planner/chat', { method: 'POST', body }),
    onSuccess: (res) => res.proposal && set(res.proposal),
  });
}
