import * as THREE from 'three';
import { Player } from './Player';
import type { TeamSide, PlayerRole } from '../data/Types';

export class Team {
    name: string;
    primaryColor: number;
    secondaryColor: number;
    players: Player[] = [];
    side: TeamSide;

    constructor(
        name: string,
        primary: number,
        secondary: number,
        side: TeamSide,
    ) {
        this.name = name;
        this.primaryColor = primary;
        this.secondaryColor = secondary;
        this.side = side;
    }

    static create(
        name: string,
        primary: number,
        secondary: number,
        side: TeamSide,
        scene: THREE.Scene,
    ): Team {
        const team = new Team(name, primary, secondary, side);
        const roles: PlayerRole[] = [
            'handler',
            'handler',
            'handler',
            'cutter',
            'cutter',
            'cutter',
            'deep_cutter',
        ];
        for (let i = 0; i < 7; i++) {
            const player = new Player(side, roles[i], primary, i);
            team.players.push(player);
            scene.add(player.stickman.group);
        }
        return team;
    }

    getHolder(): Player | undefined {
        return this.players.find((p) => p.holdingDisc);
    }

    getAllPlayers(): Player[] {
        return this.players;
    }
}
