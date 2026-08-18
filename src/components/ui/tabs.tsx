'use client';

import { useId, useRef, useState } from 'react';
import type * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * Tabs, following the WAI-ARIA tabs pattern.
 *
 * Several pages fake this with buttons and a conditional. The difference that
 * matters is keyboard behaviour: arrow keys move between tabs, Home/End jump to
 * the ends, and only the active tab is in the tab order — so Tab moves *out* of
 * the tab list into the panel rather than walking through every tab.
 */

export interface TabItem {
  id: string;
  label: string;
  /** Optional count shown as a pill, e.g. unread items. */
  badge?: number;
  content: React.ReactNode;
}

export function Tabs({ items, defaultId }: { items: TabItem[]; defaultId?: string }) {
  const baseId = useId();
  const [active, setActive] = useState(defaultId ?? items[0]?.id ?? '');
  const tabRefs = useRef(new Map<string, HTMLButtonElement>());

  function onKeyDown(event: React.KeyboardEvent) {
    const index = items.findIndex((item) => item.id === active);
    if (index < 0) return;

    let nextIndex: number | null = null;
    if (event.key === 'ArrowRight') nextIndex = (index + 1) % items.length;
    else if (event.key === 'ArrowLeft') nextIndex = (index - 1 + items.length) % items.length;
    else if (event.key === 'Home') nextIndex = 0;
    else if (event.key === 'End') nextIndex = items.length - 1;

    if (nextIndex === null) return;

    event.preventDefault();
    const next = items[nextIndex];
    if (!next) return;

    setActive(next.id);
    tabRefs.current.get(next.id)?.focus();
  }

  const activeItem = items.find((item) => item.id === active);

  return (
    <div className="flex flex-col gap-4">
      <div
        role="tablist"
        onKeyDown={onKeyDown}
        className="border-line-medium flex gap-1 overflow-x-auto border-b"
      >
        {items.map((item) => {
          const selected = item.id === active;
          return (
            <button
              key={item.id}
              ref={(el) => {
                if (el) tabRefs.current.set(item.id, el);
                else tabRefs.current.delete(item.id);
              }}
              role="tab"
              id={`${baseId}-tab-${item.id}`}
              aria-selected={selected}
              aria-controls={`${baseId}-panel-${item.id}`}
              // Roving tabindex: only the selected tab is reachable by Tab.
              tabIndex={selected ? 0 : -1}
              onClick={() => setActive(item.id)}
              className={cn(
                'relative min-h-11 shrink-0 px-3.5 text-[13.5px] font-semibold whitespace-nowrap transition-colors',
                selected ? 'text-primary' : 'text-ink-muted hover:text-ink-secondary'
              )}
            >
              <span className="flex items-center gap-1.5">
                {item.label}
                {item.badge !== undefined && item.badge > 0 && (
                  <span className="bg-primary-light text-primary rounded-full px-1.5 py-0.5 text-[10.5px] font-bold">
                    {item.badge}
                  </span>
                )}
              </span>
              {selected && <span className="bg-primary absolute inset-x-2 -bottom-px h-0.5 rounded-full" />}
            </button>
          );
        })}
      </div>

      {activeItem && (
        <div
          role="tabpanel"
          id={`${baseId}-panel-${activeItem.id}`}
          aria-labelledby={`${baseId}-tab-${activeItem.id}`}
          tabIndex={0}
          className="outline-none"
        >
          {activeItem.content}
        </div>
      )}
    </div>
  );
}
