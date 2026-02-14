import type { Challenge, ChallengeResult } from '../gameplay/Challenge';

// ---------------------------------------------------------------------------
// Medal color map
// ---------------------------------------------------------------------------

const MEDAL_COLORS: Record<string, string> = {
    none: '#555',
    bronze: '#cd7f32',
    silver: '#c0c0c0',
    gold: '#ffd700',
    diamond: '#b9f2ff',
};

const MEDAL_LABELS: Record<string, string> = {
    none: '--',
    bronze: 'Bronze',
    silver: 'Silver',
    gold: 'Gold',
    diamond: 'Diamond',
};

// ---------------------------------------------------------------------------
// ChallengeHUD
// ---------------------------------------------------------------------------

/**
 * In-game HUD overlay shown while a challenge is active.
 *
 * Usage:
 *   const hud = new ChallengeHUD(container);
 *   hud.show(challenge);
 *   // on each tick:
 *   hud.updateProgress(stats);
 *   // when done:
 *   hud.showResult(result);
 *   hud.destroy();
 */
export class ChallengeHUD {
    private container: HTMLElement;
    private root: HTMLDivElement;
    private challenge: Challenge | null = null;

    // Top bar elements
    private nameEl: HTMLDivElement;
    private objectivesEl: HTMLDivElement;
    private timerEl: HTMLDivElement;

    // Medal threshold strip
    private medalStripEl: HTMLDivElement;

    // Quit button
    private quitBtn: HTMLButtonElement;

    // Result overlay
    private resultOverlay: HTMLDivElement;

    // Timer tracking
    private timerStart: number = 0;
    private timerLimit: number = 0;
    private timerRaf: number = 0;

    constructor(container: HTMLElement) {
        this.container = container;

        this.root = document.createElement('div');
        this.root.style.cssText =
            'position:absolute;top:0;left:0;right:0;pointer-events:none;' +
            'font-family:Arial,sans-serif;z-index:30;';

        // Top panel
        const topPanel = document.createElement('div');
        topPanel.style.cssText =
            'display:flex;flex-direction:column;align-items:center;gap:6px;' +
            'padding:10px 16px;margin:8px 60px 0 60px;border-radius:10px;' +
            'background:rgba(7,16,30,0.88);border:1px solid rgba(255,255,255,0.18);' +
            'backdrop-filter:blur(6px);';

        // Challenge name
        this.nameEl = document.createElement('div');
        this.nameEl.style.cssText =
            'font-size:15px;font-weight:bold;color:white;letter-spacing:0.5px;';
        topPanel.appendChild(this.nameEl);

        // Objectives container
        this.objectivesEl = document.createElement('div');
        this.objectivesEl.style.cssText =
            'display:flex;flex-direction:column;gap:4px;width:100%;max-width:500px;';
        topPanel.appendChild(this.objectivesEl);

        // Timer
        this.timerEl = document.createElement('div');
        this.timerEl.style.cssText =
            'font-size:22px;font-weight:bold;color:#ffd700;font-family:monospace;' +
            'letter-spacing:2px;display:none;';
        topPanel.appendChild(this.timerEl);

        // Medal threshold strip
        this.medalStripEl = document.createElement('div');
        this.medalStripEl.style.cssText =
            'display:flex;gap:8px;justify-content:center;align-items:center;margin-top:2px;';
        topPanel.appendChild(this.medalStripEl);

        this.root.appendChild(topPanel);

        // Quit button (bottom right)
        this.quitBtn = document.createElement('button');
        this.quitBtn.textContent = 'Quit Challenge';
        this.quitBtn.style.cssText =
            'position:absolute;top:8px;right:8px;padding:6px 14px;border:1px solid rgba(255,80,80,0.5);' +
            'border-radius:6px;background:rgba(180,40,40,0.6);color:white;font-family:Arial,sans-serif;' +
            'font-size:12px;font-weight:bold;cursor:pointer;pointer-events:auto;' +
            'backdrop-filter:blur(4px);transition:background 0.15s;';
        this.quitBtn.addEventListener('mouseenter', () => {
            this.quitBtn.style.background = 'rgba(220,50,50,0.8)';
        });
        this.quitBtn.addEventListener('mouseleave', () => {
            this.quitBtn.style.background = 'rgba(180,40,40,0.6)';
        });
        this.quitBtn.addEventListener('click', () => {
            window.dispatchEvent(new CustomEvent('quitChallenge'));
        });
        this.root.appendChild(this.quitBtn);

        // Result overlay (hidden by default)
        this.resultOverlay = document.createElement('div');
        this.resultOverlay.style.cssText =
            'position:fixed;inset:0;display:none;align-items:center;justify-content:center;' +
            'background:rgba(4,10,18,0.85);backdrop-filter:blur(8px);z-index:50;pointer-events:auto;';
        this.root.appendChild(this.resultOverlay);

        this.container.appendChild(this.root);
    }

    // -----------------------------------------------------------------------
    // Show challenge info
    // -----------------------------------------------------------------------

    show(challenge: Challenge): void {
        this.challenge = challenge;
        this.root.style.display = 'block';
        this.resultOverlay.style.display = 'none';

        this.nameEl.textContent = challenge.name;
        this.renderObjectives(challenge, {});
        this.renderMedalStrip(challenge, 0);

        // Timer
        if (challenge.setup.timeLimit) {
            this.timerLimit = challenge.setup.timeLimit;
            this.timerStart = performance.now();
            this.timerEl.style.display = 'block';
            this.tickTimer();
        } else {
            this.timerEl.style.display = 'none';
            this.timerLimit = 0;
        }
    }

    // -----------------------------------------------------------------------
    // Update progress during gameplay
    // -----------------------------------------------------------------------

    updateProgress(stats: Record<string, number>): void {
        if (!this.challenge) return;
        this.renderObjectives(this.challenge, stats);
        this.renderMedalStrip(this.challenge, stats['score'] ?? 0);
    }

    // -----------------------------------------------------------------------
    // Show final result
    // -----------------------------------------------------------------------

    showResult(result: ChallengeResult): void {
        if (!this.challenge) return;
        cancelAnimationFrame(this.timerRaf);

        const ch = this.challenge;
        const medalColor = MEDAL_COLORS[result.medal];
        const medalLabel = MEDAL_LABELS[result.medal];

        const card = document.createElement('div');
        card.style.cssText =
            'display:flex;flex-direction:column;align-items:center;gap:16px;' +
            'padding:32px 40px;border-radius:14px;max-width:440px;width:90vw;' +
            'background:rgba(22,33,62,0.95);border:1px solid rgba(255,255,255,0.15);' +
            'font-family:Arial,sans-serif;color:white;text-align:center;';

        // Title
        const titleEl = document.createElement('h2');
        titleEl.style.cssText = 'margin:0;font-size:22px;color:white;';
        titleEl.textContent = 'Challenge Complete!';
        card.appendChild(titleEl);

        // Challenge name
        const nameEl = document.createElement('div');
        nameEl.style.cssText = 'font-size:15px;color:rgba(255,255,255,0.6);';
        nameEl.textContent = ch.name;
        card.appendChild(nameEl);

        // Medal display
        const medalEl = document.createElement('div');
        medalEl.style.cssText =
            `font-size:36px;font-weight:bold;color:${medalColor};` +
            `text-shadow:0 0 20px ${medalColor}60;letter-spacing:2px;`;
        medalEl.textContent = result.medal === 'none' ? 'No Medal' : medalLabel;
        card.appendChild(medalEl);

        // Score
        const scoreEl = document.createElement('div');
        scoreEl.style.cssText = 'font-size:16px;color:rgba(255,255,255,0.8);';
        scoreEl.textContent = `Score: ${result.score}`;
        card.appendChild(scoreEl);

        // Objectives completed
        const objBox = document.createElement('div');
        objBox.style.cssText = 'width:100%;display:flex;flex-direction:column;gap:4px;';
        ch.objectives.forEach((obj, i) => {
            const completed = result.objectivesCompleted[i];
            const row = document.createElement('div');
            row.style.cssText =
                `padding:6px 10px;border-radius:6px;font-size:12px;text-align:left;` +
                `background:${completed ? 'rgba(56,214,122,0.1)' : 'rgba(255,79,94,0.1)'};` +
                `border:1px solid ${completed ? 'rgba(56,214,122,0.3)' : 'rgba(255,79,94,0.3)'};` +
                `color:${completed ? '#38d67a' : '#ff4f5e'};`;
            row.textContent = `${completed ? '\u2713' : '\u2717'} ${obj.description}`;
            objBox.appendChild(row);
        });
        card.appendChild(objBox);

        // XP earned
        if (result.xpEarned > 0) {
            const xpEl = document.createElement('div');
            xpEl.style.cssText = 'font-size:14px;color:#3498db;font-weight:bold;';
            xpEl.textContent = `+${result.xpEarned} XP`;
            card.appendChild(xpEl);
        }

        // Buttons
        const btnRow = document.createElement('div');
        btnRow.style.cssText = 'display:flex;gap:12px;margin-top:8px;';

        const retryBtn = document.createElement('button');
        retryBtn.textContent = 'Retry';
        retryBtn.style.cssText =
            'padding:10px 24px;border:1px solid rgba(255,255,255,0.2);border-radius:8px;' +
            'background:rgba(26,26,46,0.8);color:white;font-family:Arial,sans-serif;' +
            'font-size:14px;font-weight:bold;cursor:pointer;';
        retryBtn.addEventListener('click', () => {
            window.dispatchEvent(new CustomEvent('retryChallenge', { detail: { challengeId: ch.id } }));
        });
        btnRow.appendChild(retryBtn);

        const exitBtn = document.createElement('button');
        exitBtn.textContent = 'Back to Challenges';
        exitBtn.style.cssText =
            'padding:10px 24px;border:none;border-radius:8px;' +
            'background:linear-gradient(135deg,#3498db,#2980b9);color:white;' +
            'font-family:Arial,sans-serif;font-size:14px;font-weight:bold;cursor:pointer;';
        exitBtn.addEventListener('click', () => {
            window.dispatchEvent(new CustomEvent('exitChallenge'));
        });
        btnRow.appendChild(exitBtn);

        card.appendChild(btnRow);

        this.resultOverlay.innerHTML = '';
        this.resultOverlay.appendChild(card);
        this.resultOverlay.style.display = 'flex';
    }

    // -----------------------------------------------------------------------
    // Destroy
    // -----------------------------------------------------------------------

    destroy(): void {
        cancelAnimationFrame(this.timerRaf);
        this.root.remove();
        this.challenge = null;
    }

    // -----------------------------------------------------------------------
    // Internal rendering
    // -----------------------------------------------------------------------

    private renderObjectives(challenge: Challenge, stats: Record<string, number>): void {
        this.objectivesEl.innerHTML = '';

        for (const obj of challenge.objectives) {
            const current = stats[obj.type] ?? stats['score'] ?? 0;
            const target = obj.target;
            const pct = Math.min(100, Math.max(0, (current / target) * 100));
            const done = obj.type === 'time'
                ? (current > 0 && current <= target)
                : current >= target;

            const row = document.createElement('div');
            row.style.cssText = 'display:flex;flex-direction:column;gap:2px;';

            // Label row
            const labelRow = document.createElement('div');
            labelRow.style.cssText = 'display:flex;justify-content:space-between;font-size:11px;';

            const descSpan = document.createElement('span');
            descSpan.style.cssText = `color:${done ? '#38d67a' : 'rgba(255,255,255,0.8)'};`;
            descSpan.textContent = obj.description;
            labelRow.appendChild(descSpan);

            const valueSpan = document.createElement('span');
            valueSpan.style.cssText = 'color:rgba(255,255,255,0.5);font-family:monospace;';
            if (obj.type === 'time') {
                valueSpan.textContent = current > 0 ? `${current.toFixed(1)}s / ${target}s` : `-- / ${target}s`;
            } else {
                valueSpan.textContent = `${Math.floor(current)} / ${target}`;
            }
            labelRow.appendChild(valueSpan);

            row.appendChild(labelRow);

            // Progress bar
            const barOuter = document.createElement('div');
            barOuter.style.cssText =
                'height:6px;border-radius:3px;background:rgba(255,255,255,0.1);overflow:hidden;';

            const barFill = document.createElement('div');
            barFill.style.cssText =
                `height:100%;border-radius:3px;transition:width 0.2s;` +
                `width:${pct}%;background:${done ? '#38d67a' : '#3498db'};`;
            barOuter.appendChild(barFill);

            row.appendChild(barOuter);
            this.objectivesEl.appendChild(row);
        }
    }

    private renderMedalStrip(challenge: Challenge, currentScore: number): void {
        this.medalStripEl.innerHTML = '';

        for (const m of ['bronze', 'silver', 'gold', 'diamond'] as const) {
            const threshold = challenge.medals[m];
            const isLower = challenge.medals.diamond < challenge.medals.bronze;
            const reached = isLower
                ? currentScore > 0 && currentScore <= threshold
                : currentScore >= threshold;

            const chip = document.createElement('span');
            chip.style.cssText =
                `font-size:10px;padding:2px 6px;border-radius:4px;font-weight:bold;` +
                `background:${reached ? `${MEDAL_COLORS[m]}25` : 'rgba(255,255,255,0.05)'};` +
                `color:${reached ? MEDAL_COLORS[m] : 'rgba(255,255,255,0.3)'};` +
                `border:1px solid ${reached ? MEDAL_COLORS[m] : 'rgba(255,255,255,0.08)'};`;
            chip.textContent = `${MEDAL_LABELS[m]}: ${threshold}`;
            this.medalStripEl.appendChild(chip);
        }

        // Current score indicator
        const scoreChip = document.createElement('span');
        scoreChip.style.cssText =
            'font-size:11px;padding:2px 8px;border-radius:4px;font-weight:bold;' +
            'background:rgba(52,152,219,0.2);color:#3498db;border:1px solid rgba(52,152,219,0.4);' +
            'margin-left:4px;';
        scoreChip.textContent = `Score: ${currentScore}`;
        this.medalStripEl.appendChild(scoreChip);
    }

    private tickTimer = (): void => {
        if (this.timerLimit <= 0) return;

        const elapsed = (performance.now() - this.timerStart) / 1000;
        const remaining = Math.max(0, this.timerLimit - elapsed);
        const mins = Math.floor(remaining / 60);
        const secs = Math.floor(remaining % 60);
        const tenths = Math.floor((remaining * 10) % 10);

        this.timerEl.textContent = mins > 0
            ? `${mins}:${secs.toString().padStart(2, '0')}.${tenths}`
            : `${secs}.${tenths}`;

        // Color warning at low time
        if (remaining <= 10) {
            this.timerEl.style.color = '#ff4f5e';
        } else if (remaining <= 30) {
            this.timerEl.style.color = '#ffc646';
        } else {
            this.timerEl.style.color = '#ffd700';
        }

        if (remaining > 0) {
            this.timerRaf = requestAnimationFrame(this.tickTimer);
        } else {
            this.timerEl.textContent = '0.0';
            window.dispatchEvent(new CustomEvent('challengeTimeUp'));
        }
    };
}
