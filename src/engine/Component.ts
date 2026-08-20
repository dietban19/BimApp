import type { World } from './World';

export abstract class Component {
  enabled = true;

  constructor(protected readonly world: World) {}

  /**
   * Called once when the component is added to a world.
   */
  init(): void {}

  /**
   * Called every frame by the world.
   *
   * delta is measured in seconds.
   */
  update(_delta: number): void {}

  /**
   * Called whenever the world's viewport changes size.
   */
  resize(_width: number, _height: number): void {}

  /**
   * Called when the component or world is destroyed.
   */
  dispose(): void {}
}

export type ComponentConstructor<
  T extends Component,
  Args extends unknown[] = unknown[],
> = new (world: World, ...args: Args) => T;
