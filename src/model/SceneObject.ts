/**
 * Base class for anything that lives in the editor's model layer.
 *
 * A SceneObject is a piece of application/domain data (a wall, a room,
 * a door in the future...). It is deliberately independent of the
 * engine Component lifecycle so the model can be reasoned about, saved,
 * or validated without any rendering concerns.
 */
export abstract class SceneObject {
  readonly id: string = crypto.randomUUID();

  /**
   * Human readable object type, e.g. "Wall", "Room".
   * Useful for UI panels and debugging.
   */
  abstract readonly type: string;

  name: string;

  constructor(name?: string) {
    this.name = name ?? '';
  }

  /**
   * Release any resources owned by this object.
   * Subclasses that own GPU resources must override this.
   */
  dispose(): void {}
}
