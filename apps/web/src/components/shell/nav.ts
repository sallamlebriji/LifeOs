import {
  BarChart3,
  BookOpen,
  CalendarDays,
  CheckSquare,
  Dumbbell,
  FolderKanban,
  type LucideIcon,
  Plane,
  Repeat,
  Settings,
  Sparkles,
  Sun,
  Target,
} from 'lucide-react';
import { type MessageKey } from '@/i18n/messages';

export interface NavItem {
  slug: string;
  href: string;
  label: MessageKey;
  icon: LucideIcon;
  /** Roadmap phase in which the module ships; undefined = available now. */
  phase?: 2 | 3 | 4;
  summary?: string;
}

export interface NavGroup {
  label?: MessageKey;
  items: NavItem[];
}

export const NAV: NavGroup[] = [
  {
    items: [
      { slug: 'today', href: '/today', label: 'nav.today', icon: Sun },
      {
        slug: 'calendar',
        href: '/calendar',
        label: 'nav.calendar',
        icon: CalendarDays,
        summary: 'Day, week, month and agenda views with time blocking, recurring events, locked events and conflict detection.',
      },
    ],
  },
  {
    label: 'nav.groupLife',
    items: [
      { slug: 'goals', href: '/goals', label: 'nav.goals', icon: Target, summary: 'Annual, monthly, weekly and daily goals with milestones and progress history.' },
      { slug: 'tasks', href: '/tasks', label: 'nav.tasks', icon: CheckSquare, summary: 'Full task management: subtasks, dependencies, recurrence, splittable and fixed-time tasks.' },
      { slug: 'projects', href: '/projects', label: 'nav.projects', icon: FolderKanban, summary: 'Projects with milestones, a Kanban board, project calendar and time tracking.' },
      { slug: 'habits', href: '/habits', label: 'nav.habits', icon: Repeat, summary: 'Create habits with custom frequencies, reminders, streaks and weekly consistency.' },
      { slug: 'sports', href: '/sports', label: 'nav.sports', icon: Dumbbell, summary: 'Workouts, training frequency, recovery days and weekly statistics.' },
      { slug: 'study', href: '/study', label: 'nav.study', icon: BookOpen, summary: 'Subjects, courses, revision sessions and exams, ready for spaced repetition.' },
      { slug: 'travel', href: '/travel', label: 'nav.travel', icon: Plane, summary: 'Trips with itinerary, reservations, budget, checklist and calendar blocking.' },
    ],
  },
  {
    label: 'nav.groupIntelligence',
    items: [
      { slug: 'planner', href: '/planner', label: 'nav.planner', icon: Sparkles, summary: 'Describe your week in plain language; the planner proposes a schedule you review and approve.' },
      { slug: 'analytics', href: '/analytics', label: 'nav.analytics', icon: BarChart3, summary: 'Completion rates, time allocation, habit consistency and planned vs. actual time.' },
    ],
  },
  {
    items: [{ slug: 'settings', href: '/settings', label: 'nav.settings', icon: Settings }],
  },
];

export const ALL_ITEMS = NAV.flatMap((g) => g.items);
export function findSection(slug: string): NavItem | undefined {
  return ALL_ITEMS.find((i) => i.slug === slug);
}
