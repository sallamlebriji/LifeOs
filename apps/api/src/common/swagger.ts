import { applyDecorators } from '@nestjs/common';
import { ApiBody, ApiQuery } from '@nestjs/swagger';
import { z } from '@lifeos/validation';

type JsonSchema = Record<string, unknown>;

function toJsonSchema(schema: z.ZodType): JsonSchema {
  return z.toJSONSchema(schema, { io: 'input', unrepresentable: 'any' }) as JsonSchema;
}

/** Documents a request body in OpenAPI straight from the shared Zod schema. */
export function ApiZodBody(schema: z.ZodType, description?: string) {
  const json = toJsonSchema(schema);
  delete json.$schema;
  return ApiBody({ schema: json, ...(description ? { description } : {}) });
}

/** Documents query parameters from a Zod object schema. */
export function ApiZodQuery(schema: z.ZodObject) {
  const json = toJsonSchema(schema) as { properties?: Record<string, JsonSchema>; required?: string[] };
  const decorators = Object.entries(json.properties ?? {}).map(([name, prop]) =>
    ApiQuery({ name, required: json.required?.includes(name) ?? false, schema: prop }),
  );
  return applyDecorators(...decorators);
}
