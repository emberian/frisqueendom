import {
    saveManager,
    getDefaultSettings,
    createNewCareer,
    saveCareer,
    type GameSettings,
} from '../data/SaveLoad';
import { CareerManager } from '../management/Career';

export type MenuState = 'title' | 'main_menu' | 'career_menu' | 'match_setup' | 'settings' | 'credits' | 'none';

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
                <button class="menu-btn" id="practice">Practice Mode</button>
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
        
        menu.querySelector('#practice')?.addEventListener('click', () => {
            this.setState('none');
            this.onStateChange?.('none');
            // Launch practice mode
            window.dispatchEvent(new CustomEvent('startPractice'));
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
            </div>
            <div class="menu-buttons">
                <button class="menu-btn primary" id="start-match">Start Match</button>
                <button class="menu-btn" id="back">Back</button>
            </div>
        `;
        this.container.appendChild(menu);
        
        menu.querySelector('#start-match')?.addEventListener('click', () => {
            const color = (menu.querySelector('#team-color') as HTMLSelectElement).value;
            const difficulty = (menu.querySelector('#difficulty') as HTMLSelectElement).value;
            const gameTo = parseInt((menu.querySelector('#game-to') as HTMLSelectElement).value);
            
            this.setState('none');
            window.dispatchEvent(new CustomEvent('startQuickMatch', { 
                detail: { color, difficulty, gameTo } 
            }));
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
        
        const dialog = document.createElement('div');
        dialog.className = 'dialog-overlay';
        
        let rosterHtml = '<div style="max-height: 400px; overflow-y: auto;">';
        for (const player of career.team.roster.slice(0, 10)) {
            const overall = player.overallRating;
            rosterHtml += `
                <div style="padding: 10px; border-bottom: 1px solid rgba(255,255,255,0.1);">
                    <strong>${player.fullName}</strong> (#${player.appearance.jerseyNumber}) - ${player.role}
                    <br><small>Overall: ${overall} | ${player.development.age} yrs | Pot: ${Math.round(player.development.potential)}</small>
                </div>
            `;
        }
        if (career.team.roster.length > 10) {
            rosterHtml += `<p style="text-align: center; padding: 10px;">...and ${career.team.roster.length - 10} more players</p>`;
        }
        rosterHtml += '</div>';
        
        dialog.innerHTML = `
            <div class="dialog wide">
                <h2>Roster (${career.team.roster.length} players)</h2>
                ${rosterHtml}
                <p style="color: #888; font-size: 12px; margin-top: 10px;">Detailed lineup controls are coming soon.</p>
                <button class="menu-btn" id="close">Close</button>
            </div>
        `;
        this.container.appendChild(dialog);
        
        dialog.querySelector('#close')?.addEventListener('click', () => dialog.remove());
    }
    
    private showPlaybookScreen(): void {
        const dialog = document.createElement('div');
        dialog.className = 'dialog-overlay';
        dialog.innerHTML = `
            <div class="dialog wide">
                <h2>Playbook</h2>
                <p>Available Formations:</p>
                <ul style="text-align: left; margin: 20px 0;">
                    <li>Vertical Stack - Classic vertical lanes</li>
                    <li>Horizontal Stack - Spread across field</li>
                    <li>Split Stack - Two cutting lanes</li>
                    <li>HO Stack - Handler-heavy setup</li>
                </ul>
                <p style="color: #888; font-size: 12px;">Play diagram editing is planned for a future update.</p>
                <button class="menu-btn" id="close">Close</button>
            </div>
        `;
        this.container.appendChild(dialog);
        
        dialog.querySelector('#close')?.addEventListener('click', () => dialog.remove());
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
