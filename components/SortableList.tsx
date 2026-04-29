"use client";

import { ReactNode } from "react";
import {
  DndContext,
  PointerSensor,
  KeyboardSensor,
  TouchSensor,
  useSensor,
  useSensors,
  closestCenter,
  type DragEndEvent,
} from "@dnd-kit/core";
import { restrictToVerticalAxis, restrictToParentElement } from "@dnd-kit/modifiers";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

type SortableListProps<TId extends string | number> = {
  ids: TId[];
  onReorder: (next: TId[]) => void;
  renderItem: (id: TId, dragHandle: SortableDragHandleProps) => ReactNode;
  className?: string;
};

export type SortableDragHandleProps = {
  attributes: ReturnType<typeof useSortable>["attributes"];
  listeners: ReturnType<typeof useSortable>["listeners"];
  isDragging: boolean;
};

export function SortableList<TId extends string | number>({
  ids,
  onReorder,
  renderItem,
  className,
}: SortableListProps<TId>) {
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 200, tolerance: 8 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const from = ids.indexOf(active.id as TId);
    const to = ids.indexOf(over.id as TId);
    if (from < 0 || to < 0) return;
    onReorder(arrayMove(ids, from, to));
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
      modifiers={[restrictToVerticalAxis, restrictToParentElement]}
    >
      <SortableContext items={ids as unknown as (string | number)[]} strategy={verticalListSortingStrategy}>
        <div className={className}>
          {ids.map((id) => (
            <SortableItem key={String(id)} id={id}>
              {(handleProps) => renderItem(id, handleProps)}
            </SortableItem>
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}

function SortableItem<TId extends string | number>({
  id,
  children,
}: {
  id: TId;
  children: (handleProps: SortableDragHandleProps) => ReactNode;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: id as unknown as string | number });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 30 : undefined,
    opacity: isDragging ? 0.92 : 1,
    boxShadow: isDragging
      ? "0 18px 40px -12px rgba(0,0,0,0.6), 0 4px 12px rgba(0,0,0,0.45)"
      : undefined,
  } as const;

  return (
    <div ref={setNodeRef} style={style}>
      {children({ attributes, listeners, isDragging })}
    </div>
  );
}

export function DragHandle({
  attributes,
  listeners,
  className,
  ariaLabel = "Drag to reorder",
}: SortableDragHandleProps & { className?: string; ariaLabel?: string }) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      className={
        className ??
        "flex items-center justify-center h-9 w-9 rounded-lg border border-white/8 bg-white/[0.04] text-app-secondary hover:text-white hover:bg-white/[0.07] transition-colors touch-none cursor-grab active:cursor-grabbing"
      }
      {...attributes}
      {...listeners}
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-[18px] w-[18px]"
        aria-hidden
      >
        <circle cx="9" cy="6" r="1" />
        <circle cx="15" cy="6" r="1" />
        <circle cx="9" cy="12" r="1" />
        <circle cx="15" cy="12" r="1" />
        <circle cx="9" cy="18" r="1" />
        <circle cx="15" cy="18" r="1" />
      </svg>
    </button>
  );
}
