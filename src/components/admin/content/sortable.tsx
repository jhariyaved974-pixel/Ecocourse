'use client';

// Drag-to-reorder lists for the CMS screens, built on @dnd-kit. Rows are moved
// with the pointer (drag the grip) or the keyboard (focus the grip, Space to
// pick up, arrow keys to move, Space to drop, Escape to cancel).

import * as React from 'react';
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
  type UniqueIdentifier,
} from '@dnd-kit/core';
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical } from 'lucide-react';
import { cn } from '@/lib/utils';

type SortableState = ReturnType<typeof useSortable>;

export interface DragHandleBinding {
  setActivator: SortableState['setActivatorNodeRef'];
  attributes: SortableState['attributes'];
  listeners: SortableState['listeners'];
  isDragging: boolean;
}

export function SortableList<T extends { id: string }>({
  items,
  onReorder,
  renderItem,
  itemLabel,
  label,
  className,
  itemClassName,
  disabled,
}: {
  items: T[];
  /** Called with the new id order after a drop that moved something. */
  onReorder: (ids: string[]) => void;
  renderItem: (item: T, handle: DragHandleBinding, index: number) => React.ReactNode;
  /** Human-readable name of a row, used in screen reader announcements. */
  itemLabel: (item: T) => string;
  label: string;
  className?: string;
  itemClassName?: string;
  disabled?: boolean;
}) {
  const id = React.useId();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const ids = items.map((i) => i.id);
  const nameOf = (uid: UniqueIdentifier) => {
    const item = items.find((i) => i.id === uid);
    return item ? `“${itemLabel(item)}”` : 'Item';
  };
  const positionOf = (uid: UniqueIdentifier) => `position ${ids.indexOf(String(uid)) + 1} of ${ids.length}`;
  const announcements: Announcements = {
    onDragStart: ({ active }) => `Picked up ${nameOf(active.id)} at ${positionOf(active.id)}.`,
    onDragOver: ({ active, over }) => (over ? `${nameOf(active.id)} moved to ${positionOf(over.id)}.` : `${nameOf(active.id)} is not over a list position.`),
    onDragEnd: ({ active, over }) => (over ? `${nameOf(active.id)} dropped at ${positionOf(over.id)}.` : `${nameOf(active.id)} dropped.`),
    onDragCancel: ({ active }) => `Moving ${nameOf(active.id)} was cancelled.`,
  };

  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const from = ids.indexOf(String(active.id));
    const to = ids.indexOf(String(over.id));
    if (from < 0 || to < 0) return;
    onReorder(arrayMove(ids, from, to));
  };

  return (
    <DndContext
      id={id}
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={onDragEnd}
      accessibility={{
        announcements,
        screenReaderInstructions: {
          draggable: 'To reorder, press Space or Enter to pick up this row, use the arrow keys to move it, then press Space or Enter again to drop it. Press Escape to cancel.',
        },
      }}
    >
      <SortableContext items={ids} strategy={verticalListSortingStrategy} disabled={disabled}>
        <ul className={className} aria-label={label}>
          {items.map((item, index) => (
            <SortableRow key={item.id} id={item.id} className={itemClassName}>
              {(handle) => renderItem(item, handle, index)}
            </SortableRow>
          ))}
        </ul>
      </SortableContext>
    </DndContext>
  );
}

function SortableRow({ id, className, children }: { id: string; className?: string; children: (handle: DragHandleBinding) => React.ReactNode }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id });
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn('relative', isDragging && 'z-20 opacity-90 shadow-lg', className)}
    >
      {children({ setActivator: setActivatorNodeRef, attributes, listeners, isDragging })}
    </li>
  );
}

/** The grip button that starts a drag. Always give it a label naming the row. */
export function DragHandle({ handle, label, className }: { handle: DragHandleBinding; label: string; className?: string }) {
  const { setActivator, attributes, listeners, isDragging } = handle;
  return (
    <button
      type="button"
      ref={setActivator}
      {...attributes}
      {...listeners}
      aria-label={label}
      className={cn(
        'grid size-8 shrink-0 cursor-grab touch-none place-items-center rounded-md text-muted transition-colors hover:bg-surface-2 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ink active:cursor-grabbing',
        isDragging && 'cursor-grabbing text-ink',
        className,
      )}
    >
      <GripVertical className="size-4" aria-hidden />
    </button>
  );
}

/**
 * Local order that overrides the server order until the server catches up:
 * after a successful reorder the refreshed props carry the new order, which
 * changes the key and drops the override; on failure call reset().
 */
export function useLocalOrder(serverIds: string[]) {
  const key = serverIds.join('|');
  const [local, setLocal] = React.useState<{ key: string; ids: string[] } | null>(null);
  const ids = local && local.key === key ? local.ids : serverIds;
  const set = React.useCallback((next: string[]) => setLocal({ key, ids: next }), [key]);
  const reset = React.useCallback(() => setLocal(null), []);
  return [ids, set, reset] as const;
}

/** Orders `items` by `ids`, appending any items whose id is not listed. */
export function orderBy<T extends { id: string }>(items: T[], ids: string[]): T[] {
  const byId = new Map(items.map((i) => [i.id, i]));
  const ordered = ids.flatMap((id) => {
    const item = byId.get(id);
    return item ? [item] : [];
  });
  const listed = new Set(ids);
  return [...ordered, ...items.filter((i) => !listed.has(i.id))];
}

/** Moves the element at `from` by `delta` positions (no-op when out of range). */
export function moveBy<T>(list: T[], from: number, delta: number): T[] {
  const to = from + delta;
  if (from < 0 || from >= list.length || to < 0 || to >= list.length) return list;
  return arrayMove(list, from, to);
}

/** Warns before leaving the page (reload, close, in-app links) while `dirty`. */
export function useUnsavedChangesWarning(dirty: boolean) {
  React.useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const anchor = (e.target as Element | null)?.closest?.('a[href]');
      if (!(anchor instanceof HTMLAnchorElement) || anchor.target === '_blank' || anchor.hasAttribute('download')) return;
      const url = new URL(anchor.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      if (url.pathname === window.location.pathname && url.search === window.location.search) return;
      if (!window.confirm('You have unsaved changes. Leave this page and discard them?')) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    document.addEventListener('click', onClick, true);
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      document.removeEventListener('click', onClick, true);
    };
  }, [dirty]);
}
