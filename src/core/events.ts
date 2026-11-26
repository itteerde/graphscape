type Handler<T> = (payload: T) => void;

/** Minimal typed event emitter. */
export class Emitter<E> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private map = new Map<keyof E, Set<Handler<any>>>();

  on<K extends keyof E>(type: K, fn: Handler<E[K]>): () => void {
    let set = this.map.get(type);
    if (!set) {
      set = new Set();
      this.map.set(type, set);
    }
    set.add(fn);
    return () => this.off(type, fn);
  }

  off<K extends keyof E>(type: K, fn: Handler<E[K]>): void {
    this.map.get(type)?.delete(fn);
  }

  emit<K extends keyof E>(type: K, payload: E[K]): void {
    const set = this.map.get(type);
    if (set) for (const fn of [...set]) fn(payload);
  }

  clear(): void {
    this.map.clear();
  }
}
