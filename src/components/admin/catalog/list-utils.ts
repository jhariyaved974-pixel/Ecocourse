/** Returns a copy of `items` with the element at `from` moved to `to` (no-op when out of range). */
export function moveItem<T>(items: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= items.length || to >= items.length) return items;
  const next = [...items];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

let counter = 0;
/** Client-side key for rows that do not exist in the database yet. */
export function newKey(prefix = 'new'): string {
  counter += 1;
  return `${prefix}-${Date.now().toString(36)}-${counter}-${Math.random().toString(36).slice(2, 8)}`;
}
