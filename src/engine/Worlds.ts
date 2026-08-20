import { World, type WorldOptions } from './World';

export class Worlds {
  readonly list = new Map<string, World>();

  create(container: HTMLElement, options: WorldOptions = {}): World {
    const world = new World(container, options);

    if (this.list.has(world.id)) {
      world.dispose();

      throw new Error(`A world with ID ${world.id} already exists.`);
    }

    this.list.set(world.id, world);

    return world;
  }

  get(id: string): World {
    const world = this.list.get(id);

    if (!world) {
      throw new Error(`World "${id}" does not exist.`);
    }

    return world;
  }

  delete(world: World): void {
    if (!this.list.has(world.id)) {
      throw new Error(
        'The provided world is not managed by this Worlds instance.',
      );
    }

    world.dispose();

    this.list.delete(world.id);
  }

  update(delta: number): void {
    for (const world of this.list.values()) {
      world.update(delta);
    }
  }

  dispose(): void {
    for (const world of this.list.values()) {
      world.dispose();
    }

    this.list.clear();
  }
}
