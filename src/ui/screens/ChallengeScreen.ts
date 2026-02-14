import {
    CHALLENGE_CATALOG,
    getChallengesByCategory,
    type Challenge,
} from '../../gameplay/Challenge';
import { escapeHtml, type Screen, type ScreenContext } from './ScreenInterface';

// ---------------------------------------------------------------------------
// Challenge progress persistence
// ---------------------------------------------------------------------------

const STORAGE_KEY = 'frisqueendom_challenge_progress';

interface ChallengeProgressEntry {
    bestScore: number;
    bestMedal: 'none' | 'bronze' | 'silver' | 'gold' | 'diamond';
    completedAt?: number;
}

interface ChallengeProgress {
    [challengeId: string]: ChallengeProgressEntry;
}

function loadProgress(): ChallengeProgress {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) return JSON.parse(raw) as ChallengeProgress;
    } catch { /* ignore corrupt data */ }
    return {};
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CATEGORIES = ['throwing', 'catching', 'game', 'team'] as const;

const CATEGORY_LABELS: Record<string, string> = {
    throwing: 'Throwing',
    catching: 'Catching',
    game: 'Game',
    team: 'Team',
};

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
// ChallengeScreen
// ---------------------------------------------------------------------------

export class ChallengeScreen implements Screen {
    private ctx: ScreenContext;
    private root: HTMLDivElement | null = null;
    private activeCategory: string = 'throwing';
    private selectedChallenge: Challenge | null = null;
    private progress: ChallengeProgress = {};

    constructor(ctx: ScreenContext) {
        this.ctx = ctx;
    }

    render(container: HTMLElement): void {
        this.progress = loadProgress();

        const wrapper = document.createElement('div');
        wrapper.style.cssText =
            'display:flex;flex-direction:column;align-items:center;width:100%;max-width:960px;' +
            'margin:0 auto;padding:24px 16px;box-sizing:border-box;font-family:Arial,sans-serif;color:white;';

        // Title
        const title = document.createElement('h1');
        title.style.cssText =
            'margin:0 0 4px 0;font-size:28px;letter-spacing:1px;color:white;text-align:center;';
        title.textContent = 'Challenge Mode';
        wrapper.appendChild(title);

        const subtitle = document.createElement('p');
        subtitle.style.cssText =
            'margin:0 0 20px 0;font-size:14px;color:rgba(255,255,255,0.6);text-align:center;';
        subtitle.textContent = 'Complete skill challenges to earn medals and rewards.';
        wrapper.appendChild(subtitle);

        // Summary bar
        wrapper.appendChild(this.buildSummaryBar());

        // Tabs
        wrapper.appendChild(this.buildTabs());

        // Body: challenge list + detail panel
        const body = document.createElement('div');
        body.style.cssText =
            'display:flex;gap:16px;width:100%;min-height:400px;';
        body.id = 'challenge-body';

        body.appendChild(this.buildChallengeList());
        body.appendChild(this.buildDetailPanel());

        wrapper.appendChild(body);

        // Back button
        const backRow = document.createElement('div');
        backRow.style.cssText = 'margin-top:20px;text-align:center;';
        const backBtn = document.createElement('button');
        backBtn.textContent = 'Back to Main';
        backBtn.style.cssText = this.buttonStyle(false);
        backBtn.addEventListener('click', () => this.ctx.navigate('/title'));
        backRow.appendChild(backBtn);
        wrapper.appendChild(backRow);

        container.appendChild(wrapper);
        this.root = wrapper;
    }

    destroy(): void {
        this.root?.remove();
        this.root = null;
        this.selectedChallenge = null;
    }

    // -----------------------------------------------------------------------
    // Summary bar: total medals earned
    // -----------------------------------------------------------------------

    private buildSummaryBar(): HTMLDivElement {
        const bar = document.createElement('div');
        bar.style.cssText =
            'display:flex;gap:16px;justify-content:center;align-items:center;' +
            'margin-bottom:16px;padding:10px 20px;border-radius:10px;' +
            'background:rgba(22,33,62,0.7);border:1px solid rgba(255,255,255,0.12);';

        const total = CHALLENGE_CATALOG.length;
        let completed = 0;
        const medalCounts: Record<string, number> = { bronze: 0, silver: 0, gold: 0, diamond: 0 };

        for (const ch of CHALLENGE_CATALOG) {
            const entry = this.progress[ch.id];
            if (entry && entry.bestMedal !== 'none') {
                completed++;
                medalCounts[entry.bestMedal]++;
            }
        }

        const countEl = document.createElement('span');
        countEl.style.cssText = 'font-size:14px;color:rgba(255,255,255,0.8);';
        countEl.textContent = `${completed}/${total} Completed`;
        bar.appendChild(countEl);

        for (const medal of ['bronze', 'silver', 'gold', 'diamond'] as const) {
            const badge = document.createElement('span');
            badge.style.cssText =
                `font-size:13px;color:${MEDAL_COLORS[medal]};font-weight:bold;`;
            badge.textContent = `${MEDAL_LABELS[medal]}: ${medalCounts[medal]}`;
            bar.appendChild(badge);
        }

        return bar;
    }

    // -----------------------------------------------------------------------
    // Category tabs
    // -----------------------------------------------------------------------

    private buildTabs(): HTMLDivElement {
        const tabBar = document.createElement('div');
        tabBar.style.cssText =
            'display:flex;gap:4px;margin-bottom:16px;width:100%;';

        for (const cat of CATEGORIES) {
            const btn = document.createElement('button');
            const isActive = cat === this.activeCategory;
            btn.textContent = CATEGORY_LABELS[cat];
            btn.style.cssText = this.tabStyle(isActive);
            btn.addEventListener('click', () => {
                this.activeCategory = cat;
                this.selectedChallenge = null;
                this.rerender();
            });
            tabBar.appendChild(btn);
        }

        return tabBar;
    }

    // -----------------------------------------------------------------------
    // Challenge list (left panel)
    // -----------------------------------------------------------------------

    private buildChallengeList(): HTMLDivElement {
        const list = document.createElement('div');
        list.style.cssText =
            'flex:1;display:flex;flex-direction:column;gap:6px;overflow-y:auto;' +
            'max-height:440px;padding-right:8px;';

        const challenges = getChallengesByCategory(this.activeCategory);

        for (const ch of challenges) {
            const entry = this.progress[ch.id];
            const medal = entry?.bestMedal ?? 'none';
            const isSelected = this.selectedChallenge?.id === ch.id;

            const card = document.createElement('div');
            card.style.cssText =
                `display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:8px;cursor:pointer;` +
                `background:${isSelected ? 'rgba(52,152,219,0.25)' : 'rgba(26,26,46,0.8)'};` +
                `border:1px solid ${isSelected ? '#3498db' : 'rgba(255,255,255,0.1)'};` +
                `transition:background 0.15s,border-color 0.15s;`;

            card.addEventListener('mouseenter', () => {
                if (!isSelected) card.style.background = 'rgba(52,152,219,0.12)';
            });
            card.addEventListener('mouseleave', () => {
                if (!isSelected) card.style.background = 'rgba(26,26,46,0.8)';
            });
            card.addEventListener('click', () => {
                this.selectedChallenge = ch;
                this.rerender();
            });

            // Medal dot
            const dot = document.createElement('span');
            dot.style.cssText =
                `display:inline-block;width:14px;height:14px;border-radius:50%;flex-shrink:0;` +
                `background:${MEDAL_COLORS[medal]};border:1px solid rgba(255,255,255,0.2);`;
            if (medal === 'diamond') {
                dot.style.boxShadow = '0 0 6px rgba(185,242,255,0.6)';
            }
            card.appendChild(dot);

            // Name + description
            const text = document.createElement('div');
            text.style.cssText = 'flex:1;min-width:0;';

            const name = document.createElement('div');
            name.style.cssText = 'font-size:14px;font-weight:bold;color:white;';
            name.textContent = ch.name;
            text.appendChild(name);

            const desc = document.createElement('div');
            desc.style.cssText =
                'font-size:12px;color:rgba(255,255,255,0.55);white-space:nowrap;' +
                'overflow:hidden;text-overflow:ellipsis;';
            desc.textContent = ch.description;
            text.appendChild(desc);

            card.appendChild(text);

            // Medal label
            if (medal !== 'none') {
                const medalLabel = document.createElement('span');
                medalLabel.style.cssText =
                    `font-size:11px;font-weight:bold;color:${MEDAL_COLORS[medal]};flex-shrink:0;`;
                medalLabel.textContent = MEDAL_LABELS[medal];
                card.appendChild(medalLabel);
            }

            list.appendChild(card);
        }

        if (challenges.length === 0) {
            const empty = document.createElement('div');
            empty.style.cssText = 'color:rgba(255,255,255,0.4);font-size:14px;padding:20px;text-align:center;';
            empty.textContent = 'No challenges in this category.';
            list.appendChild(empty);
        }

        return list;
    }

    // -----------------------------------------------------------------------
    // Detail panel (right side)
    // -----------------------------------------------------------------------

    private buildDetailPanel(): HTMLDivElement {
        const panel = document.createElement('div');
        panel.style.cssText =
            'width:320px;flex-shrink:0;padding:16px;border-radius:10px;' +
            'background:rgba(22,33,62,0.6);border:1px solid rgba(255,255,255,0.1);' +
            'display:flex;flex-direction:column;gap:12px;';

        if (!this.selectedChallenge) {
            const hint = document.createElement('div');
            hint.style.cssText =
                'flex:1;display:flex;align-items:center;justify-content:center;' +
                'color:rgba(255,255,255,0.35);font-size:14px;text-align:center;';
            hint.textContent = 'Select a challenge to view details.';
            panel.appendChild(hint);
            return panel;
        }

        const ch = this.selectedChallenge;
        const entry = this.progress[ch.id];
        const medal = entry?.bestMedal ?? 'none';

        // Name
        const nameEl = document.createElement('h2');
        nameEl.style.cssText = 'margin:0;font-size:20px;color:white;';
        nameEl.textContent = ch.name;
        panel.appendChild(nameEl);

        // Category badge
        const catBadge = document.createElement('span');
        catBadge.style.cssText =
            'display:inline-block;padding:2px 8px;border-radius:4px;font-size:11px;' +
            'background:rgba(52,152,219,0.25);color:#3498db;text-transform:uppercase;' +
            'letter-spacing:0.5px;align-self:flex-start;';
        catBadge.textContent = CATEGORY_LABELS[ch.category];
        panel.appendChild(catBadge);

        // Description
        const descEl = document.createElement('p');
        descEl.style.cssText = 'margin:0;font-size:13px;color:rgba(255,255,255,0.75);line-height:1.5;';
        descEl.textContent = ch.description;
        panel.appendChild(descEl);

        // Objectives
        const objTitle = document.createElement('div');
        objTitle.style.cssText = 'font-size:12px;font-weight:bold;color:rgba(255,255,255,0.6);text-transform:uppercase;letter-spacing:0.5px;';
        objTitle.textContent = 'Objectives';
        panel.appendChild(objTitle);

        for (const obj of ch.objectives) {
            const objEl = document.createElement('div');
            objEl.style.cssText =
                'padding:6px 10px;border-radius:6px;background:rgba(255,255,255,0.05);' +
                'border:1px solid rgba(255,255,255,0.08);font-size:12px;color:rgba(255,255,255,0.85);';
            objEl.textContent = obj.description;
            panel.appendChild(objEl);
        }

        // Setup info
        if (ch.setup.timeLimit || ch.setup.wind || ch.setup.opponents) {
            const setupTitle = document.createElement('div');
            setupTitle.style.cssText = 'font-size:12px;font-weight:bold;color:rgba(255,255,255,0.6);text-transform:uppercase;letter-spacing:0.5px;';
            setupTitle.textContent = 'Conditions';
            panel.appendChild(setupTitle);

            const setupInfo = document.createElement('div');
            setupInfo.style.cssText = 'font-size:12px;color:rgba(255,255,255,0.6);line-height:1.6;';
            const parts: string[] = [];
            if (ch.setup.timeLimit) parts.push(`Time Limit: ${ch.setup.timeLimit}s`);
            if (ch.setup.wind) parts.push(`Wind: ${ch.setup.wind.speed.toFixed(1)} m/s`);
            if (ch.setup.opponents) parts.push(`Opponents: ${ch.setup.opponents}`);
            setupInfo.textContent = parts.join(' | ');
            panel.appendChild(setupInfo);
        }

        // Medal thresholds
        const medalTitle = document.createElement('div');
        medalTitle.style.cssText = 'font-size:12px;font-weight:bold;color:rgba(255,255,255,0.6);text-transform:uppercase;letter-spacing:0.5px;';
        medalTitle.textContent = 'Medal Thresholds';
        panel.appendChild(medalTitle);

        const medalRow = document.createElement('div');
        medalRow.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;';
        for (const m of ['bronze', 'silver', 'gold', 'diamond'] as const) {
            const chip = document.createElement('span');
            const isEarned = medal !== 'none' && medalRank(medal) >= medalRank(m);
            chip.style.cssText =
                `display:inline-flex;align-items:center;gap:4px;padding:4px 8px;border-radius:6px;font-size:12px;` +
                `background:${isEarned ? `${MEDAL_COLORS[m]}22` : 'rgba(255,255,255,0.05)'};` +
                `border:1px solid ${isEarned ? MEDAL_COLORS[m] : 'rgba(255,255,255,0.1)'};` +
                `color:${isEarned ? MEDAL_COLORS[m] : 'rgba(255,255,255,0.4)'};font-weight:bold;`;
            chip.textContent = `${MEDAL_LABELS[m]}: ${ch.medals[m]}`;
            medalRow.appendChild(chip);
        }
        panel.appendChild(medalRow);

        // Current best
        if (entry && entry.bestMedal !== 'none') {
            const bestRow = document.createElement('div');
            bestRow.style.cssText =
                `padding:8px 12px;border-radius:8px;background:${MEDAL_COLORS[medal]}15;` +
                `border:1px solid ${MEDAL_COLORS[medal]}40;font-size:13px;`;
            bestRow.innerHTML =
                `<span style="color:rgba(255,255,255,0.6);">Your Best:</span> ` +
                `<span style="color:${MEDAL_COLORS[medal]};font-weight:bold;">${escapeHtml(MEDAL_LABELS[medal])}</span>` +
                ` <span style="color:rgba(255,255,255,0.5);">(Score: ${entry.bestScore})</span>`;
            if (entry.completedAt) {
                const date = new Date(entry.completedAt);
                const dateStr = date.toLocaleDateString();
                bestRow.innerHTML += ` <span style="color:rgba(255,255,255,0.3);font-size:11px;"> - ${escapeHtml(dateStr)}</span>`;
            }
            panel.appendChild(bestRow);
        }

        // Reward
        const rewardTitle = document.createElement('div');
        rewardTitle.style.cssText = 'font-size:12px;font-weight:bold;color:rgba(255,255,255,0.6);text-transform:uppercase;letter-spacing:0.5px;';
        rewardTitle.textContent = 'Reward';
        panel.appendChild(rewardTitle);

        const rewardEl = document.createElement('div');
        rewardEl.style.cssText = 'font-size:12px;color:rgba(255,255,255,0.7);';
        const rewardParts: string[] = [`${ch.reward.xp} XP`];
        if (ch.reward.cosmeticId) rewardParts.push(`Cosmetic: ${ch.reward.cosmeticId}`);
        if (ch.reward.achievementId) rewardParts.push(`Achievement: ${ch.reward.achievementId}`);
        rewardEl.textContent = rewardParts.join(' | ');
        panel.appendChild(rewardEl);

        // Start button
        const startBtn = document.createElement('button');
        startBtn.textContent = 'Start Challenge';
        startBtn.style.cssText = this.buttonStyle(true);
        startBtn.style.marginTop = 'auto';
        startBtn.addEventListener('click', () => {
            this.ctx.navigate('start_challenge', { challengeId: ch.id });
        });
        panel.appendChild(startBtn);

        return panel;
    }

    // -----------------------------------------------------------------------
    // Helpers
    // -----------------------------------------------------------------------

    private rerender(): void {
        if (!this.root) return;
        const parent = this.root.parentElement;
        if (!parent) return;
        this.root.remove();
        this.render(parent);
    }

    private buttonStyle(primary: boolean): string {
        if (primary) {
            return (
                'padding:10px 20px;border:none;border-radius:8px;cursor:pointer;' +
                'font-family:Arial,sans-serif;font-size:14px;font-weight:bold;' +
                'background:linear-gradient(135deg,#3498db,#2980b9);color:white;' +
                'letter-spacing:0.5px;transition:opacity 0.15s;'
            );
        }
        return (
            'padding:10px 20px;border:1px solid rgba(255,255,255,0.2);border-radius:8px;cursor:pointer;' +
            'font-family:Arial,sans-serif;font-size:14px;font-weight:bold;' +
            'background:rgba(26,26,46,0.8);color:white;' +
            'transition:background 0.15s;'
        );
    }

    private tabStyle(active: boolean): string {
        return (
            `flex:1;padding:10px 16px;border:1px solid ${active ? '#3498db' : 'rgba(255,255,255,0.12)'};` +
            `border-radius:8px;cursor:pointer;font-family:Arial,sans-serif;font-size:13px;font-weight:bold;` +
            `background:${active ? 'rgba(52,152,219,0.2)' : 'rgba(26,26,46,0.6)'};` +
            `color:${active ? '#3498db' : 'rgba(255,255,255,0.6)'};` +
            `text-transform:uppercase;letter-spacing:0.5px;transition:all 0.15s;`
        );
    }
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function medalRank(medal: string): number {
    switch (medal) {
        case 'diamond': return 4;
        case 'gold': return 3;
        case 'silver': return 2;
        case 'bronze': return 1;
        default: return 0;
    }
}
