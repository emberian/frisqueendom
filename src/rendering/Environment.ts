import * as THREE from 'three';
import { FIELD_LENGTH, FIELD_WIDTH } from '../data/Constants';
import type { Venue } from '../data/WeatherTypes';

/**
 * FieldEnvironment adds simple geometric surroundings to the field based on venue type.
 *
 * - 'park': Trees and benches along field edges (default casual setting)
 * - 'tournament': Temporary fencing and scorer's table (competitive setting)
 * - 'stadium': For stadium venue, use the existing Stadium class from Stadium.ts.
 *   This class does not create stadium geometry -- main.ts should instantiate
 *   Stadium directly for that venue type.
 */
export class FieldEnvironment {
    private scene: THREE.Scene;
    private group: THREE.Group;
    private currentVenue: Venue;

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

    private clearGroup(): void {
        while (this.group.children.length > 0) {
            const child = this.group.children[0];
            this.group.remove(child);
            if (child instanceof THREE.Mesh) {
                child.geometry.dispose();
                if (child.material instanceof THREE.Material) {
                    child.material.dispose();
                }
            }
        }
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

    // -------- Park Setting --------

    private buildPark(): void {
        this.placeTrees();
        this.placeBenches();
    }

    private placeTrees(): void {
        // Shared materials
        const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5c3a1e, roughness: 0.9 });
        const foliageMat = new THREE.MeshStandardMaterial({ color: 0x2a7a2a, roughness: 0.8 });

        // Shared geometries
        const trunkGeo = new THREE.CylinderGeometry(0.15, 0.3, 2.0, 6);
        const foliageGeo = new THREE.ConeGeometry(1.5, 3.0, 6);

        // Place 10 trees at pseudo-random positions 5-15m outside field boundaries
        const treePositions = this.generateTreePositions(10);

        for (const pos of treePositions) {
            // Trunk
            const trunk = new THREE.Mesh(trunkGeo, trunkMat);
            trunk.position.set(pos.x, 1.0, pos.z);
            trunk.castShadow = true;
            this.group.add(trunk);

            // Foliage (cone on top of trunk)
            const foliage = new THREE.Mesh(foliageGeo, foliageMat);
            foliage.position.set(pos.x, 3.5, pos.z); // trunk top (2m) + half cone height (1.5m)
            foliage.castShadow = true;
            this.group.add(foliage);
        }
    }

    private generateTreePositions(count: number): { x: number; z: number }[] {
        const positions: { x: number; z: number }[] = [];
        const halfW = FIELD_WIDTH / 2;

        // Use a deterministic-ish distribution: spread trees along all 4 sides
        // Seeded with simple math to avoid needing external random
        for (let i = 0; i < count; i++) {
            const t = i / count;
            const side = Math.floor(t * 4); // 0=left, 1=right, 2=near, 3=far
            const frac = (t * 4) - side;    // 0..1 within that side

            let x: number, z: number;
            const offset = 5 + (frac * 10); // 5-15m outside boundary

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

            // Add slight jitter so trees don't look perfectly placed
            x += Math.sin(i * 7.3) * 2;
            z += Math.cos(i * 11.1) * 2;

            positions.push({ x, z });
        }

        return positions;
    }

    private placeBenches(): void {
        const benchMat = new THREE.MeshStandardMaterial({ color: 0x6b4226, roughness: 0.85 });

        // 3 park benches along one sideline (right side, 3m outside)
        const benchGeo = new THREE.BoxGeometry(2.5, 0.5, 0.6);
        const legGeo = new THREE.BoxGeometry(0.15, 0.4, 0.5);

        const benchPositions = [
            FIELD_LENGTH * 0.25,
            FIELD_LENGTH * 0.50,
            FIELD_LENGTH * 0.75,
        ];

        const benchX = FIELD_WIDTH / 2 + 3;

        for (const z of benchPositions) {
            // Seat
            const seat = new THREE.Mesh(benchGeo, benchMat);
            seat.position.set(benchX, 0.45, z);
            seat.castShadow = true;
            this.group.add(seat);

            // Two legs
            const legLeft = new THREE.Mesh(legGeo, benchMat);
            legLeft.position.set(benchX - 0.9, 0.2, z);
            this.group.add(legLeft);

            const legRight = new THREE.Mesh(legGeo, benchMat);
            legRight.position.set(benchX + 0.9, 0.2, z);
            this.group.add(legRight);
        }
    }

    // -------- Tournament Setting --------

    private buildTournament(): void {
        this.placeFencing();
        this.placeScorersTable();
    }

    private placeFencing(): void {
        const fenceMat = new THREE.MeshStandardMaterial({ color: 0x888888, roughness: 0.7 });
        const halfW = FIELD_WIDTH / 2;

        // Thin temporary fencing along both sidelines, ~1m tall, 2m outside the lines
        const sideLength = FIELD_LENGTH + 4; // extend slightly past endlines
        const sideGeo = new THREE.BoxGeometry(0.05, 1.0, sideLength);

        const leftFence = new THREE.Mesh(sideGeo, fenceMat);
        leftFence.position.set(-halfW - 2, 0.5, FIELD_LENGTH / 2);
        leftFence.castShadow = true;
        this.group.add(leftFence);

        const rightFence = new THREE.Mesh(sideGeo, fenceMat);
        rightFence.position.set(halfW + 2, 0.5, FIELD_LENGTH / 2);
        rightFence.castShadow = true;
        this.group.add(rightFence);

        // End fencing
        const endGeo = new THREE.BoxGeometry(FIELD_WIDTH + 8, 1.0, 0.05);

        const nearFence = new THREE.Mesh(endGeo, fenceMat);
        nearFence.position.set(0, 0.5, -2);
        nearFence.castShadow = true;
        this.group.add(nearFence);

        const farFence = new THREE.Mesh(endGeo, fenceMat);
        farFence.position.set(0, 0.5, FIELD_LENGTH + 2);
        farFence.castShadow = true;
        this.group.add(farFence);

        // Fence posts every 5m along sidelines
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

        // Scorer's table at midfield on one sideline (right side, just outside fence)
        const tableGeo = new THREE.BoxGeometry(3.0, 0.8, 1.0);
        const table = new THREE.Mesh(tableGeo, tableMat);
        table.position.set(FIELD_WIDTH / 2 + 4, 0.4, FIELD_LENGTH / 2);
        table.castShadow = true;
        this.group.add(table);

        // Chair behind table
        const chairMat = new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.7 });
        const chairGeo = new THREE.BoxGeometry(0.5, 0.5, 0.5);

        for (let i = -1; i <= 1; i++) {
            const chair = new THREE.Mesh(chairGeo, chairMat);
            chair.position.set(FIELD_WIDTH / 2 + 5.2, 0.25, FIELD_LENGTH / 2 + i * 1.0);
            this.group.add(chair);
        }
    }
}
