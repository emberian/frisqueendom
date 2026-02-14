import {
    saveManager,
    createNewCareer,
    loadCareer,
    saveCareer,
    setActiveCareerSlot,
    type CareerData,
    type ScoutingReport,
} from '../../data/SaveLoad';
import { CareerManager, type CareerSimSummary, type SimIntervention } from '../../management/Career';
import { RosterManager } from '../../management/Roster';
import { PlaybookEditor } from '../../management/Playbook';
import { escapeHtml, type Screen, type ScreenContext } from './ScreenInterface';

export class CareerScreen implements Screen {
    private ctx: ScreenContext;
    private root: HTMLDivElement | null = null;
    private container: HTMLElement | null = null;

    constructor(ctx: ScreenContext) {
        this.ctx = ctx;
    }

    render(container: HTMLElement): void {
        this.container = container;
        const career = loadCareer();
        if (!career) {
            this.ctx.navigate('/title');
            return;
        }

        const manager = CareerManager.load(career.careerSlot);
        if (!manager) {
            this.ctx.navigate('/title');
            return;
        }

        const currentEvent = career.schedule.find((event) => event.date === career.week) || null;
        let actionLabel = 'Advance Event';
        let actionHint = 'No scheduled event this week.';
        if (currentEvent?.type === 'tournament') {
            actionLabel = `Play ${currentEvent.title}`;
            const gateReason = manager.getCurrentEventGateReason(currentEvent);
            actionHint = gateReason
                ? `Locked: ${gateReason}`
                : `${currentEvent.opponent.teamName} (${currentEvent.opponent.rating} OVR • ${currentEvent.opponent.difficulty})`;
        } else if (currentEvent?.type === 'practice') {
            actionLabel = 'Run Practice';
            actionHint = `${currentEvent.title} • Suggested focus: ${currentEvent.focus}`;
        } else if (currentEvent?.type === 'rest') {
            actionLabel = 'Take Rest Week';
            actionHint = currentEvent.title;
        } else if (currentEvent?.type === 'tryout') {
            actionLabel =
                currentEvent.stage === 'announce'
                    ? 'Post Tryout Announcement'
                    : currentEvent.stage === 'drill'
                    ? 'Run Tryout Drill'
                    : 'Offer Roster Spots';
            actionHint = `${currentEvent.title} • ${currentEvent.stage.toUpperCase()}`;
        } else if (currentEvent?.type === 'scouting') {
            actionLabel = 'Scout Opponent';
            actionHint = currentEvent.title;
        } else if (currentEvent?.type === 'bonding') {
            actionLabel = 'Run Team Bonding';
            actionHint = `${currentEvent.title} • ${currentEvent.effect.toUpperCase()} focus`;
        }

        const menu = document.createElement('div');
        menu.className = 'career-menu';
        menu.innerHTML = `
            <h1>${career.teamName}</h1>
            <p class="menu-subtitle">Event-driven season mode.</p>
            <div class="career-stats">
                <p>Season ${career.season}, Week ${career.week}</p>
                <p>${career.mode === 'college' ? `College Year ${career.collegeYear}` : `Division ${career.division}`} • ${escapeHtml(career.homeRegion)} • ${career.difficulty.toUpperCase()}</p>
                <p>Phase: ${career.seasonPhase.toUpperCase()} • Rank #${manager.getCurrentRank()}</p>
                <p>Record: ${career.team.stats.wins}-${career.team.stats.losses}</p>
                <p>Points: ${career.team.stats.pointsFor}-${career.team.stats.pointsAgainst}</p>
                <p>Spirit: ${career.team.stats.spiritScore.toFixed(1)}/10</p>
                <p>Budget: $${career.finances.budget.toLocaleString()}</p>
                <p>Captains: ${career.captainIds.length} • Mentorships: ${career.mentorships.length} • Prestige: ${career.prestigeLevel}</p>
                <p>Line Setting: O ${career.team.offenseLineupIds?.length || 0}/7 • D ${career.team.defenseLineupIds?.length || 0}/7</p>
                <p>Slot: ${career.careerSlot + 1}/3</p>
            </div>
            <div style="margin:10px 0 12px;padding:10px;border-radius:10px;border:1px solid rgba(255,255,255,0.18);background:rgba(8,14,24,0.55);">
                <p style="margin:0;font-size:12px;color:#9fb6d4;text-transform:uppercase;letter-spacing:0.08em;">Current Event</p>
                <p style="margin:6px 0 0;font-size:16px;font-weight:600;">${escapeHtml(currentEvent?.title || 'Open Week')}</p>
                <p style="margin:2px 0 0;font-size:13px;color:#c8d7ee;">${escapeHtml(actionHint)}</p>
            </div>
            <div class="menu-buttons">
                <button class="menu-btn primary" id="primary-action">${escapeHtml(actionLabel)}</button>
                <button class="menu-btn" id="auto-event">Auto-Resolve Event</button>
                <button class="menu-btn" id="roster">Roster</button>
                <button class="menu-btn" id="playbook">Playbook</button>
                <button class="menu-btn" id="schedule">Schedule</button>
                <button class="menu-btn" id="tryouts">Tryouts</button>
                <button class="menu-btn" id="scouting">Scouting</button>
                <button class="menu-btn" id="spirit">Spirit Dashboard</button>
                <button class="menu-btn" id="milestones">Milestones</button>
                <button class="menu-btn" id="profile">Profile</button>
                <button class="menu-btn" id="back">Back to Main</button>
            </div>
        `;
        container.appendChild(menu);
        this.root = menu;

        menu.querySelector('#primary-action')?.addEventListener('click', () => {
            const event = manager.getCurrentEvent();
            if (event?.type === 'tournament') {
                const gate = manager.getCurrentEventGateReason(event);
                if (gate) {
                    alert(gate);
                    return;
                }
                setActiveCareerSlot(manager.data.careerSlot);
                this.ctx.setState('none');
                window.dispatchEvent(new CustomEvent('startCareerMatch'));
                return;
            }
            if (event?.type === 'practice') {
                this.showTrainingScreen();
                return;
            }
            if (event?.type === 'rest') {
                const outcome = manager.takeRestWeek();
                if (!outcome.ok) {
                    alert(outcome.reason || 'Unable to take a rest week right now.');
                }
                this.ctx.rerender();
                return;
            }
            if (event?.type === 'tryout') {
                this.showTryoutScreen(career);
                return;
            }
            if (event?.type === 'scouting') {
                this.showScoutingScreen(career);
                return;
            }
            if (event?.type === 'bonding') {
                const outcome = manager.runBondingEvent();
                if (!outcome.ok) {
                    alert(outcome.reason || 'Unable to run bonding event.');
                }
                this.ctx.rerender();
                return;
            }
            alert('No scheduled event this week.');
        });

        menu.querySelector('#auto-event')?.addEventListener('click', () => {
            const event = manager.getCurrentEvent();
            const interventions: SimIntervention[] = [];
            if (event?.type === 'tournament') {
                if (confirm('Call a timeout during simulation for a momentum boost?')) {
                    interventions.push({ type: 'timeout', atPoint: 8 });
                }
            }
            const outcome = manager.runCurrentEventAuto(interventions);
            if (!outcome.ok) {
                alert(outcome.reason || 'Unable to auto-resolve this event.');
                return;
            }
            if (event?.type === 'tournament' && outcome.data) {
                this.showSimulationSummaryDialog(outcome.data as CareerSimSummary);
            } else if (event?.type === 'scouting' && outcome.data) {
                const report = outcome.data as ScoutingReport;
                alert(
                    `Scouting report ready: ${report.teamName}\nStrengths: ${report.strengths.join(', ')}\nWeaknesses: ${report.weaknesses.join(', ')}`,
                );
            } else {
                alert('Event resolved.');
            }
            this.ctx.rerender();
        });

        menu.querySelector('#roster')?.addEventListener('click', () => {
            this.showRosterScreen();
        });

        menu.querySelector('#playbook')?.addEventListener('click', () => {
            this.showPlaybookScreen();
        });

        menu.querySelector('#schedule')?.addEventListener('click', () => {
            this.showScheduleScreen();
        });

        menu.querySelector('#tryouts')?.addEventListener('click', () => {
            this.showTryoutScreen(career);
        });

        menu.querySelector('#scouting')?.addEventListener('click', () => {
            this.showScoutingScreen(career);
        });

        menu.querySelector('#spirit')?.addEventListener('click', () => {
            this.showSpiritDashboard(career);
        });

        menu.querySelector('#milestones')?.addEventListener('click', () => {
            this.showMilestonesScreen(career);
        });

        menu.querySelector('#profile')?.addEventListener('click', () => {
            this.showProfileScreen(career);
        });

        menu.querySelector('#back')?.addEventListener('click', () => {
            this.ctx.navigate('/title');
        });
    }

    // ------------------------------------------------------------------
    // Sub-dialog: Roster
    // ------------------------------------------------------------------

    private showRosterScreen(): void {
        const career = loadCareer();
        if (!career) return;
        const manager = CareerManager.load(career.careerSlot);
        if (!manager) return;

        const ensureLineup = (ids: string[], rosterIds: string[]): string[] => {
            const unique = new Set<string>();
            const lineup: string[] = [];
            for (const id of ids) {
                if (!rosterIds.includes(id) || unique.has(id)) continue;
                unique.add(id);
                lineup.push(id);
                if (lineup.length >= 7) break;
            }
            for (const id of rosterIds) {
                if (lineup.length >= 7) break;
                if (unique.has(id)) continue;
                unique.add(id);
                lineup.push(id);
            }
            return lineup.slice(0, 7);
        };

        let sortBy: 'overall' | 'role' | 'stamina' | 'morale' = 'overall';
        let offenseLineupIds = ensureLineup(
            career.team.offenseLineupIds || career.team.startingLineupIds || [],
            career.team.roster.map((player) => player.id),
        );
        let defenseLineupIds = ensureLineup(
            career.team.defenseLineupIds || career.team.startingLineupIds || [],
            career.team.roster.map((player) => player.id),
        );

        const dialog = document.createElement('div');
        dialog.className = 'dialog-overlay';

        const render = () => {
            const refreshed = loadCareer(career.careerSlot);
            if (!refreshed) return;
            const workingCareer = refreshed;
            const rosterManager = new RosterManager(workingCareer);
            const rosterIds = workingCareer.team.roster.map((player) => player.id);
            offenseLineupIds = ensureLineup(offenseLineupIds, rosterIds);
            defenseLineupIds = ensureLineup(defenseLineupIds, rosterIds);

            const sorted = rosterManager.sortRoster(sortBy);
            const buildLineRows = (
                lineType: 'offense' | 'defense',
                lineupIds: string[],
                title: string,
            ) =>
                lineupIds
                .map((playerId, idx) => {
                    const selected = workingCareer.team.roster.find((p) => p.id === playerId);
                    const options = sorted
                        .map((player) => {
                            const selectedAttr = player.id === playerId ? 'selected' : '';
                            return `<option value="${player.id}" ${selectedAttr}>${escapeHtml(player.fullName)} (${player.role}, OVR ${player.overallRating})</option>`;
                        })
                        .join('');
                    return `
<tr>
  <td style="padding:6px 8px;">${title} ${idx + 1}</td>
  <td style="padding:6px 8px;">${selected ? escapeHtml(selected.role) : '-'}</td>
  <td style="padding:6px 8px;">
    <select data-lineup-slot="${idx}" data-lineup-type="${lineType}" style="width:100%;padding:6px;border-radius:7px;border:1px solid rgba(255,255,255,0.28);background:rgba(255,255,255,0.1);color:white;">
      ${options}
    </select>
  </td>
</tr>`;
                })
                .join('');
            const offenseRows = buildLineRows('offense', offenseLineupIds, 'O');
            const defenseRows = buildLineRows('defense', defenseLineupIds, 'D');

            const rosterRows = sorted
                .map(
                    (player) => `
<tr>
  <td style="padding:6px 8px;">${escapeHtml(player.fullName)}</td>
  <td style="padding:6px 8px;">${escapeHtml(player.role)}</td>
  <td style="padding:6px 8px;text-align:center;">${offenseLineupIds.includes(player.id) ? 'O' : ''}${defenseLineupIds.includes(player.id) ? 'D' : ''}</td>
  <td style="padding:6px 8px;text-align:right;">${player.overallRating}</td>
  <td style="padding:6px 8px;text-align:right;">${player.attributes.stamina.toFixed(0)}</td>
  <td style="padding:6px 8px;text-align:right;">${player.morale.toFixed(0)}</td>
  <td style="padding:6px 8px;text-align:center;">
    <button class="menu-btn small" data-captain-toggle="${player.id}">
      ${workingCareer.captainIds.includes(player.id) ? 'Captain' : 'Set'}
    </button>
  </td>
</tr>`,
                )
                .join('');

            const recommendations = rosterManager
                .getTrainingRecommendations()
                .slice(0, 2)
                .map((r) => `${escapeHtml(r.focus)}: ${escapeHtml(r.reason)}`)
                .join(' • ');

            const mentorshipRows = (workingCareer.mentorships || [])
                .map((pair) => {
                    const mentor = workingCareer.team.roster.find(
                        (player) => player.id === pair.mentorId,
                    );
                    const mentee = workingCareer.team.roster.find(
                        (player) => player.id === pair.menteeId,
                    );
                    if (!mentor || !mentee) return '';
                    return `
<tr>
  <td style="padding:6px 8px;">${escapeHtml(mentor.fullName)}</td>
  <td style="padding:6px 8px;">${escapeHtml(mentee.fullName)}</td>
  <td style="padding:6px 8px;text-align:right;">${pair.sessions}</td>
  <td style="padding:6px 8px;text-align:right;">${manager.getChemistry(mentor.id, mentee.id).toFixed(1)}</td>
  <td style="padding:6px 8px;"><button class="menu-btn small danger" data-remove-mentee="${mentee.id}">Remove</button></td>
</tr>`;
                })
                .filter((row) => row.length > 0)
                .join('');

            const mentorOptions = workingCareer.team.roster
                .slice()
                .sort(
                    (a, b) =>
                        b.development.age +
                        b.career.gamesPlayed * 0.05 -
                        (a.development.age + a.career.gamesPlayed * 0.05),
                )
                .map(
                    (player) =>
                        `<option value="${player.id}">${escapeHtml(player.fullName)} (${player.development.age}y, ${player.career.gamesPlayed} gp)</option>`,
                )
                .join('');
            const menteeOptions = workingCareer.team.roster
                .slice()
                .sort(
                    (a, b) =>
                        a.development.age + a.career.gamesPlayed * 0.02 -
                        (b.development.age + b.career.gamesPlayed * 0.02),
                )
                .map(
                    (player) =>
                        `<option value="${player.id}">${escapeHtml(player.fullName)} (${player.development.age}y)</option>`,
                )
                .join('');

            dialog.innerHTML = `
<div class="dialog wide" style="max-width:min(960px,95vw);">
  <h2>Roster And Lineup (${career.team.roster.length} players)</h2>
  <p style="margin-top:-4px;color:#c8d7ee;font-size:13px;">Set dedicated offense and defense lines, assign captains, and run mentorship pairings.</p>

  <div style="display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:12px;max-height:72vh;overflow:auto;padding-right:4px;">
    <section style="padding:10px;border-radius:10px;border:1px solid rgba(255,255,255,0.18);background:rgba(8,14,24,0.6);">
      <h3 style="margin:0 0 8px;">Offense Line (Receiving)</h3>
      <table style="width:100%;border-collapse:collapse;font-size:12px;">
        <thead><tr><th style="padding:6px 8px;text-align:left;">Slot</th><th style="padding:6px 8px;text-align:left;">Role</th><th style="padding:6px 8px;text-align:left;">Player</th></tr></thead>
        <tbody>${offenseRows}</tbody>
      </table>
      <div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap;">
        <button class="menu-btn" id="lineup-auto-offense">Auto O-Line</button>
      </div>
    </section>

    <section style="padding:10px;border-radius:10px;border:1px solid rgba(255,255,255,0.18);background:rgba(8,14,24,0.6);">
      <h3 style="margin:0 0 8px;">Defense Line (Pulling)</h3>
      <table style="width:100%;border-collapse:collapse;font-size:12px;">
        <thead><tr><th style="padding:6px 8px;text-align:left;">Slot</th><th style="padding:6px 8px;text-align:left;">Role</th><th style="padding:6px 8px;text-align:left;">Player</th></tr></thead>
        <tbody>${defenseRows}</tbody>
      </table>
      <div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap;">
        <button class="menu-btn" id="lineup-auto-defense">Auto D-Line</button>
        <button class="menu-btn primary" id="lineup-save">Save Lines</button>
      </div>
    </section>

    <section style="padding:10px;border-radius:10px;border:1px solid rgba(255,255,255,0.18);background:rgba(8,14,24,0.6);grid-column:1 / span 2;">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;">
        <h3 style="margin:0;">Full Roster</h3>
        <label style="font-size:12px;">Sort
          <select id="roster-sort" style="margin-left:6px;padding:5px;border-radius:7px;border:1px solid rgba(255,255,255,0.28);background:rgba(255,255,255,0.1);color:white;">
            <option value="overall" ${sortBy === 'overall' ? 'selected' : ''}>Overall</option>
            <option value="role" ${sortBy === 'role' ? 'selected' : ''}>Role</option>
            <option value="stamina" ${sortBy === 'stamina' ? 'selected' : ''}>Stamina</option>
            <option value="morale" ${sortBy === 'morale' ? 'selected' : ''}>Morale</option>
          </select>
        </label>
      </div>
      <div style="margin-top:8px;max-height:350px;overflow:auto;">
        <table style="width:100%;border-collapse:collapse;font-size:12px;">
          <thead><tr><th style="padding:6px 8px;text-align:left;">Player</th><th style="padding:6px 8px;text-align:left;">Role</th><th style="padding:6px 8px;text-align:center;">Line</th><th style="padding:6px 8px;text-align:right;">OVR</th><th style="padding:6px 8px;text-align:right;">STA</th><th style="padding:6px 8px;text-align:right;">MOR</th><th style="padding:6px 8px;text-align:center;">Captain</th></tr></thead>
          <tbody>${rosterRows}</tbody>
        </table>
      </div>
      <p style="margin:10px 0 0;color:#9fb6d4;font-size:12px;">${recommendations || 'No training recommendation right now.'}</p>
    </section>

    <section style="padding:10px;border-radius:10px;border:1px solid rgba(255,255,255,0.18);background:rgba(8,14,24,0.6);grid-column:1 / span 2;">
      <h3 style="margin:0 0 8px;">Mentoring</h3>
      <p style="margin:0 0 8px;color:#9fb6d4;font-size:12px;">Pair veterans with younger players to boost development during training weeks.</p>
      <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:flex-end;">
        <label style="font-size:12px;flex:1;min-width:200px;">Mentor
          <select id="mentor-select" style="width:100%;margin-top:4px;padding:6px;border-radius:7px;border:1px solid rgba(255,255,255,0.28);background:rgba(255,255,255,0.1);color:white;">${mentorOptions}</select>
        </label>
        <label style="font-size:12px;flex:1;min-width:200px;">Mentee
          <select id="mentee-select" style="width:100%;margin-top:4px;padding:6px;border-radius:7px;border:1px solid rgba(255,255,255,0.28);background:rgba(255,255,255,0.1);color:white;">${menteeOptions}</select>
        </label>
        <button class="menu-btn" id="mentorship-add">Assign Pair</button>
      </div>
      <div style="margin-top:8px;max-height:180px;overflow:auto;">
        <table style="width:100%;border-collapse:collapse;font-size:12px;">
          <thead><tr><th style="padding:6px 8px;text-align:left;">Mentor</th><th style="padding:6px 8px;text-align:left;">Mentee</th><th style="padding:6px 8px;text-align:right;">Sessions</th><th style="padding:6px 8px;text-align:right;">Chem</th><th style="padding:6px 8px;text-align:left;">Action</th></tr></thead>
          <tbody>${mentorshipRows || '<tr><td colspan="5" style="padding:8px;">No mentorships assigned.</td></tr>'}</tbody>
        </table>
      </div>
    </section>
  </div>

  <div style="margin-top:12px;display:flex;justify-content:flex-end;">
    <button class="menu-btn" id="close">Close</button>
  </div>
</div>`;

            dialog.querySelectorAll<HTMLSelectElement>('select[data-lineup-slot]').forEach((selectEl) => {
                selectEl.addEventListener('change', () => {
                    const slot = Number(selectEl.dataset.lineupSlot ?? -1);
                    const lineupType = selectEl.dataset.lineupType === 'defense' ? 'defense' : 'offense';
                    if (slot < 0) return;
                    const nextId = selectEl.value;
                    const target = lineupType === 'offense' ? offenseLineupIds : defenseLineupIds;
                    const duplicateIndex = target.findIndex(
                        (id, idx) => id === nextId && idx !== slot,
                    );
                    if (duplicateIndex >= 0) {
                        target[duplicateIndex] = target[slot];
                    }
                    target[slot] = nextId;
                    render();
                });
            });

            dialog.querySelector('#roster-sort')?.addEventListener('change', (event) => {
                const value = (event.target as HTMLSelectElement).value;
                if (value === 'overall' || value === 'role' || value === 'stamina' || value === 'morale') {
                    sortBy = value;
                    render();
                }
            });

            dialog.querySelector('#lineup-auto-offense')?.addEventListener('click', () => {
                offenseLineupIds = [...workingCareer.team.roster]
                    .sort(
                        (a, b) =>
                            b.attributes.throwAccuracy +
                            b.attributes.awareness +
                            b.attributes.catching -
                            (a.attributes.throwAccuracy +
                                a.attributes.awareness +
                                a.attributes.catching),
                    )
                    .slice(0, 7)
                    .map((player) => player.id);
                render();
            });

            dialog.querySelector('#lineup-auto-defense')?.addEventListener('click', () => {
                defenseLineupIds = [...workingCareer.team.roster]
                    .sort(
                        (a, b) =>
                            b.attributes.marking + b.attributes.speed + b.attributes.stamina -
                            (a.attributes.marking + a.attributes.speed + a.attributes.stamina),
                    )
                    .slice(0, 7)
                    .map((player) => player.id);
                render();
            });

            dialog.querySelector('#lineup-save')?.addEventListener('click', () => {
                const outcome = manager.setLineups(offenseLineupIds, defenseLineupIds);
                if (!outcome.ok) {
                    alert(outcome.reason || 'Unable to save line assignments.');
                    return;
                }
                this.ctx.rerender();
                dialog.remove();
            });

            dialog.querySelectorAll<HTMLButtonElement>('[data-captain-toggle]').forEach((button) => {
                button.addEventListener('click', () => {
                    const playerId = button.dataset.captainToggle;
                    if (!playerId) return;
                    const isCaptain = career.captainIds.includes(playerId);
                    const result = manager.setCaptain(playerId, !isCaptain);
                    if (!result.ok) {
                        alert(result.reason || 'Unable to update captain.');
                        return;
                    }
                    render();
                });
            });

            dialog.querySelector('#mentorship-add')?.addEventListener('click', () => {
                const mentorId =
                    (dialog.querySelector('#mentor-select') as HTMLSelectElement | null)
                        ?.value || '';
                const menteeId =
                    (dialog.querySelector('#mentee-select') as HTMLSelectElement | null)
                        ?.value || '';
                const outcome = manager.assignMentorship(mentorId, menteeId);
                if (!outcome.ok) {
                    alert(outcome.reason || 'Unable to assign mentorship.');
                }
                render();
            });

            dialog.querySelectorAll<HTMLButtonElement>('[data-remove-mentee]').forEach((button) => {
                button.addEventListener('click', () => {
                    const menteeId = button.dataset.removeMentee;
                    if (!menteeId) return;
                    const outcome = manager.removeMentorship(menteeId);
                    if (!outcome.ok) {
                        alert(outcome.reason || 'Unable to remove mentorship.');
                    }
                    render();
                });
            });

            dialog.querySelector('#close')?.addEventListener('click', () => dialog.remove());
        };

        this.container?.appendChild(dialog);
        render();
    }

    // ------------------------------------------------------------------
    // Sub-dialog: Playbook
    // ------------------------------------------------------------------

    private showPlaybookScreen(): void {
        const career = loadCareer();
        if (!career) return;
        const manager = CareerManager.load(career.careerSlot);
        if (!manager) return;

        const editor = new PlaybookEditor(career.playbook);
        const customPlaybookUnlocked =
            career.unlockedGameplay.includes('custom_playbook') || career.division <= 2;
        let selectedFormationId =
            career.activeFormationId || career.playbook.formations[0]?.id || '';
        let selectedPlayId =
            career.activePlayId || career.playbook.plays[0]?.id || '';

        const dialog = document.createElement('div');
        dialog.className = 'dialog-overlay';

        const ensureFormationShape = () => {
            const formation = career.playbook.formations.find((f) => f.id === selectedFormationId);
            if (!formation) return;
            while (formation.positions.length < 7) {
                const idx = formation.positions.length;
                formation.positions.push({
                    role: idx < 2 ? 'handler' : 'cutter',
                    x: idx < 2 ? idx * 4 : -6 + (idx - 2) * 3,
                    z: idx < 2 ? 0 : -10 - (idx - 2) * 5,
                });
            }
        };

        const render = () => {
            ensureFormationShape();
            const formation = career.playbook.formations.find((f) => f.id === selectedFormationId);
            const playsForFormation = career.playbook.plays.filter(
                (play) => play.formationId === selectedFormationId,
            );
            if (!selectedPlayId && playsForFormation.length > 0) {
                selectedPlayId = playsForFormation[0].id;
            }
            if (
                selectedPlayId &&
                !playsForFormation.some((play) => play.id === selectedPlayId)
            ) {
                selectedPlayId = playsForFormation[0]?.id || '';
            }
            const selectedPlay = playsForFormation.find((play) => play.id === selectedPlayId) || null;
            const latestReport = career.scoutingReports[0] || null;

            const formationOptions = career.playbook.formations
                .map((f) => `<option value="${f.id}" ${f.id === selectedFormationId ? 'selected' : ''}>${escapeHtml(f.name)}</option>`)
                .join('');

            const positionRows = formation
                ? formation.positions
                      .slice(0, 7)
                      .map(
                          (pos, idx) => `
<tr>
  <td style="padding:6px 8px;">${idx + 1}</td>
  <td style="padding:6px 8px;">
    <select data-pos-role="${idx}" style="width:100%;padding:5px;border-radius:7px;border:1px solid rgba(255,255,255,0.28);background:rgba(255,255,255,0.1);color:white;">
      <option value="handler" ${pos.role === 'handler' ? 'selected' : ''}>Handler</option>
      <option value="cutter" ${pos.role === 'cutter' ? 'selected' : ''}>Cutter</option>
    </select>
  </td>
  <td style="padding:6px 8px;"><input data-pos-x="${idx}" type="number" step="0.5" value="${pos.x.toFixed(1)}" style="width:90px;padding:5px;border-radius:7px;border:1px solid rgba(255,255,255,0.28);background:rgba(255,255,255,0.1);color:white;"></td>
  <td style="padding:6px 8px;"><input data-pos-z="${idx}" type="number" step="0.5" value="${pos.z.toFixed(1)}" style="width:90px;padding:5px;border-radius:7px;border:1px solid rgba(255,255,255,0.28);background:rgba(255,255,255,0.1);color:white;"></td>
</tr>`,
                      )
                      .join('')
                : '<tr><td colspan="4" style="padding:8px;">No formation selected.</td></tr>';

            const playOptions = playsForFormation
                .map(
                    (play) =>
                        `<option value="${play.id}" ${play.id === selectedPlayId ? 'selected' : ''}>${escapeHtml(play.name)}</option>`,
                )
                .join('');

            const cutsRows = selectedPlay
                ? selectedPlay.cuts
                      .map(
                          (cut, idx) => `
<tr>
  <td style="padding:6px 8px;">${escapeHtml(cut.playerRole)}</td>
  <td style="padding:6px 8px;text-align:right;">${cut.timing.toFixed(1)}s</td>
  <td style="padding:6px 8px;">(${cut.startX.toFixed(1)}, ${cut.startZ.toFixed(1)}) → (${cut.endX.toFixed(1)}, ${cut.endZ.toFixed(1)})</td>
  <td style="padding:6px 8px;"><button class="menu-btn" data-cut-del="${idx}">Del</button></td>
</tr>`,
                      )
                      .join('')
                : '<tr><td colspan="4" style="padding:8px;">No play selected.</td></tr>';

            dialog.innerHTML = `
<div class="dialog wide" style="max-width:min(1020px,95vw);">
  <h2>Playbook Editor</h2>
  <p style="margin-top:-4px;color:#c8d7ee;font-size:13px;">Edit formations and scripted cuts used by your AI teammates.</p>
  <p style="margin:0 0 8px;color:#9fb6d4;font-size:12px;">Scouting Link: ${
      latestReport
          ? `${escapeHtml(latestReport.teamName)} • ${escapeHtml(latestReport.gamePlan || 'No recommendation text.')}`
          : 'No scouting report available.'
  }</p>
  ${
      customPlaybookUnlocked
          ? ''
          : '<p style="margin:0 0 8px;color:#ffd166;font-size:12px;">Custom playbook tools unlock at Division 2.</p>'
  }
  <div style="margin-bottom:8px;display:flex;justify-content:flex-end;">
    <button class="menu-btn" id="playbook-apply-scout" ${
        latestReport ? '' : 'disabled'
    }>Apply Latest Scouting Plan</button>
  </div>
  <div style="display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:12px;max-height:72vh;overflow:auto;padding-right:4px;">
    <section style="padding:10px;border-radius:10px;border:1px solid rgba(255,255,255,0.18);background:rgba(8,14,24,0.6);">
      <div style="display:flex;justify-content:space-between;gap:8px;align-items:center;flex-wrap:wrap;">
        <h3 style="margin:0;">Formations</h3>
        <select id="formation-select" style="padding:6px;border-radius:7px;border:1px solid rgba(255,255,255,0.28);background:rgba(255,255,255,0.1);color:white;">${formationOptions}</select>
      </div>
      <div style="margin-top:8px;display:flex;gap:8px;flex-wrap:wrap;">
        <input id="new-formation-name" placeholder="New formation name" style="flex:1;min-width:180px;padding:6px;border-radius:7px;border:1px solid rgba(255,255,255,0.28);background:rgba(255,255,255,0.1);color:white;">
        <button class="menu-btn" id="formation-add" ${customPlaybookUnlocked ? '' : 'disabled'}>Add</button>
        <button class="menu-btn danger" id="formation-del" ${customPlaybookUnlocked ? '' : 'disabled'}>Delete</button>
      </div>
      <div style="margin-top:8px;overflow:auto;">
        <table style="width:100%;border-collapse:collapse;font-size:12px;">
          <thead><tr><th style="padding:6px 8px;text-align:left;">#</th><th style="padding:6px 8px;text-align:left;">Role</th><th style="padding:6px 8px;text-align:left;">X</th><th style="padding:6px 8px;text-align:left;">Z</th></tr></thead>
          <tbody>${positionRows}</tbody>
        </table>
      </div>
      <div style="margin-top:8px;">
        <button class="menu-btn primary" id="playbook-save">Save Formation Changes</button>
      </div>
    </section>

    <section style="padding:10px;border-radius:10px;border:1px solid rgba(255,255,255,0.18);background:rgba(8,14,24,0.6);">
      <div style="display:flex;justify-content:space-between;gap:8px;align-items:center;flex-wrap:wrap;">
        <h3 style="margin:0;">Plays</h3>
        <select id="play-select" style="padding:6px;border-radius:7px;border:1px solid rgba(255,255,255,0.28);background:rgba(255,255,255,0.1);color:white;">${playOptions || '<option value="">No plays</option>'}</select>
      </div>
      <div style="margin-top:8px;display:flex;gap:8px;flex-wrap:wrap;">
        <input id="new-play-name" placeholder="New play name" style="flex:1;min-width:180px;padding:6px;border-radius:7px;border:1px solid rgba(255,255,255,0.28);background:rgba(255,255,255,0.1);color:white;">
        <button class="menu-btn" id="play-add" ${customPlaybookUnlocked ? '' : 'disabled'}>Add</button>
        <button class="menu-btn danger" id="play-del" ${customPlaybookUnlocked ? '' : 'disabled'}>Delete</button>
        <button class="menu-btn primary" id="strategy-active">Set Active</button>
      </div>
      <div style="margin-top:8px;display:flex;gap:8px;flex-wrap:wrap;">
        <button class="menu-btn" id="cut-add-under" ${customPlaybookUnlocked ? '' : 'disabled'}>Add Under Cut</button>
        <button class="menu-btn" id="cut-add-deep" ${customPlaybookUnlocked ? '' : 'disabled'}>Add Deep Cut</button>
      </div>
      <div style="margin-top:8px;max-height:320px;overflow:auto;">
        <table style="width:100%;border-collapse:collapse;font-size:12px;">
          <thead><tr><th style="padding:6px 8px;text-align:left;">Role</th><th style="padding:6px 8px;text-align:right;">Timing</th><th style="padding:6px 8px;text-align:left;">Path</th><th style="padding:6px 8px;text-align:left;">Action</th></tr></thead>
          <tbody>${cutsRows}</tbody>
        </table>
      </div>
    </section>
  </div>
  <div style="margin-top:12px;display:flex;justify-content:flex-end;gap:8px;">
    <button class="menu-btn" id="close">Close</button>
  </div>
</div>`;

            dialog.querySelector('#formation-select')?.addEventListener('change', (event) => {
                selectedFormationId = (event.target as HTMLSelectElement).value;
                selectedPlayId = '';
                render();
            });

            dialog.querySelector('#playbook-apply-scout')?.addEventListener('click', () => {
                const outcome = manager.applyLatestScoutingPlan();
                if (!outcome.ok) {
                    alert(outcome.reason || 'No scouting plan available.');
                    return;
                }
                const refreshed = loadCareer(career.careerSlot);
                if (!refreshed) return;
                career.playbook = refreshed.playbook;
                career.schedule = refreshed.schedule;
                career.scoutingReports = refreshed.scoutingReports;
                career.activeFormationId = refreshed.activeFormationId;
                career.activePlayId = refreshed.activePlayId;
                selectedFormationId = career.activeFormationId || selectedFormationId;
                selectedPlayId = career.activePlayId || selectedPlayId;
                render();
            });

            dialog.querySelector('#formation-add')?.addEventListener('click', () => {
                if (!customPlaybookUnlocked) {
                    alert('Custom playbook tools unlock at Division 2.');
                    return;
                }
                const input = dialog.querySelector<HTMLInputElement>('#new-formation-name');
                const name = (input?.value || '').trim() || `Custom ${career.playbook.formations.length + 1}`;
                const newFormation = editor.createFormation(name);
                const base =
                    career.playbook.formations.find((f) => f.id === selectedFormationId)
                        ?.positions
                        .slice(0, 7) || [];
                const source = base.length > 0 ? base : PlaybookEditor.createDefaultFormations()[0].positions;
                source.slice(0, 7).forEach((pos, idx) => {
                    editor.updateFormationPosition(newFormation.id, idx, pos.x, pos.z);
                    newFormation.positions[idx].role = pos.role;
                });
                selectedFormationId = newFormation.id;
                saveCareer(career);
                render();
            });

            dialog.querySelector('#formation-del')?.addEventListener('click', () => {
                if (!customPlaybookUnlocked) {
                    alert('Custom playbook tools unlock at Division 2.');
                    return;
                }
                if (career.playbook.formations.length <= 1) return;
                const removedFormationId = selectedFormationId;
                editor.deleteFormation(selectedFormationId);
                selectedFormationId = career.playbook.formations[0]?.id || '';
                selectedPlayId = '';
                if (career.activeFormationId === removedFormationId) {
                    career.activeFormationId = selectedFormationId;
                    career.activePlayId = null;
                }
                saveCareer(career);
                render();
            });

            dialog.querySelector('#playbook-save')?.addEventListener('click', () => {
                if (!formation) return;
                for (let i = 0; i < Math.min(7, formation.positions.length); i++) {
                    const role = (dialog.querySelector(`[data-pos-role="${i}"]`) as HTMLSelectElement | null)?.value;
                    const xVal = Number((dialog.querySelector(`[data-pos-x="${i}"]`) as HTMLInputElement | null)?.value);
                    const zVal = Number((dialog.querySelector(`[data-pos-z="${i}"]`) as HTMLInputElement | null)?.value);
                    formation.positions[i].role = role === 'handler' ? 'handler' : 'cutter';
                    formation.positions[i].x = Number.isFinite(xVal) ? xVal : formation.positions[i].x;
                    formation.positions[i].z = Number.isFinite(zVal) ? zVal : formation.positions[i].z;
                }
                saveCareer(career);
                render();
            });

            dialog.querySelector('#play-select')?.addEventListener('change', (event) => {
                selectedPlayId = (event.target as HTMLSelectElement).value;
                render();
            });

            dialog.querySelector('#play-add')?.addEventListener('click', () => {
                if (!customPlaybookUnlocked) {
                    alert('Custom playbook tools unlock at Division 2.');
                    return;
                }
                if (!selectedFormationId) return;
                const input = dialog.querySelector<HTMLInputElement>('#new-play-name');
                const name = (input?.value || '').trim() || `Play ${career.playbook.plays.length + 1}`;
                const play = editor.createPlay(name, selectedFormationId);
                selectedPlayId = play.id;
                saveCareer(career);
                render();
            });

            dialog.querySelector('#play-del')?.addEventListener('click', () => {
                if (!customPlaybookUnlocked) {
                    alert('Custom playbook tools unlock at Division 2.');
                    return;
                }
                if (!selectedPlayId) return;
                const removedPlayId = selectedPlayId;
                editor.deletePlay(selectedPlayId);
                selectedPlayId = '';
                if (career.activePlayId === removedPlayId) {
                    career.activePlayId = null;
                }
                saveCareer(career);
                render();
            });

            dialog.querySelector('#strategy-active')?.addEventListener('click', () => {
                if (!selectedFormationId) return;
                career.activeFormationId = selectedFormationId;
                career.activePlayId = selectedPlayId || null;
                saveCareer(career);
                render();
            });

            const addCut = (deep: boolean) => {
                if (!customPlaybookUnlocked) {
                    alert('Custom playbook tools unlock at Division 2.');
                    return;
                }
                if (!selectedPlayId) return;
                const startZ = deep ? -12 : -22;
                const endZ = deep ? -42 : -6;
                editor.addCut(selectedPlayId, 'cutter', 1.0, -5, startZ, -2, endZ, deep ? 2 : 1);
                saveCareer(career);
                render();
            };
            dialog.querySelector('#cut-add-under')?.addEventListener('click', () => addCut(false));
            dialog.querySelector('#cut-add-deep')?.addEventListener('click', () => addCut(true));

            dialog.querySelectorAll<HTMLButtonElement>('[data-cut-del]').forEach((button) => {
                button.addEventListener('click', () => {
                    if (!selectedPlayId) return;
                    const index = Number(button.dataset.cutDel ?? -1);
                    if (index < 0) return;
                    editor.removeCut(selectedPlayId, index);
                    saveCareer(career);
                    render();
                });
            });

            dialog.querySelector('#close')?.addEventListener('click', () => dialog.remove());
        };

        this.container?.appendChild(dialog);
        render();
    }

    // ------------------------------------------------------------------
    // Sub-dialog: Schedule
    // ------------------------------------------------------------------

    private showScheduleScreen(): void {
        const career = loadCareer();
        if (!career) return;

        const manager = CareerManager.load(career.careerSlot);
        if (!manager) return;

        const dialog = document.createElement('div');
        dialog.className = 'dialog-overlay';
        const practiceFocuses: Array<'offense' | 'defense' | 'conditioning' | 'throws'> = [
            'offense',
            'defense',
            'conditioning',
            'throws',
        ];

        const render = () => {
            const refreshed = loadCareer(career.careerSlot);
            if (!refreshed) return;
            const latest = CareerManager.load(refreshed.careerSlot);
            if (!latest) return;
            const rows = refreshed.schedule
                .slice(0, 20)
                .map((event) => {
                    const isPast = event.date < refreshed.week;
                    const isCurrent = event.date === refreshed.week;
                    const status = isPast ? 'Past' : isCurrent ? 'Current' : `+${event.date - refreshed.week}w`;
                    const phase = event.phase.toUpperCase();
                    if (event.type === 'practice') {
                        const focusOptions = practiceFocuses
                            .map(
                                (focus) =>
                                    `<option value="${focus}" ${event.focus === focus ? 'selected' : ''}>${focus}</option>`,
                            )
                            .join('');
                        return `
<tr>
  <td style="padding:6px 8px;">${event.date}</td>
  <td style="padding:6px 8px;">${phase}</td>
  <td style="padding:6px 8px;">${status}</td>
  <td style="padding:6px 8px;">Practice</td>
  <td style="padding:6px 8px;">${escapeHtml(event.title)}</td>
  <td style="padding:6px 8px;">
    <select data-plan-practice="${event.date}" ${isPast ? 'disabled' : ''} style="width:100%;padding:5px;border-radius:7px;border:1px solid rgba(255,255,255,0.25);background:rgba(255,255,255,0.1);color:white;">
      ${focusOptions}
    </select>
  </td>
</tr>`;
                    }
                    if (event.type === 'scouting') {
                        const targetOptions = refreshed.standings
                            .filter((standing) => standing.teamId !== refreshed.team.id)
                            .map(
                                (standing) =>
                                    `<option value="${standing.teamId}" ${
                                        event.targetTeamId === standing.teamId ? 'selected' : ''
                                    }>${escapeHtml(standing.teamName)}</option>`,
                            )
                            .join('');
                        return `
<tr>
  <td style="padding:6px 8px;">${event.date}</td>
  <td style="padding:6px 8px;">${phase}</td>
  <td style="padding:6px 8px;">${status}</td>
  <td style="padding:6px 8px;">Scouting</td>
  <td style="padding:6px 8px;">${escapeHtml(event.title)}</td>
  <td style="padding:6px 8px;">
    <select data-plan-scout="${event.date}" ${isPast ? 'disabled' : ''} style="width:100%;padding:5px;border-radius:7px;border:1px solid rgba(255,255,255,0.25);background:rgba(255,255,255,0.1);color:white;">
      ${targetOptions}
    </select>
  </td>
</tr>`;
                    }
                    const detail =
                        event.type === 'tournament'
                            ? `${event.opponent.teamName} (${event.opponent.rating} OVR)`
                            : event.type === 'tryout'
                            ? `Stage: ${event.stage}`
                            : event.type === 'bonding'
                            ? `Bonding (${event.effect})`
                            : 'Rest';
                    return `
<tr>
  <td style="padding:6px 8px;">${event.date}</td>
  <td style="padding:6px 8px;">${phase}</td>
  <td style="padding:6px 8px;">${status}</td>
  <td style="padding:6px 8px;">${escapeHtml(event.type)}</td>
  <td style="padding:6px 8px;">${escapeHtml(event.title)}</td>
  <td style="padding:6px 8px;">${escapeHtml(detail)}</td>
</tr>`;
                })
                .join('');

            const latestReport = refreshed.scoutingReports[0];
            dialog.innerHTML = `
            <div class="dialog wide" style="max-width:min(1100px,96vw);">
                <h2>Season Planner - Week ${refreshed.week}</h2>
                <p style="margin-top:-4px;color:#c8d7ee;font-size:13px;">Plan upcoming practice/scouting weeks. Changes are event-driven and apply when those weeks arrive.</p>
                <p style="margin:0 0 8px;color:#9fb6d4;font-size:12px;">Latest scouting: ${
                    latestReport
                        ? `${escapeHtml(latestReport.teamName)} • ${escapeHtml(
                              latestReport.gamePlan || 'No game-plan notes.',
                          )}`
                        : 'No report yet.'
                }</p>
                <div style="max-height:64vh;overflow:auto;">
                    <table style="width:100%;border-collapse:collapse;font-size:12px;">
                        <thead>
                            <tr>
                                <th style="padding:6px 8px;text-align:left;">Week</th>
                                <th style="padding:6px 8px;text-align:left;">Phase</th>
                                <th style="padding:6px 8px;text-align:left;">Status</th>
                                <th style="padding:6px 8px;text-align:left;">Type</th>
                                <th style="padding:6px 8px;text-align:left;">Event</th>
                                <th style="padding:6px 8px;text-align:left;">Plan</th>
                            </tr>
                        </thead>
                        <tbody>${rows}</tbody>
                    </table>
                </div>
                <div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end;">
                    <button class="menu-btn" id="planner-auto-scout">Apply Latest Scout Plan</button>
                    <button class="menu-btn primary" id="planner-save">Save Plans</button>
                    <button class="menu-btn" id="planner-close">Close</button>
                </div>
            </div>
        `;

            dialog.querySelector('#planner-save')?.addEventListener('click', () => {
                let errors = 0;
                dialog.querySelectorAll<HTMLSelectElement>('[data-plan-practice]').forEach((select) => {
                    const week = Number(select.dataset.planPractice || 0);
                    if (week < refreshed.week) return;
                    const focus = select.value as
                        | 'offense'
                        | 'defense'
                        | 'conditioning'
                        | 'throws';
                    const outcome = latest.planPracticeFocus(week, focus);
                    if (!outcome.ok) errors++;
                });
                dialog.querySelectorAll<HTMLSelectElement>('[data-plan-scout]').forEach((select) => {
                    const week = Number(select.dataset.planScout || 0);
                    if (week < refreshed.week) return;
                    const teamId = select.value;
                    const outcome = latest.planScoutingTarget(week, teamId);
                    if (!outcome.ok) errors++;
                });
                this.ctx.rerender();
                render();
                if (errors > 0) {
                    alert(`${errors} plan update(s) could not be applied.`);
                } else {
                    alert('Season plans saved.');
                }
            });

            dialog.querySelector('#planner-auto-scout')?.addEventListener('click', () => {
                const outcome = latest.applyLatestScoutingPlan();
                if (!outcome.ok) {
                    alert(outcome.reason || 'No scouting plan available.');
                    return;
                }
                this.ctx.rerender();
                render();
                alert(
                    `Applied scouting plan for ${outcome.data?.teamName || 'opponent'}${
                        outcome.data?.focus ? ` (next practice: ${outcome.data.focus})` : ''
                    }.`,
                );
            });

            dialog.querySelector('#planner-close')?.addEventListener('click', () => dialog.remove());
        };

        this.container?.appendChild(dialog);
        render();
    }

    // ------------------------------------------------------------------
    // Sub-dialog: Training
    // ------------------------------------------------------------------

    private showTrainingScreen(): void {
        const dialog = document.createElement('div');
        dialog.className = 'dialog-overlay';
        dialog.innerHTML = `
            <div class="dialog">
                <h2>Training Focus</h2>
                <p>Select what to focus on this week:</p>
                <div class="training-options">
                    <button class="menu-btn" id="train-offense">Offense (Throwing, Awareness)</button>
                    <button class="menu-btn" id="train-defense">Defense (Marking, Speed)</button>
                    <button class="menu-btn" id="train-conditioning">Conditioning (Stamina)</button>
                    <button class="menu-btn" id="train-throws">Throws (Accuracy, Power)</button>
                    <button class="menu-btn" id="rest">Rest Week (Recover fatigue)</button>
                </div>
                <button class="menu-btn" id="cancel">Cancel</button>
            </div>
        `;
        this.container?.appendChild(dialog);

        const showResult = (message: string) => {
            const resultDiv = document.createElement('div');
            resultDiv.className = 'dialog-overlay';
            resultDiv.innerHTML = `
                <div class="dialog">
                    <h3>Training Complete</h3>
                    <p>${message}</p>
                    <button class="menu-btn" id="ok">OK</button>
                </div>
            `;
            this.container?.appendChild(resultDiv);
            resultDiv.querySelector('#ok')?.addEventListener('click', () => {
                resultDiv.remove();
                dialog.remove();
                this.ctx.rerender();
            });
        };

        const train = (focus: 'offense' | 'defense' | 'conditioning' | 'throws') => {
            const career = CareerManager.load();
            if (career) {
                const outcome = career.conductTraining(focus);
                if (outcome.ok) {
                    showResult(`Players gained experience in ${focus}. Budget: $${career.data.finances.budget}`);
                } else {
                    showResult(outcome.reason || 'Training is unavailable right now.');
                }
            } else {
                dialog.remove();
            }
        };

        dialog.querySelector('#train-offense')?.addEventListener('click', () => train('offense'));
        dialog.querySelector('#train-defense')?.addEventListener('click', () => train('defense'));
        dialog.querySelector('#train-conditioning')?.addEventListener('click', () => train('conditioning'));
        dialog.querySelector('#train-throws')?.addEventListener('click', () => train('throws'));

        dialog.querySelector('#rest')?.addEventListener('click', () => {
            const career = CareerManager.load();
            if (career) {
                const outcome = career.takeRestWeek();
                if (outcome.ok) {
                    showResult('Players recovered fatigue.');
                } else {
                    showResult(outcome.reason || 'Rest week is unavailable right now.');
                }
            } else {
                dialog.remove();
            }
        });

        dialog.querySelector('#cancel')?.addEventListener('click', () => {
            dialog.remove();
        });
    }

    // ------------------------------------------------------------------
    // Sub-dialog: Tryouts
    // ------------------------------------------------------------------

    private showTryoutScreen(careerInput?: CareerData): void {
        const career = careerInput || loadCareer();
        if (!career) return;
        const manager = CareerManager.load(career.careerSlot);
        if (!manager) return;

        const dialog = document.createElement('div');
        dialog.className = 'dialog-overlay';

        const render = () => {
            const refreshed = loadCareer(career.careerSlot);
            if (!refreshed) return;
            const latest = CareerManager.load(refreshed.careerSlot);
            if (!latest) return;
            const tryout = latest.data.activeTryout;
            const event = latest.getCurrentEvent();
            const candidates =
                tryout?.candidates
                    .slice(0, 12)
                    .map((candidate) => {
                        const statsPreview = [
                            typeof candidate.knownStats.speed === 'number'
                                ? `SPD ${Math.round(candidate.knownStats.speed)}`
                                : null,
                            typeof candidate.knownStats.throwAccuracy === 'number'
                                ? `THR ${Math.round(candidate.knownStats.throwAccuracy)}`
                                : null,
                            typeof candidate.knownStats.catching === 'number'
                                ? `CAT ${Math.round(candidate.knownStats.catching)}`
                                : null,
                            `POT ${candidate.potential}`,
                        ]
                            .filter(Boolean)
                            .join(' • ');
                        return `
                        <tr>
                          <td style="padding:6px 8px;">${escapeHtml(candidate.name)}</td>
                          <td style="padding:6px 8px;text-align:right;">${candidate.age}</td>
                          <td style="padding:6px 8px;text-align:right;">${candidate.teamPreference}</td>
                          <td style="padding:6px 8px;">${escapeHtml(statsPreview)}</td>
                          <td style="padding:6px 8px;">
                            <button class="menu-btn small" data-offer-candidate="${candidate.id}">Offer</button>
                          </td>
                        </tr>`;
                    })
                    .join('') || '<tr><td colspan="5" style="padding:8px;">No active candidates.</td></tr>';

            dialog.innerHTML = `
            <div class="dialog wide" style="max-width:min(980px,95vw);">
              <h2>Tryout Center</h2>
              <p style="margin-top:-4px;color:#c8d7ee;font-size:13px;">Current week: ${refreshed.week} • Event: ${escapeHtml(event?.title || 'None')}</p>
              <p style="margin:4px 0 10px;color:#9fb6d4;font-size:12px;">Announcement posted: ${tryout?.announcementPosted ? 'Yes' : 'No'} • Drills: ${(tryout?.drillsRun || []).join(', ') || 'None'}</p>
              <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px;">
                <button class="menu-btn" id="tryout-announce">Post Announcement</button>
                <button class="menu-btn" id="tryout-sprint">Sprint Drill</button>
                <button class="menu-btn" id="tryout-throwing">Throwing Drill</button>
                <button class="menu-btn" id="tryout-cutting">Cutting Drill</button>
                <button class="menu-btn" id="tryout-scrimmage">Scrimmage Drill</button>
                <button class="menu-btn" id="tryout-finish">Finish Cycle</button>
              </div>
              <div style="max-height:55vh;overflow:auto;">
                <table style="width:100%;border-collapse:collapse;font-size:12px;">
                  <thead><tr><th style="padding:6px 8px;text-align:left;">Candidate</th><th style="padding:6px 8px;text-align:right;">Age</th><th style="padding:6px 8px;text-align:right;">Pref</th><th style="padding:6px 8px;text-align:left;">Known Stats</th><th style="padding:6px 8px;text-align:left;">Action</th></tr></thead>
                  <tbody>${candidates}</tbody>
                </table>
              </div>
              <div style="margin-top:12px;display:flex;justify-content:flex-end;">
                <button class="menu-btn" id="tryout-close">Close</button>
              </div>
            </div>`;

            const run = (action: () => { ok: boolean; reason?: string }) => {
                const outcome = action();
                if (!outcome.ok) {
                    alert(outcome.reason || 'Action unavailable.');
                }
                render();
                this.ctx.rerender();
            };

            dialog.querySelector('#tryout-announce')?.addEventListener('click', () =>
                run(() => latest.postTryoutAnnouncement()),
            );
            dialog.querySelector('#tryout-sprint')?.addEventListener('click', () =>
                run(() => latest.runTryoutDrill('sprint')),
            );
            dialog.querySelector('#tryout-throwing')?.addEventListener('click', () =>
                run(() => latest.runTryoutDrill('throwing')),
            );
            dialog.querySelector('#tryout-cutting')?.addEventListener('click', () =>
                run(() => latest.runTryoutDrill('cutting')),
            );
            dialog.querySelector('#tryout-scrimmage')?.addEventListener('click', () =>
                run(() => latest.runTryoutDrill('scrimmage')),
            );
            dialog.querySelector('#tryout-finish')?.addEventListener('click', () =>
                run(() => latest.finishTryoutCycle()),
            );
            dialog.querySelectorAll<HTMLButtonElement>('[data-offer-candidate]').forEach((button) => {
                button.addEventListener('click', () => {
                    const candidateId = button.dataset.offerCandidate;
                    if (!candidateId) return;
                    const outcome = latest.offerTryoutSpot(candidateId);
                    if (!outcome.ok) {
                        alert(outcome.reason || 'Offer failed.');
                    } else if (outcome.data) {
                        alert(
                            outcome.data.accepted
                                ? `${outcome.data.name} accepted the offer.`
                                : `${outcome.data.name} declined the offer.`,
                        );
                    }
                    render();
                    this.ctx.rerender();
                });
            });
            dialog.querySelector('#tryout-close')?.addEventListener('click', () => dialog.remove());
        };

        this.container?.appendChild(dialog);
        render();
    }

    // ------------------------------------------------------------------
    // Sub-dialog: Scouting
    // ------------------------------------------------------------------

    private showScoutingScreen(careerInput?: CareerData): void {
        const career = careerInput || loadCareer();
        if (!career) return;
        const manager = CareerManager.load(career.careerSlot);
        if (!manager) return;

        const dialog = document.createElement('div');
        dialog.className = 'dialog-overlay';

        const render = () => {
            const refreshed = loadCareer(career.careerSlot);
            if (!refreshed) return;
            const reports = refreshed.scoutingReports.slice(0, 8);
            const reportsHtml =
                reports.length > 0
                    ? reports
                          .map(
                              (report) => `
                <div style="padding:10px;border-radius:10px;border:1px solid rgba(255,255,255,0.14);background:rgba(8,14,24,0.55);">
                  <p style="margin:0;font-weight:600;">${escapeHtml(report.teamName)} (S${report.season} W${report.week})</p>
                  <p style="margin:6px 0 0;font-size:12px;color:#c8d7ee;">Strengths: ${escapeHtml(report.strengths.join('; ') || 'Unknown')}</p>
                  <p style="margin:2px 0 0;font-size:12px;color:#c8d7ee;">Weaknesses: ${escapeHtml(report.weaknesses.join('; ') || 'Unknown')}</p>
                  <p style="margin:2px 0 0;font-size:12px;color:#9fb6d4;">Tendencies: ${escapeHtml(report.tendencies.join('; '))}</p>
                  <p style="margin:2px 0 0;font-size:12px;color:#9fb6d4;">Recommendation: ${escapeHtml(
                      report.gamePlan || 'No tactical recommendation.',
                  )}</p>
                  <p style="margin:2px 0 0;font-size:11px;color:#8fb4d8;">Formation: ${escapeHtml(
                      report.recommendedFormationId || 'N/A',
                  )} • Defense: ${escapeHtml(report.recommendedDefense || 'N/A')} • Practice: ${escapeHtml(
                      report.recommendedPracticeFocus || 'N/A',
                  )} • Confidence ${Math.round(report.confidence * 100)}%</p>
                </div>`,
                          )
                          .join('')
                    : '<p style="color:#9fb6d4;">No scouting reports yet.</p>';

            dialog.innerHTML = `
            <div class="dialog wide" style="max-width:min(900px,95vw);">
              <h2>Scouting Desk</h2>
              <p style="margin-top:-4px;color:#c8d7ee;font-size:13px;">Spend $1,200 to generate a scouting report during scouting weeks, then apply recommendations to your playbook and practice plan.</p>
              <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px;">
                <button class="menu-btn primary" id="scout-generate">Generate Report</button>
                <button class="menu-btn" id="scout-apply">Apply Latest Plan</button>
                <button class="menu-btn" id="scout-close">Close</button>
              </div>
              <div style="display:flex;flex-direction:column;gap:8px;max-height:60vh;overflow:auto;">
                ${reportsHtml}
              </div>
            </div>`;

            dialog.querySelector('#scout-generate')?.addEventListener('click', () => {
                const latest = CareerManager.load(refreshed.careerSlot);
                if (!latest) return;
                const outcome = latest.scoutOpponent();
                if (!outcome.ok) {
                    alert(outcome.reason || 'Scouting unavailable.');
                } else if (outcome.data) {
                    alert(
                        `Report complete for ${outcome.data.teamName}\nStrengths: ${outcome.data.strengths.join(', ')}\nWeaknesses: ${outcome.data.weaknesses.join(', ')}`,
                    );
                }
                this.ctx.rerender();
                render();
            });
            dialog.querySelector('#scout-apply')?.addEventListener('click', () => {
                const latest = CareerManager.load(refreshed.careerSlot);
                if (!latest) return;
                const outcome = latest.applyLatestScoutingPlan();
                if (!outcome.ok) {
                    alert(outcome.reason || 'No scouting plan available.');
                } else {
                    alert(
                        `Applied plan for ${outcome.data?.teamName || 'opponent'}.\nFormation: ${
                            outcome.data?.formationId || 'n/a'
                        }${outcome.data?.focus ? `\nNext practice: ${outcome.data.focus}` : ''}`,
                    );
                }
                this.ctx.rerender();
                render();
            });
            dialog.querySelector('#scout-close')?.addEventListener('click', () => dialog.remove());
        };

        this.container?.appendChild(dialog);
        render();
    }

    // ------------------------------------------------------------------
    // Sub-dialog: Spirit Dashboard
    // ------------------------------------------------------------------

    private showSpiritDashboard(careerInput?: CareerData): void {
        const career = careerInput || loadCareer();
        if (!career) return;

        const incidents = career.spiritIncidents
            .slice(0, 10)
            .map(
                (incident) =>
                    `<li>${incident.severity === 'positive' ? '+' : ''}${incident.delta.toFixed(
                        2,
                    )} • S${incident.season}W${incident.week} • ${escapeHtml(incident.description)}</li>`,
            )
            .join('');
        const captains = career.team.roster
            .filter((player) => career.captainIds.includes(player.id))
            .map((player) => `${player.fullName} (${player.attributes.spirit.toFixed(0)} spirit)`)
            .join(', ');
        const cultureLines = [
            `Competitive: ${career.culture.competitive.toFixed(1)}`,
            `Spirited: ${career.culture.spirited.toFixed(1)}`,
            `Athletic: ${career.culture.athletic.toFixed(1)}`,
            `Cerebral: ${career.culture.cerebral.toFixed(1)}`,
            `Clutch: ${career.culture.clutch.toFixed(1)}`,
        ].join(' • ');

        const dialog = document.createElement('div');
        dialog.className = 'dialog-overlay';
        dialog.innerHTML = `
            <div class="dialog wide">
                <h2>Spirit Dashboard</h2>
                <p>Team Spirit: ${career.team.stats.spiritScore.toFixed(2)} / 10</p>
                <p>Captains: ${escapeHtml(captains || 'None')}</p>
                <p>Culture: ${escapeHtml(cultureLines)}</p>
                <p style="margin-top:10px;font-weight:600;">Recent Incidents</p>
                <ul style="max-height:220px;overflow:auto;">${incidents || '<li>No incidents logged.</li>'}</ul>
                <button class="menu-btn" id="close">Close</button>
            </div>
        `;
        this.container?.appendChild(dialog);
        dialog.querySelector('#close')?.addEventListener('click', () => dialog.remove());
    }

    // ------------------------------------------------------------------
    // Sub-dialog: Milestones
    // ------------------------------------------------------------------

    private showMilestonesScreen(careerInput?: CareerData): void {
        const career = careerInput || loadCareer();
        if (!career) return;

        const dialog = document.createElement('div');
        dialog.className = 'dialog-overlay';
        const rows = career.milestones
            .map((milestone) => {
                const pct = Math.min(100, (milestone.progress / Math.max(1, milestone.target)) * 100);
                return `
                <div style="padding:10px;border-radius:10px;border:1px solid rgba(255,255,255,0.16);background:rgba(8,14,24,0.55);">
                  <p style="margin:0;font-weight:600;">${escapeHtml(milestone.title)} ${milestone.completed ? '✓' : ''}</p>
                  <p style="margin:4px 0 0;font-size:12px;color:#c8d7ee;">${escapeHtml(milestone.description)}</p>
                  <p style="margin:4px 0 0;font-size:12px;color:#9fb6d4;">Reward: ${escapeHtml(milestone.reward)}</p>
                  <div style="height:7px;background:rgba(255,255,255,0.1);border-radius:6px;margin-top:8px;overflow:hidden;">
                    <div style="height:100%;width:${pct}%;background:linear-gradient(90deg,#39d67d,#00bcd4);"></div>
                  </div>
                  <p style="margin:4px 0 0;font-size:11px;color:#9fb6d4;">${milestone.progress.toFixed(0)} / ${milestone.target}</p>
                </div>`;
            })
            .join('');

        dialog.innerHTML = `
            <div class="dialog wide" style="max-width:min(920px,95vw);">
                <h2>Career Milestones</h2>
                <p style="margin-top:-4px;color:#c8d7ee;font-size:13px;">Nationals Titles: ${career.nationalsTitles} • Prestige Level: ${career.prestigeLevel}</p>
                <div style="display:flex;flex-direction:column;gap:8px;max-height:60vh;overflow:auto;">${rows}</div>
                <div style="margin-top:12px;display:flex;gap:8px;justify-content:flex-end;">
                    <button class="menu-btn" id="prestige-start" ${career.nationalsTitles > 0 ? '' : 'disabled'}>Start Prestige Run</button>
                    <button class="menu-btn" id="close">Close</button>
                </div>
            </div>
        `;
        this.container?.appendChild(dialog);

        dialog.querySelector('#prestige-start')?.addEventListener('click', () => {
            if (!career.nationalsTitles) return;
            if (!confirm('Start a prestige career in this slot? This replaces current career progression.')) return;
            const prestigeCareer = createNewCareer(career.playerName, career.teamName, {
                mode: career.mode,
                difficulty: 'hard',
                homeRegion: career.homeRegion,
                primaryColor: career.team.primaryColor,
                secondaryColor: career.team.secondaryColor,
                slot: career.careerSlot,
                prestigeLevel: career.prestigeLevel + 1,
            });
            saveCareer(prestigeCareer, career.careerSlot);
            dialog.remove();
            this.ctx.rerender();
        });
        dialog.querySelector('#close')?.addEventListener('click', () => dialog.remove());
    }

    // ------------------------------------------------------------------
    // Sub-dialog: Profile
    // ------------------------------------------------------------------

    private showProfileScreen(careerInput?: CareerData): void {
        const career = careerInput || loadCareer();
        if (!career) return;
        const stats = saveManager.getStats();
        const completionPct =
            stats.careerAttempts > 0
                ? (stats.careerCompletions / stats.careerAttempts) * 100
                : 0;
        const winRate =
            stats.totalGamesPlayed > 0
                ? (stats.totalWins / stats.totalGamesPlayed) * 100
                : 0;
        const avgSpirit =
            stats.totalGamesPlayed > 0
                ? stats.totalSpiritScore / stats.totalGamesPlayed
                : 0;

        const dialog = document.createElement('div');
        dialog.className = 'dialog-overlay';
        dialog.innerHTML = `
            <div class="dialog wide">
                <h2>Player Profile</h2>
                <p>Games Played: ${stats.totalGamesPlayed}</p>
                <p>Goals: ${stats.careerGoals} • Assists: ${stats.careerAssists} • Blocks: ${stats.careerBlocks}</p>
                <p>Turnovers: ${stats.careerTurnovers} • Completion: ${completionPct.toFixed(1)}%</p>
                <p>Layout Catches: ${stats.layoutCatches} • Sky Wins: ${stats.skyWins}</p>
                <p>Total Throw Distance: ${stats.totalThrowDistanceMeters.toFixed(1)} m</p>
                <p>Win Rate: ${winRate.toFixed(1)}% • Avg Spirit: ${avgSpirit.toFixed(2)}</p>
                <p>Achievements Unlocked: ${saveManager.load()?.achievements.length || 0}</p>
                <button class="menu-btn" id="close">Close</button>
            </div>
        `;
        this.container?.appendChild(dialog);
        dialog.querySelector('#close')?.addEventListener('click', () => dialog.remove());
    }

    // ------------------------------------------------------------------
    // Sub-dialog: Simulation Summary
    // ------------------------------------------------------------------

    private showSimulationSummaryDialog(summary: CareerSimSummary): void {
        const dialog = document.createElement('div');
        dialog.className = 'dialog-overlay';
        const points = summary.points
            .slice(0, 20)
            .map(
                (point) =>
                    `<li>P${point.point}: ${point.scoringSide === 'player' ? 'Your team' : 'Opponent'} (${point.playerScore}-${point.opponentScore})</li>`,
            )
            .join('');
        dialog.innerHTML = `
            <div class="dialog wide" style="max-width:min(860px,95vw);">
                <h2>Simulation Complete</h2>
                <p>${escapeHtml(summary.eventTitle)} • Final: ${summary.playerScore}-${summary.opponentScore}</p>
                <p>Spirit: You ${summary.spiritReport.player.toFixed(1)} / Opp ${summary.spiritReport.opponent.toFixed(1)}</p>
                <p style="font-weight:600;margin-top:8px;">Key Plays</p>
                <ul style="max-height:130px;overflow:auto;">${summary.highlights.map((line) => `<li>${escapeHtml(line)}</li>`).join('') || '<li>No highlights recorded.</li>'}</ul>
                <p style="font-weight:600;margin-top:8px;">Point Progression</p>
                <ul style="max-height:140px;overflow:auto;">${points}</ul>
                <button class="menu-btn" id="close">Close</button>
            </div>
        `;
        this.container?.appendChild(dialog);
        dialog.querySelector('#close')?.addEventListener('click', () => dialog.remove());
    }

    destroy(): void {
        this.root?.remove();
        this.root = null;
        this.container = null;
    }
}
