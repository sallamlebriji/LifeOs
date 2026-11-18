/**
 * LifeOS primitives. Tailwind utilities map to the CSS tokens in tokens.css
 * (see apps/web/src/app/globals.css @theme block).
 */
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import {
  forwardRef,
  type ButtonHTMLAttributes,
  type HTMLAttributes,
  type InputHTMLAttributes,
  type LabelHTMLAttributes,
  type ReactNode,
  useId,
} from 'react';
import { cn } from './cn';

// ─── Button ──────────────────────────────────────────────────────────────

export const buttonVariants = cva(
  'inline-flex select-none items-center justify-center gap-2 whitespace-nowrap font-medium transition-[background-color,color,box-shadow,transform] duration-[var(--duration-fast)] ease-[var(--ease-standard)] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-accent/40 disabled:pointer-events-none disabled:opacity-45 active:scale-[0.98]',
  {
    variants: {
      variant: {
        primary: 'bg-accent text-on-accent hover:bg-accent-hover',
        secondary: 'bg-sunken text-primary hover:bg-[color-mix(in_srgb,var(--surface-sunken),var(--content-primary)_6%)]',
        ghost: 'text-primary hover:bg-sunken',
        link: 'text-accent underline-offset-4 hover:underline px-0 h-auto',
        destructive: 'bg-critical text-white hover:opacity-90',
      },
      size: {
        sm: 'h-8 rounded-sm px-3 text-[0.8125rem]',
        md: 'h-10 rounded-md px-4 text-[0.9375rem]',
        lg: 'h-12 rounded-md px-5 text-[1.0625rem]',
        icon: 'h-10 w-10 rounded-md',
        'icon-sm': 'h-8 w-8 rounded-sm',
      },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  },
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild, loading, disabled, children, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return (
      <Comp
        ref={ref}
        className={cn(buttonVariants({ variant, size }), className)}
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        {...props}
      >
        {/* Slot needs exactly one child, so asChild buttons don't get the spinner slot. */}
        {asChild ? (
          children
        ) : (
          <>
            {loading ? <Spinner className="h-4 w-4" /> : null}
            {children}
          </>
        )}
      </Comp>
    );
  },
);
Button.displayName = 'Button';

// ─── Form fields ─────────────────────────────────────────────────────────

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        'h-11 w-full rounded-md border border-separator bg-raised px-3.5 text-[0.9375rem] text-primary shadow-none outline-none transition-[border-color,box-shadow] duration-[var(--duration-fast)] placeholder:text-tertiary focus:border-accent focus:ring-[3px] focus:ring-accent/25 aria-[invalid=true]:border-critical aria-[invalid=true]:focus:ring-critical/20 disabled:opacity-50',
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = 'Input';

export function Label({ className, ...props }: LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label className={cn('text-[0.8125rem] font-medium text-secondary', className)} {...props} />
  );
}

/** Label + control + hint/error, wired with aria-describedby. */
export function Field({
  label,
  hint,
  error,
  children,
  className,
}: {
  label: string;
  hint?: string;
  error?: string;
  className?: string;
  children: (props: { id: string; 'aria-describedby'?: string; 'aria-invalid'?: boolean }) => ReactNode;
}) {
  const id = useId();
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <Label htmlFor={id}>{label}</Label>
      {children({ id, ...(describedBy ? { 'aria-describedby': describedBy } : {}), ...(error ? { 'aria-invalid': true } : {}) })}
      {error ? (
        <p id={`${id}-error`} role="alert" className="text-[0.8125rem] text-critical">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-[0.8125rem] text-tertiary">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

// ─── Surfaces ────────────────────────────────────────────────────────────

export function Surface({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('rounded-lg bg-raised shadow-sm', className)} {...props} />;
}

export function SectionHeader({
  title,
  detail,
  action,
  id,
}: {
  title: string;
  detail?: ReactNode;
  action?: ReactNode;
  id?: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 px-1 pb-2">
      <h2 id={id} className="text-[1.0625rem] font-semibold tracking-[-0.01em] text-primary">
        {title}
      </h2>
      <div className="flex items-center gap-3 text-[0.8125rem] text-secondary">
        {detail}
        {action}
      </div>
    </div>
  );
}

// ─── Status ──────────────────────────────────────────────────────────────

export function Spinner({ className, label = 'Loading' }: { className?: string; label?: string }) {
  return (
    <svg
      className={cn('h-5 w-5 animate-spin text-current', className)}
      viewBox="0 0 24 24"
      fill="none"
      role="img"
      aria-label={label}
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.2" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn('animate-pulse rounded-md bg-sunken', className)} />;
}

/** Circular progress with the value also given as text for assistive tech. */
export function ProgressRing({
  value,
  size = 44,
  stroke = 5,
  label,
  className,
  tone = 'accent',
}: {
  value: number; // 0–1
  size?: number;
  stroke?: number;
  label: string;
  className?: string;
  tone?: 'accent' | 'positive';
}) {
  const clamped = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label={`${label}: ${Math.round(clamped * 100)}%`}
      className={cn('-rotate-90', className)}
    >
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-sunken)" strokeWidth={stroke} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={tone === 'positive' ? 'var(--signal-positive)' : 'var(--accent)'}
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - clamped)}
        style={{ transition: 'stroke-dashoffset var(--duration-slow) var(--ease-standard)' }}
      />
    </svg>
  );
}

export function ProgressBar({ value, label, className }: { value: number; label: string; className?: string }) {
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100);
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
      className={cn('h-1.5 w-full overflow-hidden rounded-full bg-sunken', className)}
    >
      <div
        className="h-full rounded-full bg-accent transition-[width] duration-[var(--duration-slow)]"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

// ─── Empty & error states ────────────────────────────────────────────────

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col items-center gap-2 px-6 py-8 text-center', className)}>
      {icon ? <div className="mb-1 text-tertiary">{icon}</div> : null}
      <p className="text-[0.9375rem] font-medium text-primary">{title}</p>
      {description ? <p className="max-w-sm text-[0.8125rem] text-secondary">{description}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

export function ErrorState({
  title = 'Something went wrong',
  description,
  onRetry,
}: {
  title?: string;
  description?: string;
  onRetry?: () => void;
}) {
  return (
    <div role="alert" className="flex flex-col items-center gap-2 px-6 py-10 text-center">
      <p className="text-[0.9375rem] font-medium text-primary">{title}</p>
      {description ? <p className="max-w-sm text-[0.8125rem] text-secondary">{description}</p> : null}
      {onRetry ? (
        <Button variant="secondary" size="sm" className="mt-2" onClick={onRetry}>
          Try again
        </Button>
      ) : null}
    </div>
  );
}

// ─── Badges ──────────────────────────────────────────────────────────────

const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[0.75rem] font-medium leading-5',
  {
    variants: {
      tone: {
        neutral: 'bg-sunken text-secondary',
        accent: 'bg-accent-soft text-accent',
        positive: 'bg-positive-soft text-positive',
        warning: 'bg-warning-soft text-warning',
        critical: 'bg-critical-soft text-critical',
      },
    },
    defaultVariants: { tone: 'neutral' },
  },
);

export function Badge({
  tone,
  className,
  ...props
}: HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}
