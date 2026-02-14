import { practiceManager } from '../../gameplay/Practice';
import type { Screen, ScreenContext } from './ScreenInterface';

export class PracticeScreen implements Screen {
    private ctx: ScreenContext;
    private root: HTMLDivElement | null = null;

    constructor(ctx: ScreenContext) {
        this.ctx = ctx;
    }

    render(container: HTMLElement): void {
        const menu = document.createElement('div');
        menu.className = 'practice-menu';

        const drills = practiceManager.getAllDrillConfigs();

        let drillsHtml = '';
        drills.forEach(({ type, config }) => {
            const bestScore = practiceManager.getBestScore(type);
            const bestScoreText = bestScore > 0 ? `Best: ${bestScore.toFixed(1)}` : 'Not attempted';

            drillsHtml += `
                <div class="drill-card" data-drill="${type}">
                    <h3>${config.name}</h3>
                    <p>${config.description}</p>
                    <div class="drill-meta">
                        <span>${config.duration > 0 ? `${config.duration}s` : 'Untimed'}</span>
                        <span>Target: ${config.targetScore}</span>
                    </div>
                    <div class="drill-best">${bestScoreText}</div>
                    <button class="menu-btn" data-drill-start="${type}">Start Drill</button>
                </div>
            `;
        });

        menu.innerHTML = `
            <h1>Practice Mode</h1>
            <p class="menu-subtitle">Master your skills with focused drills.</p>
            <div class="drill-grid">
                ${drillsHtml}
            </div>
            <div class="menu-buttons">
                <button class="menu-btn" id="back">Back to Main</button>
            </div>
        `;
        container.appendChild(menu);
        this.root = menu;

        drills.forEach(({ type }) => {
            menu.querySelector(`[data-drill-start="${type}"]`)?.addEventListener('click', () => {
                this.ctx.navigate('/drill', { type });
            });
        });

        menu.querySelector('#back')?.addEventListener('click', () => {
            this.ctx.navigate('/title');
        });
    }

    destroy(): void {
        this.root?.remove();
        this.root = null;
    }
}
