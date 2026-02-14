import * as THREE from 'three';
import { FIELD_WIDTH, FIELD_LENGTH } from '../data/Constants';

export class Stadium {
    group = new THREE.Group();
    private crowdMesh: THREE.InstancedMesh | null = null;
    private crowdTime = 0;
    private homeColor: number;
    private excitement = 0.2;
    private cheerTimer = 0;

    // Team banners
    private bannerMeshes: THREE.Mesh[] = [];
    private bannerTextures: THREE.CanvasTexture[] = [];
    private bannerCanvases: HTMLCanvasElement[] = [];

    // Scoreboard
    private scoreboardTexture: THREE.CanvasTexture | null = null;
    private scoreboardCanvas: HTMLCanvasElement | null = null;
    private homeName = 'HOME';
    private awayName = 'AWAY';

    constructor(scene: THREE.Scene, homeColor: number = 0x1a73e8) {
        this.homeColor = homeColor;
        this.createBleachers();
        this.createFloodlights();
        this.createFence();
        this.createCrowd();
        this.createBanners();
        this.createScoreboard();
        this.createCrowdLOD();
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

        // Banner wind sway - each banner gets a slightly different phase
        for (let i = 0; i < this.bannerMeshes.length; i++) {
            const banner = this.bannerMeshes[i];
            const phase = i * 1.3;
            banner.rotation.z = Math.sin(this.crowdTime * 1.5 + phase) * 0.06;
            banner.rotation.x = Math.sin(this.crowdTime * 1.1 + phase + 0.7) * 0.03;
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

    // ---- Team Banners ----

    private createBannerTexture(text: string, color: number): { canvas: HTMLCanvasElement; texture: THREE.CanvasTexture } {
        const canvas = document.createElement('canvas');
        canvas.width = 256;
        canvas.height = 512;
        const ctx = canvas.getContext('2d')!;

        // Fill with team color
        const c = new THREE.Color(color);
        ctx.fillStyle = `rgb(${Math.floor(c.r * 255)},${Math.floor(c.g * 255)},${Math.floor(c.b * 255)})`;
        ctx.fillRect(0, 0, 256, 512);

        // Darker border
        ctx.strokeStyle = 'rgba(0,0,0,0.4)';
        ctx.lineWidth = 6;
        ctx.strokeRect(3, 3, 250, 506);

        // Team name text - vertical, centered
        ctx.save();
        ctx.translate(128, 256);
        ctx.rotate(-Math.PI / 2);
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 42px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.shadowColor = 'rgba(0,0,0,0.6)';
        ctx.shadowBlur = 4;
        ctx.fillText(text.toUpperCase(), 0, 0);
        ctx.restore();

        const texture = new THREE.CanvasTexture(canvas);
        texture.needsUpdate = true;
        return { canvas, texture };
    }

    private createBanners(): void {
        const poleHeight = 8;
        const bannerWidth = 1.5;
        const bannerHeight = 3;

        const poleGeo = new THREE.CylinderGeometry(0.06, 0.08, poleHeight, 6);
        const poleMat = new THREE.MeshStandardMaterial({ color: 0x555555, metalness: 0.6, roughness: 0.3 });

        // Banner positions: 4 corners of the sidelines
        // Each sideline gets 2 banners (near each endzone)
        // Left sideline: x = -(FIELD_WIDTH/2 + 4), Right sideline: x = (FIELD_WIDTH/2 + 4)
        // Near endzone 0: z = 5, Near endzone 1: z = FIELD_LENGTH - 5
        const sideOffset = FIELD_WIDTH / 2 + 4;
        const positions: [number, number, number, number][] = [
            // [x, z, inward angle Y, team index (0=home, 1=away)]
            [-sideOffset, 5,           0.15, 0],
            [-sideOffset, FIELD_LENGTH - 5, 0.15, 1],
            [ sideOffset, 5,          -0.15, 0],
            [ sideOffset, FIELD_LENGTH - 5, -0.15, 1],
        ];

        for (const [x, z, angleY, teamIdx] of positions) {
            // Pole
            const pole = new THREE.Mesh(poleGeo, poleMat);
            pole.position.set(x, poleHeight / 2, z);
            pole.castShadow = true;
            this.group.add(pole);

            // Banner texture (default names/colors, updated via setTeamNames)
            const defaultColor = teamIdx === 0 ? 0x1a73e8 : 0xe81a1a;
            const defaultName = teamIdx === 0 ? 'HOME' : 'AWAY';
            const { canvas, texture } = this.createBannerTexture(defaultName, defaultColor);

            const bannerGeo = new THREE.PlaneGeometry(bannerWidth, bannerHeight);
            const bannerMat = new THREE.MeshStandardMaterial({
                map: texture,
                side: THREE.DoubleSide,
                roughness: 0.7,
                metalness: 0.0,
            });

            const banner = new THREE.Mesh(bannerGeo, bannerMat);
            // Hang from top of pole, banner center is offset downward
            banner.position.set(x, poleHeight - bannerHeight / 2 - 0.2, z);
            banner.rotation.y = angleY;
            banner.castShadow = true;
            this.group.add(banner);

            this.bannerMeshes.push(banner);
            this.bannerTextures.push(texture);
            this.bannerCanvases.push(canvas);
        }
    }

    /** Update banner textures with team names and colors. */
    setTeamNames(home: string, away: string, homeColor: number, awayColor: number): void {
        this.homeName = home;
        this.awayName = away;

        // Banners 0,2 are home (near endzone 0 on each sideline)
        // Banners 1,3 are away (near endzone 1 on each sideline)
        const assignments: [string, number][] = [
            [home, homeColor],
            [away, awayColor],
            [home, homeColor],
            [away, awayColor],
        ];

        for (let i = 0; i < this.bannerCanvases.length; i++) {
            const [text, color] = assignments[i];
            const { canvas, texture } = this.createBannerTexture(text, color);
            // Replace the old texture on the material
            const mat = (this.bannerMeshes[i].material as THREE.MeshStandardMaterial);
            mat.map = texture;
            mat.needsUpdate = true;
            // Dispose old texture
            this.bannerTextures[i].dispose();
            this.bannerTextures[i] = texture;
            this.bannerCanvases[i] = canvas;
        }
    }

    // ---- 3D Scoreboard ----

    private renderScoreboardTexture(homeScore: number, awayScore: number): void {
        const canvas = this.scoreboardCanvas;
        if (!canvas) return;
        const ctx = canvas.getContext('2d')!;

        // Dark background
        ctx.fillStyle = '#111118';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Subtle border glow
        ctx.strokeStyle = '#44aaff';
        ctx.lineWidth = 4;
        ctx.strokeRect(4, 4, canvas.width - 8, canvas.height - 8);

        // Team names and score
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 48px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        const centerY = canvas.height / 2;
        const homeTxt = this.homeName.toUpperCase();
        const awayTxt = this.awayName.toUpperCase();

        // HOME  0 - 0  AWAY
        ctx.font = 'bold 36px sans-serif';
        ctx.fillText(homeTxt, 140, centerY - 4);

        ctx.font = 'bold 56px sans-serif';
        ctx.fillStyle = '#ffdd44';
        ctx.fillText(`${homeScore}  -  ${awayScore}`, canvas.width / 2, centerY - 4);

        ctx.font = 'bold 36px sans-serif';
        ctx.fillStyle = '#ffffff';
        ctx.fillText(awayTxt, canvas.width - 140, centerY - 4);

        if (this.scoreboardTexture) {
            this.scoreboardTexture.needsUpdate = true;
        }
    }

    private createScoreboard(): void {
        const boardWidth = 10;
        const boardHeight = 3;
        const poleHeight = 9;
        const boardElevation = poleHeight + boardHeight / 2;

        // Position behind endzone 0 (z < 0)
        const boardZ = -8;
        const boardX = 0;

        // Support poles
        const poleGeo = new THREE.CylinderGeometry(0.15, 0.2, poleHeight, 6);
        const poleMat = new THREE.MeshStandardMaterial({ color: 0x333333, metalness: 0.5, roughness: 0.4 });

        const poleL = new THREE.Mesh(poleGeo, poleMat);
        poleL.position.set(boardX - boardWidth / 2 + 0.5, poleHeight / 2, boardZ);
        poleL.castShadow = true;
        this.group.add(poleL);

        const poleR = new THREE.Mesh(poleGeo, poleMat);
        poleR.position.set(boardX + boardWidth / 2 - 0.5, poleHeight / 2, boardZ);
        poleR.castShadow = true;
        this.group.add(poleR);

        // Board frame
        const frameGeo = new THREE.BoxGeometry(boardWidth + 0.4, boardHeight + 0.4, 0.5);
        const frameMat = new THREE.MeshStandardMaterial({ color: 0x222222, metalness: 0.3, roughness: 0.6 });
        const frame = new THREE.Mesh(frameGeo, frameMat);
        frame.position.set(boardX, boardElevation, boardZ);
        frame.castShadow = true;
        this.group.add(frame);

        // Canvas texture for score display
        const canvas = document.createElement('canvas');
        canvas.width = 1024;
        canvas.height = 256;
        this.scoreboardCanvas = canvas;
        this.scoreboardTexture = new THREE.CanvasTexture(canvas);

        this.renderScoreboardTexture(0, 0);

        // Score face - front of board
        const faceGeo = new THREE.PlaneGeometry(boardWidth, boardHeight);
        const faceMat = new THREE.MeshStandardMaterial({
            map: this.scoreboardTexture,
            emissive: 0x222244,
            emissiveIntensity: 0.8,
            roughness: 0.5,
        });
        const face = new THREE.Mesh(faceGeo, faceMat);
        face.position.set(boardX, boardElevation, boardZ + 0.26);
        this.group.add(face);
    }

    /** Update the scoreboard display with new scores. */
    updateScore(home: number, away: number): void {
        this.renderScoreboardTexture(home, away);
    }

    // ---- Crowd LOD (distant filler strips) ----

    private createCrowdLOD(): void {
        // 2-3 horizontal strips of colored boxes along each sideline, behind the bleachers
        // These represent distant seated spectators at a coarse LOD
        const stripLength = FIELD_LENGTH + 16;
        const stripHeight = 0.8;
        const stripDepth = 3;
        const rowCount = 3;

        // Section colors alternate to suggest different crowd sections
        const sectionColors = [0x993333, 0x336699, 0x996633, 0x339966, 0x663399];

        const sideOffsetBase = FIELD_WIDTH / 2 + 18; // behind the outermost bleacher tier

        for (let side = 0; side < 2; side++) {
            const xDir = side === 0 ? -1 : 1;

            for (let row = 0; row < rowCount; row++) {
                // Split each row into ~5 sections with alternating colors
                const sectionsPerRow = 5;
                const sectionLength = stripLength / sectionsPerRow;

                for (let s = 0; s < sectionsPerRow; s++) {
                    const colorIdx = (row * sectionsPerRow + s + side) % sectionColors.length;
                    const color = sectionColors[colorIdx];

                    const geo = new THREE.BoxGeometry(sectionLength - 0.3, stripHeight, stripDepth);
                    const mat = new THREE.MeshStandardMaterial({
                        color,
                        roughness: 0.9,
                        metalness: 0.0,
                    });

                    const strip = new THREE.Mesh(geo, mat);
                    const x = (sideOffsetBase + row * 3.5) * xDir;
                    const y = 2.5 + row * 1.8;
                    const z = -8 + sectionLength / 2 + s * sectionLength;

                    strip.position.set(x, y, z);
                    strip.receiveShadow = true;
                    this.group.add(strip);
                }
            }
        }
    }
}
