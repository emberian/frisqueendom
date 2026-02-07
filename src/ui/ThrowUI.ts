export class ThrowUI {
    private container: HTMLDivElement;
    private powerBar: HTMLDivElement;
    private powerFill: HTMLDivElement;
    private hyzerIndicator: HTMLDivElement;

    constructor() {
        const ui = document.getElementById('ui')!;

        this.container = document.createElement('div');
        this.container.style.cssText =
            'position:absolute;bottom:60px;left:50%;transform:translateX(-50%);display:none;text-align:center;';
        ui.appendChild(this.container);

        // Power bar
        const barContainer = document.createElement('div');
        barContainer.style.cssText =
            'width:200px;height:12px;background:rgba(0,0,0,0.4);border-radius:6px;overflow:hidden;margin:0 auto;';
        this.powerFill = document.createElement('div');
        this.powerFill.style.cssText =
            'height:100%;width:0%;border-radius:6px;transition:background 0.1s;';
        barContainer.appendChild(this.powerFill);
        this.container.appendChild(barContainer);

        this.powerBar = barContainer;

        // Hyzer indicator
        this.hyzerIndicator = document.createElement('div');
        this.hyzerIndicator.style.cssText =
            'color:white;font-family:monospace;font-size:12px;margin-top:4px;text-shadow:1px 1px 2px black;';
        this.container.appendChild(this.hyzerIndicator);
    }

    show(power: number, hyzer: number, isForehand: boolean): void {
        this.container.style.display = 'block';

        const pct = Math.round(power * 100);
        this.powerFill.style.width = pct + '%';

        let color: string;
        if (power < 0.3) color = '#44cc44';
        else if (power < 0.6) color = '#cccc44';
        else if (power < 0.9) color = '#cc8844';
        else color = '#cc4444';
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
}
