import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import './App.css';

function App() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;

    if (!container) return;

    // --------------------------------
    // Scene
    // --------------------------------

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x111111);

    // --------------------------------
    // Camera
    // --------------------------------

    const camera = new THREE.PerspectiveCamera(
      60,
      container.clientWidth / container.clientHeight,
      0.1,
      1000,
    );

    camera.position.set(6, 6, 6);
    camera.lookAt(0, 0, 0);

    // --------------------------------
    // Renderer
    // --------------------------------

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
    });

    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(container.clientWidth, container.clientHeight);

    container.appendChild(renderer.domElement);

    // --------------------------------
    // Controls
    // --------------------------------

    const controls = new OrbitControls(camera, renderer.domElement);

    controls.enableDamping = true;
    controls.target.set(0, 0, 0);

    // --------------------------------
    // Grid
    // --------------------------------

    const GRID_SIZE = 100;
    const GRID_DIVISIONS = 100;
    const CELL_SIZE = GRID_SIZE / GRID_DIVISIONS;

    const grid = new THREE.GridHelper(GRID_SIZE, GRID_DIVISIONS);

    scene.add(grid);

    // --------------------------------
    // Axes
    // --------------------------------

    const axes = new THREE.AxesHelper(15);

    scene.add(axes);

    // --------------------------------
    // Invisible plane for raycasting
    // --------------------------------

    const raycastPlaneGeometry = new THREE.PlaneGeometry(GRID_SIZE, GRID_SIZE);

    const raycastPlaneMaterial = new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
    });

    const raycastPlane = new THREE.Mesh(
      raycastPlaneGeometry,
      raycastPlaneMaterial,
    );

    // PlaneGeometry starts in the XY plane.
    // Rotate it so it lies on the XZ plane.
    raycastPlane.rotation.x = -Math.PI / 2;

    scene.add(raycastPlane);

    // --------------------------------
    // Highlight cell
    // --------------------------------

    const highlightGeometry = new THREE.PlaneGeometry(CELL_SIZE, CELL_SIZE);

    const highlightMaterial = new THREE.MeshBasicMaterial({
      color: 0xffff00,
      transparent: true,
      opacity: 0.35,
      side: THREE.DoubleSide,
    });

    const highlight = new THREE.Mesh(highlightGeometry, highlightMaterial);

    highlight.rotation.x = -Math.PI / 2;

    // Move slightly above grid to avoid z-fighting.
    highlight.position.y = 0.01;

    // Hidden until mouse enters the grid.
    highlight.visible = false;

    scene.add(highlight);

    // --------------------------------
    // Raycaster
    // --------------------------------

    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    const handlePointerMove = (event: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();

      // Convert mouse position into normalized device coordinates.
      mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;

      mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(mouse, camera);

      const intersections = raycaster.intersectObject(raycastPlane);

      if (intersections.length === 0) {
        highlight.visible = false;
        return;
      }

      const point = intersections[0].point;

      // --------------------------------
      // Convert hit position -> grid cell
      // --------------------------------

      const cellX = Math.floor(point.x / CELL_SIZE) * CELL_SIZE + CELL_SIZE / 2;

      const cellZ = Math.floor(point.z / CELL_SIZE) * CELL_SIZE + CELL_SIZE / 2;

      highlight.position.set(cellX, 0.01, cellZ);

      highlight.visible = true;
    };

    const handlePointerLeave = () => {
      highlight.visible = false;
    };

    renderer.domElement.addEventListener('pointermove', handlePointerMove);

    renderer.domElement.addEventListener('pointerleave', handlePointerLeave);

    // --------------------------------
    // Resize
    // --------------------------------

    const handleResize = () => {
      const width = container.clientWidth;
      const height = container.clientHeight;

      camera.aspect = width / height;
      camera.updateProjectionMatrix();

      renderer.setSize(width, height);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    };

    window.addEventListener('resize', handleResize);

    // --------------------------------
    // Animation
    // --------------------------------

    let animationFrameId: number;

    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);

      controls.update();

      renderer.render(scene, camera);
    };

    animate();

    // --------------------------------
    // Cleanup
    // --------------------------------

    return () => {
      cancelAnimationFrame(animationFrameId);

      window.removeEventListener('resize', handleResize);

      renderer.domElement.removeEventListener('pointermove', handlePointerMove);

      renderer.domElement.removeEventListener(
        'pointerleave',
        handlePointerLeave,
      );

      controls.dispose();

      raycastPlaneGeometry.dispose();
      raycastPlaneMaterial.dispose();

      highlightGeometry.dispose();
      highlightMaterial.dispose();

      renderer.dispose();

      if (renderer.domElement.parentElement === container) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []);

  return (
    <main className="app">
      <div ref={containerRef} className="three-container" />
    </main>
  );
}

export default App;
