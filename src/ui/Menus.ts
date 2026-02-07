import {
    saveManager,
    getDefaultSettings,
    createNewCareer,
    saveCareer,
    type GameSettings,
} from '../data/SaveLoad';
import { CareerManager } from '../management/Career';
import { RosterManager } from '../management/Roster';
import { PlaybookEditor } from '../management/Playbook';
import { practiceManager, type DrillType } from '../gameplay/Practice';

export type MenuState = 'title' | 'main_menu' | 'career_menu' | 'match_setup' | 'settings' | 'credits' | 'practice_menu' | 'none';

export type MultiplayerMode = 'single' | 'local_split' | 'lan_remote';

export interface QuickMatchConfig {
    color: string;
    difficulty: string;
    gameTo: number;
    multiplayerMode: MultiplayerMode;
    spectatorMode?: boolean;
    lanServerUrl?: string;
    lanRoom?: string;
    timeOfDay?: string;
    weather?: string;
}

export class MenuSystem {
    private container: HTMLElement;
    private currentState: MenuState = 'title';
    private onStateChange?: (state: MenuState) => void;
    private settings: GameSettings;
    private tempSettings: GameSettings;
    
    constructor(container: HTMLElement, onStateChange?: (state: MenuState) => void) {
        this.container = container;
        this.onStateChange = onStateChange;
        this.settings = saveManager.getSettings();
        this.tempSettings = cloneSettings(this.settings);
        
        this.render();
    }
    
    getState(): MenuState {
        return this.currentState;
    }
    
    setState(state: MenuState): void {
        this.currentState = state;
        this.render();
        this.onStateChange?.(state);
    }
    
    private render(): void {
        this.container.innerHTML = '';
        this.container.className = 'menu-container';
        
        switch (this.currentState) {
            case 'title':
                this.renderTitleScreen();
                break;
            case 'main_menu':
                this.renderMainMenu();
                break;
            case 'career_menu':
                this.renderCareerMenu();
                break;
            case 'match_setup':
                this.renderMatchSetup();
                break;
            case 'settings':
                this.renderSettings();
                break;
            case 'credits':
                this.renderCredits();
                break;
            case 'practice_menu':
                this.renderPracticeMenu();
                break;
        }
    }
    
    private renderTitleScreen(): void {
        const title = document.createElement('div');
        title.className = 'title-screen';
        title.innerHTML = `
            <p class="title-eyebrow">BROADCAST ARCADE EDITION</p>
            <h1 class="game-title">FrisQueendom</h1>
            <p class="game-subtitle">FIFA Energy. Ultimate Frisbee Soul.</p>
            <div class="title-features">
                <span>7v7 FLOW</span>
                <span>DISC PHYSICS</span>
                <span>SEASON MODE</span>
            </div>
            <button class="menu-btn primary" id="start-btn">Click to Start</button>
            <p class="version">v0.1.0 - Browser Edition</p>
        `;
        this.container.appendChild(title);
        
        title.querySelector('#start-btn')?.addEventListener('click', () => {
            this.setState('main_menu');
        });
        
        // Also advance on any click
        title.addEventListener('click', () => {
            this.setState('main_menu');
        });
    }
    
    private renderMainMenu(): void {
        const hasCareer = !!saveManager.load()?.career;
        const hasSave = saveManager.hasSave();
        
        const menu = document.createElement('div');
        menu.className = 'main-menu';
        menu.innerHTML = `
            <h1>Main Menu</h1>
            <p class="menu-subtitle">Pick a mode and hit the field.</p>
            <div class="menu-buttons">
                ${hasCareer ? `<button class="menu-btn" id="continue-career">Continue Career</button>` : ''}
                <button class="menu-btn" id="new-career">New Career</button>
                <button class="menu-btn" id="quick-match">Quick Match</button>
                <button class="menu-btn" id="watch-match">Watch Match</button>
                <button class="menu-btn" id="practice">Practice Mode</button>
                <button class="menu-btn" id="tutorial">Tutorial</button>
                <button class="menu-btn" id="settings">Settings</button>
                <button class="menu-btn" id="credits">Credits</button>
                ${hasSave ? `<button class="menu-btn danger" id="delete-save">Delete Save</button>` : ''}
            </div>
        `;
        this.container.appendChild(menu);
        
        menu.querySelector('#continue-career')?.addEventListener('click', () => {
            this.setState('career_menu');
        });
        
        menu.querySelector('#new-career')?.addEventListener('click', () => {
            this.showNewCareerDialog();
        });
        
        menu.querySelector('#quick-match')?.addEventListener('click', () => {
            this.setState('match_setup');
        });

        menu.querySelector('#watch-match')?.addEventListener('click', () => {
            this.setState('match_setup');
        });
        
        menu.querySelector('#practice')?.addEventListener('click', () => {
            this.setState('practice_menu');
        });

        menu.querySelector('#tutorial')?.addEventListener('click', () => {
            this.setState('none');
            window.dispatchEvent(new CustomEvent('startTutorial'));
        });

        menu.querySelector('#settings')?.addEventListener('click', () => {
            this.setState('settings');
        });
        
        menu.querySelector('#credits')?.addEventListener('click', () => {
            this.setState('credits');
        });
        
        menu.querySelector('#delete-save')?.addEventListener('click', () => {
            if (confirm('Are you sure you want to delete all save data? This cannot be undone.')) {
                saveManager.deleteSave();
                this.render();
            }
        });
    }
    
    private renderCareerMenu(): void {
        const career = saveManager.load()?.career;
        if (!career) {
            this.setState('main_menu');
            return;
        }
        
        const menu = document.createElement('div');
        menu.className = 'career-menu';
        menu.innerHTML = `
            <h1>${career.teamName}</h1>
            <p class="menu-subtitle">Build chemistry. Train hard. Win points.</p>
            <div class="career-stats">
                <p>Season ${career.season}, Week ${career.week}</p>
                <p>Record: ${career.team.stats.wins}-${career.team.stats.losses}</p>
                <p>Points: ${career.team.stats.pointsFor}-${career.team.stats.pointsAgainst}</p>
                <p>Spirit: ${career.team.stats.spiritScore.toFixed(1)}/10</p>
                <p>Budget: $${career.finances.budget.toLocaleString()}</p>
            </div>
            <div class="menu-buttons">
                <button class="menu-btn" id="play-match">Play Match</button>
                <button class="menu-btn" id="roster">Roster</button>
                <button class="menu-btn" id="playbook">Playbook</button>
                <button class="menu-btn" id="schedule">Schedule</button>
                <button class="menu-btn" id="training">Training</button>
                <button class="menu-btn" id="back">Back to Main</button>
            </div>
        `;
        this.container.appendChild(menu);
        
        menu.querySelector('#play-match')?.addEventListener('click', () => {
            this.setState('none');
            window.dispatchEvent(new CustomEvent('startCareerMatch'));
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
        
        menu.querySelector('#training')?.addEventListener('click', () => {
            this.showTrainingScreen();
        });
        
        menu.querySelector('#back')?.addEventListener('click', () => {
            this.setState('main_menu');
        });
    }
    
    private renderMatchSetup(): void {
        const menu = document.createElement('div');
        menu.className = 'match-setup';
        const defaultLanUrl =
            window.location.hostname === 'localhost'
                ? 'ws://localhost:8787/ws'
                : `wss://${window.location.host}/ws`;
        menu.innerHTML = `
            <h1>Quick Match</h1>
            <p class="menu-subtitle">Set the vibe, then launch the point.</p>
            <div class="setup-options">
                <label>Your Team Color:</label>
                <select id="team-color">
                    <option value="blue">Blue</option>
                    <option value="red">Red</option>
                    <option value="green">Green</option>
                    <option value="yellow">Yellow</option>
                </select>
                
                <label>Opponent Difficulty:</label>
                <select id="difficulty">
                    <option value="easy">Easy</option>
                    <option value="normal" selected>Normal</option>
                    <option value="hard">Hard</option>
                </select>
                
                <label>Game to:</label>
                <select id="game-to">
                    <option value="7">7 points</option>
                    <option value="11" selected>11 points</option>
                    <option value="15">15 points</option>
                </select>

                <label>Time of Day:</label>
                <select id="time-of-day">
                    <option value="morning">Morning</option>
                    <option value="midday" selected>Midday</option>
                    <option value="golden_hour">Golden Hour</option>
                    <option value="sunset">Sunset</option>
                    <option value="night">Night</option>
                </select>

                <label>Weather:</label>
                <select id="weather">
                    <option value="clear" selected>Clear</option>
                    <option value="overcast">Overcast</option>
                    <option value="rain">Rain</option>
                    <option value="cold">Cold</option>
                    <option value="hot">Hot</option>
                </select>

                <label>Multiplayer:</label>
                <select id="multiplayer-mode">
                    <option value="single" selected>Single Player</option>
                    <option value="local_split">Local Split-Screen (2 Players)</option>
                    <option value="lan_remote">LAN Remote Controller (Player 2)</option>
                </select>

                <div id="lan-options" style="display:none;">
                    <label>LAN Relay WebSocket URL:</label>
                    <input type="text" id="lan-server-url" value="${defaultLanUrl}" />

                    <label>Room Code:</label>
                    <input type="text" id="lan-room" value="fqd-room-1" />

                    <label>Controller Link:</label>
                    <input type="text" id="controller-url-preview" readonly />
                </div>
            </div>
            <div class="menu-buttons">
                <button class="menu-btn primary" id="start-match">Start Match</button>
                <button class="menu-btn" id="watch-sim">Watch Sim</button>
                <button class="menu-btn" id="back">Back</button>
            </div>
        `;
        this.container.appendChild(menu);

        const multiplayerModeEl = menu.querySelector(
            '#multiplayer-mode',
        ) as HTMLSelectElement;
        const lanOptionsEl = menu.querySelector('#lan-options') as HTMLDivElement;
        const lanUrlInput = menu.querySelector('#lan-server-url') as HTMLInputElement;
        const lanRoomInput = menu.querySelector('#lan-room') as HTMLInputElement;
        const controllerPreviewInput = menu.querySelector(
            '#controller-url-preview',
        ) as HTMLInputElement;
        const updateControllerPreview = () => {
            const relay = encodeURIComponent(lanUrlInput.value.trim());
            const room = encodeURIComponent(lanRoomInput.value.trim() || 'fqd-room-1');
            controllerPreviewInput.value = `${window.location.origin}/controller.html?relay=${relay}&room=${room}`;
        };
        const updateMultiplayerVisibility = () => {
            lanOptionsEl.style.display =
                multiplayerModeEl.value === 'lan_remote' ? 'block' : 'none';
        };
        lanUrlInput.addEventListener('input', updateControllerPreview);
        lanRoomInput.addEventListener('input', updateControllerPreview);
        updateControllerPreview();
        multiplayerModeEl.addEventListener('change', updateMultiplayerVisibility);
        updateMultiplayerVisibility();
        
        menu.querySelector('#start-match')?.addEventListener('click', () => {
            const color = (menu.querySelector('#team-color') as HTMLSelectElement).value;
            const difficulty = (menu.querySelector('#difficulty') as HTMLSelectElement).value;
            const gameTo = parseInt((menu.querySelector('#game-to') as HTMLSelectElement).value);
            const timeOfDay = (menu.querySelector('#time-of-day') as HTMLSelectElement).value;
            const weather = (menu.querySelector('#weather') as HTMLSelectElement).value;
            const multiplayerMode = (menu.querySelector(
                '#multiplayer-mode',
            ) as HTMLSelectElement).value as MultiplayerMode;
            const lanServerUrl = lanUrlInput.value.trim();
            const lanRoom = lanRoomInput.value
                .trim()
                .slice(0, 64);

            this.setState('none');
            const detail: QuickMatchConfig = {
                color,
                difficulty,
                gameTo,
                multiplayerMode,
                timeOfDay,
                weather,
            };
            if (multiplayerMode === 'lan_remote') {
                detail.lanServerUrl = lanServerUrl;
                detail.lanRoom = lanRoom || 'fqd-room-1';
            }
            window.dispatchEvent(
                new CustomEvent('startQuickMatch', {
                    detail,
                }),
            );
        });

        menu.querySelector('#watch-sim')?.addEventListener('click', () => {
            const color = (menu.querySelector('#team-color') as HTMLSelectElement).value;
            const difficulty = (menu.querySelector('#difficulty') as HTMLSelectElement).value;
            const gameTo = parseInt((menu.querySelector('#game-to') as HTMLSelectElement).value);
            const timeOfDay = (menu.querySelector('#time-of-day') as HTMLSelectElement).value;
            const weather = (menu.querySelector('#weather') as HTMLSelectElement).value;

            this.setState('none');
            const detail: QuickMatchConfig = {
                color,
                difficulty,
                gameTo,
                multiplayerMode: 'single',
                spectatorMode: true,
                timeOfDay,
                weather,
            };
            window.dispatchEvent(
                new CustomEvent('startSpectatorMatch', {
                    detail,
                }),
            );
        });
        
        menu.querySelector('#back')?.addEventListener('click', () => {
            this.setState('main_menu');
        });
    }
    
    private renderSettings(): void {
        const settings = this.tempSettings;
        
        const menu = document.createElement('div');
        menu.className = 'settings-menu';
        menu.innerHTML = `
            <h1>Settings</h1>
            <p class="menu-subtitle">Tune your controls, visuals, and feel.</p>
            
            <div class="settings-section">
                <h2>Audio</h2>
                <label>Master Volume: <span>${Math.round(settings.audio.masterVolume * 100)}%</span></label>
                <input type="range" id="master-vol" min="0" max="100" value="${settings.audio.masterVolume * 100}">
                
                <label>Music Volume: <span>${Math.round(settings.audio.musicVolume * 100)}%</span></label>
                <input type="range" id="music-vol" min="0" max="100" value="${settings.audio.musicVolume * 100}">
                
                <label>SFX Volume: <span>${Math.round(settings.audio.sfxVolume * 100)}%</span></label>
                <input type="range" id="sfx-vol" min="0" max="100" value="${settings.audio.sfxVolume * 100}">
            </div>
            
            <div class="settings-section">
                <h2>Graphics</h2>
                <label>Quality:</label>
                <select id="graphics-quality">
                    <option value="low" ${settings.graphics.quality === 'low' ? 'selected' : ''}>Low</option>
                    <option value="medium" ${settings.graphics.quality === 'medium' ? 'selected' : ''}>Medium</option>
                    <option value="high" ${settings.graphics.quality === 'high' ? 'selected' : ''}>High</option>
                </select>
                
                <label class="checkbox">
                    <input type="checkbox" id="shadows" ${settings.graphics.shadows ? 'checked' : ''}>
                    Shadows
                </label>
                
                <label class="checkbox">
                    <input type="checkbox" id="particles" ${settings.graphics.particles ? 'checked' : ''}>
                    Particles
                </label>
            </div>
            
            <div class="settings-section">
                <h2>Gameplay</h2>
                <label class="checkbox">
                    <input type="checkbox" id="auto-switch" ${settings.gameplay.autoSwitchOnCatch ? 'checked' : ''}>
                    Auto-switch player on catch
                </label>

                <label class="checkbox">
                    <input type="checkbox" id="show-trajectory" ${settings.gameplay.showTrajectory ? 'checked' : ''}>
                    Show throw trajectory
                </label>
            </div>

            <div class="settings-section">
                <h2>Accessibility</h2>
                <label>Color Blind Mode:</label>
                <select id="color-blind-mode">
                    <option value="none" ${settings.accessibility.colorBlindMode === 'none' ? 'selected' : ''}>None</option>
                    <option value="protanopia" ${settings.accessibility.colorBlindMode === 'protanopia' ? 'selected' : ''}>Protanopia (Red-blind)</option>
                    <option value="deuteranopia" ${settings.accessibility.colorBlindMode === 'deuteranopia' ? 'selected' : ''}>Deuteranopia (Green-blind)</option>
                    <option value="tritanopia" ${settings.accessibility.colorBlindMode === 'tritanopia' ? 'selected' : ''}>Tritanopia (Blue-blind)</option>
                </select>

                <label class="checkbox">
                    <input type="checkbox" id="high-contrast" ${settings.accessibility.highContrast ? 'checked' : ''}>
                    High Contrast
                </label>

                <label class="checkbox">
                    <input type="checkbox" id="large-text" ${settings.accessibility.largeText ? 'checked' : ''}>
                    Large Text
                </label>

                <label class="checkbox">
                    <input type="checkbox" id="reduced-motion" ${settings.accessibility.reducedMotion ? 'checked' : ''}>
                    Reduced Motion
                </label>
            </div>
            
            <div class="menu-buttons">
                <button class="menu-btn primary" id="save-settings">Save</button>
                <button class="menu-btn" id="cancel-settings">Cancel</button>
                <button class="menu-btn danger" id="reset-settings">Reset to Default</button>
            </div>
        `;
        this.container.appendChild(menu);
        
        // Volume sliders
        const updateVolDisplay = (id: string, key: 'masterVolume' | 'musicVolume' | 'sfxVolume') => {
            const slider = menu.querySelector(`#${id}`) as HTMLInputElement;
            const display = slider?.previousElementSibling?.querySelector('span');
            slider?.addEventListener('input', () => {
                if (display) display.textContent = `${slider.value}%`;
                settings.audio[key] = parseInt(slider.value) / 100;
            });
        };
        updateVolDisplay('master-vol', 'masterVolume');
        updateVolDisplay('music-vol', 'musicVolume');
        updateVolDisplay('sfx-vol', 'sfxVolume');
        
        // Graphics
        menu.querySelector('#graphics-quality')?.addEventListener('change', (e) => {
            const value = (e.target as HTMLSelectElement).value;
            if (['low', 'medium', 'high'].includes(value)) {
                settings.graphics.quality = value as 'low' | 'medium' | 'high';
            }
        });
        
        menu.querySelector('#shadows')?.addEventListener('change', (e) => {
            settings.graphics.shadows = (e.target as HTMLInputElement).checked;
        });
        
        menu.querySelector('#particles')?.addEventListener('change', (e) => {
            settings.graphics.particles = (e.target as HTMLInputElement).checked;
        });
        
        // Gameplay
        menu.querySelector('#auto-switch')?.addEventListener('change', (e) => {
            settings.gameplay.autoSwitchOnCatch = (e.target as HTMLInputElement).checked;
        });
        
        menu.querySelector('#show-trajectory')?.addEventListener('change', (e) => {
            settings.gameplay.showTrajectory = (e.target as HTMLInputElement).checked;
        });

        // Accessibility
        menu.querySelector('#color-blind-mode')?.addEventListener('change', (e) => {
            const value = (e.target as HTMLSelectElement).value;
            if (['none', 'protanopia', 'deuteranopia', 'tritanopia'].includes(value)) {
                settings.accessibility.colorBlindMode = value as 'none' | 'protanopia' | 'deuteranopia' | 'tritanopia';
            }
        });
        menu.querySelector('#high-contrast')?.addEventListener('change', (e) => {
            settings.accessibility.highContrast = (e.target as HTMLInputElement).checked;
        });
        menu.querySelector('#large-text')?.addEventListener('change', (e) => {
            settings.accessibility.largeText = (e.target as HTMLInputElement).checked;
        });
        menu.querySelector('#reduced-motion')?.addEventListener('change', (e) => {
            settings.accessibility.reducedMotion = (e.target as HTMLInputElement).checked;
        });
        
        // Buttons
        menu.querySelector('#save-settings')?.addEventListener('click', () => {
            this.settings = cloneSettings(this.tempSettings);
            saveManager.saveSettings(this.settings);
            this.setState('main_menu');
        });
        
        menu.querySelector('#cancel-settings')?.addEventListener('click', () => {
            this.tempSettings = cloneSettings(this.settings);
            this.setState('main_menu');
        });
        
        menu.querySelector('#reset-settings')?.addEventListener('click', () => {
            this.tempSettings = getDefaultSettings();
            this.render();
        });
    }
    
    private renderCredits(): void {
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
                
                <p class="copyright">© 2024 FrisQueendom Project</p>
            </div>
            <button class="menu-btn" id="back">Back</button>
        `;
        this.container.appendChild(credits);
        
        credits.querySelector('#back')?.addEventListener('click', () => {
            this.setState('main_menu');
        });
    }
    
    private showNewCareerDialog(): void {
        const dialog = document.createElement('div');
        dialog.className = 'dialog-overlay';
        dialog.innerHTML = `
            <div class="dialog">
                <h2>Start New Career</h2>
                <label>Your Name:</label>
                <input type="text" id="player-name" placeholder="Coach" value="Coach">
                
                <label>Team Name:</label>
                <input type="text" id="team-name" placeholder="Lightning" value="Lightning">
                
                <div class="dialog-buttons">
                    <button class="menu-btn" id="cancel">Cancel</button>
                    <button class="menu-btn primary" id="create">Create</button>
                </div>
            </div>
        `;
        this.container.appendChild(dialog);
        
        dialog.querySelector('#cancel')?.addEventListener('click', () => {
            dialog.remove();
        });
        
        dialog.querySelector('#create')?.addEventListener('click', () => {
            const playerName = (dialog.querySelector('#player-name') as HTMLInputElement).value || 'Coach';
            const teamName = (dialog.querySelector('#team-name') as HTMLInputElement).value || 'Lightning';
            
            const career = createNewCareer(playerName, teamName);
            saveCareer(career);
            
            dialog.remove();
            this.setState('career_menu');
        });
    }
    
    private showRosterScreen(): void {
        const career = saveManager.load()?.career;
        if (!career) return;

        const rosterManager = new RosterManager(career);
        let sortBy: 'overall' | 'role' | 'stamina' | 'morale' = 'overall';
        let lineupIds = [...career.team.startingLineupIds];
        if (lineupIds.length < 7) {
            const fill = career.team.roster
                .filter((p) => !lineupIds.includes(p.id))
                .slice(0, 7 - lineupIds.length)
                .map((p) => p.id);
            lineupIds = [...lineupIds, ...fill];
        }
        lineupIds = lineupIds.slice(0, 7);

        const dialog = document.createElement('div');
        dialog.className = 'dialog-overlay';

        const render = () => {
            const sorted = rosterManager.sortRoster(sortBy);
            const lineupRows = lineupIds
                .map((playerId, idx) => {
                    const selected = career.team.roster.find((p) => p.id === playerId);
                    const options = sorted
                        .map((player) => {
                            const selectedAttr = player.id === playerId ? 'selected' : '';
                            return `<option value="${player.id}" ${selectedAttr}>${escapeHtml(player.fullName)} (${player.role}, OVR ${player.overallRating})</option>`;
                        })
                        .join('');
                    return `
<tr>
  <td style="padding:6px 8px;">${idx + 1}</td>
  <td style="padding:6px 8px;">${selected ? escapeHtml(selected.role) : '-'}</td>
  <td style="padding:6px 8px;">
    <select data-lineup-slot="${idx}" style="width:100%;padding:6px;border-radius:7px;border:1px solid rgba(255,255,255,0.28);background:rgba(255,255,255,0.1);color:white;">
      ${options}
    </select>
  </td>
</tr>`;
                })
                .join('');

            const rosterRows = sorted
                .map(
                    (player) => `
<tr>
  <td style="padding:6px 8px;">${escapeHtml(player.fullName)}</td>
  <td style="padding:6px 8px;">${escapeHtml(player.role)}</td>
  <td style="padding:6px 8px;text-align:right;">${player.overallRating}</td>
  <td style="padding:6px 8px;text-align:right;">${player.attributes.stamina.toFixed(0)}</td>
  <td style="padding:6px 8px;text-align:right;">${player.morale.toFixed(0)}</td>
</tr>`,
                )
                .join('');

            const recommendations = rosterManager
                .getTrainingRecommendations()
                .slice(0, 2)
                .map((r) => `${escapeHtml(r.focus)}: ${escapeHtml(r.reason)}`)
                .join(' • ');

            dialog.innerHTML = `
<div class="dialog wide" style="max-width:min(960px,95vw);">
  <h2>Roster And Lineup (${career.team.roster.length} players)</h2>
  <p style="margin-top:-4px;color:#c8d7ee;font-size:13px;">Select your 7-player starting lineup for career matches.</p>

  <div style="display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:12px;max-height:72vh;overflow:auto;padding-right:4px;">
    <section style="padding:10px;border-radius:10px;border:1px solid rgba(255,255,255,0.18);background:rgba(8,14,24,0.6);">
      <h3 style="margin:0 0 8px;">Starting Lineup</h3>
      <table style="width:100%;border-collapse:collapse;font-size:12px;">
        <thead><tr><th style="padding:6px 8px;text-align:left;">#</th><th style="padding:6px 8px;text-align:left;">Role</th><th style="padding:6px 8px;text-align:left;">Player</th></tr></thead>
        <tbody>${lineupRows}</tbody>
      </table>
      <div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap;">
        <button class="menu-btn" id="lineup-auto">Auto Best</button>
        <button class="menu-btn primary" id="lineup-save">Save Lineup</button>
      </div>
    </section>

    <section style="padding:10px;border-radius:10px;border:1px solid rgba(255,255,255,0.18);background:rgba(8,14,24,0.6);">
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
          <thead><tr><th style="padding:6px 8px;text-align:left;">Player</th><th style="padding:6px 8px;text-align:left;">Role</th><th style="padding:6px 8px;text-align:right;">OVR</th><th style="padding:6px 8px;text-align:right;">STA</th><th style="padding:6px 8px;text-align:right;">MOR</th></tr></thead>
          <tbody>${rosterRows}</tbody>
        </table>
      </div>
      <p style="margin:10px 0 0;color:#9fb6d4;font-size:12px;">${recommendations || 'No training recommendation right now.'}</p>
    </section>
  </div>

  <div style="margin-top:12px;display:flex;justify-content:flex-end;">
    <button class="menu-btn" id="close">Close</button>
  </div>
</div>`;

            dialog.querySelectorAll<HTMLSelectElement>('select[data-lineup-slot]').forEach((selectEl) => {
                selectEl.addEventListener('change', () => {
                    const slot = Number(selectEl.dataset.lineupSlot ?? -1);
                    if (slot < 0) return;
                    const nextId = selectEl.value;
                    const duplicateIndex = lineupIds.findIndex(
                        (id, idx) => id === nextId && idx !== slot,
                    );
                    if (duplicateIndex >= 0) {
                        lineupIds[duplicateIndex] = lineupIds[slot];
                    }
                    lineupIds[slot] = nextId;
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

            dialog.querySelector('#lineup-auto')?.addEventListener('click', () => {
                lineupIds = rosterManager
                    .sortRoster('overall')
                    .slice(0, 7)
                    .map((player) => player.id);
                render();
            });

            dialog.querySelector('#lineup-save')?.addEventListener('click', () => {
                career.team.startingLineupIds = [...lineupIds];
                saveCareer(career);
                this.render();
                dialog.remove();
            });

            dialog.querySelector('#close')?.addEventListener('click', () => dialog.remove());
        };

        this.container.appendChild(dialog);
        render();
    }
    
    private showPlaybookScreen(): void {
        const career = saveManager.load()?.career;
        if (!career) return;

        const editor = new PlaybookEditor(career.playbook);
        let selectedFormationId =
            career.playbook.formations[0]?.id ?? '';
        let selectedPlayId = career.playbook.plays[0]?.id ?? '';

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
            const selectedPlay = playsForFormation.find((play) => play.id === selectedPlayId) || null;

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
  <div style="display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:12px;max-height:72vh;overflow:auto;padding-right:4px;">
    <section style="padding:10px;border-radius:10px;border:1px solid rgba(255,255,255,0.18);background:rgba(8,14,24,0.6);">
      <div style="display:flex;justify-content:space-between;gap:8px;align-items:center;flex-wrap:wrap;">
        <h3 style="margin:0;">Formations</h3>
        <select id="formation-select" style="padding:6px;border-radius:7px;border:1px solid rgba(255,255,255,0.28);background:rgba(255,255,255,0.1);color:white;">${formationOptions}</select>
      </div>
      <div style="margin-top:8px;display:flex;gap:8px;flex-wrap:wrap;">
        <input id="new-formation-name" placeholder="New formation name" style="flex:1;min-width:180px;padding:6px;border-radius:7px;border:1px solid rgba(255,255,255,0.28);background:rgba(255,255,255,0.1);color:white;">
        <button class="menu-btn" id="formation-add">Add</button>
        <button class="menu-btn danger" id="formation-del">Delete</button>
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
        <button class="menu-btn" id="play-add">Add</button>
        <button class="menu-btn danger" id="play-del">Delete</button>
      </div>
      <div style="margin-top:8px;display:flex;gap:8px;flex-wrap:wrap;">
        <button class="menu-btn" id="cut-add-under">Add Under Cut</button>
        <button class="menu-btn" id="cut-add-deep">Add Deep Cut</button>
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

            dialog.querySelector('#formation-add')?.addEventListener('click', () => {
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
                if (career.playbook.formations.length <= 1) return;
                editor.deleteFormation(selectedFormationId);
                selectedFormationId = career.playbook.formations[0]?.id || '';
                selectedPlayId = '';
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
                if (!selectedFormationId) return;
                const input = dialog.querySelector<HTMLInputElement>('#new-play-name');
                const name = (input?.value || '').trim() || `Play ${career.playbook.plays.length + 1}`;
                const play = editor.createPlay(name, selectedFormationId);
                selectedPlayId = play.id;
                saveCareer(career);
                render();
            });

            dialog.querySelector('#play-del')?.addEventListener('click', () => {
                if (!selectedPlayId) return;
                editor.deletePlay(selectedPlayId);
                selectedPlayId = '';
                saveCareer(career);
                render();
            });

            const addCut = (deep: boolean) => {
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

        this.container.appendChild(dialog);
        render();
    }
    
    private showScheduleScreen(): void {
        const career = saveManager.load()?.career;
        if (!career) return;
        
        const dialog = document.createElement('div');
        dialog.className = 'dialog-overlay';
        
        let scheduleHtml = '<h3>Upcoming Events</h3><ul>';
        const upcoming = career.schedule.filter(e => e.date > career.week).slice(0, 5);
        
        for (const event of upcoming) {
            const weekDiff = event.date - career.week;
            const weekText = weekDiff === 1 ? 'next week' : `in ${weekDiff} weeks`;
            
            if (event.type === 'tournament') {
                scheduleHtml += `<li>Tournament ${weekText}</li>`;
            } else if (event.type === 'practice') {
                scheduleHtml += `<li>Practice (${event.focus}) ${weekText}</li>`;
            } else {
                scheduleHtml += `<li>Rest week ${weekText}</li>`;
            }
        }
        scheduleHtml += '</ul>';
        
        dialog.innerHTML = `
            <div class="dialog wide">
                <h2>Season Schedule - Week ${career.week}</h2>
                ${scheduleHtml}
                <button class="menu-btn" id="close">Close</button>
            </div>
        `;
        this.container.appendChild(dialog);
        
        dialog.querySelector('#close')?.addEventListener('click', () => {
            dialog.remove();
        });
    }
    
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
        this.container.appendChild(dialog);
        
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
            this.container.appendChild(resultDiv);
            resultDiv.querySelector('#ok')?.addEventListener('click', () => {
                resultDiv.remove();
                dialog.remove();
                this.render();
            });
        };
        
        const train = (focus: 'offense' | 'defense' | 'conditioning' | 'throws') => {
            const career = CareerManager.load();
            if (career) {
                career.conductTraining(focus);
                showResult(`Players gained experience in ${focus}. Budget: $${career.data.finances.budget}`);
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
                career.takeRestWeek();
                showResult('Players recovered fatigue.');
            } else {
                dialog.remove();
            }
        });
        
        dialog.querySelector('#cancel')?.addEventListener('click', () => {
            dialog.remove();
        });
    }
    
    // Pause menu overlay
    showPauseMenu(onResume: () => void, onQuit: () => void): void {
        const existing = this.container.querySelector('.pause-menu');
        if (existing) return;
        
        const pause = document.createElement('div');
        pause.className = 'pause-menu';
        pause.innerHTML = `
            <div class="pause-content">
                <h2>Paused</h2>
                <button class="menu-btn" id="resume">Resume</button>
                <button class="menu-btn" id="settings">Settings</button>
                <button class="menu-btn danger" id="quit">Quit Match</button>
            </div>
        `;
        this.container.appendChild(pause);
        
        pause.querySelector('#resume')?.addEventListener('click', () => {
            pause.remove();
            onResume();
        });
        
        pause.querySelector('#settings')?.addEventListener('click', () => {
            this.renderSettings();
        });
        
        pause.querySelector('#quit')?.addEventListener('click', () => {
            if (confirm('Quit current match? Progress will not be saved.')) {
                pause.remove();
                onQuit();
            }
        });
    }
    
    private renderPracticeMenu(): void {
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
        this.container.appendChild(menu);

        // Add event listeners for drill start buttons
        drills.forEach(({ type }) => {
            menu.querySelector(`[data-drill-start="${type}"]`)?.addEventListener('click', () => {
                this.setState('none');
                window.dispatchEvent(new CustomEvent('startPracticeDrill', {
                    detail: { drillType: type }
                }));
            });
        });

        menu.querySelector('#back')?.addEventListener('click', () => {
            this.setState('main_menu');
        });
    }

    hide(): void {
        this.container.style.display = 'none';
    }

    show(): void {
        this.container.style.display = 'flex';
    }
}

function cloneSettings(settings: GameSettings): GameSettings {
    return JSON.parse(JSON.stringify(settings)) as GameSettings;
}

function escapeHtml(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}
