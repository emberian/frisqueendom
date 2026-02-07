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
