import * as React from "react";
import {
  createViewportRuntime,
  type SceneAdapter,
  type ViewportRuntime,
  type ViewportRuntimeOptions,
} from "../runtime/createViewportRuntime.ts";

export interface UseViewportRuntimeOptions extends Omit<ViewportRuntimeOptions, "adapter"> {
  /** Creates the domain scene adapter once per mount. */
  createAdapter: () => SceneAdapter;
  /** Called once the runtime exists (first fit, initial state sync). */
  onReady?: (runtime: ViewportRuntime) => void;
  /** Set false to skip mounting (for example when a 2D fallback is active). */
  enabled?: boolean;
}

export interface UseViewportRuntimeResult {
  runtimeRef: React.RefObject<ViewportRuntime | null>;
  /** Message when WebGL initialization failed; null while healthy. */
  error: string | null;
}

/**
 * Owns the viewport runtime lifecycle for a canvas inside a sized container.
 * The runtime is created on mount, resized with the container, and disposed on unmount.
 */
export function useViewportRuntime(
  canvasRef: React.RefObject<HTMLCanvasElement | null>,
  containerRef: React.RefObject<HTMLElement | null>,
  options: UseViewportRuntimeOptions
): UseViewportRuntimeResult {
  const runtimeRef = React.useRef<ViewportRuntime | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const optionsRef = React.useRef(options);
  optionsRef.current = options;
  const enabled = options.enabled ?? true;

  React.useEffect(() => {
    if (!enabled) return;
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    const { createAdapter, onReady, ...runtimeOptions } = optionsRef.current;
    let runtime: ViewportRuntime;
    try {
      runtime = createViewportRuntime(canvas, container, { ...runtimeOptions, adapter: createAdapter() });
    } catch (err) {
      setError(err instanceof Error ? err.message : "WebGL context could not be created.");
      return;
    }
    runtimeRef.current = runtime;
    setError(null);
    onReady?.(runtime);
    return () => {
      runtime.dispose();
      runtimeRef.current = null;
    };
  }, [enabled, canvasRef, containerRef]);

  return { runtimeRef, error };
}
