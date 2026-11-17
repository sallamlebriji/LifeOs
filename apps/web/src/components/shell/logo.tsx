/**
 * LifeOS mark: a day arc with a single "now" point — the same idea as the day
 * ribbon on My Day.
 */
export function Logo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <rect width="32" height="32" rx="8" fill="var(--accent)" />
      <path
        d="M7 20a9 9 0 0 1 18 0"
        fill="none"
        stroke="var(--content-on-accent)"
        strokeWidth="2.6"
        strokeLinecap="round"
      />
      <circle cx="19.5" cy="13.2" r="2.6" fill="var(--content-on-accent)" />
      <path d="M7 23.5h18" stroke="var(--content-on-accent)" strokeOpacity="0.55" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
