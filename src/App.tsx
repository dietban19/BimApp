import { useEffect, useRef, useState } from 'react';

import { Engine } from './engine/Engine';

import { GridComponent } from './components/GridComponent';
import { OrbitControlsComponent } from './components/OrbitControlsComponent';
import { RaycastComponent } from './components/RaycastComponent';
import { LightingComponent } from './components/LightingComponent';
import { FloorPlanComponent } from './components/FloorPlanComponent';
import { EditorComponent } from './components/EditorComponent';

import { EditorOverlay } from './ui/EditorOverlay';

import './App.css';

function App() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [editor, setEditor] = useState<EditorComponent | null>(null);

  useEffect(() => {
    const container = containerRef.current;

    if (!container) {
      return;
    }

    // --------------------------------
    // Engine
    // --------------------------------

    const engine = new Engine();

    // --------------------------------
    // World
    // --------------------------------

    const world = engine.worlds.create(container, {
      background: 0x111111,
      fov: 60,
      near: 0.1,
      far: 1000,
    });

    // --------------------------------
    // World components
    // --------------------------------

    /*
     * GridComponent uses RaycastComponent,
     * so raycasting is registered first.
     */
    world.add(RaycastComponent);

    world.add(GridComponent, {
      size: 100,
      divisions: 100,
      showAxes: true,
    });

    world.add(OrbitControlsComponent, {
      enableDamping: true,
    });

    world.add(LightingComponent);

    /*
     * FloorPlanComponent is added before the EditorComponent so the
     * editor can wire the shared model into it during init.
     */
    world.add(FloorPlanComponent);

    const editorComponent = world.add(EditorComponent);

    setEditor(editorComponent);

    // --------------------------------
    // Start application
    // --------------------------------

    engine.start();

    // --------------------------------
    // Cleanup
    // --------------------------------

    return () => {
      setEditor(null);
      engine.dispose();
    };
  }, []);

  return (
    <main className="app">
      <div ref={containerRef} className="three-container" />
      {editor && <EditorOverlay editor={editor} />}
    </main>
  );
}

export default App;
