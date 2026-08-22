/**
 * Minimal typed event emitter used to decouple the model / tools from
 * the React UI. Listeners return an unsubscribe function.
 */
export type Listener<T> = (payload: T) => void;

export class Emitter<T> {
  private readonly listeners = new Set<Listener<T>>();

  on(listener: Listener<T>): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  emit(payload: T): void {
    for (const listener of [...this.listeners]) {
      listener(payload);
    }
  }

  clear(): void {
    this.listeners.clear();
  }
}
