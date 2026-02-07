export class ThrowUI {
    private container: HTMLDivElement;
    private powerBar: HTMLDivElement;
    private powerFill: HTMLDivElement;
    private hyzerIndicator: HTMLDivElement;

    constructor() {
        const ui = document.getElementById('ui')!;

        this.container = document.createElement('div');
        this.container.style.cssText =
            'position:absolute;bottom:64px;left:50%;transform:translateX(-50%);display:none;text-align:center;' +
            'padding:8px 10px;border-radius:12px;background:rgba(6,16,30,0.72);' +
            'border:1px solid rgba(255,255,255,0.2);backdrop-filter:blur(5px);';
        ui.appendChild(this.container);

        // Power bar
        const barContainer = document.createElement('div');
        barContainer.style.cssText =
            'width:220px;height:14px;background:rgba(0,0,0,0.48);border-radius:999px;overflow:hidden;margin:0 auto;' +
            'border:1px solid rgba(255,255,255,0.2);';
        this.powerFill = document.createElement('div');
        this.powerFill.style.cssText =
            'height:100%;width:0%;border-radius:999px;transition:background 0.1s;';
        barContainer.appendChild(this.powerFill);
        this.container.appendChild(barContainer);

        this.powerBar = barContainer;

        // Hyzer indicator
        this.hyzerIndicator = document.createElement('div');
        this.hyzerIndicator.style.cssText =
            'color:white;font-family:monospace;font-size:12px;letter-spacing:0.04em;margin-top:6px;text-shadow:0 2px 6px rgba(0,0,0,0.7);';
        this.container.appendChild(this.hyzerIndicator);
    }

    show(power: number, hyzer: number, isForehand: boolean): void {
        this.container.style.display = 'block';

        const pct = Math.round(power * 100);
        this.powerFill.style.width = pct + '%';

        let color: string;
        if (power < 0.3) color = '#38d67a';
        else if (power < 0.6) color = '#ffd166';
        else if (power < 0.9) color = '#ff8a2a';
        else color = '#ff4d6d';
        this.powerFill.style.background = color;

        const grip = isForehand ? 'FH' : 'BH';
        const hyzerDeg = Math.round(hyzer * (180 / Math.PI));
        const label =
            hyzerDeg > 2
                ? `Hyzer ${hyzerDeg}°`
                : hyzerDeg < -2
                  ? `Anhyzer ${-hyzerDeg}°`
                  : 'Flat';
        this.hyzerIndicator.textContent = `${grip} | ${label} | ${pct}%`;
    }

    hide(): void {
        this.container.style.display = 'none';
    }
    
    destroy(): void {
        this.container.remove();
    }
}
