import * as THREE from 'three';
import type { DebugSnapshot } from '../ai/TeamAI';

const MAX_EVAL_LINES = 7;
const MAX_CUT_LINES = 7;
const MAX_MATCHUP_LINES = 7;
const MAX_FORMATION = 7;

// Reusable temp vectors
const _v = new THREE.Vector3();
const _m = new THREE.Matrix4();

export class DebugVisuals {
    private scene: THREE.Scene;
    private visible = false;
    private focusTeam: 'offense' | 'defense' | 'both' = 'both';

    // Receiver evaluation lines (thrower → receivers, colored by score)
    private evalGeom: THREE.BufferGeometry;
    private evalPositions: Float32Array;
    private evalColors: Float32Array;
    private evalLines: THREE.LineSegments;

    // Selected throw arrow (line + cone head)
    private throwLine: THREE.Line;
    private throwLineGeom: THREE.BufferGeometry;
    private throwLinePositions: Float32Array;
    private throwCone: THREE.Mesh;

    // Lead pass target marker
    private leadMarker: THREE.Mesh;

    // Cut target lines
    private cutGeom: THREE.BufferGeometry;
    private cutPositions: Float32Array;
    private cutColors: Float32Array;
    private cutLines: THREE.LineSegments;

    // Defensive matchup lines
    private matchupGeom: THREE.BufferGeometry;
    private matchupPositions: Float32Array;
    private matchupLines: THREE.LineSegments;

    // Formation position markers
    private formationMesh: THREE.InstancedMesh;

    // Force side arrow
    private forceLine: THREE.Line;
    private forceLineGeom: THREE.BufferGeometry;
    private forceLinePositions: Float32Array;
    private forceCone: THREE.Mesh;

    // DOM info panel
    private infoPanel: HTMLDivElement;

    // Latest snapshots for the info panel
    private lastOffSnap: DebugSnapshot | null = null;
    private lastDefSnap: DebugSnapshot | null = null;

    constructor() {
        this.scene = new THREE.Scene();

        // --- Eval lines ---
        this.evalPositions = new Float32Array(MAX_EVAL_LINES * 2 * 3);
        this.evalColors = new Float32Array(MAX_EVAL_LINES * 2 * 3);
        this.evalGeom = new THREE.BufferGeometry();
        this.evalGeom.setAttribute('position', new THREE.BufferAttribute(this.evalPositions, 3));
        this.evalGeom.setAttribute('color', new THREE.BufferAttribute(this.evalColors, 3));
        this.evalLines = new THREE.LineSegments(this.evalGeom, new THREE.LineBasicMaterial({
            vertexColors: true, transparent: true, opacity: 0.7, depthTest: false,
        }));
        this.evalLines.frustumCulled = false;
        this.evalLines.renderOrder = 999;
        this.scene.add(this.evalLines);

        // --- Throw arrow ---
        this.throwLinePositions = new Float32Array(2 * 3);
        this.throwLineGeom = new THREE.BufferGeometry();
        this.throwLineGeom.setAttribute('position', new THREE.BufferAttribute(this.throwLinePositions, 3));
        this.throwLine = new THREE.Line(this.throwLineGeom, new THREE.LineBasicMaterial({
            color: 0x00ffff, depthTest: false, transparent: true, opacity: 0.9,
        }));
        this.throwLine.frustumCulled = false;
        this.throwLine.renderOrder = 1000;
        this.throwLine.visible = false;
        this.scene.add(this.throwLine);

        const coneGeo = new THREE.ConeGeometry(0.35, 0.8, 6);
        coneGeo.rotateX(Math.PI / 2);
        this.throwCone = new THREE.Mesh(coneGeo, new THREE.MeshBasicMaterial({
            color: 0x00ffff, depthTest: false, transparent: true, opacity: 0.9,
        }));
        this.throwCone.renderOrder = 1000;
        this.throwCone.visible = false;
        this.scene.add(this.throwCone);

        // --- Lead pass marker ---
        this.leadMarker = new THREE.Mesh(
            new THREE.SphereGeometry(0.3, 8, 6),
            new THREE.MeshBasicMaterial({ color: 0xffff00, depthTest: false, transparent: true, opacity: 0.8 }),
        );
        this.leadMarker.renderOrder = 1000;
        this.leadMarker.visible = false;
        this.scene.add(this.leadMarker);

        // --- Cut lines ---
        this.cutPositions = new Float32Array(MAX_CUT_LINES * 2 * 3);
        this.cutColors = new Float32Array(MAX_CUT_LINES * 2 * 3);
        this.cutGeom = new THREE.BufferGeometry();
        this.cutGeom.setAttribute('position', new THREE.BufferAttribute(this.cutPositions, 3));
        this.cutGeom.setAttribute('color', new THREE.BufferAttribute(this.cutColors, 3));
        this.cutLines = new THREE.LineSegments(this.cutGeom, new THREE.LineBasicMaterial({
            vertexColors: true, transparent: true, opacity: 0.8, depthTest: false,
        }));
        this.cutLines.frustumCulled = false;
        this.cutLines.renderOrder = 999;
        this.scene.add(this.cutLines);

        // --- Matchup lines ---
        this.matchupPositions = new Float32Array(MAX_MATCHUP_LINES * 2 * 3);
        this.matchupGeom = new THREE.BufferGeometry();
        this.matchupGeom.setAttribute('position', new THREE.BufferAttribute(this.matchupPositions, 3));
        this.matchupLines = new THREE.LineSegments(this.matchupGeom, new THREE.LineBasicMaterial({
            color: 0xcccccc, transparent: true, opacity: 0.3, depthTest: false,
        }));
        this.matchupLines.frustumCulled = false;
        this.matchupLines.renderOrder = 998;
        this.scene.add(this.matchupLines);

        // --- Formation markers (instanced rings on ground) ---
        const ringGeo = new THREE.RingGeometry(0.35, 0.5, 12);
        ringGeo.rotateX(-Math.PI / 2);
        const ringMat = new THREE.MeshBasicMaterial({
            color: 0x4488ff, transparent: true, opacity: 0.5, depthTest: false, side: THREE.DoubleSide,
        });
        this.formationMesh = new THREE.InstancedMesh(ringGeo, ringMat, MAX_FORMATION);
        this.formationMesh.count = 0;
        this.formationMesh.frustumCulled = false;
        this.formationMesh.renderOrder = 997;
        this.scene.add(this.formationMesh);

        // --- Force side arrow ---
        this.forceLinePositions = new Float32Array(2 * 3);
        this.forceLineGeom = new THREE.BufferGeometry();
        this.forceLineGeom.setAttribute('position', new THREE.BufferAttribute(this.forceLinePositions, 3));
        this.forceLine = new THREE.Line(this.forceLineGeom, new THREE.LineBasicMaterial({
            color: 0xff4444, depthTest: false, transparent: true, opacity: 0.7,
        }));
        this.forceLine.frustumCulled = false;
        this.forceLine.renderOrder = 999;
        this.forceLine.visible = false;
        this.scene.add(this.forceLine);

        const forceConeGeo = new THREE.ConeGeometry(0.3, 0.6, 6);
        forceConeGeo.rotateX(Math.PI / 2);
        this.forceCone = new THREE.Mesh(forceConeGeo, new THREE.MeshBasicMaterial({
            color: 0xff4444, depthTest: false, transparent: true, opacity: 0.7,
        }));
        this.forceCone.renderOrder = 999;
        this.forceCone.visible = false;
        this.scene.add(this.forceCone);

        // --- DOM info panel ---
        this.infoPanel = document.createElement('div');
        this.infoPanel.style.cssText =
            'position:fixed;top:80px;left:14px;background:rgba(0,0,0,0.75);color:#eee;' +
            'font:11px/1.4 "Space Mono",monospace;padding:8px 10px;border-radius:6px;' +
            'z-index:50;pointer-events:none;display:none;max-width:260px;';
        document.getElementById('ui')?.appendChild(this.infoPanel);
    }

    setVisible(v: boolean): void {
        this.visible = v;
        this.infoPanel.style.display = v ? 'block' : 'none';
        if (!v) {
            this.evalGeom.setDrawRange(0, 0);
            this.cutGeom.setDrawRange(0, 0);
            this.matchupGeom.setDrawRange(0, 0);
            this.throwLine.visible = false;
            this.throwCone.visible = false;
            this.leadMarker.visible = false;
            this.forceLine.visible = false;
            this.forceCone.visible = false;
            this.formationMesh.count = 0;
        }
    }

    isVisible(): boolean { return this.visible; }

    cycleFocus(): void {
        if (this.focusTeam === 'both') this.focusTeam = 'offense';
        else if (this.focusTeam === 'offense') this.focusTeam = 'defense';
        else this.focusTeam = 'both';
    }

    update(
        homeSnapshot: DebugSnapshot | null,
        awaySnapshot: DebugSnapshot | null,
        allPlayers: Array<{ index: number; movement: { position: THREE.Vector3 } }>,
    ): void {
        if (!this.visible) return;

        // Find the offense and defense snapshots
        const offSnap = homeSnapshot?.isOnOffense ? homeSnapshot : awaySnapshot?.isOnOffense ? awaySnapshot : null;
        const defSnap = homeSnapshot && !homeSnapshot.isOnOffense ? homeSnapshot : awaySnapshot && !awaySnapshot.isOnOffense ? awaySnapshot : null;
        this.lastOffSnap = offSnap;
        this.lastDefSnap = defSnap;

        const showOff = this.focusTeam === 'both' || this.focusTeam === 'offense';
        const showDef = this.focusTeam === 'both' || this.focusTeam === 'defense';

        // --- Receiver eval lines ---
        let evalCount = 0;
        if (showOff && offSnap?.throwerPos && offSnap.receiverEvals.length > 0) {
            const tp = offSnap.throwerPos;
            for (let i = 0; i < offSnap.receiverEvals.length && i < MAX_EVAL_LINES; i++) {
                const ev = offSnap.receiverEvals[i];
                const base = evalCount * 6;
                // From thrower (raised slightly)
                this.evalPositions[base] = tp.x;
                this.evalPositions[base + 1] = 1.5;
                this.evalPositions[base + 2] = tp.z;
                // To receiver
                this.evalPositions[base + 3] = ev.receiverPos.x;
                this.evalPositions[base + 4] = 1.5;
                this.evalPositions[base + 5] = ev.receiverPos.z;
                // Color: green (high) -> red (low), score typically -0.5 to 0.5
                const t = Math.max(0, Math.min(1, (ev.score + 0.3) / 0.6));
                const r = 1 - t;
                const g = t;
                const b = ev.selected ? 0.6 : 0;
                this.evalColors[base] = r; this.evalColors[base + 1] = g; this.evalColors[base + 2] = b;
                this.evalColors[base + 3] = r; this.evalColors[base + 4] = g; this.evalColors[base + 5] = b;
                evalCount++;
            }
        }
        this.evalGeom.setDrawRange(0, evalCount * 2);
        (this.evalGeom.attributes.position as THREE.BufferAttribute).needsUpdate = true;
        (this.evalGeom.attributes.color as THREE.BufferAttribute).needsUpdate = true;

        // --- Throw arrow (to lead target) ---
        if (showOff && offSnap?.throwerPos && offSnap.leadPassTarget) {
            const tp = offSnap.throwerPos;
            const lt = offSnap.leadPassTarget;
            this.throwLinePositions[0] = tp.x;
            this.throwLinePositions[1] = 1.5;
            this.throwLinePositions[2] = tp.z;
            this.throwLinePositions[3] = lt.x;
            this.throwLinePositions[4] = lt.y || 1.5;
            this.throwLinePositions[5] = lt.z;
            (this.throwLineGeom.attributes.position as THREE.BufferAttribute).needsUpdate = true;
            this.throwLine.visible = true;

            // Cone at lead target, pointing from thrower
            this.throwCone.position.set(lt.x, lt.y || 1.5, lt.z);
            _v.set(lt.x - tp.x, 0, lt.z - tp.z).normalize();
            this.throwCone.lookAt(lt.x + _v.x, lt.y || 1.5, lt.z + _v.z);
            this.throwCone.visible = true;
        } else {
            this.throwLine.visible = false;
            this.throwCone.visible = false;
        }

        // --- Lead pass marker ---
        if (showOff && offSnap?.leadPassTarget) {
            this.leadMarker.position.copy(offSnap.leadPassTarget);
            if (this.leadMarker.position.y < 0.3) this.leadMarker.position.y = 0.3;
            this.leadMarker.visible = true;
        } else {
            this.leadMarker.visible = false;
        }

        // --- Cut lines ---
        let cutCount = 0;
        if (showOff && offSnap) {
            for (let i = 0; i < offSnap.cutVisualizations.length && i < MAX_CUT_LINES; i++) {
                const cv = offSnap.cutVisualizations[i];
                const base = cutCount * 6;
                this.cutPositions[base] = cv.from.x;
                this.cutPositions[base + 1] = 0.5;
                this.cutPositions[base + 2] = cv.from.z;
                this.cutPositions[base + 3] = cv.to.x;
                this.cutPositions[base + 4] = 0.5;
                this.cutPositions[base + 5] = cv.to.z;
                // Active = orange, clearing = gray
                const r = cv.isActive ? 1.0 : 0.4;
                const g = cv.isActive ? 0.55 : 0.4;
                const b = cv.isActive ? 0.0 : 0.4;
                this.cutColors[cutCount * 6] = r; this.cutColors[cutCount * 6 + 1] = g; this.cutColors[cutCount * 6 + 2] = b;
                this.cutColors[cutCount * 6 + 3] = r; this.cutColors[cutCount * 6 + 4] = g; this.cutColors[cutCount * 6 + 5] = b;
                cutCount++;
            }
        }
        this.cutGeom.setDrawRange(0, cutCount * 2);
        (this.cutGeom.attributes.position as THREE.BufferAttribute).needsUpdate = true;
        (this.cutGeom.attributes.color as THREE.BufferAttribute).needsUpdate = true;

        // --- Matchup lines ---
        let matchupCount = 0;
        if (showDef && defSnap) {
            for (let i = 0; i < defSnap.matchups.length && i < MAX_MATCHUP_LINES; i++) {
                const mu = defSnap.matchups[i];
                const defP = allPlayers.find(p => p.index === mu.defenderIndex);
                const markP = allPlayers.find(p => p.index === mu.markIndex);
                if (!defP || !markP) continue;
                const base = matchupCount * 6;
                this.matchupPositions[base] = defP.movement.position.x;
                this.matchupPositions[base + 1] = 0.3;
                this.matchupPositions[base + 2] = defP.movement.position.z;
                this.matchupPositions[base + 3] = markP.movement.position.x;
                this.matchupPositions[base + 4] = 0.3;
                this.matchupPositions[base + 5] = markP.movement.position.z;
                matchupCount++;
            }
        }
        this.matchupGeom.setDrawRange(0, matchupCount * 2);
        (this.matchupGeom.attributes.position as THREE.BufferAttribute).needsUpdate = true;

        // --- Formation markers ---
        let fmCount = 0;
        if (showOff && offSnap) {
            for (let i = 0; i < offSnap.formationPositions.length && i < MAX_FORMATION; i++) {
                const fp = offSnap.formationPositions[i];
                _m.makeTranslation(fp.x, 0.15, fp.z);
                this.formationMesh.setMatrixAt(fmCount, _m);
                fmCount++;
            }
        }
        this.formationMesh.count = fmCount;
        if (fmCount > 0) this.formationMesh.instanceMatrix.needsUpdate = true;

        // --- Force side arrow ---
        if (showDef && defSnap?.forceSideOrigin) {
            const orig = defSnap.forceSideOrigin;
            const side = defSnap.forceSide;
            this.forceLinePositions[0] = orig.x;
            this.forceLinePositions[1] = 2.5;
            this.forceLinePositions[2] = orig.z;
            this.forceLinePositions[3] = orig.x + side * 4;
            this.forceLinePositions[4] = 2.5;
            this.forceLinePositions[5] = orig.z;
            (this.forceLineGeom.attributes.position as THREE.BufferAttribute).needsUpdate = true;
            this.forceLine.visible = true;

            this.forceCone.position.set(orig.x + side * 4, 2.5, orig.z);
            this.forceCone.rotation.set(0, side > 0 ? -Math.PI / 2 : Math.PI / 2, 0);
            this.forceCone.visible = true;
        } else {
            this.forceLine.visible = false;
            this.forceCone.visible = false;
        }

        // --- Info panel ---
        this.updateInfoPanel();
    }

    private updateInfoPanel(): void {
        const off = this.lastOffSnap;
        const def = this.lastDefSnap;
        let html = '<b style="color:#88ccff;">AI DEBUG</b> <span style="color:#666;">[D] toggle [F] focus</span><br>';

        if (off) {
            html += `<span style="color:#4f4;">OFF</span> ${off.personality} stall:${off.stallCount.toFixed(1)}<br>`;
            html += `agg:${off.tendency.aggression.toFixed(2)} tmp:${off.tendency.tempo.toFixed(2)}<br>`;
            if (off.receiverEvals.length > 0) {
                const best = off.receiverEvals.reduce((a, b) => a.score > b.score ? a : b);
                html += `best recv:#${best.receiverIndex} sc:${best.score.toFixed(3)}`;
                if (off.leadPassTarget) html += ' <span style="color:#0ff;">THROW</span>';
                html += '<br>';
                for (const ev of off.receiverEvals) {
                    const bar = ev.selected ? '>' : ' ';
                    const col = ev.score > 0.05 ? '#4f4' : ev.score > -0.1 ? '#ff4' : '#f44';
                    html += `<span style="color:${col};">${bar}#${ev.receiverIndex} ${ev.score.toFixed(3)}</span><br>`;
                }
            }
        }

        if (def) {
            html += `<span style="color:#f44;">DEF</span> ${def.personality} force:${def.forceSide > 0 ? 'R' : 'L'}<br>`;
            html += `matchups:${def.matchups.length}`;
            if (def.helpDefenderIndex !== null) html += ` help:#${def.helpDefenderIndex}`;
            html += '<br>';
        }

        this.infoPanel.innerHTML = html;
    }

    render(renderer: THREE.WebGLRenderer, camera: THREE.PerspectiveCamera): void {
        if (!this.visible) return;
        renderer.autoClear = false;
        renderer.clearDepth();
        renderer.render(this.scene, camera);
        renderer.autoClear = true;
    }

    dispose(): void {
        this.evalGeom.dispose();
        this.throwLineGeom.dispose();
        this.cutGeom.dispose();
        this.matchupGeom.dispose();
        this.forceLineGeom.dispose();
        this.infoPanel.remove();
    }
}
