import React, { useRef, useState, useEffect, useMemo } from 'react';

interface VirtualContainerListProps<T> {
  items: T[];
  renderItem: (item: T) => React.ReactNode;
  itemHeight: number; // Approximate height of each container card
  maxHeight?: number; // Maximum height of the scroll container
  className?: string;
  gap?: number;
}

export function VirtualContainerList<T>({
  items,
  renderItem,
  itemHeight,
  maxHeight = 600, // standard max height
  className = '',
  gap = 16, // tailwind gap-4 is 16px
}: VirtualContainerListProps<T>) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [columns, setColumns] = useState(1);

  // Update column count based on window resize (matching Tailwind md breakpoint)
  useEffect(() => {
    const updateColumns = () => {
      setColumns(window.innerWidth >= 768 ? 2 : 1);
    };

    updateColumns();
    window.addEventListener('resize', updateColumns);
    return () => window.removeEventListener('resize', updateColumns);
  }, []);

  // Row calculations
  const rowCount = Math.ceil(items.length / columns);
  const totalHeight = rowCount * itemHeight + Math.max(0, rowCount - 1) * gap;

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    setScrollTop(e.currentTarget.scrollTop);
  };

  // Calculate visible range
  const rowHeightWithGap = itemHeight + gap;
  const startRow = Math.floor(scrollTop / rowHeightWithGap);
  const visibleRows = Math.ceil(maxHeight / rowHeightWithGap);

  // Add buffer rows for smoother scrolling
  const bufferRows = 2;
  const safeStartRow = Math.max(0, startRow - bufferRows);
  const safeEndRow = Math.min(rowCount, startRow + visibleRows + bufferRows);

  const startIndex = safeStartRow * columns;
  const endIndex = Math.min(items.length, safeEndRow * columns);

  const visibleItems = useMemo(() => {
    return items.slice(startIndex, endIndex);
  }, [items, startIndex, endIndex]);

  const paddingTop = safeStartRow * rowHeightWithGap;

  return (
    <div
      ref={containerRef}
      onScroll={handleScroll}
      className={`overflow-y-auto w-full ${className}`}
      style={{ maxHeight: items.length > 0 ? maxHeight : 'auto' }}
    >
      <div style={{ height: items.length > 0 ? totalHeight : 'auto', position: 'relative' }}>
        <div
          style={{
            position: items.length > 0 ? 'absolute' : 'static',
            top: 0,
            left: 0,
            right: 0,
            transform: items.length > 0 ? `translateY(${paddingTop}px)` : 'none',
          }}
          className="grid grid-cols-1 md:grid-cols-2 gap-4"
        >
          {visibleItems.map(renderItem)}
        </div>
      </div>
    </div>
  );
}
