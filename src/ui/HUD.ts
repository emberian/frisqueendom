import type { TeamSide } from '../data/Types';

export class HUD {
    private scoreEl: HTMLDivElement;
    private stallBar: HTMLDivElement;
    private stallFill: HTMLDivElement;
    private stateTextEl: HTMLDivElement;
    private windEl: HTMLDivElement;
    private phaseEl: HTMLDivElement;

    constructor() {
        const ui = document.getElementById('ui')!;

        // Score display
        this.scoreEl = document.createElement('div');
        this.scoreEl.style.cssText =
            'position:absolute;top:16px;left:50%;transform:translateX(-50%);' +
            'font-family:monospace;font-size:24px;font-weight:bold;color:white;' +
            'text-shadow:2px 2px 4px rgba(0,0,0,0.8);letter-spacing:2px;';
        ui.appendChild(this.scoreEl);

        // Stall bar
        const stallContainer = document.createElement('div');
        stallContainer.style.cssText =
            'position:absolute;top:50px;left:50%;transform:translateX(-50%);' +
            'width:160px;height:8px;background:rgba(0,0,0,0.3);border-radius:4px;overflow:hidden;';
        this.stallFill = document.createElement('div');
        this.stallFill.style.cssText =
            'height:100%;width:0%;border-radius:4px;transition:background 0.15s;';
        stallContainer.appendChild(this.stallFill);
        this.stallBar = stallContainer;
        ui.appendChild(this.stallBar);

        // State text (TURNOVER, SCORE, etc.)
        this.stateTextEl = document.createElement('div');
        this.stateTextEl.style.cssText =
            'position:absolute;top:40%;left:50%;transform:translate(-50%,-50%);' +
            'font-family:monospace;font-size:48px;font-weight:bold;color:white;' +
            'text-shadow:3px 3px 6px rgba(0,0,0,0.9);opacity:0;transition:opacity 0.3s;';
        ui.appendChild(this.stateTextEl);

        // Wind indicator
        this.windEl = document.createElement('div');
        this.windEl.style.cssText =
            'position:absolute;top:16px;left:16px;font-family:monospace;font-size:14px;' +
            'color:white;text-shadow:1px 1px 2px black;';
        ui.appendChild(this.windEl);

        // Phase display
        this.phaseEl = document.createElement('div');
        this.phaseEl.style.cssText =
            'position:absolute;top:16px;right:16px;font-family:monospace;font-size:12px;' +
            'color:rgba(255,255,255,0.6);text-shadow:1px 1px 2px black;';
        ui.appendChild(this.phaseEl);
    }

    updateScore(home: number, away: number): void {
        this.scoreEl.innerHTML =
            `<span style="color:#5599ff">${home}</span>` +
            ` - ` +
            `<span style="color:#ff5555">${away}</span>`;
    }

    updateStall(stallCount: number, maxStall: number, visible: boolean): void {
        this.stallBar.style.display = visible ? 'block' : 'none';
        const pct = Math.min(100, (stallCount / maxStall) * 100);
        this.stallFill.style.width = pct + '%';

        let color: string;
        if (pct < 50) color = '#44cc44';
        else if (pct < 70) color = '#cccc44';
        else if (pct < 90) color = '#cc8844';
        else color = '#cc4444';
        this.stallFill.style.background = color;
    }

    showStateText(text: string, show: boolean): void {
        this.stateTextEl.textContent = text;
        this.stateTextEl.style.opacity = show ? '1' : '0';
    }

    updateWind(speed: number, directionRad: number): void {
        const dirDeg = Math.round((directionRad * 180) / Math.PI);
        const arrow = getWindArrow(directionRad);
        this.windEl.textContent = `Wind: ${speed.toFixed(1)} m/s ${arrow}`;
    }

    updatePhase(phase: string): void {
        this.phaseEl.textContent = phase.replace(/_/g, ' ').toUpperCase();
    }
}

function getWindArrow(rad: number): string {
    const deg = ((rad * 180) / Math.PI + 360) % 360;
    const arrows = ['↑', '↗', '→', '↘', '↓', '↙', '←', '↖'];
    const idx = Math.round(deg / 45) % 8;
    return arrows[idx];
}
