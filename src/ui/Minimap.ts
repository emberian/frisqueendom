import * as THREE from 'three';
import type { Player } from '../entities/Player';
import type { Disc } from '../entities/Disc';
import { FIELD_LENGTH, FIELD_WIDTH } from '../data/Constants';

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
