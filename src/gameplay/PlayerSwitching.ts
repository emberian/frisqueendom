import type { Player } from '../entities/Player';
import type { Team } from '../entities/Team';
import type { Disc } from '../entities/Disc';

export class PlayerSwitching {
    controlledPlayer: Player | null = null;

    clearControl(): void {
        if (!this.controlledPlayer) return;
        this.controlledPlayer.isControlled = false;
        this.controlledPlayer = null;
    }

    switchToNext(team: Team): void {
        if (!this.controlledPlayer) {
            this.switchTo(team.players[0]);
            return;
        }
        const idx = team.players.indexOf(this.controlledPlayer);
        const next = (idx + 1) % team.players.length;
        this.switchTo(team.players[next]);
    }

    switchTo(player: Player): void {
        if (this.controlledPlayer) {
            this.controlledPlayer.stickman.setAccent(null);
        }
        this.clearControl();
        this.controlledPlayer = player;
        player.isControlled = true;
    }

    autoSwitchOnCatch(catcher: Player, myTeam: Team): void {
        if (myTeam.players.includes(catcher)) {
            this.switchTo(catcher);
        }
    }

    autoSwitchOnTurnover(disc: Disc, myTeam: Team): void {
        let nearest: Player | null = null;
        let nearestDist = Infinity;
        for (const p of myTeam.players) {
            const d = p.movement.position.distanceTo(disc.position);
            if (d < nearestDist) {
                nearestDist = d;
                nearest = p;
            }
        }
        if (nearest) this.switchTo(nearest);
    }

    switchToNearest(disc: Disc, team: Team): void {
        this.autoSwitchOnTurnover(disc, team);
    }
}
