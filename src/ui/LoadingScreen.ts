/**
 * Full-screen loading overlay shown during WASM initialization and asset loading.
 * Dark themed with gradient progress bar and smooth CSS transitions.
 */
export class LoadingScreen {
    private overlay: HTMLDivElement;
    private progressFill: HTMLDivElement;
    private percentText: HTMLSpanElement;
    private statusText: HTMLDivElement;
    private destroyed = false;

    constructor(container: HTMLElement) {
        this.overlay = document.createElement('div');
        this.overlay.style.cssText =
            'position:fixed;inset:0;z-index:9999;' +
            'display:flex;flex-direction:column;align-items:center;justify-content:center;gap:28px;' +
            'background:#0a0a1a;' +
            'transition:opacity 0.5s ease;opacity:1;' +
            'font-family:"Barlow Condensed","Trebuchet MS",sans-serif;';

        // Logo text
        const logo = document.createElement('div');
        logo.textContent = 'FrisQueendom';
        logo.style.cssText =
            'font-family:"Bebas Neue","Impact",sans-serif;' +
            'font-size:clamp(3rem, 8vw, 5.5rem);' +
            'letter-spacing:0.04em;text-transform:uppercase;line-height:1;' +
            'background:linear-gradient(20deg,#fff8e4 8%,#ffd166 38%,#ff7a22 72%,#ff4d6d 100%);' +
            '-webkit-background-clip:text;-webkit-text-fill-color:transparent;' +
            'background-clip:text;color:transparent;' +
            'text-shadow:none;filter:drop-shadow(0 0 30px rgba(255,122,34,0.25));';
        this.overlay.appendChild(logo);

        // Subtitle
        const subtitle = document.createElement('div');
        subtitle.textContent = 'Ultimate Frisbee';
        subtitle.style.cssText =
            'font-size:clamp(0.9rem, 2vw, 1.2rem);' +
            'letter-spacing:0.22em;text-transform:uppercase;' +
            'color:rgba(180,200,220,0.7);margin-top:-14px;';
        this.overlay.appendChild(subtitle);

        // Progress bar container
        const progressBar = document.createElement('div');
        progressBar.style.cssText =
            'width:min(360px, 72vw);height:8px;' +
            'background:rgba(255,255,255,0.08);border-radius:999px;overflow:hidden;' +
            'border:1px solid rgba(255,255,255,0.06);';
        this.overlay.appendChild(progressBar);

        // Progress bar fill
        this.progressFill = document.createElement('div');
        this.progressFill.style.cssText =
            'width:0%;height:100%;border-radius:999px;' +
            'background:linear-gradient(90deg,#3498db,#2ecc71);' +
            'box-shadow:0 0 12px rgba(52,152,219,0.4);' +
            'transition:width 0.4s cubic-bezier(0.22,1,0.36,1);';
        progressBar.appendChild(this.progressFill);

        // Percentage + status row
        const statusRow = document.createElement('div');
        statusRow.style.cssText =
            'display:flex;flex-direction:column;align-items:center;gap:6px;';
        this.overlay.appendChild(statusRow);

        // Percentage text
        this.percentText = document.createElement('span');
        this.percentText.textContent = '0%';
        this.percentText.style.cssText =
            'font-family:"Space Mono","Consolas",monospace;' +
            'font-size:0.85rem;color:rgba(255,255,255,0.5);letter-spacing:0.08em;';
        statusRow.appendChild(this.percentText);

        // Status text
        this.statusText = document.createElement('div');
        this.statusText.textContent = 'Initializing...';
        this.statusText.style.cssText =
            'font-size:0.82rem;color:rgba(180,200,220,0.55);' +
            'letter-spacing:0.1em;text-transform:uppercase;' +
            'transition:opacity 0.2s ease;';
        statusRow.appendChild(this.statusText);

        container.appendChild(this.overlay);
    }

    setProgress(percent: number, statusText: string): void {
        if (this.destroyed) return;
        const clamped = Math.max(0, Math.min(100, percent));
        this.progressFill.style.width = `${clamped}%`;
        this.percentText.textContent = `${Math.round(clamped)}%`;
        this.statusText.textContent = statusText;
    }

    destroy(): void {
        if (this.destroyed) return;
        this.destroyed = true;

        // Fade out, then remove from DOM
        this.overlay.style.opacity = '0';
        this.overlay.style.pointerEvents = 'none';
        setTimeout(() => {
            this.overlay.remove();
        }, 550);
    }
}
