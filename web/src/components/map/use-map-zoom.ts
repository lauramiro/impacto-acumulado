"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent, type RefObject } from "react";
import { IDENTITY, panBy, zoomAt, type View } from "@/lib/zoom";

/** Movement, in screen pixels, after which a press is a drag and not a click on a municipality. */
const DRAG_THRESHOLD = 6;
const WHEEL_STEP = 1.25;
const BUTTON_STEP = 2;
const HINT_MS = 1800;

type Pointer = { x: number; y: number };

/**
 * Zoom and pan for the map's SVG: buttons, Ctrl or ⌘ with the wheel (a plain wheel scrolls the
 * page), pinch on a touch screen, drag to pan. `resetKey` returns to the whole map when it changes
 * (a province picked in the table refits the projection itself).
 */
export function useMapZoom(svgRef: RefObject<SVGSVGElement | null>, width: number, height: number, resetKey: string | null) {
  const [state, setState] = useState<{ key: string | null; view: View }>({ key: resetKey, view: IDENTITY });
  const view = state.key === resetKey ? state.view : IDENTITY;
  // The handlers read the current view without being re-created on every zoom step.
  const viewRef = useRef(view);
  useLayoutEffect(() => {
    viewRef.current = view;
  }, [view]);
  const setView = useCallback((v: View) => setState({ key: resetKey, view: v }), [resetKey]);
  const [hint, setHint] = useState(false);

  const pointers = useRef(new Map<number, Pointer>());
  const start = useRef<{ x: number; y: number; dist: number } | null>(null);
  const dragged = useRef(false);
  const moved = useRef(0);

  /** Client coordinates to viewBox units. */
  const toView = useCallback(
    (clientX: number, clientY: number) => {
      const rect = svgRef.current?.getBoundingClientRect();
      if (!rect || rect.width === 0) return { x: 0, y: 0, scale: 1 };
      const scale = width / rect.width;
      return { x: (clientX - rect.left) * scale, y: (clientY - rect.top) * scale, scale };
    },
    [svgRef, width],
  );

  // The wheel listener is native: React's is passive, and a Ctrl+wheel must not zoom the page.
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    function onWheel(e: WheelEvent) {
      if (!e.ctrlKey && !e.metaKey) {
        setHint(true);
        clearTimeout(timer);
        timer = setTimeout(() => setHint(false), HINT_MS);
        return;
      }
      e.preventDefault();
      const p = toView(e.clientX, e.clientY);
      setView(zoomAt(viewRef.current, e.deltaY < 0 ? WHEEL_STEP : 1 / WHEEL_STEP, p.x, p.y, width, height));
    }
    svg.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      svg.removeEventListener("wheel", onWheel);
      clearTimeout(timer);
    };
  }, [svgRef, toView, setView, width, height]);

  const zoomBy = useCallback((factor: number) => setView(zoomAt(viewRef.current, factor, width / 2, height / 2, width, height)), [setView, width, height]);

  function onPointerDown(e: ReactPointerEvent<SVGSVGElement>) {
    // A finger on the whole map scrolls the page; once zoomed in, it pans the map.
    if (e.pointerType === "touch" && viewRef.current.k === 1 && pointers.current.size === 0) {
      pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      moved.current = 0;
      dragged.current = false;
      return;
    }
    if (e.pointerType === "mouse" && e.button !== 0) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 1) {
      moved.current = 0;
      dragged.current = false;
    }
    start.current = null;
  }

  function onPointerMove(e: ReactPointerEvent<SVGSVGElement>) {
    const prev = pointers.current.get(e.pointerId);
    if (!prev) return;
    const next = { x: e.clientX, y: e.clientY };
    pointers.current.set(e.pointerId, next);
    const list = [...pointers.current.values()];
    if (list.length === 2) {
      // Pinch: zoom by the change in distance between the fingers, around their midpoint.
      const [a, b] = list as [Pointer, Pointer];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const mid = toView((a.x + b.x) / 2, (a.y + b.y) / 2);
      if (start.current && start.current.dist > 0) {
        const zoomed = zoomAt(viewRef.current, dist / start.current.dist, mid.x, mid.y, width, height);
        setView(panBy(zoomed, mid.x - start.current.x, mid.y - start.current.y, width, height));
      }
      start.current = { x: mid.x, y: mid.y, dist };
      dragged.current = true;
      return;
    }
    if (list.length !== 1) return;
    moved.current += Math.hypot(next.x - prev.x, next.y - prev.y);
    if (moved.current > DRAG_THRESHOLD) dragged.current = true;
    // At the whole map there is nothing to pan; a touch there is the page's scroll.
    if (viewRef.current.k === 1) return;
    if (dragged.current) {
      // Capture keeps the drag going past the map's edge; a pointer the browser no longer
      // tracks throws, and that must not stop the pan.
      try {
        if (!svgRef.current?.hasPointerCapture(e.pointerId)) svgRef.current?.setPointerCapture(e.pointerId);
      } catch {}
      const { scale } = toView(0, 0);
      setView(panBy(viewRef.current, (next.x - prev.x) * scale, (next.y - prev.y) * scale, width, height));
    }
  }

  function onPointerEnd(e: ReactPointerEvent<SVGSVGElement>) {
    pointers.current.delete(e.pointerId);
    start.current = null;
    if (svgRef.current?.hasPointerCapture(e.pointerId)) svgRef.current.releasePointerCapture(e.pointerId);
  }

  /** A drag or a pinch ends without a click: it must not select the municipality under the pointer. */
  function onClickCapture(e: ReactMouseEvent) {
    if (dragged.current) {
      e.stopPropagation();
      e.preventDefault();
      dragged.current = false;
    }
  }

  return {
    view,
    zoomed: view.k > 1,
    hint,
    zoomIn: () => zoomBy(BUTTON_STEP),
    zoomOut: () => zoomBy(1 / BUTTON_STEP),
    reset: () => setView(IDENTITY),
    handlers: { onPointerDown, onPointerMove, onPointerUp: onPointerEnd, onPointerCancel: onPointerEnd, onClickCapture },
  };
}
