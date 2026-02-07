import type { Disc } from '../entities/Disc';
import type { Team } from '../entities/Team';
import { isInBounds, isInEndzone } from './FieldBounds';
import { STALL_DURATION } from '../data/Constants';

export class PointFlow {
    stallCount = 0;
    stallActive = false;
    turnover = false;
    scored = false;
    turnoverReason = '';

    start(): void {
        this.stallCount = 0;
        this.stallActive = false;
        this.turnover = false;
        this.scored = false;
        this.turnoverReason = '';
    }

    update(
        dt: number,
        disc: Disc,
        offenseTeam: Team,
        attackingEndzone: number,
    ): void {
        // Stall count
        if (disc.state === 'held') {
            this.stallActive = true;
            this.stallCount += dt;
            if (this.stallCount >= STALL_DURATION) {
                this.triggerTurnover('stall');
                return;
            }
        }

        // Reset stall on new catch
        if (disc.justCaught) {
            this.stallCount = 0;
        }

        // Turnover: disc hits ground from flight
        if (
            disc.state === 'on_ground' &&
            disc.previousState === 'in_flight'
        ) {
            this.triggerTurnover('incomplete');
            return;
        }

        // Out of bounds
        if (disc.state === 'on_ground' && !isInBounds(disc.position)) {
            this.triggerTurnover('out_of_bounds');
            return;
        }

        // Score: catch in the attacking endzone
        if (disc.justCaught && disc.holder) {
            if (
                offenseTeam.players.includes(disc.holder) &&
                isInEndzone(
                    disc.holder.movement.position,
                    attackingEndzone,
                )
            ) {
                this.scored = true;
            }
        }
    }

    triggerTurnover(reason: string): void {
        this.turnover = true;
        this.turnoverReason = reason;
    }
}
