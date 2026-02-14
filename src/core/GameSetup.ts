import * as THREE from 'three';

/**
 * Configuration for creating a game scene.
 */
export interface GameSceneConfig {
    /** Canvas width. Defaults to window.innerWidth. */
    width?: number;
    /** Canvas height. Defaults to window.innerHeight. */
    height?: number;
    /** Max pixel ratio. Defaults to 2. */
    maxPixelRatio?: number;
    /** Background sky color. Defaults to 0x87ceeb. */
    skyColor?: number;
    /** Fog density. Defaults to 0.003. */
    fogDensity?: number;
    /** Sun intensity. Defaults to 1.5. */
    sunIntensity?: number;
    /** Sun position. Defaults to (30, 50, 20). */
    sunPosition?: { x: number; y: number; z: number };
    /** Ambient light intensity. Defaults to 0.8. */
    ambientIntensity?: number;
    /** Ambient light color. Defaults to 0x404060. */
    ambientColor?: number;
}

/**
 * The set of core Three.js objects created by createGameScene().
 */
export interface GameSceneResult {
    scene: THREE.Scene;
    renderer: THREE.WebGLRenderer;
    camera: THREE.PerspectiveCamera;
    sun: THREE.DirectionalLight;
    ambient: THREE.AmbientLight;
}

/**
 * Factory: creates the renderer, scene, camera, and lighting
 * that every game mode needs.
 *
 * Extracted from main.ts startGame() lines ~595-620.
 */
export function createGameScene(config?: GameSceneConfig): GameSceneResult {
    const width = config?.width ?? window.innerWidth;
    const height = config?.height ?? window.innerHeight;
    const maxPixelRatio = config?.maxPixelRatio ?? 2;
    const skyColor = config?.skyColor ?? 0x87ceeb;
    const fogDensity = config?.fogDensity ?? 0.003;
    const sunIntensity = config?.sunIntensity ?? 1.5;
    const sunPos = config?.sunPosition ?? { x: 30, y: 50, z: 20 };
    const ambientIntensity = config?.ambientIntensity ?? 0.8;
    const ambientColor = config?.ambientColor ?? 0x404060;

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, maxPixelRatio));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    document.body.appendChild(renderer.domElement);

    // Scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(skyColor);
    scene.fog = new THREE.FogExp2(skyColor, fogDensity);

    // Camera (sensible defaults — modes can override)
    const camera = new THREE.PerspectiveCamera(60, width / height, 0.5, 500);
    camera.position.set(0, 30, -40);
    camera.lookAt(0, 0, 50);

    // Lighting
    const sun = new THREE.DirectionalLight(0xffffff, sunIntensity);
    sun.position.set(sunPos.x, sunPos.y, sunPos.z);
    scene.add(sun);

    const ambient = new THREE.AmbientLight(ambientColor, ambientIntensity);
    scene.add(ambient);

    return { scene, renderer, camera, sun, ambient };
}

/**
 * Tear down a scene created by createGameScene().
 * Disposes all geometries, materials, and textures, then removes the canvas.
 */
export function disposeGameScene(result: GameSceneResult): void {
    result.scene.traverse((object) => {
        const mesh = object as {
            geometry?: THREE.BufferGeometry;
            material?: THREE.Material | THREE.Material[];
        };

        if (mesh.geometry) {
            mesh.geometry.dispose();
        }

        if (Array.isArray(mesh.material)) {
            for (const material of mesh.material) {
                material.dispose();
            }
        } else if (mesh.material) {
            mesh.material.dispose();
        }
    });

    result.renderer.dispose();
    if (result.renderer.domElement.parentNode === document.body) {
        document.body.removeChild(result.renderer.domElement);
    }
}
