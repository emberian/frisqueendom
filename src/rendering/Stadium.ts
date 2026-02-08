import * as THREE from 'three';
import { FIELD_WIDTH, FIELD_LENGTH } from '../data/Constants';

export class Stadium {
    group = new THREE.Group();
    private crowdMesh: THREE.InstancedMesh | null = null;
    private crowdTime = 0;
    private homeColor: number;
    private excitement = 0.2;
    private cheerTimer = 0;

    constructor(scene: THREE.Scene, homeColor: number = 0x1a73e8) {
        this.homeColor = homeColor;
        this.createBleachers();
        this.createFloodlights();
        this.createFence();
        this.createCrowd();
        scene.add(this.group);
    }

    private createCrowd(): void {
        const rowCount = 3;
        const peoplePerRow = 80;
        const totalPeople = rowCount * peoplePerRow * 2; 

        const personGeo = new THREE.CapsuleGeometry(0.12, 0.3, 2, 4);
        const personMat = new THREE.MeshStandardMaterial({ 
            roughness: 0.8,
            metalness: 0.1
        });

        personMat.onBeforeCompile = (shader) => {
            shader.uniforms.time = { value: 0 };
            shader.uniforms.excitement = { value: 0.2 };
            shader.uniforms.cheer = { value: 0 };
            
            shader.vertexShader = `
                uniform float time;
                uniform float excitement;
                uniform float cheer;
            ` + shader.vertexShader;
            
            shader.vertexShader = shader.vertexShader.replace(
                '#include <begin_vertex>',
                `
                #include <begin_vertex>
                float id = float(gl_InstanceID);
                
                // Base bobbing scales with excitement
                float bobSpeed = 3.0 + excitement * 5.0;
                float bobAmp = 0.02 + excitement * 0.08;
                float bounce = sin(time * bobSpeed + id * 0.5) * bobAmp;
                
                // Synchronized jump on cheer
                float jump = cheer * 0.25 * sin(time * 12.0 + id * 0.1);
                jump = max(0.0, jump); // only up
                
                if (transformed.y > 0.0) {
                    transformed.y += bounce + jump;
                    transformed.x += sin(time * 2.0 + id) * 0.02 * excitement;
                }
                `
            );
            this.group.userData.crowdShader = shader;
        };

        this.crowdMesh = new THREE.InstancedMesh(personGeo, personMat, totalPeople);
        this.crowdMesh.castShadow = true;

        const dummy = new THREE.Object3D();
        const colors = new Float32Array(totalPeople * 3);
        const homeTHREEColor = new THREE.Color(this.homeColor);
        let idx = 0;

        for (let side = 0; side < 2; side++) {
            const xDir = side === 0 ? -1 : 1;
            const xBase = (FIELD_WIDTH / 2 + 8) * xDir;

            for (let row = 0; row < rowCount; row++) {
                for (let p = 0; row < rowCount && p < peoplePerRow; p++) {
                    const z = (p / peoplePerRow) * (FIELD_LENGTH + 10) - 5;
                    const x = xBase + (row * 4 * xDir) + (THREE.MathUtils.randFloat(-0.5, 0.5));
                    const y = 1.2 + row * 1.5;

                    dummy.position.set(x, y, z);
                    dummy.rotation.y = side === 0 ? Math.PI / 2 : -Math.PI / 2;
                    dummy.updateMatrix();
                    this.crowdMesh.setMatrixAt(idx, dummy.matrix);

                    // Shirt colors: 70% Home team, 30% Random
                    if (Math.random() < 0.7) {
                        const variant = homeTHREEColor.clone().offsetHSL(0, 0, (Math.random() - 0.5) * 0.2);
                        colors[idx * 3] = variant.r;
                        colors[idx * 3 + 1] = variant.g;
                        colors[idx * 3 + 2] = variant.b;
                    } else {
                        const color = new THREE.Color().setHSL(Math.random(), 0.4, 0.5);
                        colors[idx * 3] = color.r;
                        colors[idx * 3 + 1] = color.g;
                        colors[idx * 3 + 2] = color.b;
                    }

                    idx++;
                }
            }
        }

        this.crowdMesh.instanceColor = new THREE.InstancedBufferAttribute(colors, 3);
        this.group.add(this.crowdMesh);
    }

    update(dt: number, excitement: number = 0.2): void {
        this.crowdTime += dt;
        this.excitement = excitement;
        
        if (this.cheerTimer > 0) {
            this.cheerTimer -= dt;
        }

        if (this.group.userData.crowdShader) {
            const shader = this.group.userData.crowdShader;
            shader.uniforms.time.value = this.crowdTime;
            shader.uniforms.excitement.value = this.excitement;
            shader.uniforms.cheer.value = Math.max(0, this.cheerTimer > 0 ? 1 : 0);
        }
    }

    triggerCheer(duration: number = 1.5): void {
        this.cheerTimer = duration;
    }

    private createBleachers(): void {
        const bleacherGeo = new THREE.BoxGeometry(FIELD_LENGTH + 20, 2, 5);
        const bleacherMat = new THREE.MeshStandardMaterial({ color: 0x444444, roughness: 0.8 });

        // Left side bleachers
        const left = new THREE.Mesh(bleacherGeo, bleacherMat);
        left.position.set(-FIELD_WIDTH / 2 - 8, 1, FIELD_LENGTH / 2);
        left.rotation.y = Math.PI / 2;
        left.castShadow = true;
        left.receiveShadow = true;
        this.group.add(left);

        // Right side bleachers
        const right = left.clone();
        right.position.x = FIELD_WIDTH / 2 + 8;
        this.group.add(right);

        // Add steps/tiers
        for (let i = 1; i < 3; i++) {
            const tier = new THREE.Mesh(
                new THREE.BoxGeometry(FIELD_LENGTH + 20, 2, 5),
                bleacherMat
            );
            tier.position.set(-FIELD_WIDTH / 2 - 8 - i * 4, 1 + i * 1.5, FIELD_LENGTH / 2);
            tier.rotation.y = Math.PI / 2;
            this.group.add(tier);

            const tierR = tier.clone();
            tierR.position.x = FIELD_WIDTH / 2 + 8 + i * 4;
            this.group.add(tierR);
        }
    }

    private createFloodlights(): void {
        const poleGeo = new THREE.CylinderGeometry(0.2, 0.3, 15, 8);
        const poleMat = new THREE.MeshStandardMaterial({ color: 0x222222 });
        const lightBoxGeo = new THREE.BoxGeometry(2, 1.5, 1);
        const lightBoxMat = new THREE.MeshStandardMaterial({ color: 0x111111 });
        const emissiveMat = new THREE.MeshStandardMaterial({ 
            color: 0xffffff, 
            emissive: 0xffffff, 
            emissiveIntensity: 5 
        });

        const corners = [
            [-FIELD_WIDTH / 2 - 15, -10],
            [FIELD_WIDTH / 2 + 15, -10],
            [-FIELD_WIDTH / 2 - 15, FIELD_LENGTH + 10],
            [FIELD_WIDTH / 2 + 15, FIELD_LENGTH + 10],
        ];

        for (const [x, z] of corners) {
            const pole = new THREE.Mesh(poleGeo, poleMat);
            pole.position.set(x, 7.5, z);
            pole.castShadow = true;
            this.group.add(pole);

            const box = new THREE.Mesh(lightBoxGeo, lightBoxMat);
            box.position.set(x, 15, z);
            box.lookAt(0, 5, FIELD_LENGTH / 2);
            this.group.add(box);

            const emissive = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 1.3), emissiveMat);
            emissive.position.set(0, 0, 0.51);
            box.add(emissive);
        }
    }

    private createFence(): void {
        // Simple low-poly boundary fence
        const fenceGeo = new THREE.BoxGeometry(FIELD_WIDTH + 20, 0.8, 0.1);
        const fenceMat = new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.9 });

        const back = new THREE.Mesh(fenceGeo, fenceMat);
        back.position.set(0, 0.4, -5);
        this.group.add(back);

        const front = back.clone();
        front.position.z = FIELD_LENGTH + 5;
        this.group.add(front);

        const sideGeo = new THREE.BoxGeometry(FIELD_LENGTH + 10, 0.8, 0.1);
        const left = new THREE.Mesh(sideGeo, fenceMat);
        left.position.set(-FIELD_WIDTH / 2 - 5, 0.4, FIELD_LENGTH / 2);
        left.rotation.y = Math.PI / 2;
        this.group.add(left);

        const right = left.clone();
        right.position.x = FIELD_WIDTH / 2 + 5;
        this.group.add(right);
    }
}
