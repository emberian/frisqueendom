import type { Screen, ScreenContext } from './ScreenInterface';

export class CreditsScreen implements Screen {
    private ctx: ScreenContext;
    private root: HTMLDivElement | null = null;

    constructor(ctx: ScreenContext) {
        this.ctx = ctx;
    }

    render(container: HTMLElement): void {
        const credits = document.createElement('div');
        credits.className = 'credits';
        credits.innerHTML = `
            <h1>Credits</h1>
            <p class="menu-subtitle">Made for backyard legends and future captains.</p>
            <div class="credits-content">
                <h2>FrisQueendom</h2>
                <p>A browser-based ultimate frisbee game</p>

                <h3>Design & Development</h3>
                <p>Built with Three.js and Rust/WASM</p>

                <h3>Physics</h3>
                <p>Custom disc flight simulation</p>
                <p>Inspired by real ultimate frisbee physics</p>

                <h3>Special Thanks</h3>
                <p>The ultimate frisbee community</p>
                <p>Disc golf flight physics research</p>

                <p class="copyright">&copy; 2024 FrisQueendom Project</p>
            </div>
            <button class="menu-btn" id="back">Back</button>
        `;
        container.appendChild(credits);
        this.root = credits;

        credits.querySelector('#back')?.addEventListener('click', () => {
            this.ctx.navigate('/title');
        });
    }

    destroy(): void {
        this.root?.remove();
        this.root = null;
    }
}
