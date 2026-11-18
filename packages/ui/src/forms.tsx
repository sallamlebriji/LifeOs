/** Additional form controls: textarea, native select, segmented control, check circle. */
import { Check } from 'lucide-react';
import {
  forwardRef,
  type ButtonHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { cn } from './cn';

const fieldBase =
  'w-full rounded-md border border-separator bg-raised px-3.5 text-[0.9375rem] text-primary outline-none transition-[border-color,box-shadow] duration-[var(--duration-fast)] placeholder:text-tertiary focus:border-accent focus:ring-[3px] focus:ring-accent/25 aria-[invalid=true]:border-critical disabled:opacity-50';

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => (
    <textarea ref={ref} className={cn(fieldBase, 'min-h-[88px] resize-y py-2.5 leading-relaxed', className)} {...props} />
  ),
);
Textarea.displayName = 'Textarea';

/** Native select: platform pickers on touch devices, full keyboard support for free. */
export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, children, ...props }, ref) => (
    <select
      ref={ref}
      className={cn(
        fieldBase,
        'h-11 appearance-none bg-[length:16px] bg-[right_12px_center] bg-no-repeat pr-9',
        "bg-[url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%238e8e93' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")]",
        className,
      )}
      {...props}
    >
      {children}
    </select>
  ),
);
Select.displayName = 'Select';

/** Segmented control (radio group semantics). */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
  className,
  size = 'md',
}: {
  value: T;
  onChange: (value: T) => void;
  options: ReadonlyArray<{ value: T; label: ReactNode }>;
  label: string;
  className?: string;
  size?: 'sm' | 'md';
}) {
  return (
    <div role="radiogroup" aria-label={label} className={cn('inline-flex rounded-md bg-sunken p-0.5', className)}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.value)}
            className={cn(
              'flex-1 whitespace-nowrap rounded-[calc(var(--ds-radius-md)-2px)] font-medium transition-[background-color,color,box-shadow] duration-[var(--duration-fast)] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-accent/40',
              size === 'sm' ? 'h-7 px-2.5 text-[0.8125rem]' : 'h-9 px-3.5 text-[0.875rem]',
              active ? 'bg-raised text-primary shadow-sm' : 'text-secondary hover:text-primary',
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** Round completion toggle with a 44pt hit area around a 22pt circle. */
export function CheckCircle({
  checked,
  label,
  color,
  className,
  ...props
}: Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'role' | 'aria-checked'> & {
  checked: boolean;
  label: string;
  color?: string | null;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      className={cn(
        'group -m-2.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-full focus-visible:outline-none',
        className,
      )}
      {...props}
    >
      <span
        aria-hidden
        className={cn(
          'flex h-[22px] w-[22px] items-center justify-center rounded-full border-[1.5px] transition-[background-color,border-color] duration-[var(--duration-fast)] group-focus-visible:ring-[3px] group-focus-visible:ring-accent/40',
          checked ? 'border-transparent' : 'border-[color:var(--content-tertiary)] group-hover:border-[color:var(--content-secondary)]',
        )}
        style={checked ? { background: color ?? 'var(--signal-positive)' } : undefined}
      >
        {checked ? <Check className="h-3.5 w-3.5 text-white" strokeWidth={3} /> : null}
      </span>
    </button>
  );
}
