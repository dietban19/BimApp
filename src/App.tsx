import { useEffect, useRef, useState } from 'react';

import { Engine } from './engine/Engine';

import { GridComponent } from './components/GridComponent';
import { OrbitControlsComponent } from './components/OrbitControlsComponent';
import { RaycastComponent } from './components/RaycastComponent';
import { RoomComponent } from './components/RoomComponent';
import { WallToolComponent } from './components/WallToolComponent';
import { UIOverlay } from './ui/UIOverlay';

import './App.css';

function App() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [wallTool, setWallTool] = useState<WallToolComponent | null>(null);
  const [roomTool, setRoomTool] = useState<RoomComponent | null>(null);

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

    const wallToolComp = world.add(WallToolComponent);
    setWallTool(wallToolComp);

    /*
     * RoomComponent derives rooms from the walls owned by the wall tool,
     * so it is registered after it.
     */
    const roomComp = world.add(RoomComponent);
    setRoomTool(roomComp);

    // world.addTestMesh(5.237499999999999, 5.4625, 'red');
    // world.addTestMesh(0.6124999999999998, 0.5374999999999996, 'green');
    // world.addTestMesh(5.387499999999999, 5.4625, 'orange');
    // world.addTestMesh(0.7625, 0.5374999999999996, 'blue');
    world.addTestMesh(0.35, 0.19999999999999998, 'red');
    world.addTestMesh(3.5, 3.8, 'red');
    // world.addTestMesh(3.2, 0.5, 'red');
    // world.addTestMesh(3.2, 3.5, 'blue');
    //
    // world.addTestMesh(5.237499999999999, 0.5375, 'red');

    // world.addTestMesh(5.237499999999999, 5.4625, 'red');

    // --------------------------------
    // Start application
    // --------------------------------

    engine.start();

    // --------------------------------
    // Cleanup
    // --------------------------------

    return () => {
      setWallTool(null);
      setRoomTool(null);
      engine.dispose();
    };
  }, []);

  return (
    <main className="app-shell">
      <div
        ref={containerRef}
        className="three-container"
        aria-label="3D architectural workspace"
      />
      <UIOverlay wallTool={wallTool} roomTool={roomTool} />
    </main>
  );
}

export default App;
