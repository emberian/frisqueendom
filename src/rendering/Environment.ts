import * as THREE from 'three';
import { FIELD_LENGTH, FIELD_WIDTH } from '../data/Constants';
import type { Venue } from '../data/WeatherTypes';

// -------- Internal types --------

type TreeType = 'oak' | 'pine' | 'birch' | 'palm';

interface TreeInstance {
    group: THREE.Group;
    type: TreeType;
    /** Trunk material with injected sway shader */
    trunkMaterial: THREE.MeshStandardMaterial;
    /** Height of the tree for sway normalization */
    maxHeight: number;
    /** Per-tree phase offset so they don't all sway in sync */
    phaseOffset: number;
}

interface Bird {
    position: THREE.Vector3;
    velocity: THREE.Vector3;
}

/**
 * FieldEnvironment adds simple geometric surroundings to the field based on venue type.
 *
 * - 'park': Trees (4 varieties with wind sway), benches, props, and birds
 * - 'tournament': Temporary fencing and scorer's table (competitive setting)
 * - 'stadium': For stadium venue, use the existing Stadium class from Stadium.ts.
 *   This class does not create stadium geometry -- main.ts should instantiate
 *   Stadium directly for that venue type.
 */
export class FieldEnvironment {
    private scene: THREE.Scene;
    private group: THREE.Group;
    private currentVenue: Venue;

    // ---- Animated sub-systems (park venue) ----
    private trees: TreeInstance[] = [];
    private treeTimeUniforms: { value: number }[] = [];
    private treeSwayUniforms: { value: number }[] = [];
    private elapsedTime = 0;

    private birds: Bird[] = [];
    private birdMesh: THREE.InstancedMesh | null = null;
    private readonly BIRD_COUNT = 12;
    private readonly dummyMatrix = new THREE.Matrix4();
    private readonly dummyQuat = new THREE.Quaternion();

    constructor(scene: THREE.Scene, venue: Venue) {
        this.scene = scene;
        this.group = new THREE.Group();
        this.group.name = 'fieldEnvironment';
        this.scene.add(this.group);
        this.currentVenue = venue;
        this.buildVenue(venue);
    }

    setVenue(venue: Venue): void {
        if (venue === this.currentVenue) return;
        this.clearGroup();
        this.currentVenue = venue;
        this.buildVenue(venue);
    }

    dispose(): void {
        this.clearGroup();
        this.scene.remove(this.group);
    }

    /** Call each frame from the game loop */
    update(dt: number): void {
        this.elapsedTime += dt;
        if (this.currentVenue === 'park') {
            this.updateTrees(dt, 1.0);
            this.updateBirds(dt);
        }
    }

    // -------- Cleanup --------

    private clearGroup(): void {
        // Dispose all children recursively
        this.group.traverse((obj) => {
            if (obj instanceof THREE.Mesh || obj instanceof THREE.InstancedMesh) {
                obj.geometry.dispose();
                if (Array.isArray(obj.material)) {
                    for (const m of obj.material) m.dispose();
                } else if (obj.material instanceof THREE.Material) {
                    obj.material.dispose();
                }
            }
        });
        while (this.group.children.length > 0) {
            this.group.remove(this.group.children[0]);
        }
        this.trees = [];
        this.treeTimeUniforms = [];
        this.treeSwayUniforms = [];
        this.birds = [];
        this.birdMesh = null;
    }

    private buildVenue(venue: Venue): void {
        switch (venue) {
            case 'park':
                this.buildPark();
                break;
            case 'tournament':
                this.buildTournament();
                break;
            case 'stadium':
                // Stadium venue is handled by the Stadium class in Stadium.ts.
                // main.ts should use `new Stadium(scene, homeColor)` for stadium venues.
                break;
        }
    }

    // ========================================================================
    //  PARK SETTING
    // ========================================================================

    private buildPark(): void {
        this.placeTrees();
        this.placeBenches();
        this.placeProps();
        this.createBirds();
    }

    // -------- Trees (4 varieties with wind sway) --------

    private placeTrees(): void {
        const positions = this.generateTreePositions(22);
        const types: TreeType[] = ['oak', 'pine', 'birch', 'palm'];

        for (let i = 0; i < positions.length; i++) {
            const pos = positions[i];
            const type = types[i % types.length];
            this.createTree(type, pos.x, pos.z, i);
        }
    }

    private createTree(type: TreeType, x: number, z: number, seed: number): void {
        const treeGroup = new THREE.Group();
        treeGroup.position.set(x, 0, z);

        // Per-tree uniforms for sway
        const timeUniform = { value: 0.0 };
        const swayUniform = { value: 0.3 + Math.sin(seed * 3.7) * 0.15 };
        const phaseOffset = seed * 2.13;
        let maxHeight = 5.0;

        this.treeTimeUniforms.push(timeUniform);
        this.treeSwayUniforms.push(swayUniform);

        // Create sway-injected trunk material
        const createSwayMaterial = (color: number): THREE.MeshStandardMaterial => {
            const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.9 });
            const uTime = timeUniform;
            const uSway = swayUniform;
            const mh = maxHeight;
            mat.onBeforeCompile = (shader) => {
                shader.uniforms.uSwayTime = uTime;
                shader.uniforms.uSwayAmount = uSway;
                shader.vertexShader = shader.vertexShader.replace(
                    '#include <begin_vertex>',
                    `#include <begin_vertex>
                    float normalizedH = position.y / ${mh.toFixed(1)};
                    transformed.x += sin(uSwayTime.x + position.y * 0.5) * uSwayAmount.x * normalizedH;`
                );
                shader.vertexShader = 'uniform float uSwayTime;\nuniform float uSwayAmount;\n' + shader.vertexShader;
            };
            return mat;
        };

        switch (type) {
            case 'oak': {
                maxHeight = 5.5;
                const trunkMat = createSwayMaterial(0x5c3a1e);
                const trunkGeo = new THREE.CylinderGeometry(0.2, 0.45, 3.0, 6);
                const trunk = new THREE.Mesh(trunkGeo, trunkMat);
                trunk.position.y = 1.5;
                trunk.castShadow = true;
                treeGroup.add(trunk);

                const canopyMat = new THREE.MeshStandardMaterial({ color: 0x2a7a2a, roughness: 0.8 });
                const canopyGeo = new THREE.SphereGeometry(2.2, 8, 6);
                const canopy = new THREE.Mesh(canopyGeo, canopyMat);
                canopy.position.y = 4.2;
                canopy.castShadow = true;
                treeGroup.add(canopy);

                this.trees.push({ group: treeGroup, type, trunkMaterial: trunkMat, maxHeight, phaseOffset });
                break;
            }
            case 'pine': {
                maxHeight = 7.0;
                const trunkMat = createSwayMaterial(0x4a3018);
                const trunkGeo = new THREE.CylinderGeometry(0.1, 0.2, 3.5, 5);
                const trunk = new THREE.Mesh(trunkGeo, trunkMat);
                trunk.position.y = 1.75;
                trunk.castShadow = true;
                treeGroup.add(trunk);

                const pineMat = new THREE.MeshStandardMaterial({ color: 0x1a5a1a, roughness: 0.85 });
                // Stack 2 cones for fuller pine shape
                const coneGeo1 = new THREE.ConeGeometry(1.8, 3.0, 6);
                const cone1 = new THREE.Mesh(coneGeo1, pineMat);
                cone1.position.y = 4.5;
                cone1.castShadow = true;
                treeGroup.add(cone1);

                const coneGeo2 = new THREE.ConeGeometry(1.2, 2.0, 6);
                const cone2 = new THREE.Mesh(coneGeo2, pineMat);
                cone2.position.y = 6.2;
                cone2.castShadow = true;
                treeGroup.add(cone2);

                this.trees.push({ group: treeGroup, type, trunkMaterial: trunkMat, maxHeight, phaseOffset });
                break;
            }
            case 'birch': {
                maxHeight = 5.0;
                const trunkMat = createSwayMaterial(0xe8e0d0); // white/cream bark
                const trunkGeo = new THREE.CylinderGeometry(0.08, 0.14, 3.0, 5);
                const trunk = new THREE.Mesh(trunkGeo, trunkMat);
                trunk.position.y = 1.5;
                trunk.castShadow = true;
                treeGroup.add(trunk);

                const birchLeafMat = new THREE.MeshStandardMaterial({ color: 0x55aa40, roughness: 0.75 });
                // Ellipsoid canopy via scaled sphere
                const canopyGeo = new THREE.SphereGeometry(1.0, 7, 5);
                const canopy = new THREE.Mesh(canopyGeo, birchLeafMat);
                canopy.position.y = 3.8;
                canopy.scale.set(1.2, 1.6, 1.2);
                canopy.castShadow = true;
                treeGroup.add(canopy);

                this.trees.push({ group: treeGroup, type, trunkMaterial: trunkMat, maxHeight, phaseOffset });
                break;
            }
            case 'palm': {
                maxHeight = 6.0;
                // Curved trunk via TubeGeometry along a quadratic path
                const curve = new THREE.QuadraticBezierCurve3(
                    new THREE.Vector3(0, 0, 0),
                    new THREE.Vector3(0.8, 3.0, 0.3),
                    new THREE.Vector3(0.2, 5.5, -0.1)
                );
                const trunkMat = createSwayMaterial(0x8b6914);
                const tubeGeo = new THREE.TubeGeometry(curve, 8, 0.15, 5, false);
                const trunk = new THREE.Mesh(tubeGeo, trunkMat);
                trunk.castShadow = true;
                treeGroup.add(trunk);

                // Fan leaves as tilted planes
                const leafMat = new THREE.MeshStandardMaterial({
                    color: 0x228b22,
                    roughness: 0.7,
                    side: THREE.DoubleSide,
                });
                const leafGeo = new THREE.PlaneGeometry(1.8, 0.5);
                const leafTop = curve.getPoint(1); // tip of the trunk
                for (let l = 0; l < 6; l++) {
                    const angle = (l / 6) * Math.PI * 2;
                    const leaf = new THREE.Mesh(leafGeo, leafMat);
                    leaf.position.set(
                        leafTop.x + Math.cos(angle) * 0.9,
                        leafTop.y - 0.1,
                        leafTop.z + Math.sin(angle) * 0.9
                    );
                    leaf.rotation.set(
                        -0.4 + Math.sin(angle) * 0.2, // tilt downward
                        angle,
                        0
                    );
                    leaf.castShadow = true;
                    treeGroup.add(leaf);
                }

                this.trees.push({ group: treeGroup, type, trunkMaterial: trunkMat, maxHeight, phaseOffset });
                break;
            }
        }

        this.group.add(treeGroup);
    }

    updateTrees(dt: number, windStrength: number): void {
        for (let i = 0; i < this.trees.length; i++) {
            const tree = this.trees[i];
            this.treeTimeUniforms[i].value = this.elapsedTime + tree.phaseOffset;
            this.treeSwayUniforms[i].value = 0.15 + windStrength * 0.25;
        }
    }

    private generateTreePositions(count: number): { x: number; z: number }[] {
        const positions: { x: number; z: number }[] = [];
        const halfW = FIELD_WIDTH / 2;

        // Distribute trees around all 4 sides, 10-25m outside field boundaries
        for (let i = 0; i < count; i++) {
            const t = i / count;
            const side = Math.floor(t * 4); // 0=left, 1=right, 2=near, 3=far
            const frac = (t * 4) - side;

            let x: number, z: number;
            const offset = 10 + (frac * 15); // 10-25m outside boundary

            switch (side) {
                case 0: // left side
                    x = -halfW - offset;
                    z = frac * FIELD_LENGTH;
                    break;
                case 1: // right side
                    x = halfW + offset;
                    z = frac * FIELD_LENGTH;
                    break;
                case 2: // near end (z < 0)
                    x = (frac - 0.5) * FIELD_WIDTH;
                    z = -offset;
                    break;
                default: // far end (z > FIELD_LENGTH)
                    x = (frac - 0.5) * FIELD_WIDTH;
                    z = FIELD_LENGTH + offset;
                    break;
            }

            // Deterministic jitter
            x += Math.sin(i * 7.3) * 3;
            z += Math.cos(i * 11.1) * 3;

            positions.push({ x, z });
        }

        return positions;
    }

    // -------- Benches (unchanged from original) --------

    private placeBenches(): void {
        const benchMat = new THREE.MeshStandardMaterial({ color: 0x6b4226, roughness: 0.85 });

        const benchGeo = new THREE.BoxGeometry(2.5, 0.5, 0.6);
        const legGeo = new THREE.BoxGeometry(0.15, 0.4, 0.5);

        const benchPositions = [
            FIELD_LENGTH * 0.25,
            FIELD_LENGTH * 0.50,
            FIELD_LENGTH * 0.75,
        ];

        const benchX = FIELD_WIDTH / 2 + 3;

        for (const z of benchPositions) {
            const seat = new THREE.Mesh(benchGeo, benchMat);
            seat.position.set(benchX, 0.45, z);
            seat.castShadow = true;
            this.group.add(seat);

            const legLeft = new THREE.Mesh(legGeo, benchMat);
            legLeft.position.set(benchX - 0.9, 0.2, z);
            this.group.add(legLeft);

            const legRight = new THREE.Mesh(legGeo, benchMat);
            legRight.position.set(benchX + 0.9, 0.2, z);
            this.group.add(legRight);
        }
    }

    // -------- Props (picnic tables, water cooler, trash cans) --------

    private placeProps(): void {
        const halfW = FIELD_WIDTH / 2;
        // Place props along the left sideline, 4-8m outside boundary
        const propsX = -halfW - 5;

        this.placePicnicTables(propsX);
        this.placeWaterCooler(propsX + 1, FIELD_LENGTH * 0.5);
        this.placeTrashCans(propsX);
    }

    private placePicnicTables(baseX: number): void {
        const woodMat = new THREE.MeshStandardMaterial({ color: 0x8b5a2b, roughness: 0.85 });

        // 2 picnic tables
        const tableZPositions = [FIELD_LENGTH * 0.3, FIELD_LENGTH * 0.7];

        for (const z of tableZPositions) {
            // Table top
            const topGeo = new THREE.BoxGeometry(2.0, 0.1, 1.0);
            const top = new THREE.Mesh(topGeo, woodMat);
            top.position.set(baseX, 0.75, z);
            top.castShadow = true;
            this.group.add(top);

            // 4 legs
            const legGeo = new THREE.BoxGeometry(0.1, 0.75, 0.1);
            const offsets = [
                { x: -0.85, z: -0.4 },
                { x: 0.85, z: -0.4 },
                { x: -0.85, z: 0.4 },
                { x: 0.85, z: 0.4 },
            ];
            for (const off of offsets) {
                const leg = new THREE.Mesh(legGeo, woodMat);
                leg.position.set(baseX + off.x, 0.375, z + off.z);
                this.group.add(leg);
            }

            // 2 bench seats on either side
            const seatGeo = new THREE.BoxGeometry(2.0, 0.08, 0.3);
            const seat1 = new THREE.Mesh(seatGeo, woodMat);
            seat1.position.set(baseX, 0.45, z - 0.8);
            seat1.castShadow = true;
            this.group.add(seat1);

            const seat2 = new THREE.Mesh(seatGeo, woodMat);
            seat2.position.set(baseX, 0.45, z + 0.8);
            seat2.castShadow = true;
            this.group.add(seat2);
        }
    }

    private placeWaterCooler(x: number, z: number): void {
        // Small table
        const tableMat = new THREE.MeshStandardMaterial({ color: 0x999999, roughness: 0.6 });
        const tableGeo = new THREE.BoxGeometry(0.6, 0.7, 0.4);
        const table = new THREE.Mesh(tableGeo, tableMat);
        table.position.set(x, 0.35, z);
        table.castShadow = true;
        this.group.add(table);

        // Water jug (cylinder)
        const jugMat = new THREE.MeshStandardMaterial({ color: 0x3388cc, roughness: 0.3 });
        const jugGeo = new THREE.CylinderGeometry(0.15, 0.15, 0.4, 8);
        const jug = new THREE.Mesh(jugGeo, jugMat);
        jug.position.set(x, 0.9, z);
        jug.castShadow = true;
        this.group.add(jug);

        // Spout nozzle
        const nozzleMat = new THREE.MeshStandardMaterial({ color: 0xdddddd, roughness: 0.5 });
        const nozzleGeo = new THREE.CylinderGeometry(0.02, 0.02, 0.08, 4);
        const nozzle = new THREE.Mesh(nozzleGeo, nozzleMat);
        nozzle.position.set(x + 0.15, 0.76, z);
        nozzle.rotation.z = Math.PI / 2;
        this.group.add(nozzle);
    }

    private placeTrashCans(baseX: number): void {
        const trashMat = new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.8 });
        const lidMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.7 });

        const trashPositions = [FIELD_LENGTH * 0.45, FIELD_LENGTH * 0.55];

        for (const z of trashPositions) {
            // Body
            const bodyGeo = new THREE.CylinderGeometry(0.25, 0.22, 0.7, 8);
            const body = new THREE.Mesh(bodyGeo, trashMat);
            body.position.set(baseX - 2, 0.35, z);
            body.castShadow = true;
            this.group.add(body);

            // Lid
            const lidGeo = new THREE.CylinderGeometry(0.27, 0.27, 0.05, 8);
            const lid = new THREE.Mesh(lidGeo, lidMat);
            lid.position.set(baseX - 2, 0.725, z);
            lid.castShadow = true;
            this.group.add(lid);
        }
    }

    // -------- Bird Flock (InstancedMesh + boid behavior) --------

    private createBirds(): void {
        // Simple pyramid geometry for a bird silhouette (4 faces)
        const birdGeo = new THREE.BufferGeometry();
        const vertices = new Float32Array([
            // Front face (beak)
             0.0,  0.0,  0.4,   // nose
            -0.3,  0.0, -0.2,   // left wing tip
             0.3,  0.0, -0.2,   // right wing tip
            // Top face
             0.0,  0.0,  0.4,   // nose
             0.0,  0.1,  0.0,   // top center
            -0.3,  0.0, -0.2,   // left wing
            // Top face right
             0.0,  0.0,  0.4,   // nose
             0.3,  0.0, -0.2,   // right wing
             0.0,  0.1,  0.0,   // top center
            // Back face
            -0.3,  0.0, -0.2,
             0.0,  0.1,  0.0,
             0.3,  0.0, -0.2,
        ]);
        birdGeo.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
        birdGeo.computeVertexNormals();

        const birdMat = new THREE.MeshStandardMaterial({
            color: 0x1a1a1a,
            roughness: 0.9,
            side: THREE.DoubleSide,
        });

        this.birdMesh = new THREE.InstancedMesh(birdGeo, birdMat, this.BIRD_COUNT);
        this.birdMesh.castShadow = true;
        this.birdMesh.frustumCulled = false;
        this.group.add(this.birdMesh);

        // Initialize birds in a cluster above field center
        const fieldCenterX = 0;
        const fieldCenterZ = FIELD_LENGTH / 2;
        this.birds = [];

        for (let i = 0; i < this.BIRD_COUNT; i++) {
            const angle = (i / this.BIRD_COUNT) * Math.PI * 2;
            const radius = 5 + Math.sin(i * 5.3) * 8;
            const bird: Bird = {
                position: new THREE.Vector3(
                    fieldCenterX + Math.cos(angle) * radius,
                    35 + Math.sin(i * 3.1) * 15,
                    fieldCenterZ + Math.sin(angle) * radius
                ),
                velocity: new THREE.Vector3(
                    Math.cos(angle + 0.5) * 2,
                    Math.sin(i * 1.7) * 0.3,
                    Math.sin(angle + 0.5) * 2
                ),
            };
            this.birds.push(bird);
        }

        this.syncBirdMatrices();
    }

    updateBirds(dt: number): void {
        if (!this.birdMesh || this.birds.length === 0) return;

        const fieldCenterX = 0;
        const fieldCenterZ = FIELD_LENGTH / 2;

        // Compute flock center
        const flockCenter = new THREE.Vector3();
        for (const b of this.birds) {
            flockCenter.add(b.position);
        }
        flockCenter.divideScalar(this.birds.length);

        // Compute average heading
        const avgVel = new THREE.Vector3();
        for (const b of this.birds) {
            avgVel.add(b.velocity);
        }
        avgVel.divideScalar(this.birds.length);

        const cohesionWeight = 0.8;
        const alignWeight = 0.4;
        const separationWeight = 1.5;
        const maxSpeed = 4.0;
        const minSpeed = 1.5;

        const force = new THREE.Vector3();
        const diff = new THREE.Vector3();

        for (const bird of this.birds) {
            force.set(0, 0, 0);

            // Cohesion: steer toward flock center
            diff.copy(flockCenter).sub(bird.position);
            force.addScaledVector(diff, cohesionWeight * 0.02);

            // Alignment: match average velocity
            diff.copy(avgVel).sub(bird.velocity);
            force.addScaledVector(diff, alignWeight * 0.05);

            // Separation: avoid neighbors within 3m
            for (const other of this.birds) {
                if (other === bird) continue;
                diff.copy(bird.position).sub(other.position);
                const dist = diff.length();
                if (dist < 3.0 && dist > 0.01) {
                    diff.divideScalar(dist * dist);
                    force.addScaledVector(diff, separationWeight);
                }
            }

            // Soft boundary: keep birds above the field area
            // Y bounds: 30..60
            if (bird.position.y < 32) force.y += (32 - bird.position.y) * 0.5;
            if (bird.position.y > 58) force.y -= (bird.position.y - 58) * 0.5;

            // XZ bounds: stay within 80m of field center
            diff.set(
                bird.position.x - fieldCenterX,
                0,
                bird.position.z - fieldCenterZ
            );
            const xzDist = diff.length();
            if (xzDist > 70) {
                diff.normalize().multiplyScalar((xzDist - 70) * 0.3);
                force.sub(diff);
            }

            // Gentle circular drift tendency
            force.x += Math.sin(this.elapsedTime * 0.2 + bird.position.z * 0.01) * 0.3;
            force.z += Math.cos(this.elapsedTime * 0.15 + bird.position.x * 0.01) * 0.3;

            // Apply force
            bird.velocity.addScaledVector(force, dt);

            // Clamp speed
            const speed = bird.velocity.length();
            if (speed > maxSpeed) {
                bird.velocity.multiplyScalar(maxSpeed / speed);
            } else if (speed < minSpeed) {
                bird.velocity.multiplyScalar(minSpeed / speed);
            }

            // Dampen vertical component to keep flight level
            bird.velocity.y *= 0.95;

            // Integrate position
            bird.position.addScaledVector(bird.velocity, dt);
        }

        this.syncBirdMatrices();
    }

    private syncBirdMatrices(): void {
        if (!this.birdMesh) return;

        const forward = new THREE.Vector3();

        for (let i = 0; i < this.birds.length; i++) {
            const bird = this.birds[i];
            forward.copy(bird.velocity).normalize();

            // Orient bird to face its velocity direction
            this.dummyQuat.setFromUnitVectors(new THREE.Vector3(0, 0, 1), forward);

            this.dummyMatrix.compose(
                bird.position,
                this.dummyQuat,
                new THREE.Vector3(1, 1, 1)
            );
            this.birdMesh.setMatrixAt(i, this.dummyMatrix);
        }
        this.birdMesh.instanceMatrix.needsUpdate = true;
    }

    // ========================================================================
    //  TOURNAMENT SETTING
    // ========================================================================

    private buildTournament(): void {
        this.placeFencing();
        this.placeScorersTable();
    }

    private placeFencing(): void {
        const fenceMat = new THREE.MeshStandardMaterial({ color: 0x888888, roughness: 0.7 });
        const halfW = FIELD_WIDTH / 2;

        const sideLength = FIELD_LENGTH + 4;
        const sideGeo = new THREE.BoxGeometry(0.05, 1.0, sideLength);

        const leftFence = new THREE.Mesh(sideGeo, fenceMat);
        leftFence.position.set(-halfW - 2, 0.5, FIELD_LENGTH / 2);
        leftFence.castShadow = true;
        this.group.add(leftFence);

        const rightFence = new THREE.Mesh(sideGeo, fenceMat);
        rightFence.position.set(halfW + 2, 0.5, FIELD_LENGTH / 2);
        rightFence.castShadow = true;
        this.group.add(rightFence);

        const endGeo = new THREE.BoxGeometry(FIELD_WIDTH + 8, 1.0, 0.05);

        const nearFence = new THREE.Mesh(endGeo, fenceMat);
        nearFence.position.set(0, 0.5, -2);
        nearFence.castShadow = true;
        this.group.add(nearFence);

        const farFence = new THREE.Mesh(endGeo, fenceMat);
        farFence.position.set(0, 0.5, FIELD_LENGTH + 2);
        farFence.castShadow = true;
        this.group.add(farFence);

        const postGeo = new THREE.CylinderGeometry(0.04, 0.04, 1.1, 4);
        const postMat = new THREE.MeshStandardMaterial({ color: 0x666666, roughness: 0.6 });

        for (let z = -2; z <= FIELD_LENGTH + 2; z += 5) {
            const postL = new THREE.Mesh(postGeo, postMat);
            postL.position.set(-halfW - 2, 0.55, z);
            this.group.add(postL);

            const postR = new THREE.Mesh(postGeo, postMat);
            postR.position.set(halfW + 2, 0.55, z);
            this.group.add(postR);
        }
    }

    private placeScorersTable(): void {
        const tableMat = new THREE.MeshStandardMaterial({ color: 0x555555, roughness: 0.6 });

        const tableGeo = new THREE.BoxGeometry(3.0, 0.8, 1.0);
        const table = new THREE.Mesh(tableGeo, tableMat);
        table.position.set(FIELD_WIDTH / 2 + 4, 0.4, FIELD_LENGTH / 2);
        table.castShadow = true;
        this.group.add(table);

        const chairMat = new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.7 });
        const chairGeo = new THREE.BoxGeometry(0.5, 0.5, 0.5);

        for (let i = -1; i <= 1; i++) {
            const chair = new THREE.Mesh(chairGeo, chairMat);
            chair.position.set(FIELD_WIDTH / 2 + 5.2, 0.25, FIELD_LENGTH / 2 + i * 1.0);
            this.group.add(chair);
        }
    }
}
