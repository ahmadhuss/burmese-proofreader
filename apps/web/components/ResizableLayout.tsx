"use client";

import { useState, useRef, useCallback, ReactNode, useEffect } from "react";

interface Props {
  left: ReactNode;
  right: ReactNode;
  defaultLeftWidth?: number;
  minLeft?: number;
  minRight?: number;
}

const STORAGE_KEY = "resizable_left_width";

export default function ResizableLayout({ left, right, defaultLeftWidth = 320, minLeft = 220, minRight = 380 }: Props) {
  const [leftWidth, setLeftWidth] = useState(defaultLeftWidth);
  const [isMobile, setIsMobile] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 1024);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) setLeftWidth(parseInt(stored, 10));
  }, []);

  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      isDragging.current = true;
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";

      const onMouseMove = (ev: MouseEvent) => {
        if (!isDragging.current || !containerRef.current) return;
        const rect = containerRef.current.getBoundingClientRect();
        const newWidth = ev.clientX - rect.left;
        const maxWidth = rect.width - minRight - 16;
        setLeftWidth(Math.max(minLeft, Math.min(maxWidth, newWidth)));
      };

      const onMouseUp = (ev: MouseEvent) => {
        isDragging.current = false;
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        if (containerRef.current) {
          const rect = containerRef.current.getBoundingClientRect();
          const newWidth = ev.clientX - rect.left;
          const maxWidth = rect.width - minRight - 16;
          const clamped = Math.max(minLeft, Math.min(maxWidth, newWidth));
          localStorage.setItem(STORAGE_KEY, String(clamped));
        }
        document.removeEventListener("mousemove", onMouseMove);
        document.removeEventListener("mouseup", onMouseUp);
      };

      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
    },
    [minLeft, minRight]
  );

  // Mobile: stack vertically
  if (isMobile) {
    return (
      <div className="flex flex-col w-full gap-4">
        <div>{left}</div>
        <div>{right}</div>
      </div>
    );
  }

  // Desktop: resizable side-by-side
  return (
    <div ref={containerRef} className="flex flex-1 items-start w-full">
      <div style={{ width: leftWidth, minWidth: leftWidth }} className="shrink-0">
        {left}
      </div>

      <div onMouseDown={onMouseDown} className="w-4 shrink-0 self-stretch flex items-center justify-center cursor-col-resize group">
        <div className="relative w-px self-stretch bg-gray-200 group-hover:bg-blue-300 transition-colors duration-150">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[5px] h-9 rounded-full bg-blue-200 group-hover:bg-blue-400 group-active:bg-blue-500 transition-colors duration-150 shadow-sm" />
        </div>
      </div>

      <div className="flex-1 min-w-0">{right}</div>
    </div>
  );
}
