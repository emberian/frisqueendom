import * as THREE from 'three';
import { FIELD_LENGTH, FIELD_WIDTH } from '../data/Constants';
import { Random } from '../data/SeededRandom';

const BLADE_COUNT = 15000;
const BLADE_HEIGHT = 0.07;
const BLADE_WIDTH = 0.015;

export class GrassField {
    mesh: THREE.InstancedMesh;
    private dummy = new THREE.Object3D();
    private time = 0;
    private windDir = new THREE.Vector2(0, 1);
    private windSpeed = 0;

    constructor(scene: THREE.Scene) {
        // Blade geometry: thin triangle
        const geo = new THREE.BufferGeometry();
        const vertices = new Float32Array([
            -BLADE_WIDTH / 2, 0, 0,
            BLADE_WIDTH / 2, 0, 0,
            0, BLADE_HEIGHT, 0,
        ]);
        geo.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
        geo.computeVertexNormals();

        const mat = new THREE.MeshLambertMaterial({
            color: 0xffffff,
            side: THREE.DoubleSide,
        });

        // Add wind sway and coloring via shader for high performance
        mat.onBeforeCompile = (shader) => {
            shader.uniforms.time = { value: 0 };
            shader.uniforms.windDir = { value: new THREE.Vector2(0, 1) };
            shader.uniforms.windSpeed = { value: 0 };
            
            shader.vertexShader = `
                uniform float time;
                uniform vec2 windDir;
                uniform float windSpeed;
                varying float vRelativeY;
                varying vec3 vWorldPos;
            ` + shader.vertexShader;

            shader.vertexShader = shader.vertexShader.replace(
                '#include <begin_vertex>',
                `
                #include <begin_vertex>
                
                vRelativeY = position.y / ${BLADE_HEIGHT.toFixed(3)};
                vWorldPos = (instanceMatrix * vec4(position, 1.0)).xyz;

                if (position.y > 0.0) {
                    float sway = sin(time * 2.5 + instanceMatrix[3][0] * 0.5 + instanceMatrix[3][2] * 0.3) * 0.02;
                    float bend = windSpeed * 0.04;
                    float total = sway + bend;
                    
                    transformed.x += total * windDir.x * position.y * 12.0;
                    transformed.z += total * windDir.y * position.y * 12.0;
                }
                `
            );

            shader.fragmentShader = `
                uniform float time;
                varying float vRelativeY;
                varying vec3 vWorldPos;
            ` + shader.fragmentShader;

            shader.fragmentShader = shader.fragmentShader.replace(
                '#include <color_fragment>',
                `
                #include <color_fragment>
                
                // Tip brightening / Soil deepening
                vec3 tipColor = vec3(1.2, 1.1, 0.8); // Sun-kissed tips
                diffuseColor.rgb *= mix(vec3(0.4, 0.4, 0.4), tipColor, vRelativeY);

                // Cloud shadows (scrolling noise)
                float noise = sin(vWorldPos.x * 0.1 + time * 0.5) * cos(vWorldPos.z * 0.1 - time * 0.3);
                float shadow = smoothstep(0.2, 0.8, noise * 0.5 + 0.5);
                diffuseColor.rgb *= mix(0.7, 1.0, shadow);
                `
            );

            this.mesh.userData.shader = shader;
        };

        this.mesh = new THREE.InstancedMesh(geo, mat, BLADE_COUNT);
        this.mesh.receiveShadow = true;

        // Scatter blades across the field
        const colors = new Float32Array(BLADE_COUNT * 3);

        for (let i = 0; i < BLADE_COUNT; i++) {
            const x = (Random.next() - 0.5) * FIELD_WIDTH;
            const z = Random.next() * FIELD_LENGTH;
            const rot = Random.next() * Math.PI * 2;
            const scale = 0.8 + Random.next() * 0.4;

            this.dummy.position.set(x, 0, z);
            this.dummy.rotation.set(0, rot, 0);
            this.dummy.scale.set(1, scale, 1);
            this.dummy.updateMatrix();
            this.mesh.setMatrixAt(i, this.dummy.matrix);

            // Color variation + mowing stripes
            const stripe = Math.floor(z / 3) % 2;
            const baseG = 0.45 + stripe * 0.08;
            const noise = (Random.next() - 0.5) * 0.08;
            colors[i * 3] = 0.15 + noise;
            colors[i * 3 + 1] = baseG + noise;
            colors[i * 3 + 2] = 0.12 + noise;
        }

        this.mesh.instanceColor = new THREE.InstancedBufferAttribute(colors, 3);
        this.mesh.instanceMatrix.needsUpdate = true;

        scene.add(this.mesh);
    }

    update(dt: number, windSpeed: number, windDirection: number): void {
        this.time += dt;
        const shader = this.mesh.userData.shader;
        if (shader) {
            shader.uniforms.time.value = this.time;
            shader.uniforms.windDir.value.set(Math.sin(windDirection), Math.cos(windDirection));
            shader.uniforms.windSpeed.value = windSpeed;
        }
    }
}
