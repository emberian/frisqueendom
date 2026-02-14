import { saveManager, getDefaultSettings } from '../../data/SaveLoad';
import { cloneSettings, type Screen, type ScreenContext } from './ScreenInterface';

export class SettingsScreen implements Screen {
    private ctx: ScreenContext;
    private root: HTMLDivElement | null = null;

    constructor(ctx: ScreenContext) {
        this.ctx = ctx;
    }

    render(container: HTMLElement): void {
        const settings = this.ctx.getTempSettings();

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

                <label>UI Scale: <span id="ui-scale-value">${Math.round(settings.accessibility.uiScale * 100)}%</span></label>
                <input type="range" id="ui-scale" min="100" max="200" step="5" value="${Math.round(
                    settings.accessibility.uiScale * 100,
                )}">

                <label class="checkbox">
                    <input type="checkbox" id="high-contrast" ${settings.accessibility.highContrast ? 'checked' : ''}>
                    High Contrast
                </label>

                <label class="checkbox">
                    <input type="checkbox" id="reduced-motion" ${settings.accessibility.reducedMotion ? 'checked' : ''}>
                    Reduced Motion
                </label>
            </div>

            <div class="menu-buttons">
                <button class="menu-btn primary" id="save-settings">Save</button>
                <button class="menu-btn" id="cancel-settings">Cancel</button>
                <button class="menu-btn" id="reset-settings">Reset to Default</button>
                <button class="menu-btn" id="export-save">Export Save</button>
                <button class="menu-btn" id="import-save">Import Save</button>
                <button class="menu-btn danger" id="delete-save">Delete All Progress</button>
            </div>
        `;
        container.appendChild(menu);
        this.root = menu;

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
        const uiScaleSlider = menu.querySelector('#ui-scale') as HTMLInputElement | null;
        const uiScaleValue = menu.querySelector('#ui-scale-value');
        uiScaleSlider?.addEventListener('input', () => {
            const value = Math.max(100, Math.min(200, parseInt(uiScaleSlider.value, 10) || 130));
            settings.accessibility.uiScale = value / 100;
            settings.accessibility.largeText = settings.accessibility.uiScale >= 1.2;
            if (uiScaleValue) uiScaleValue.textContent = `${value}%`;
            this.ctx.applyMenuAccessibility(settings);
        });
        menu.querySelector('#reduced-motion')?.addEventListener('change', (e) => {
            settings.accessibility.reducedMotion = (e.target as HTMLInputElement).checked;
        });

        // Buttons
        menu.querySelector('#save-settings')?.addEventListener('click', () => {
            this.ctx.saveSettings(cloneSettings(settings));
        });

        menu.querySelector('#cancel-settings')?.addEventListener('click', () => {
            this.ctx.setTempSettings(cloneSettings(this.ctx.getSettings()));
            this.ctx.rerender();
        });

        menu.querySelector('#reset-settings')?.addEventListener('click', () => {
            this.ctx.setTempSettings(getDefaultSettings());
            this.ctx.rerender();
        });

        menu.querySelector('#export-save')?.addEventListener('click', () => {
            const payload = saveManager.exportSave();
            if (!payload) {
                alert('No save data available to export.');
                return;
            }
            const blob = new Blob([payload], { type: 'text/plain' });
            const url = URL.createObjectURL(blob);
            const anchor = document.createElement('a');
            anchor.href = url;
            anchor.download = `frisqueendom-save-${new Date().toISOString().slice(0, 10)}.txt`;
            anchor.click();
            URL.revokeObjectURL(url);
        });

        menu.querySelector('#import-save')?.addEventListener('click', () => {
            const pasted = prompt('Paste exported save string:');
            if (!pasted) return;
            const ok = saveManager.importSave(pasted.trim());
            if (!ok) {
                alert('Import failed. Please verify the save string.');
                return;
            }
            alert('Save imported successfully.');
            this.ctx.rerender();
        });

        menu.querySelector('#delete-save')?.addEventListener('click', () => {
            if (confirm('Are you sure you want to delete all save data? This cannot be undone.')) {
                saveManager.deleteSave();
                this.ctx.setTempSettings(getDefaultSettings());
                this.ctx.saveSettings(getDefaultSettings());
                this.ctx.navigate('/title');
            }
        });
    }

    destroy(): void {
        this.root?.remove();
        this.root = null;
    }
}
