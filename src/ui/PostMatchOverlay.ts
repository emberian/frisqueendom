import type { MatchProgressionResult } from '../management/ProgressionManager';
import { XP_PER_LEVEL } from '../data/Progression';
import type { ProgressionData } from '../data/SaveLoad';

export type MatchEventType = 'goal' | 'turnover' | 'block';

export interface MatchEventItem {
    timeLabel: string;
    type: MatchEventType;
    text: string;
    playerId?: string;
}

export interface PerformerLine {
    playerId: string;
    name: string;
    teamName: string;
    goals: number;
    blocks: number;
    impact: number;
}

export interface MatchSummaryData {
    homeTeamName: string;
    awayTeamName: string;
    homeScore: number;
    awayScore: number;
    playerOfMatch: PerformerLine | null;
    topPerformers: PerformerLine[];
    events: MatchEventItem[];
    progression?: {
        result: MatchProgressionResult;
        currentData: ProgressionData;
    };
}

export class PostMatchOverlay {
    private root: HTMLDivElement;

    constructor() {
        const ui = document.getElementById('ui')!;
        this.root = document.createElement('div');
        this.root.style.cssText =
            'position:absolute;inset:0;display:none;align-items:center;justify-content:center;' +
            'background:rgba(3,8,16,0.92);backdrop-filter:blur(8px);z-index:45;pointer-events:auto;';
        ui.appendChild(this.root);
    }

    show(
        summary: MatchSummaryData,
        onContinue: () => void,
        onWatchHighlights?: () => void,
        onPlayAgain?: () => void,
    ): void {
        const winnerName =
            summary.homeScore >= summary.awayScore
                ? summary.homeTeamName
                : summary.awayTeamName;
        
        const topRows = summary.topPerformers
            .slice(0, 4)
            .map(
                (p, idx) => `
<tr>
  <td style="padding:6px 8px;color:rgba(255,255,255,0.72);">${idx + 1}</td>
  <td style="padding:6px 8px;">${escapeHtml(p.name)}</td>
  <td style="padding:6px 8px;color:rgba(255,255,255,0.72);">${escapeHtml(p.teamName)}</td>
  <td style="padding:6px 8px;text-align:right;">${p.goals}</td>
  <td style="padding:6px 8px;text-align:right;">${p.blocks}</td>
  <td style="padding:6px 8px;text-align:right;color:#ffd166;font-weight:bold;">${p.impact}</td>
</tr>`,
            )
            .join('');

        const timelineRows = summary.events
            .slice(-8)
            .reverse()
            .map((event) => {
                const color =
                    event.type === 'goal'
                        ? '#ffd166'
                        : event.type === 'block'
                        ? '#8fdcff'
                        : '#ffa8b7';
                return `<li style="display:grid;grid-template-columns:72px 1fr;gap:10px;padding:6px 0;border-bottom:1px solid rgba(255,255,255,0.08);"><span style="color:${color};font-weight:bold;">${escapeHtml(event.timeLabel)}</span><span>${escapeHtml(event.text)}</span></li>`;
            })
            .join('');
            
        // Progression Section
        let progressionHtml = '';
        if (summary.progression) {
            const { result, currentData } = summary.progression;
            
            // Calculate progress bar
            // XP for current level starts at (level-1) * 1000
            // XP for next level is level * 1000
            // Progress is (totalXP - startXP) / 1000
            const levelStartXP = (result.newLevel - 1) * XP_PER_LEVEL;
            const currentLevelXP = currentData.experience - levelStartXP;
            const progressPct = Math.min(100, Math.max(0, (currentLevelXP / XP_PER_LEVEL) * 100));
            
            const challengesHtml = result.completedChallenges.length > 0 
                ? `<div style="margin-top:8px;padding:8px;background:rgba(255,215,0,0.15);border-radius:8px;border:1px solid rgba(255,215,0,0.3);">
                    <div style="font-size:11px;color:#ffd700;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px;">Challenges Complete!</div>
                    ${result.completedChallenges.map(c => `<div style="font-size:13px;">✓ ${escapeHtml(c.description)} <span style="color:#8fdcff;">+${c.rewardXp} XP</span></div>`).join('')}
                   </div>`
                : '';
                
            const unlocksHtml = result.newUnlocks.length > 0
                ? `<div style="margin-top:8px;padding:8px;background:linear-gradient(90deg, rgba(143,220,255,0.2), transparent);border-radius:8px;border-left:3px solid #8fdcff;">
                    <div style="font-size:11px;color:#8fdcff;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px;">New Unlocks!</div>
                    ${result.newUnlocks.map(u => `<div style="font-size:14px;font-weight:bold;">${escapeHtml(u.name)}</div><div style="font-size:12px;opacity:0.8;">${escapeHtml(u.description)}</div>`).join('')}
                   </div>`
                : '';

            progressionHtml = `
            <section style="margin-top:12px;padding:14px;border-radius:12px;background:linear-gradient(150deg,rgba(20,30,50,0.6),rgba(10,20,35,0.6));border:1px solid rgba(255,255,255,0.14);">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
                    <div style="display:flex;align-items:center;gap:12px;">
                        <div style="width:42px;height:42px;border-radius:50%;background:#3498db;display:flex;align-items:center;justify-content:center;font-size:20px;font-weight:bold;color:white;box-shadow:0 4px 12px rgba(0,0,0,0.3);">
                            ${result.newLevel}
                        </div>
                        <div>
                            <div style="font-size:12px;text-transform:uppercase;letter-spacing:1px;color:rgba(255,255,255,0.6);">Level ${result.newLevel}</div>
                            <div style="width:160px;height:8px;background:rgba(255,255,255,0.1);border-radius:4px;margin-top:4px;overflow:hidden;">
                                <div style="width:${progressPct}%;height:100%;background:#ffd166;transition:width 1s ease-out;"></div>
                            </div>
                        </div>
                    </div>
                    <div style="text-align:right;">
                        <div style="font-size:24px;font-weight:bold;color:#ffd166;">+${result.xpGained} XP</div>
                        <div style="font-size:11px;color:rgba(255,255,255,0.5);">Match Total</div>
                    </div>
                </div>
                ${result.levelUp ? '<div style="text-align:center;font-weight:bold;color:#8fdcff;margin-bottom:8px;letter-spacing:2px;text-shadow:0 0 10px #8fdcff;">LEVEL UP!</div>' : ''}
                ${challengesHtml}
                ${unlocksHtml}
            </section>
            `;
        }

        this.root.innerHTML = `
<div style="width:min(980px,95vw);max-height:90vh;overflow:auto;border-radius:18px;border:1px solid rgba(255,255,255,0.24);background:linear-gradient(150deg,rgba(5,14,28,0.95),rgba(9,28,49,0.92));box-shadow:0 30px 90px rgba(0,0,0,0.55);padding:18px;">
  <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap;">
    <div>
      <div style="font-family:monospace;font-size:12px;letter-spacing:0.14em;text-transform:uppercase;color:rgba(255,255,255,0.72);">Final Whistle</div>
      <h2 style="margin:6px 0 2px;font-family:monospace;font-size:34px;letter-spacing:0.07em;color:#ffd166;">${escapeHtml(summary.homeTeamName)} ${summary.homeScore} - ${summary.awayScore} ${escapeHtml(summary.awayTeamName)}</h2>
      <div style="font-family:monospace;font-size:13px;color:rgba(255,255,255,0.82);">${escapeHtml(winnerName)} win the match.</div>
    </div>
    <div style="display:flex;gap:10px;">
        ${onWatchHighlights ? '<button id="watch-highlights" style="padding:10px 14px;border-radius:10px;border:1px solid rgba(143,220,255,0.4);background:rgba(143,220,255,0.1);color:#8fdcff;font-family:monospace;letter-spacing:0.1em;text-transform:uppercase;cursor:pointer;">Watch Highlights</button>' : ''}
        ${onPlayAgain ? '<button id="play-again" style="padding:10px 14px;border-radius:10px;border:1px solid rgba(102,255,102,0.4);background:rgba(102,255,102,0.1);color:#66ff66;font-family:monospace;letter-spacing:0.1em;text-transform:uppercase;cursor:pointer;font-weight:bold;">Play Again</button>' : ''}
        <button id="continue-post-match" style="padding:10px 14px;border-radius:10px;border:1px solid rgba(255,255,255,0.26);background:linear-gradient(150deg,rgba(255,122,34,0.92),rgba(255,77,109,0.9));color:white;font-family:monospace;letter-spacing:0.1em;text-transform:uppercase;cursor:pointer;">Continue</button>
    </div>
  </div>

  <div style="display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:12px;margin-top:12px;">
    <div style="display:flex;flex-direction:column;gap:12px;">
        <section style="padding:10px;border-radius:12px;background:rgba(3,10,20,0.45);border:1px solid rgba(255,255,255,0.14);">
          <h3 style="margin:0 0 8px;font-family:monospace;font-size:15px;letter-spacing:0.08em;text-transform:uppercase;color:#8fdcff;">Player Of The Match</h3>
          ${
              summary.playerOfMatch
                  ? `<div style="font-family:monospace;font-size:14px;line-height:1.6;">
                        <div style="font-size:19px;color:#ffd166;font-weight:bold;">${escapeHtml(summary.playerOfMatch.name)}</div>
                        <div style="color:rgba(255,255,255,0.82);">${escapeHtml(summary.playerOfMatch.teamName)}</div>
                        <div style="margin-top:4px;">Goals: <strong>${summary.playerOfMatch.goals}</strong> | Blocks: <strong>${summary.playerOfMatch.blocks}</strong> | Impact: <strong>${summary.playerOfMatch.impact}</strong></div>
                     </div>`
                  : `<div style="font-family:monospace;color:rgba(255,255,255,0.7);">No standout player recorded.</div>`
          }
        </section>
        ${progressionHtml}
    </div>
    <section style="padding:10px;border-radius:12px;background:rgba(3,10,20,0.45);border:1px solid rgba(255,255,255,0.14);">
      <h3 style="margin:0 0 8px;font-family:monospace;font-size:15px;letter-spacing:0.08em;text-transform:uppercase;color:#ffd166;">Match Timeline</h3>
      <ul style="list-style:none;margin:0;padding:0;font-family:monospace;font-size:12px;max-height:210px;overflow:auto;">
        ${timelineRows || `<li style="padding:6px 0;color:rgba(255,255,255,0.72);">No major events captured.</li>`}
      </ul>
    </section>
  </div>

  <section style="margin-top:12px;padding:10px;border-radius:12px;background:rgba(3,10,20,0.45);border:1px solid rgba(255,255,255,0.14);">
    <h3 style="margin:0 0 8px;font-family:monospace;font-size:15px;letter-spacing:0.08em;text-transform:uppercase;color:#a0f5a0;">Top Performers</h3>
    <div style="overflow:auto;">
      <table style="width:100%;border-collapse:collapse;font-family:monospace;font-size:12px;">
        <thead>
          <tr style="color:rgba(255,255,255,0.75);text-align:left;">
            <th style="padding:6px 8px;">#</th>
            <th style="padding:6px 8px;">Player</th>
            <th style="padding:6px 8px;">Team</th>
            <th style="padding:6px 8px;text-align:right;">G</th>
            <th style="padding:6px 8px;text-align:right;">B</th>
            <th style="padding:6px 8px;text-align:right;">Impact</th>
          </tr>
        </thead>
        <tbody>
          ${topRows || `<tr><td colspan="6" style="padding:8px;color:rgba(255,255,255,0.7);">No performer data yet.</td></tr>`}
        </tbody>
      </table>
    </div>
  </section>
</div>`;
        this.root.style.display = 'flex';
        this.root
            .querySelector<HTMLButtonElement>('#continue-post-match')
            ?.addEventListener('click', () => {
                this.hide();
                onContinue();
            });

        if (onWatchHighlights) {
            this.root.querySelector('#watch-highlights')?.addEventListener('click', () => {
                this.hide();
                onWatchHighlights();
            });
        }

        if (onPlayAgain) {
            this.root.querySelector('#play-again')?.addEventListener('click', () => {
                this.hide();
                onPlayAgain();
            });
        }
    }

    hide(): void {
        this.root.style.display = 'none';
        this.root.innerHTML = '';
    }

    destroy(): void {
        this.root.remove();
    }
}

function escapeHtml(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}
