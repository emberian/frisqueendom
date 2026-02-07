import type { PlaybookData, Formation, Play, CutInstruction } from '../data/SaveLoad';

export class PlaybookEditor {
    playbook: PlaybookData;
    
    constructor(playbook: PlaybookData) {
        this.playbook = playbook;
    }
    
    // Formation management
    createFormation(name: string): Formation {
        const formation: Formation = {
            id: `formation_${Date.now()}`,
            name,
            positions: [],
        };
        this.playbook.formations.push(formation);
        return formation;
    }
    
    deleteFormation(formationId: string): boolean {
        const index = this.playbook.formations.findIndex(f => f.id === formationId);
        if (index === -1) return false;
        this.playbook.formations.splice(index, 1);
        return true;
    }
    
    updateFormationPosition(
        formationId: string,
        index: number,
        x: number,
        z: number,
    ): boolean {
        const formation = this.playbook.formations.find(f => f.id === formationId);
        if (!formation) return false;
        
        if (index >= formation.positions.length) {
            formation.positions.push({ role: 'cutter', x, z });
        } else {
            formation.positions[index] = { ...formation.positions[index], x, z };
        }
        return true;
    }
    
    // Play management
    createPlay(name: string, formationId: string): Play {
        const play: Play = {
            id: `play_${Date.now()}`,
            name,
            formationId,
            cuts: [],
        };
        this.playbook.plays.push(play);
        return play;
    }
    
    deletePlay(playId: string): boolean {
        const index = this.playbook.plays.findIndex(p => p.id === playId);
        if (index === -1) return false;
        this.playbook.plays.splice(index, 1);
        return true;
    }
    
    addCut(
        playId: string,
        playerRole: 'handler' | 'cutter',
        timing: number,
        startX: number,
        startZ: number,
        endX: number,
        endZ: number,
        priority: number = 1,
    ): boolean {
        const play = this.playbook.plays.find(p => p.id === playId);
        if (!play) return false;
        
        const cut: CutInstruction = {
            playerRole,
            timing,
            startX,
            startZ,
            endX,
            endZ,
            priority,
        };
        play.cuts.push(cut);
        return true;
    }
    
    removeCut(playId: string, cutIndex: number): boolean {
        const play = this.playbook.plays.find(p => p.id === playId);
        if (!play || cutIndex >= play.cuts.length) return false;
        play.cuts.splice(cutIndex, 1);
        return true;
    }
    
    // Get available plays for a situation
    getPlaysForSituation(
        yardLine: number,
        downwind: boolean,
        timeRemaining: number,
        scoreDiff: number,
    ): Play[] {
        return this.playbook.plays.filter(play => {
            // Filter logic based on situation
            // For now, return all plays
            return true;
        });
    }
    
    // Default formations
    static createDefaultFormations(): Formation[] {
        return [
            {
                id: 'vertical',
                name: 'Vertical Stack',
                positions: [
                    { role: 'handler', x: 0, z: 0 },
                    { role: 'handler', x: 5, z: 0 },
                    { role: 'cutter', x: -5, z: -10 },
                    { role: 'cutter', x: -5, z: -15 },
                    { role: 'cutter', x: -5, z: -20 },
                    { role: 'cutter', x: -5, z: -25 },
                    { role: 'cutter', x: -5, z: -30 },
                ],
            },
            {
                id: 'horizontal',
                name: 'Horizontal Stack',
                positions: [
                    { role: 'handler', x: 0, z: 0 },
                    { role: 'handler', x: 5, z: -5 },
                    { role: 'cutter', x: -10, z: -15 },
                    { role: 'cutter', x: -3, z: -15 },
                    { role: 'cutter', x: 3, z: -15 },
                    { role: 'cutter', x: 10, z: -15 },
                    { role: 'cutter', x: 0, z: -25 },
                ],
            },
            {
                id: 'split',
                name: 'Split Stack',
                positions: [
                    { role: 'handler', x: 0, z: 0 },
                    { role: 'handler', x: 8, z: -5 },
                    { role: 'cutter', x: -8, z: -10 },
                    { role: 'cutter', x: -8, z: -15 },
                    { role: 'cutter', x: -8, z: -20 },
                    { role: 'cutter', x: 8, z: -12 },
                    { role: 'cutter', x: 8, z: -18 },
                ],
            },
            {
                id: 'ho',
                name: 'HO Stack',
                positions: [
                    { role: 'handler', x: 0, z: 0 },
                    { role: 'handler', x: 0, z: -8 },
                    { role: 'handler', x: 0, z: -16 },
                    { role: 'cutter', x: -8, z: -5 },
                    { role: 'cutter', x: 8, z: -5 },
                    { role: 'cutter', x: -12, z: -20 },
                    { role: 'cutter', x: 12, z: -20 },
                ],
            },
        ];
    }
}
