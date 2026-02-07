import { describe, it, expect } from 'vitest';
import { TEAM_PRESETS, getTeamPreset, TeamPreset } from '../data/TeamPresets';
import { COSMETIC_PRESETS, DEFAULT_COSMETIC, PlayerCosmetic } from '../rendering/Cosmetics';
import {
    DEFAULT_ACCESSIBILITY,
    applyColorBlindPalette,
    getAccessibleFontSize,
    shouldReduceMotion,
    generateAriaLabel,
    getButtonSizeMultiplier,
    applyHighContrast,
    AccessibilitySettings,
} from '../ui/Accessibility';

describe('Team Presets', () => {
    it('should have exactly 10 team presets', () => {
        expect(TEAM_PRESETS).toHaveLength(10);
    });

    it('all team presets should have valid colors', () => {
        TEAM_PRESETS.forEach((team) => {
            expect(team.primaryColor).toBeGreaterThanOrEqual(0);
            expect(team.primaryColor).toBeLessThanOrEqual(0xFFFFFF);
            expect(team.secondaryColor).toBeGreaterThanOrEqual(0);
            expect(team.secondaryColor).toBeLessThanOrEqual(0xFFFFFF);
        });
    });

    it('all team presets should have unique names', () => {
        const names = TEAM_PRESETS.map((team) => team.name);
        const uniqueNames = new Set(names);
        expect(uniqueNames.size).toBe(TEAM_PRESETS.length);
    });

    it('stat modifiers should be within valid range (0.8-1.2)', () => {
        TEAM_PRESETS.forEach((team) => {
            expect(team.speedMod).toBeGreaterThanOrEqual(0.8);
            expect(team.speedMod).toBeLessThanOrEqual(1.2);
            expect(team.throwPowerMod).toBeGreaterThanOrEqual(0.8);
            expect(team.throwPowerMod).toBeLessThanOrEqual(1.2);
            expect(team.catchMod).toBeGreaterThanOrEqual(0.8);
            expect(team.catchMod).toBeLessThanOrEqual(1.2);
        });
    });

    it('all teams should have valid play styles', () => {
        const validPlayStyles = ['balanced', 'aggressive', 'defensive'];
        TEAM_PRESETS.forEach((team) => {
            expect(validPlayStyles).toContain(team.playStyle);
        });
    });

    it('all teams should have non-empty mottos', () => {
        TEAM_PRESETS.forEach((team) => {
            expect(team.motto).toBeTruthy();
            expect(team.motto.length).toBeGreaterThan(0);
        });
    });

    it('getTeamPreset should return correct team by name', () => {
        const storm = getTeamPreset('Storm');
        expect(storm).toBeDefined();
        expect(storm?.name).toBe('Storm');
        expect(storm?.motto).toBe('Ride the Lightning');
    });

    it('getTeamPreset should return undefined for non-existent team', () => {
        const nonExistent = getTeamPreset('NonExistentTeam');
        expect(nonExistent).toBeUndefined();
    });

    it('should include all specified team names', () => {
        const expectedTeams = [
            'Storm', 'Inferno', 'Tidal Wave', 'Thunderbolts', 'Night Owls',
            'Wildcats', 'Cyclones', 'Phoenix', 'Glacier', 'Raptors'
        ];
        const actualTeams = TEAM_PRESETS.map(t => t.name);
        expectedTeams.forEach(expectedName => {
            expect(actualTeams).toContain(expectedName);
        });
    });
});

describe('Cosmetics', () => {
    it('should have exactly 5 cosmetic presets', () => {
        const presetKeys = Object.keys(COSMETIC_PRESETS);
        expect(presetKeys).toHaveLength(5);
    });

    it('all cosmetic presets should have valid values', () => {
        Object.values(COSMETIC_PRESETS).forEach((cosmetic) => {
            expect(cosmetic.headSize).toBeGreaterThanOrEqual(0.8);
            expect(cosmetic.headSize).toBeLessThanOrEqual(1.2);
            expect(cosmetic.lineThickness).toBeGreaterThanOrEqual(0.03);
            expect(cosmetic.lineThickness).toBeLessThanOrEqual(0.06);
            expect(['circle', 'square', 'triangle']).toContain(cosmetic.headShape);
            expect(typeof cosmetic.hasHeadband).toBe('boolean');
            expect(typeof cosmetic.hasWristbands).toBe('boolean');
            expect(cosmetic.headbandColor).toBeGreaterThanOrEqual(0);
            expect(cosmetic.headbandColor).toBeLessThanOrEqual(0xFFFFFF);
        });
    });

    it('should include all specified preset names', () => {
        const expectedPresets = ['Classic', 'Bold', 'Slim', 'Captain', 'Rookie'];
        expectedPresets.forEach(presetName => {
            expect(COSMETIC_PRESETS[presetName]).toBeDefined();
        });
    });

    it('DEFAULT_COSMETIC should have sensible values', () => {
        expect(DEFAULT_COSMETIC.headShape).toBe('circle');
        expect(DEFAULT_COSMETIC.headSize).toBe(1.0);
        expect(DEFAULT_COSMETIC.lineThickness).toBe(0.04);
        expect(DEFAULT_COSMETIC.hasHeadband).toBe(false);
        expect(DEFAULT_COSMETIC.hasWristbands).toBe(false);
    });

    it('Bold preset should be visually distinct', () => {
        const bold = COSMETIC_PRESETS.Bold;
        expect(bold.headSize).toBeGreaterThan(DEFAULT_COSMETIC.headSize);
        expect(bold.lineThickness).toBeGreaterThan(DEFAULT_COSMETIC.lineThickness);
        expect(bold.hasHeadband).toBe(true);
        expect(bold.hasWristbands).toBe(true);
    });

    it('Slim preset should be lighter than default', () => {
        const slim = COSMETIC_PRESETS.Slim;
        expect(slim.headSize).toBeLessThan(DEFAULT_COSMETIC.headSize);
        expect(slim.lineThickness).toBeLessThan(DEFAULT_COSMETIC.lineThickness);
    });
});

describe('Accessibility', () => {
    it('DEFAULT_ACCESSIBILITY should have sensible defaults', () => {
        expect(DEFAULT_ACCESSIBILITY.colorBlindMode).toBe('none');
        expect(DEFAULT_ACCESSIBILITY.highContrast).toBe(false);
        expect(DEFAULT_ACCESSIBILITY.reducedMotion).toBe(false);
        expect(DEFAULT_ACCESSIBILITY.screenReaderHints).toBe(false);
        expect(DEFAULT_ACCESSIBILITY.fontSize).toBe('medium');
        expect(DEFAULT_ACCESSIBILITY.buttonSize).toBe('normal');
    });

    describe('Color Blind Palettes', () => {
        it('should produce distinct colors for protanopia mode', () => {
            const palette = applyColorBlindPalette('protanopia');
            expect(palette.teamA).toBe(0x0077BB);
            expect(palette.teamB).toBe(0xEE7733);
            expect(palette.teamA).not.toBe(palette.teamB);
            expect(palette.disc).toBe(0xFFFFFF);
        });

        it('should produce distinct colors for deuteranopia mode', () => {
            const palette = applyColorBlindPalette('deuteranopia');
            expect(palette.teamA).toBe(0x0077BB);
            expect(palette.teamB).toBe(0xCC3311);
            expect(palette.teamA).not.toBe(palette.teamB);
        });

        it('should produce distinct colors for tritanopia mode', () => {
            const palette = applyColorBlindPalette('tritanopia');
            expect(palette.teamA).toBe(0xEE3377);
            expect(palette.teamB).toBe(0x009988);
            expect(palette.teamA).not.toBe(palette.teamB);
        });

        it('should return default colors for none mode', () => {
            const palette = applyColorBlindPalette('none');
            expect(palette.teamA).toBe(0xFF3333);
            expect(palette.teamB).toBe(0x3333FF);
        });

        it('all palettes should have valid hex colors', () => {
            const modes = ['none', 'protanopia', 'deuteranopia', 'tritanopia'];
            modes.forEach(mode => {
                const palette = applyColorBlindPalette(mode);
                expect(palette.teamA).toBeGreaterThanOrEqual(0);
                expect(palette.teamA).toBeLessThanOrEqual(0xFFFFFF);
                expect(palette.teamB).toBeGreaterThanOrEqual(0);
                expect(palette.teamB).toBeLessThanOrEqual(0xFFFFFF);
                expect(palette.disc).toBeGreaterThanOrEqual(0);
                expect(palette.disc).toBeLessThanOrEqual(0xFFFFFF);
                expect(palette.field).toBeGreaterThanOrEqual(0);
                expect(palette.field).toBeLessThanOrEqual(0xFFFFFF);
            });
        });
    });

    describe('Font Size Scaling', () => {
        it('should scale font size correctly for small setting', () => {
            const baseSize = 16;
            const scaled = getAccessibleFontSize(baseSize, 'small');
            expect(scaled).toBe(14); // 16 * 0.875
        });

        it('should keep base size for medium setting', () => {
            const baseSize = 16;
            const scaled = getAccessibleFontSize(baseSize, 'medium');
            expect(scaled).toBe(16);
        });

        it('should scale font size correctly for large setting', () => {
            const baseSize = 16;
            const scaled = getAccessibleFontSize(baseSize, 'large');
            expect(scaled).toBe(20); // 16 * 1.25
        });

        it('should work with different base sizes', () => {
            expect(getAccessibleFontSize(20, 'small')).toBe(17.5);
            expect(getAccessibleFontSize(20, 'medium')).toBe(20);
            expect(getAccessibleFontSize(20, 'large')).toBe(25);
        });
    });

    describe('Motion Reduction', () => {
        it('should return true when reducedMotion is enabled', () => {
            const settings: AccessibilitySettings = {
                ...DEFAULT_ACCESSIBILITY,
                reducedMotion: true,
            };
            expect(shouldReduceMotion(settings)).toBe(true);
        });

        it('should return false when reducedMotion is disabled', () => {
            const settings: AccessibilitySettings = {
                ...DEFAULT_ACCESSIBILITY,
                reducedMotion: false,
            };
            expect(shouldReduceMotion(settings)).toBe(false);
        });
    });

    describe('ARIA Label Generation', () => {
        it('should generate meaningful score labels', () => {
            const label = generateAriaLabel('score', { teamA: 5, teamB: 3 });
            expect(label).toBe('Score: Team 5 to 3');
        });

        it('should generate possession labels', () => {
            const label = generateAriaLabel('possession', { team: 'Storm' });
            expect(label).toBe('Storm has possession');
        });

        it('should generate throw labels', () => {
            const label = generateAriaLabel('throw', { power: 75, angle: 45 });
            expect(label).toContain('75%');
            expect(label).toContain('45 degrees');
        });

        it('should generate goal labels', () => {
            const label = generateAriaLabel('goal', {
                team: 'Inferno',
                scoreA: 6,
                scoreB: 3,
            });
            expect(label).toContain('Inferno');
            expect(label).toContain('6 to 3');
        });

        it('should generate game end labels', () => {
            const label = generateAriaLabel('gameEnd', {
                winner: 'Phoenix',
                scoreWinner: 15,
                scoreLoser: 12,
            });
            expect(label).toContain('Phoenix wins');
            expect(label).toContain('15 to 12');
        });

        it('should handle missing data gracefully', () => {
            const label = generateAriaLabel('score', {});
            expect(label).toContain('0 to 0');
        });

        it('should use fallback for unknown contexts', () => {
            const label = generateAriaLabel('unknown', { fallback: 'Custom message' });
            expect(label).toBe('Custom message');
        });
    });

    describe('Button Size Multiplier', () => {
        it('should return 1.0 for normal button size', () => {
            const settings: AccessibilitySettings = {
                ...DEFAULT_ACCESSIBILITY,
                buttonSize: 'normal',
            };
            expect(getButtonSizeMultiplier(settings)).toBe(1.0);
        });

        it('should return 1.5 for large button size', () => {
            const settings: AccessibilitySettings = {
                ...DEFAULT_ACCESSIBILITY,
                buttonSize: 'large',
            };
            expect(getButtonSizeMultiplier(settings)).toBe(1.5);
        });
    });

    describe('High Contrast', () => {
        it('should return original color when high contrast is disabled', () => {
            const color = 0xFF5733;
            expect(applyHighContrast(color, false)).toBe(color);
        });

        it('should convert dark colors to black in high contrast mode', () => {
            const darkColor = 0x222222;
            expect(applyHighContrast(darkColor, true)).toBe(0x000000);
        });

        it('should convert bright colors to white in high contrast mode', () => {
            const brightColor = 0xDDDDDD;
            expect(applyHighContrast(brightColor, true)).toBe(0xFFFFFF);
        });

        it('should handle mid-range colors appropriately', () => {
            const midColor = 0x808080;
            const result = applyHighContrast(midColor, true);
            expect([0x000000, 0xFFFFFF]).toContain(result);
        });
    });
});
