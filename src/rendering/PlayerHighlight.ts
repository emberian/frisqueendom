import * as THREE from 'three';

/**
 * PlayerHighlight -- visual indicator for the player-controlled stickman.
 *
 * Two elements parented under a single THREE.Group:
 *   1. Ground ring:  team-colored, additive-blend glow, pulsing opacity
 *   2. Overhead arrow: downward-pointing chevron, billboarded, bobbing
 *
 * The group is positioned at the player's feet each frame via update().
 */
export class PlayerHighlight {
    private group = new THREE.Group();

    // Ground ring
    private ringMesh: THREE.Mesh;
    private ringMat: THREE.MeshBasicMaterial;

    // Arrow indicator
    private arrowMesh: THREE.Mesh;
    private arrowMat: THREE.MeshBasicMaterial;

    // Animation accumulators
    private time = 0;

    // Constants
    private static readonly RING_INNER = 0.45;
    private static readonly RING_OUTER = 0.60;
    private static readonly RING_Y_OFFSET = 0.02; // tiny lift off ground to avoid z-fight
    private static readonly PULSE_MIN = 0.3;
    private static readonly PULSE_MAX = 0.6;
    private static readonly PULSE_PERIOD = 2.0; // seconds for full breathe cycle
    private static readonly ARROW_BASE_Y = 2.2;
    private static readonly ARROW_BOB_AMP = 0.05;
    private static readonly ARROW_BOB_PERIOD = 1.5;

    constructor(color: number) {
        // --- Ground ring ---
        const ringGeo = new THREE.RingGeometry(
            PlayerHighlight.RING_INNER,
            PlayerHighlight.RING_OUTER,
            48,
        );
        ringGeo.rotateX(-Math.PI / 2); // lay flat, face up

        this.ringMat = new THREE.MeshBasicMaterial({
            color,
            transparent: true,
            opacity: PlayerHighlight.PULSE_MIN,
            side: THREE.DoubleSide,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
        });

        this.ringMesh = new THREE.Mesh(ringGeo, this.ringMat);
        this.ringMesh.position.y = PlayerHighlight.RING_Y_OFFSET;
        this.ringMesh.renderOrder = 1; // draw after opaque geometry
        this.group.add(this.ringMesh);

        // --- Overhead arrow (downward-pointing chevron) ---
        const arrowShape = new THREE.Shape();
        // Chevron pointing downward:  wide at top, point at bottom
        //        (-w, h)-----(w, h)
        //            \       /
        //             \     /
        //              \   /
        //               \ /
        //              (0, 0)
        const w = 0.12;
        const h = 0.10;
        const t = 0.035; // thickness of the chevron arms
        arrowShape.moveTo(0, 0);              // bottom tip
        arrowShape.lineTo(-w, h);             // top-left outer
        arrowShape.lineTo(-w + t, h);         // top-left inner
        arrowShape.lineTo(0, t);              // inner tip
        arrowShape.lineTo(w - t, h);          // top-right inner
        arrowShape.lineTo(w, h);              // top-right outer
        arrowShape.lineTo(0, 0);              // back to tip

        const arrowGeo = new THREE.ShapeGeometry(arrowShape);

        this.arrowMat = new THREE.MeshBasicMaterial({
            color,
            transparent: true,
            opacity: 0.85,
            side: THREE.DoubleSide,
            depthWrite: false,
        });

        this.arrowMesh = new THREE.Mesh(arrowGeo, this.arrowMat);
        this.arrowMesh.position.y = PlayerHighlight.ARROW_BASE_Y;
        this.arrowMesh.renderOrder = 2;
        this.group.add(this.arrowMesh);

        this.group.visible = false;
    }

    /**
     * Tick animations and reposition the highlight at the player's feet.
     * Call every frame from the game loop.
     */
    update(dt: number, playerPosition: THREE.Vector3): void {
        this.time += dt;

        // Move entire group to player XZ, ground level
        this.group.position.copy(playerPosition);
        this.group.position.y = 0; // ring sits on the field

        // --- Ring pulse (sin breathe, mapped to [PULSE_MIN, PULSE_MAX]) ---
        const pulseT =
            (Math.sin((this.time / PlayerHighlight.PULSE_PERIOD) * Math.PI * 2) + 1) * 0.5;
        this.ringMat.opacity =
            PlayerHighlight.PULSE_MIN +
            pulseT * (PlayerHighlight.PULSE_MAX - PlayerHighlight.PULSE_MIN);

        // --- Arrow bob ---
        const bobOffset =
            Math.sin((this.time / PlayerHighlight.ARROW_BOB_PERIOD) * Math.PI * 2) *
            PlayerHighlight.ARROW_BOB_AMP;
        this.arrowMesh.position.y = PlayerHighlight.ARROW_BASE_Y + bobOffset;
    }

    /**
     * Billboard the arrow so it always faces the active camera.
     * Call after camera updates each frame, passing the camera instance.
     * If no camera is available the arrow still renders but won't rotate.
     */
    billboardArrow(camera: THREE.Camera): void {
        // Make the arrow face the camera while staying upright
        _billboardTarget.copy(this.arrowMesh.getWorldPosition(_billboardPos));
        _billboardTarget.x = camera.position.x;
        _billboardTarget.z = camera.position.z;
        // Keep arrow y at its current world y so it doesn't tilt vertically
        _billboardTarget.y = this.arrowMesh.getWorldPosition(_billboardPos).y;
        this.arrowMesh.lookAt(_billboardTarget);
    }

    /** Show or hide the entire highlight. */
    setVisible(visible: boolean): void {
        this.group.visible = visible;
    }

    /** Change the team color of both ring and arrow. */
    setColor(color: number): void {
        this.ringMat.color.setHex(color);
        this.arrowMat.color.setHex(color);
    }

    /** Returns the THREE.Group to add to the scene graph. */
    getGroup(): THREE.Group {
        return this.group;
    }

    /** Clean up GPU resources. */
    dispose(): void {
        this.ringMesh.geometry.dispose();
        this.ringMat.dispose();
        this.arrowMesh.geometry.dispose();
        this.arrowMat.dispose();
    }
}

// Reusable vectors to avoid per-frame allocations
const _billboardPos = new THREE.Vector3();
const _billboardTarget = new THREE.Vector3();
