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
        const holder = disc.holder;
        const offenseHasDisc = holder ? offenseTeam.players.includes(holder) : false;

        // Defensive possession in live play should always force a turnover,
        // even if the catch event happened before live_play began.
        if (disc.state === 'held' && holder && !offenseHasDisc) {
            this.triggerTurnover('interception');
            return;
        }

        // Stall count
        if (disc.state === 'held' && offenseHasDisc) {
            this.stallActive = true;
            this.stallCount += dt;
            if (this.stallCount >= STALL_DURATION) {
                this.triggerTurnover('stall');
                return;
            }
        } else {
            this.stallActive = false;
        }

        // Reset stall on new catch
        if (disc.justCaught) {
            this.stallCount = 0;
            if (holder && !offenseHasDisc) {
                this.triggerTurnover('interception');
                return;
            }
        }

        // Turnover on landing is processed once per flight.
        // Consume the in-flight marker so turnover_reset -> live_play
        // cannot retrigger from the same grounded disc.
        if (disc.state === 'on_ground' && disc.previousState === 'in_flight') {
            disc.previousState = 'on_ground';
            this.triggerTurnover(
                isInBounds(disc.position) ? 'incomplete' : 'out_of_bounds',
            );
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
