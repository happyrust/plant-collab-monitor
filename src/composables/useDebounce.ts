import { ref, watch, type Ref } from 'vue';

export function useDebounce<T>(source: Ref<T>, delayMs = 300): Ref<T> {
  const debounced = ref(source.value) as Ref<T>;
  let timer: ReturnType<typeof setTimeout> | null = null;

  watch(source, (v) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => { debounced.value = v; }, delayMs);
  });

  return debounced;
}

export function useDebouncedFn<T extends (...args: unknown[]) => unknown>(fn: T, delayMs = 300): T {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return ((...args: unknown[]) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delayMs);
  }) as T;
}

export function useThrottledFn<T extends (...args: unknown[]) => unknown>(fn: T, intervalMs = 300): T {
  let last = 0;
  return ((...args: unknown[]) => {
    const now = Date.now();
    if (now - last >= intervalMs) {
      last = now;
      fn(...args);
    }
  }) as T;
}
