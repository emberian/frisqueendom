export interface DpadState {
    highRelease: boolean;
    lowRelease: boolean;
    hyzerAngle: number;
}

export class ThrowUI {
    private container: HTMLDivElement;
    private canvas: HTMLCanvasElement;
    private ctx2d: CanvasRenderingContext2D;
    private hyzerIndicator: HTMLDivElement;
    arcadeMode = false;

    // Smooth power animation
    private displayPower = 0;
    private lastTimestamp = 0;

    // Pulse animation state
    private pulseTime = 0;

    // Overcharge flash state
    private overchargeFlip = false;
    private overchargeFlipTimer = 0;

    private static readonly BAR_W = 220;
    private static readonly BAR_H = 16;
    private static readonly CANVAS_W = 220;
    private static readonly CANVAS_H = 20;

    constructor() {
        const ui = document.getElementById('ui')!;

        this.container = document.createElement('div');
        this.container.style.cssText =
            'position:absolute;bottom:64px;left:50%;transform:translateX(-50%);display:none;text-align:center;' +
            'padding:8px 10px;border-radius:12px;background:rgba(6,16,30,0.72);' +
            'border:1px solid rgba(255,255,255,0.2);backdrop-filter:blur(5px);';
        ui.appendChild(this.container);

        // Canvas-based power bar
        this.canvas = document.createElement('canvas');
        this.canvas.width = ThrowUI.CANVAS_W;
        this.canvas.height = ThrowUI.CANVAS_H;
        this.canvas.style.cssText = 'display:block;margin:0 auto;';
        this.container.appendChild(this.canvas);

        const ctx = this.canvas.getContext('2d');
        if (!ctx) throw new Error('Canvas 2D context unavailable');
        this.ctx2d = ctx;

        // Hyzer indicator text
        this.hyzerIndicator = document.createElement('div');
        this.hyzerIndicator.style.cssText =
            'color:white;font-family:monospace;font-size:12px;letter-spacing:0.04em;margin-top:6px;text-shadow:0 2px 6px rgba(0,0,0,0.7);';
        this.container.appendChild(this.hyzerIndicator);
    }

    show(power: number, hyzer: number, isForehand: boolean, dpad?: DpadState): void {
        this.container.style.display = 'block';

        const now = performance.now();
        const dt = this.lastTimestamp > 0 ? Math.min((now - this.lastTimestamp) / 1000, 0.1) : 0;
        this.lastTimestamp = now;

        // Ease-in-out lerp toward actual power
        const smooth = 1 - Math.pow(0.01, dt * 8);
        this.displayPower += (power - this.displayPower) * smooth;

        // Pulse: 3 cycles/second sine wave
        this.pulseTime += dt * Math.PI * 6;

        // Overcharge flash: toggle every ~140ms
        if (power > 0.95) {
            this.overchargeFlipTimer += dt;
            if (this.overchargeFlipTimer > 0.14) {
                this.overchargeFlip = !this.overchargeFlip;
                this.overchargeFlipTimer = 0;
            }
        } else {
            this.overchargeFlip = false;
            this.overchargeFlipTimer = 0;
        }

        this.drawBar(power);

        const pct = Math.round(power * 100);

        if (this.arcadeMode) {
            this.hyzerIndicator.textContent = `${pct}%`;
            this.drawDpad(dpad);
            return;
        }

        const grip = isForehand ? 'FH' : 'BH';
        const hyzerDeg = Math.round(hyzer * (180 / Math.PI));
        const label =
            hyzerDeg > 2
                ? `Hyzer ${hyzerDeg}°`
                : hyzerDeg < -2
                  ? `Anhyzer ${-hyzerDeg}°`
                  : 'Flat';
        this.hyzerIndicator.textContent = `${grip} | ${label} | ${pct}%`;
        this.drawDpad(dpad);
    }

    hide(): void {
        this.container.style.display = 'none';
        this.displayPower = 0;
        this.lastTimestamp = 0;
        this.pulseTime = 0;
        this.overchargeFlip = false;
        this.overchargeFlipTimer = 0;
    }

    destroy(): void {
        this.container.remove();
    }

    private drawBar(power: number): void {
        const ctx = this.ctx2d;
        const W = ThrowUI.CANVAS_W;
        const H = ThrowUI.CANVAS_H;
        const barY = (H - ThrowUI.BAR_H) / 2;
        const barH = ThrowUI.BAR_H;
        const barW = ThrowUI.BAR_W;
        const r = barH / 2;

        ctx.clearRect(0, 0, W, H);

        // Background track
        ctx.save();
        ctx.fillStyle = 'rgba(0,0,0,0.48)';
        this.roundRect(ctx, 0, barY, barW, barH, r);
        ctx.fill();

        // Sweet spot zone highlight (60-80%)
        const ssX = barW * 0.6;
        const ssW = barW * 0.2;
        ctx.fillStyle = 'rgba(255,215,0,0.13)';
        ctx.fillRect(ssX, barY, ssW, barH);

        // Fill bar
        const fillW = barW * this.displayPower;
        if (fillW > 1) {
            const grad = ctx.createLinearGradient(0, 0, barW, 0);
            grad.addColorStop(0,   hslPowerColor(0));
            grad.addColorStop(0.3, hslPowerColor(0.3));
            grad.addColorStop(0.6, hslPowerColor(0.6));
            grad.addColorStop(0.9, hslPowerColor(0.9));
            grad.addColorStop(1,   hslPowerColor(1));
            ctx.fillStyle = grad;
            this.roundRect(ctx, 0, barY, fillW, barH, r);
            ctx.fill();

            // Pulsing glow on leading edge
            const pulse = (Math.sin(this.pulseTime) + 1) / 2;
            const glowAlpha = 0.18 + pulse * 0.42;
            const glowGrad = ctx.createRadialGradient(fillW, barY + barH / 2, 0, fillW, barY + barH / 2, barH * 1.6);
            glowGrad.addColorStop(0, `rgba(255,255,255,${glowAlpha})`);
            glowGrad.addColorStop(1, 'rgba(255,255,255,0)');
            ctx.fillStyle = glowGrad;
            ctx.fillRect(Math.max(0, fillW - barH * 1.6), barY - 2, barH * 3.2, barH + 4);
        }

        // Tick marks at 25%, 50%, 75%, 100%
        ctx.strokeStyle = 'rgba(255,255,255,0.45)';
        ctx.lineWidth = 1;
        for (const frac of [0.25, 0.5, 0.75, 1.0]) {
            const tx = Math.round(barW * frac) - 0.5;
            ctx.beginPath();
            ctx.moveTo(tx, barY + 2);
            ctx.lineTo(tx, barY + barH - 2);
            ctx.stroke();
        }

        // Sweet spot label dot
        const dotX = barW * 0.7;
        ctx.fillStyle = 'rgba(255,215,0,0.55)';
        ctx.beginPath();
        ctx.arc(dotX, barY + 2.5, 2, 0, Math.PI * 2);
        ctx.fill();

        // Border — flashes red when overcharge
        ctx.strokeStyle =
            this.overchargeFlip
                ? `rgba(255,60,60,${0.5 + (Math.sin(this.pulseTime * 2) + 1) * 0.25})`
                : 'rgba(255,255,255,0.22)';
        ctx.lineWidth = 1;
        this.roundRect(ctx, 0.5, barY + 0.5, barW - 1, barH - 1, r);
        ctx.stroke();

        ctx.restore();
    }

    private drawDpad(dpad?: DpadState): void {
        if (!dpad) return;

        const ctx = this.ctx2d;
        const W = ThrowUI.CANVAS_W;
        const H = ThrowUI.CANVAS_H;

        // D-pad sits to the LEFT of bar, inside canvas overhangs via negative offset
        // We'll draw it in the right side margin area below the bar (extra canvas space not used)
        // Since canvas is exactly BAR_W wide, we embed dpad indicator below in the hyzerIndicator text
        // The dpad overlay is drawn as small arrows within the canvas at top-right corner (outside bar area)
        // Actually: draw outside the power bar area, above it or in available space
        // We draw to the right of the text area — but canvas is the full width
        // Best: draw small dpad in top-right of canvas (above bar)
        const cx = W - 14;
        const cy = H / 2;
        const sz = 5;

        // Up arrow (HIGH release)
        ctx.fillStyle = dpad.highRelease ? '#7ef' : 'rgba(255,255,255,0.2)';
        ctx.beginPath();
        ctx.moveTo(cx, cy - sz - 2);
        ctx.lineTo(cx - sz, cy - 2);
        ctx.lineTo(cx + sz, cy - 2);
        ctx.closePath();
        ctx.fill();

        // Down arrow (LOW release)
        ctx.fillStyle = dpad.lowRelease ? '#f97' : 'rgba(255,255,255,0.2)';
        ctx.beginPath();
        ctx.moveTo(cx, cy + sz + 2);
        ctx.lineTo(cx - sz, cy + 2);
        ctx.lineTo(cx + sz, cy + 2);
        ctx.closePath();
        ctx.fill();

        // Hyzer / Anhyzer left-right indicator (from hyzerAngle)
        const hyzerLeft = dpad.hyzerAngle > 0.035;
        const hyzerRight = dpad.hyzerAngle < -0.035;

        // Left arrow (HYZER)
        ctx.fillStyle = hyzerLeft ? '#ffd' : 'rgba(255,255,255,0.2)';
        ctx.beginPath();
        ctx.moveTo(cx - sz - 4, cy);
        ctx.lineTo(cx - 2, cy - sz + 2);
        ctx.lineTo(cx - 2, cy + sz - 2);
        ctx.closePath();
        ctx.fill();

        // Right arrow (ANHYZER)
        ctx.fillStyle = hyzerRight ? '#ffd' : 'rgba(255,255,255,0.2)';
        ctx.beginPath();
        ctx.moveTo(cx + sz + 4, cy);
        ctx.lineTo(cx + 2, cy - sz + 2);
        ctx.lineTo(cx + 2, cy + sz - 2);
        ctx.closePath();
        ctx.fill();
    }

    private roundRect(
        ctx: CanvasRenderingContext2D,
        x: number, y: number, w: number, h: number, r: number,
    ): void {
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.arcTo(x + w, y, x + w, y + h, r);
        ctx.arcTo(x + w, y + h, x, y + h, r);
        ctx.arcTo(x, y + h, x, y, r);
        ctx.arcTo(x, y, x + w, y, r);
        ctx.closePath();
    }
}

/** HSL interpolation from green (120°) → yellow (60°) → orange (30°) → red (0°) based on power 0–1 */
function hslPowerColor(p: number): string {
    const hue = 120 - p * 120;
    const sat = 75 + p * 20;
    const lit = 48 + (1 - p) * 12;
    return `hsl(${hue.toFixed(1)},${sat.toFixed(1)}%,${lit.toFixed(1)}%)`;
}
