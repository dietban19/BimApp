import { Worlds } from './Worlds';

export class Engine {
  readonly worlds = new Worlds();

  private animationFrameId: number | null = null;

  private running = false;

  private previousTime = 0;

  start(): void {
    if (this.running) {
      return;
    }

    this.running = true;

    this.previousTime = performance.now();

    this.animationFrameId = requestAnimationFrame(this.update);
  }

  stop(): void {
    if (!this.running) {
      return;
    }

    this.running = false;

    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);

      this.animationFrameId = null;
    }
  }

  dispose(): void {
    this.stop();

    this.worlds.dispose();
  }

  private update = (time: number): void => {
    if (!this.running) {
      return;
    }

    const deltaMilliseconds = time - this.previousTime;

    this.previousTime = time;

    /*
     * Convert milliseconds -> seconds.
     *
     * Clamp unusually large deltas. This prevents huge jumps when
     * returning to a browser tab that was inactive.
     */
    const delta = Math.min(deltaMilliseconds / 1000, 0.1);

    this.worlds.update(delta);

    this.animationFrameId = requestAnimationFrame(this.update);
  };
}
