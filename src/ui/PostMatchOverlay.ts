export type MatchEventType = 'goal' | 'turnover' | 'block';

export interface MatchEventItem {
    timeLabel: string;
    type: MatchEventType;
    text: string;
}

export interface PerformerLine {
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
    progression?: ProgressionSummaryData | null;
}

export interface ProgressionChallengeLine {
    title: string;
    description: string;
    progressLabel: string;
    completed: boolean;
    rewardXp: number;
}

export interface ProgressionSummaryData {
    level: number;
    experience: number;
    xpToNext: number;
    gainedXp: number;
    levelUps: number;
    unlockedCosmetics: string[];
    challenges: ProgressionChallengeLine[];
}

export class PostMatchOverlay {
    private root: HTMLDivElement;

    constructor() {
        const ui = document.getElementById('ui')!;
        this.root = document.createElement('div');
        this.root.style.cssText =
            'position:absolute;inset:0;display:none;align-items:center;justify-content:center;' +
            'background:rgba(3,8,16,0.78);backdrop-filter:blur(6px);z-index:45;pointer-events:auto;';
        ui.appendChild(this.root);
    }

    show(
        summary: MatchSummaryData,
        onContinue: () => void,
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

        const progression = summary.progression;
        const xpPct = progression
            ? Math.max(0, Math.min(100, (progression.experience / Math.max(1, progression.xpToNext)) * 100))
            : 0;
        const challengeCards = progression
            ? progression.challenges
                  .map((challenge) => {
                      const accent = challenge.completed ? '#8ff2a6' : '#ffd166';
                      const badge = challenge.completed ? 'Complete' : 'Active';
                      return `<div style="padding:8px;border-radius:10px;border:1px solid rgba(255,255,255,0.14);background:rgba(2,9,18,0.5);">
  <div style="display:flex;justify-content:space-between;gap:8px;align-items:flex-start;">
    <strong style="font-size:12px;color:${accent};">${escapeHtml(challenge.title)}</strong>
    <span style="font-size:10px;letter-spacing:0.06em;text-transform:uppercase;color:rgba(255,255,255,0.72);">${badge}</span>
  </div>
  <div style="margin-top:4px;font-size:11px;color:rgba(255,255,255,0.72);">${escapeHtml(challenge.description)}</div>
  <div style="margin-top:6px;display:flex;justify-content:space-between;font-size:11px;">
    <span>${escapeHtml(challenge.progressLabel)}</span>
    <span style="color:#ffd166;">+${challenge.rewardXp} XP</span>
  </div>
</div>`;
                  })
                  .join('')
            : '';
        const unlocks = progression
            ? progression.unlockedCosmetics
                  .map((name) => `<li style="padding:3px 0;">${escapeHtml(name)}</li>`)
                  .join('')
            : '';
        const progressionSection = progression
            ? `
  <section style="margin-top:12px;padding:10px;border-radius:12px;background:rgba(3,10,20,0.45);border:1px solid rgba(255,255,255,0.14);">
    <h3 style="margin:0 0 8px;font-family:monospace;font-size:15px;letter-spacing:0.08em;text-transform:uppercase;color:#ffcf6c;">Progression</h3>
    <div style="display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:10px;">
      <div style="padding:8px;border-radius:10px;border:1px solid rgba(255,255,255,0.14);background:rgba(2,9,18,0.5);font-family:monospace;">
        <div style="display:flex;justify-content:space-between;gap:8px;align-items:center;">
          <strong style="font-size:14px;color:#ffd166;">Level ${progression.level}</strong>
          <span style="font-size:12px;color:#8ff2a6;">+${progression.gainedXp} XP</span>
        </div>
        <div style="margin-top:6px;height:10px;border-radius:999px;overflow:hidden;background:rgba(255,255,255,0.12);border:1px solid rgba(255,255,255,0.2);">
          <div style="height:100%;width:${xpPct.toFixed(1)}%;background:linear-gradient(90deg,#ffd166,#ff8f4a,#ff4f7d);"></div>
        </div>
        <div style="margin-top:5px;font-size:11px;color:rgba(255,255,255,0.74);">${progression.experience} / ${progression.xpToNext} XP to next level</div>
        ${
            progression.levelUps > 0
                ? `<div style="margin-top:6px;font-size:11px;color:#8ff2a6;">Level up x${progression.levelUps}!</div>`
                : ''
        }
      </div>
      <div style="padding:8px;border-radius:10px;border:1px solid rgba(255,255,255,0.14);background:rgba(2,9,18,0.5);">
        <div style="font-family:monospace;font-size:12px;color:#8fdcff;letter-spacing:0.06em;text-transform:uppercase;">Daily Challenges</div>
        <div style="margin-top:8px;display:grid;gap:8px;">${challengeCards}</div>
      </div>
    </div>
    ${
        unlocks
            ? `<div style="margin-top:10px;padding:8px;border-radius:10px;background:rgba(30,48,14,0.45);border:1px solid rgba(143,242,166,0.44);">
                 <div style="font-family:monospace;font-size:12px;letter-spacing:0.07em;text-transform:uppercase;color:#8ff2a6;">New Cosmetic Unlocks</div>
                 <ul style="margin:6px 0 0 14px;padding:0;font-family:monospace;font-size:12px;">${unlocks}</ul>
               </div>`
            : ''
    }
  </section>`
            : '';

        this.root.innerHTML = `
<div style="width:min(980px,95vw);max-height:90vh;overflow:auto;border-radius:18px;border:1px solid rgba(255,255,255,0.24);background:linear-gradient(150deg,rgba(5,14,28,0.95),rgba(9,28,49,0.92));box-shadow:0 30px 90px rgba(0,0,0,0.55);padding:18px;">
  <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap;">
    <div>
      <div style="font-family:monospace;font-size:12px;letter-spacing:0.14em;text-transform:uppercase;color:rgba(255,255,255,0.72);">Final Whistle</div>
      <h2 style="margin:6px 0 2px;font-family:monospace;font-size:34px;letter-spacing:0.07em;color:#ffd166;">${escapeHtml(summary.homeTeamName)} ${summary.homeScore} - ${summary.awayScore} ${escapeHtml(summary.awayTeamName)}</h2>
      <div style="font-family:monospace;font-size:13px;color:rgba(255,255,255,0.82);">${escapeHtml(winnerName)} win the match.</div>
    </div>
    <button id="continue-post-match" style="padding:10px 14px;border-radius:10px;border:1px solid rgba(255,255,255,0.26);background:linear-gradient(150deg,rgba(255,122,34,0.92),rgba(255,77,109,0.9));color:white;font-family:monospace;letter-spacing:0.1em;text-transform:uppercase;cursor:pointer;">Continue</button>
  </div>

  <div style="display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:12px;margin-top:12px;">
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
  ${progressionSection}
</div>`;
        this.root.style.display = 'flex';
        this.root
            .querySelector<HTMLButtonElement>('#continue-post-match')
            ?.addEventListener('click', () => {
                this.hide();
                onContinue();
            });
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
