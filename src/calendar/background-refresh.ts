/** Coalesces quiet reads and fences responses across mutations, navigation, and disposal. */
export function createBackgroundRefresh<T>(input: {
  canRefresh(): boolean;
  load(signal: AbortSignal): Promise<T>;
  apply(value: T): void;
  failed(): void;
}) {
  let current: AbortController | null = null;
  let disposed = false;
  const cancel = () => { current?.abort(); current = null; };
  return {
    cancel,
    dispose() { disposed = true; cancel(); },
    async tick() {
      if (disposed || current || !input.canRefresh()) return;
      const controller = new AbortController(); current = controller;
      const active = () => !disposed && !controller.signal.aborted && current === controller && input.canRefresh();
      try { const value = await input.load(controller.signal); if (active()) input.apply(value); }
      catch { if (active()) input.failed(); }
      finally { if (current === controller) current = null; }
    },
  };
}
