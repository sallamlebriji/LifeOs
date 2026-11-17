import { BadRequestException, type PipeTransform } from '@nestjs/common';
import { type z } from '@lifeos/validation';

/** Groups Zod issues by dotted path, e.g. { "password": ["Use at least 10 characters"] }. */
export function formatZodIssues(error: z.ZodError): Record<string, string[]> {
  const issues: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = issue.path.length ? issue.path.join('.') : '_root';
    (issues[key] ??= []).push(issue.message);
  }
  return issues;
}

/**
 * Validates and transforms input with a shared Zod schema (single source of
 * truth with the web/mobile clients). Unknown keys are stripped by Zod objects.
 */
export class ZodValidationPipe<S extends z.ZodType> implements PipeTransform<unknown, z.output<S>> {
  constructor(private readonly schema: S) {}

  transform(value: unknown): z.output<S> {
    const result = this.schema.safeParse(value ?? {});
    if (!result.success) {
      throw new BadRequestException({
        statusCode: 400,
        error: 'Bad Request',
        message: 'Validation failed',
        issues: formatZodIssues(result.error),
      });
    }
    return result.data;
  }
}
