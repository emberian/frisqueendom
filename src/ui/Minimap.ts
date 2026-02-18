import * as THREE from 'three';
import type { Player } from '../entities/Player';
import type { Disc } from '../entities/Disc';
import { FIELD_LENGTH, FIELD_WIDTH } from '../data/Constants';
import type { DebugSnapshot } from '../ai/TeamAI';

export class Minimap {
    private canvas: HTMLCanvasElement;
    private ctx: CanvasRenderingContext2D;
    private container: HTMLDivElement;
    private visible = true;

    // Minimap dimensions
    private readonly width = 160;
    private readonly height = 280;
    private readonly padding = 8;

    constructor() {
        // Create container
        this.container = document.createElement('div');
        this.container.style.position = 'fixed';
        this.container.style.bottom = '20px';
        this.container.style.right = '20px';
        this.container.style.width = `${this.width}px`;
        this.container.style.height = `${this.height}px`;
        this.container.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
        this.container.style.border = '2px solid rgba(255, 255, 255, 0.3)';
        this.container.style.borderRadius = '4px';
        this.container.style.zIndex = '1000';
        this.container.style.pointerEvents = 'none';

        // Create canvas
        this.canvas = document.createElement('canvas');
        this.canvas.width = this.width;
        this.canvas.height = this.height;
        this.canvas.style.display = 'block';
        this.container.appendChild(this.canvas);

        // Get context
        const ctx = this.canvas.getContext('2d');
        if (!ctx) {
            throw new Error('Failed to get 2D context for minimap');
        }
        this.ctx = ctx;

        // Add to DOM
        document.body.appendChild(this.container);
    }

    /**
     * Convert world position to minimap coordinates
     */
    private worldToMinimap(worldPos: THREE.Vector3): { x: number; y: number } {
        // Field is centered at (0, 0, 0) with:
        // - X: -FIELD_WIDTH/2 to +FIELD_WIDTH/2
        // - Z: 0 to FIELD_LENGTH
        const drawWidth = this.width - this.padding * 2;
        const drawHeight = this.height - this.padding * 2;

        // Map world coordinates to minimap
        const x = this.padding + ((worldPos.x + FIELD_WIDTH / 2) / FIELD_WIDTH) * drawWidth;
        const y = this.padding + (worldPos.z / FIELD_LENGTH) * drawHeight;

        return { x, y };
    }

    /**
     * Update and render the minimap
     */
    update(
        players: Player[],
        disc: Disc,
        controlledPlayer: Player | null,
        camera: THREE.Camera,
    ): void {
        if (!this.visible) return;

        // Clear canvas
        this.ctx.clearRect(0, 0, this.width, this.height);

        const drawWidth = this.width - this.padding * 2;
        const drawHeight = this.height - this.padding * 2;

        // Draw field background
        this.ctx.fillStyle = 'rgba(50, 150, 50, 0.3)';
        this.ctx.fillRect(this.padding, this.padding, drawWidth, drawHeight);

        // Draw field lines
        this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
        this.ctx.lineWidth = 1;

        // Sidelines
        this.ctx.strokeRect(this.padding, this.padding, drawWidth, drawHeight);

        // Endzone lines (18m from each end)
        const endzoneDepth = 18;
        const endzonePixels = (endzoneDepth / FIELD_LENGTH) * drawHeight;

        this.ctx.beginPath();
        this.ctx.moveTo(this.padding, this.padding + endzonePixels);
        this.ctx.lineTo(this.padding + drawWidth, this.padding + endzonePixels);
        this.ctx.stroke();

        this.ctx.beginPath();
        this.ctx.moveTo(this.padding, this.padding + drawHeight - endzonePixels);
        this.ctx.lineTo(this.padding + drawWidth, this.padding + drawHeight - endzonePixels);
        this.ctx.stroke();

        // Draw camera view cone (semi-transparent)
        if (camera) {
            const cameraPos = camera.position;
            const minimapCam = this.worldToMinimap(cameraPos);

            // Get camera direction
            const cameraDir = new THREE.Vector3();
            camera.getWorldDirection(cameraDir);
            const cameraAngle = Math.atan2(cameraDir.x, cameraDir.z);

            // Draw cone
            this.ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
            this.ctx.beginPath();
            this.ctx.moveTo(minimapCam.x, minimapCam.y);

            const coneAngle = Math.PI / 4; // 45 degree cone
            const coneLength = 40;

            const angle1 = cameraAngle - coneAngle;
            const angle2 = cameraAngle + coneAngle;

            this.ctx.lineTo(
                minimapCam.x + Math.sin(angle1) * coneLength,
                minimapCam.y + Math.cos(angle1) * coneLength
            );
            this.ctx.lineTo(
                minimapCam.x + Math.sin(angle2) * coneLength,
                minimapCam.y + Math.cos(angle2) * coneLength
            );
            this.ctx.closePath();
            this.ctx.fill();
        }

        // Draw players
        for (const player of players) {
            const pos = this.worldToMinimap(player.movement.position);

            // Choose color based on team
            if (player.team === 'home') {
                this.ctx.fillStyle = 'rgba(26, 115, 232, 1)'; // Blue
            } else {
                this.ctx.fillStyle = 'rgba(232, 26, 26, 1)'; // Red
            }

            // Draw player dot
            this.ctx.beginPath();
            this.ctx.arc(pos.x, pos.y, 3, 0, Math.PI * 2);
            this.ctx.fill();

            // Highlight controlled player
            if (controlledPlayer && player === controlledPlayer) {
                this.ctx.strokeStyle = 'rgba(255, 255, 0, 1)'; // Yellow
                this.ctx.lineWidth = 2;
                this.ctx.beginPath();
                this.ctx.arc(pos.x, pos.y, 5, 0, Math.PI * 2);
                this.ctx.stroke();
            }
        }

        // Draw disc
        if (disc.state !== 'held') {
            const discPos = this.worldToMinimap(disc.position);
            this.ctx.fillStyle = 'rgba(255, 255, 255, 1)'; // White
            this.ctx.beginPath();
            this.ctx.arc(discPos.x, discPos.y, 4, 0, Math.PI * 2);
            this.ctx.fill();
        }
    }

    /**
     * Draw AI debug overlays on the minimap.
     * Call after update() so it draws on top of players/disc.
     */
    drawDebug(
        offSnap: DebugSnapshot | null,
        defSnap: DebugSnapshot | null,
        allPlayers: Array<{ index: number; movement: { position: THREE.Vector3 } }>,
    ): void {
        if (!this.visible) return;
        const ctx = this.ctx;

        // Helper to convert a raw {x,z} to minimap coords
        const toMM = (x: number, z: number) => {
            const dw = this.width - this.padding * 2;
            const dh = this.height - this.padding * 2;
            return {
                x: this.padding + ((x + FIELD_WIDTH / 2) / FIELD_WIDTH) * dw,
                y: this.padding + (z / FIELD_LENGTH) * dh,
            };
        };

        // --- Receiver eval lines (thrower → receivers) ---
        if (offSnap?.throwerPos && offSnap.receiverEvals.length > 0) {
            const tp = toMM(offSnap.throwerPos.x, offSnap.throwerPos.z);
            for (const ev of offSnap.receiverEvals) {
                const rp = toMM(ev.receiverPos.x, ev.receiverPos.z);
                const t = Math.max(0, Math.min(1, (ev.score + 0.3) / 0.6));
                const r = Math.round((1 - t) * 255);
                const g = Math.round(t * 255);
                ctx.strokeStyle = ev.selected
                    ? `rgba(0,255,255,0.9)`
                    : `rgba(${r},${g},0,0.5)`;
                ctx.lineWidth = ev.selected ? 2 : 1;
                ctx.beginPath();
                ctx.moveTo(tp.x, tp.y);
                ctx.lineTo(rp.x, rp.y);
                ctx.stroke();
            }
        }

        // --- Lead pass target ---
        if (offSnap?.leadPassTarget) {
            const lt = toMM(offSnap.leadPassTarget.x, offSnap.leadPassTarget.z);
            ctx.fillStyle = 'rgba(255,255,0,0.9)';
            ctx.beginPath();
            ctx.arc(lt.x, lt.y, 3, 0, Math.PI * 2);
            ctx.fill();
        }

        // --- Cut target lines ---
        if (offSnap) {
            for (const cv of offSnap.cutVisualizations) {
                const from = toMM(cv.from.x, cv.from.z);
                const to = toMM(cv.to.x, cv.to.z);
                ctx.strokeStyle = cv.isActive ? 'rgba(255,136,0,0.8)' : 'rgba(120,120,120,0.4)';
                ctx.lineWidth = cv.isActive ? 1.5 : 1;
                ctx.beginPath();
                ctx.moveTo(from.x, from.y);
                ctx.lineTo(to.x, to.y);
                ctx.stroke();
            }
        }

        // --- Defensive matchup lines ---
        if (defSnap) {
            ctx.strokeStyle = 'rgba(200,200,200,0.25)';
            ctx.lineWidth = 1;
            for (const mu of defSnap.matchups) {
                const defP = allPlayers.find(p => p.index === mu.defenderIndex);
                const markP = allPlayers.find(p => p.index === mu.markIndex);
                if (!defP || !markP) continue;
                const dp = toMM(defP.movement.position.x, defP.movement.position.z);
                const mp = toMM(markP.movement.position.x, markP.movement.position.z);
                ctx.beginPath();
                ctx.moveTo(dp.x, dp.y);
                ctx.lineTo(mp.x, mp.y);
                ctx.stroke();
            }
        }

        // --- Formation markers ---
        if (offSnap) {
            ctx.strokeStyle = 'rgba(68,136,255,0.6)';
            ctx.lineWidth = 1;
            for (const fp of offSnap.formationPositions) {
                const p = toMM(fp.x, fp.z);
                ctx.beginPath();
                ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
                ctx.stroke();
            }
        }

        // --- Force side arrow ---
        if (defSnap?.forceSideOrigin) {
            const orig = toMM(defSnap.forceSideOrigin.x, defSnap.forceSideOrigin.z);
            const tip = toMM(
                defSnap.forceSideOrigin.x + defSnap.forceSide * 4,
                defSnap.forceSideOrigin.z,
            );
            ctx.strokeStyle = 'rgba(255,68,68,0.7)';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(orig.x, orig.y);
            ctx.lineTo(tip.x, tip.y);
            ctx.stroke();
            // Arrowhead
            const angle = Math.atan2(tip.y - orig.y, tip.x - orig.x);
            ctx.beginPath();
            ctx.moveTo(tip.x, tip.y);
            ctx.lineTo(tip.x - 5 * Math.cos(angle - 0.5), tip.y - 5 * Math.sin(angle - 0.5));
            ctx.moveTo(tip.x, tip.y);
            ctx.lineTo(tip.x - 5 * Math.cos(angle + 0.5), tip.y - 5 * Math.sin(angle + 0.5));
            ctx.stroke();
        }
    }

    /**
     * Reposition the minimap container
     */
    setPosition(position: 'bottom-right' | 'top-right'): void {
        if (position === 'top-right') {
            this.container.style.top = '60px';
            this.container.style.bottom = 'auto';
        } else {
            this.container.style.top = 'auto';
            this.container.style.bottom = '20px';
        }
    }

    /**
     * Shrink and reposition minimap for mobile touch screens.
     * Moves to top-left corner to avoid conflicting with touch controls at bottom.
     */
    setMobileMode(enabled: boolean): void {
        if (enabled) {
            const scale = 0.55;
            const w = Math.round(this.width * scale);
            const h = Math.round(this.height * scale);
            this.container.style.width = `${w}px`;
            this.container.style.height = `${h}px`;
            this.canvas.style.width = `${w}px`;
            this.canvas.style.height = `${h}px`;
            this.container.style.top = '80px';
            this.container.style.bottom = 'auto';
            this.container.style.right = '8px';
            this.container.style.opacity = '0.75';
        } else {
            this.container.style.width = `${this.width}px`;
            this.container.style.height = `${this.height}px`;
            this.canvas.style.width = `${this.width}px`;
            this.canvas.style.height = `${this.height}px`;
            this.container.style.top = 'auto';
            this.container.style.bottom = '20px';
            this.container.style.right = '20px';
            this.container.style.opacity = '1';
        }
    }

    /**
     * Show the minimap
     */
    show(): void {
        this.visible = true;
        this.container.style.display = 'block';
    }

    /**
     * Hide the minimap
     */
    hide(): void {
        this.visible = false;
        this.container.style.display = 'none';
    }

    /**
     * Toggle minimap visibility
     */
    toggle(): void {
        if (this.visible) {
            this.hide();
        } else {
            this.show();
        }
    }

    /**
     * Remove minimap from DOM
     */
    dispose(): void {
        if (this.container.parentElement) {
            this.container.parentElement.removeChild(this.container);
        }
    }
}
