/** SQL literal helpers for generated seed files. */

export function sqlStr(value: string | null | undefined): string {
  if (value == null) return "null";
  return `'${value.replace(/'/g, "''")}'`;
}

export function sqlBool(value: boolean): string {
  return value ? "true" : "false";
}

export function sqlJson(value: unknown): string {
  return `'${JSON.stringify(value).replace(/'/g, "''")}'::jsonb`;
}

export function sqlUuidArray(ids: string[]): string {
  if (!ids.length) return "'{}'::uuid[]";
  return `array[${ids.map(sqlStr).join(", ")}]::uuid[]`;
}

export function sqlTextArray(items: string[]): string {
  if (!items.length) return "'{}'::text[]";
  return `array[${items.map(sqlStr).join(", ")}]::text[]`;
}
