import * as THREE from 'three';
import { FIELD_WIDTH, FIELD_LENGTH, ENDZONE_DEPTH } from '../data/Constants';

const FLAG_HEIGHT = 1.5;
const FLAG_WIDTH = 0.6;
const FLAG_SEGMENTS = 8;

export class FieldFlags {
    private flags: { mesh: THREE.Mesh; pole: THREE.Mesh; basePos: THREE.Vector3; vertices: THREE.Vector3[] }[] = [];
    private windX = 0;
    private windZ = 0;
    private time = 0;

    constructor(scene: THREE.Scene) {
        // Place flags at 8 corner positions:
        // 4 endzone-sideline intersections + 4 back-line-sideline intersections
        const positions: [number, number][] = [
            [-FIELD_WIDTH / 2, 0],
            [FIELD_WIDTH / 2, 0],
            [-FIELD_WIDTH / 2, ENDZONE_DEPTH],
            [FIELD_WIDTH / 2, ENDZONE_DEPTH],
            [-FIELD_WIDTH / 2, FIELD_LENGTH - ENDZONE_DEPTH],
            [FIELD_WIDTH / 2, FIELD_LENGTH - ENDZONE_DEPTH],
            [-FIELD_WIDTH / 2, FIELD_LENGTH],
            [FIELD_WIDTH / 2, FIELD_LENGTH],
        ];

        for (const [x, z] of positions) {
            // Create pole - thin cylinder
            const poleGeometry = new THREE.CylinderGeometry(0.02, 0.02, FLAG_HEIGHT, 8);
            const poleMaterial = new THREE.MeshStandardMaterial({ color: 0x333333 });
            const pole = new THREE.Mesh(poleGeometry, poleMaterial);
            pole.position.set(x, FLAG_HEIGHT / 2, z);
            pole.castShadow = true;
            scene.add(pole);

            // Create flag - plane with segments for cloth simulation
            const flagGeometry = new THREE.PlaneGeometry(FLAG_WIDTH, FLAG_HEIGHT / 2, FLAG_SEGMENTS, 4);
            const flagMaterial = new THREE.MeshStandardMaterial({
                color: 0xff8800,
                side: THREE.DoubleSide,
                roughness: 0.8,
            });
            const flag = new THREE.Mesh(flagGeometry, flagMaterial);
            flag.position.set(x, FLAG_HEIGHT * 0.75, z);
            flag.castShadow = true;
            flag.receiveShadow = true;
            scene.add(flag);

            // Store base vertices for cloth simulation
            const vertices: THREE.Vector3[] = [];
            const positionAttribute = flagGeometry.getAttribute('position');
            for (let i = 0; i < positionAttribute.count; i++) {
                vertices.push(new THREE.Vector3(
                    positionAttribute.getX(i),
                    positionAttribute.getY(i),
                    positionAttribute.getZ(i)
                ));
            }

            this.flags.push({
                mesh: flag,
                pole,
                basePos: new THREE.Vector3(x, FLAG_HEIGHT * 0.75, z),
                vertices,
            });
        }
    }

    setWind(speed: number, direction: number): void {
        this.windX = Math.sin(direction) * speed;
        this.windZ = Math.cos(direction) * speed;
    }

    update(dt: number): void {
        this.time += dt;

        for (const flag of this.flags) {
            const geometry = flag.mesh.geometry as THREE.PlaneGeometry;
            const positionAttribute = geometry.getAttribute('position');

            // Simple spring cloth simulation
            const windSpeed = Math.sqrt(this.windX * this.windX + this.windZ * this.windZ);
            const windDir = Math.atan2(this.windX, this.windZ);

            for (let i = 0; i < positionAttribute.count; i++) {
                const baseVertex = flag.vertices[i];

                // Get position in flag space (0-1 along width)
                const u = (baseVertex.x + FLAG_WIDTH / 2) / FLAG_WIDTH; // 0 at pole, 1 at far edge
                const v = (baseVertex.y + FLAG_HEIGHT / 4) / (FLAG_HEIGHT / 2); // 0 at bottom, 1 at top

                // Flag vertices bend toward wind direction
                // Amplitude proportional to distance from pole and wind speed
                const amplitude = u * windSpeed * 0.15;

                // Add flutter (sine wave along flag width)
                const flutter = Math.sin(this.time * 3 + u * 6) * amplitude * 0.5;

                // Calculate displacement
                const bendX = Math.sin(windDir) * (amplitude + flutter);
                const bendZ = Math.cos(windDir) * (amplitude + flutter);

                // Vertical flutter
                const verticalFlutter = Math.sin(this.time * 4 + u * 4) * amplitude * 0.3;

                // Apply displacement
                positionAttribute.setXYZ(
                    i,
                    baseVertex.x + bendX,
                    baseVertex.y + verticalFlutter,
                    baseVertex.z + bendZ
                );
            }

            positionAttribute.needsUpdate = true;
            geometry.computeVertexNormals();
        }
    }

    dispose(): void {
        for (const flag of this.flags) {
            flag.mesh.geometry.dispose();
            if (flag.mesh.material instanceof THREE.Material) {
                flag.mesh.material.dispose();
            }
            flag.mesh.parent?.remove(flag.mesh);

            flag.pole.geometry.dispose();
            if (flag.pole.material instanceof THREE.Material) {
                flag.pole.material.dispose();
            }
            flag.pole.parent?.remove(flag.pole);
        }
        this.flags = [];
    }
}
