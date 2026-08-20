import { useEffect, useRef } from 'react';

import { Engine } from './engine/Engine';

import { GridComponent } from './components/GridComponent';
import { OrbitControlsComponent } from './components/OrbitControlsComponent';
import { RaycastComponent } from './components/RaycastComponent';

import './App.css';

function App() {
  const containerRef = useRef<HTMLDivElement>(null);

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
    console.log(world);

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

    // --------------------------------
    // Start application
    // --------------------------------

    engine.start();

    // --------------------------------
    // Cleanup
    // --------------------------------

    return () => {
      engine.dispose();
    };
  }, []);

  return (
    <main className="app">
      <div ref={containerRef} className="three-container" />
    </main>
  );
}

export default App;
