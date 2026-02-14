"use client";

import { useCallback, useRef, useState } from "react";

export interface TouchPoint {
  id: number;
  x: number; // 0-1 normalized
  y: number; // 0-1 normalized
}

/**
 * Tracks all active touches on a target element, returning normalized (0-1)
 * coordinates relative to the element's bounding box.
 */
export function useMultiTouch() {
  const [touches, setTouches] = useState<TouchPoint[]>([]);
  const touchesRef = useRef<TouchPoint[]>([]);

  const normalizeTouches = useCallback(
    (e: React.TouchEvent<HTMLElement>) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const pts: TouchPoint[] = [];
      for (let i = 0; i < e.touches.length; i++) {
        const t = e.touches[i];
        pts.push({
          id: t.identifier,
          x: Math.max(0, Math.min(1, (t.clientX - rect.left) / rect.width)),
          y: Math.max(0, Math.min(1, (t.clientY - rect.top) / rect.height)),
        });
      }
      touchesRef.current = pts;
      setTouches(pts);
    },
    [],
  );

  const onTouchStart = useCallback(
    (e: React.TouchEvent<HTMLElement>) => {
      e.preventDefault();
      normalizeTouches(e);
    },
    [normalizeTouches],
  );

  const onTouchMove = useCallback(
    (e: React.TouchEvent<HTMLElement>) => {
      e.preventDefault();
      normalizeTouches(e);
    },
    [normalizeTouches],
  );

  const onTouchEnd = useCallback(
    (e: React.TouchEvent<HTMLElement>) => {
      e.preventDefault();
      normalizeTouches(e);
    },
    [normalizeTouches],
  );

  const handlers = { onTouchStart, onTouchMove, onTouchEnd };

  return { touches, touchesRef, handlers };
}
