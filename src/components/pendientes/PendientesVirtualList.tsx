import React, { useCallback, useEffect, useRef, useState } from 'react';

const DEFAULT_ROW = 132;

export interface PendientesVirtualListProps<T> {
  items: T[];
  rowHeight?: number;
  className?: string;
  empty?: React.ReactNode;
  renderRow: (item: T, index: number) => React.ReactNode;
}

function PendientesVirtualList<T>({
  items,
  rowHeight = DEFAULT_ROW,
  className = '',
  empty,
  renderRow,
}: PendientesVirtualListProps<T>) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportH, setViewportH] = useState(480);

  const onScroll = useCallback(() => {
    setScrollTop(scrollRef.current?.scrollTop ?? 0);
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setViewportH(el.clientHeight));
    ro.observe(el);
    setViewportH(el.clientHeight);
    return () => ro.disconnect();
  }, []);

  if (items.length === 0) {
    return <div className={className}>{empty ?? null}</div>;
  }

  if (items.length <= 100) {
    return (
      <div ref={scrollRef} className={`overflow-y-auto overscroll-contain ${className}`}>
        <div className="space-y-2.5 p-0.5">
          {items.map((item, i) => (
            <div key={i}>{renderRow(item, i)}</div>
          ))}
        </div>
      </div>
    );
  }

  const totalH = items.length * rowHeight;
  const start = Math.max(0, Math.floor(scrollTop / rowHeight) - 3);
  const visibleCount = Math.ceil(viewportH / rowHeight) + 6;
  const end = Math.min(items.length, start + visibleCount);
  const offsetY = start * rowHeight;

  return (
    <div
      ref={scrollRef}
      onScroll={onScroll}
      className={`overflow-y-auto overscroll-contain ${className}`}
    >
      <div style={{ height: totalH, position: 'relative' }}>
        <div style={{ transform: `translateY(${offsetY}px)` }} className="space-y-2.5 px-0.5">
          {items.slice(start, end).map((item, i) => (
            <div key={start + i} style={{ minHeight: rowHeight }}>
              {renderRow(item, start + i)}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default PendientesVirtualList;
