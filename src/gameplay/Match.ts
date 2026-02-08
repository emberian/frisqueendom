import * as THREE from 'three';
import type { Team } from '../entities/Team';
import type { Disc } from '../entities/Disc';
import { PointFlow } from './Point';
import { positionForPull, createAIPullParams } from './Pull';
import { FIELD_LENGTH, ENDZONE_DEPTH } from '../data/Constants';
import { isInBounds, isInEndzone, getBrickMark, nearestInBoundsPoint } from './FieldBounds';
import type { MatchPhase, TeamSide } from '../data/Types';

export class Match {
    phase: MatchPhase = 'pre_pull';
    score: [number, number] = [0, 0]; // [home, away]
    offenseTeam: TeamSide = 'away';
    pullingTeam: TeamSide = 'home';
    attackingEndzone: Record<TeamSide, number> = { home: 100, away: 0 };
    pointsPlayed = 0;
    point = new PointFlow();
    phaseTimer = 0;
    pullReady = false;
    playerTeam: TeamSide = 'home';
    private gameTo = 15;
    private groundedTimer = 0;

    private stateText = '';
    private stateTextTimer = 0;
    private lastScorerInfo: {
        team: TeamSide;
        playerId: string;
        playerName: string;
    } | null = null;

    get statusText(): string {
        return this.stateText;
    }

    get statusTextActive(): boolean {
        return this.stateTextTimer > 0;
    }

    get lastScorer(): {
        team: TeamSide;
        playerId: string;
        playerName: string;
    } | null {
        return this.lastScorerInfo;
    }

    setGameTo(points: number): void {
        if (!Number.isFinite(points)) return;
        this.gameTo = Math.max(1, Math.floor(points));
    }

    getGameTo(): number {
        return this.gameTo;
    }

    getAttackingEndzone(): number {
        return this.attackingEndzone[this.offenseTeam];
    }

    isPlayerOnOffense(): boolean {
        return this.offenseTeam === this.playerTeam;
    }

    isPlayerPulling(): boolean {
        return this.pullingTeam === this.playerTeam;
    }

    isTeamOnOffense(team: TeamSide): boolean {
        return this.offenseTeam === team;
    }

    isTeamPulling(team: TeamSide): boolean {
        return this.pullingTeam === team;
    }

    update(
        dt: number,
        homeTeam: Team,
        awayTeam: Team,
        disc: Disc,
    ): void {
        this.stateTextTimer = Math.max(0, this.stateTextTimer - dt);

        switch (this.phase) {
            case 'pre_pull':
                this.handlePrePull(homeTeam, awayTeam, disc);
                break;
            case 'pulling':
                this.handlePulling(disc, homeTeam, awayTeam);
                break;
            case 'live_play':
                this.handleLivePlay(dt, homeTeam, awayTeam, disc);
                break;
            case 'turnover_reset':
                this.handleTurnoverReset(dt, disc, homeTeam, awayTeam);
                break;
            case 'score':
                this.handleScore(dt);
                break;
            case 'point_reset':
                this.handlePointReset(homeTeam, awayTeam, disc);
                break;
        }
    }

    private handlePrePull(
        homeTeam: Team,
        awayTeam: Team,
        disc: Disc,
    ): void {
        if (!this.pullReady) {
            const pullingT =
                this.pullingTeam === 'home' ? homeTeam : awayTeam;
            const receivingT =
                this.pullingTeam === 'home' ? awayTeam : homeTeam;
            const pullEndzone =
                this.pullingTeam === 'home'
                    ? this.attackingEndzone.away
                    : this.attackingEndzone.home;

            positionForPull(
                pullingT.players,
                receivingT.players,
                pullEndzone,
            );

            // Give disc to puller
            disc.resetToPosition(
                pullingT.players[0].movement.position.clone().setY(0),
            );
            disc.pickup(pullingT.players[0]);

            this.pullReady = true;
            this.showText('PULL');
        }
    }

    executePull(disc: Disc, homeTeam: Team, awayTeam: Team): void {
        if (this.phase !== 'pre_pull' || !this.pullReady) return;

        const pullingT =
            this.pullingTeam === 'home' ? homeTeam : awayTeam;
        const puller = pullingT.players[0];

        const targetEndzone = this.attackingEndzone[this.pullingTeam];
        const params = createAIPullParams(puller, targetEndzone);
        disc.throwDisc(params, this.pullingTeam);

        this.phase = 'pulling';
        this.pullReady = false;
    }

    private handlePulling(
        disc: Disc,
        homeTeam: Team,
        awayTeam: Team,
    ): void {
        if (disc.state === 'held') {
            // Reset previousState so PointFlow doesn't treat pull landing as a turnover
            disc.previousState = disc.state;
            this.phase = 'live_play';
            this.point.start();
        } else if (disc.state === 'on_ground') {
            // Pull landed — check OB, snap position, then let players run to disc
            if (!isInBounds(disc.position)) {
                // Pull OB: receiver gets disc at brick mark near their defending endzone
                const defendingEndzone = this.attackingEndzone[this.offenseTeam] === 0
                    ? FIELD_LENGTH : 0;
                const brick = getBrickMark(defendingEndzone);
                disc.resetToPosition(brick);
                this.showText('BRICK');
            }

            disc.previousState = 'on_ground'; // Prevent Point from triggering turnover
            this.phase = 'live_play';
            this.point.start();
        }
    }

    private handleLivePlay(
        dt: number,
        homeTeam: Team,
        awayTeam: Team,
        disc: Disc,
    ): void {
        // Safety net: if disc is on ground with no holder for >5s, warp player to disc
        if (disc.state === 'on_ground' && !disc.holder) {
            this.groundedTimer += dt;
            if (this.groundedTimer > 5.0) {
                const offense =
                    this.offenseTeam === 'home' ? homeTeam : awayTeam;
                let nearest = offense.players[0];
                let nearestDistSq = Infinity;
                for (const p of offense.players) {
                    const distSq = p.movement.position.distanceToSquared(
                        disc.position,
                    );
                    if (distSq < nearestDistSq) {
                        nearestDistSq = distSq;
                        nearest = p;
                    }
                }
                // Move player to disc (not disc to player)
                nearest.movement.position.copy(disc.position).setY(0);
                nearest.movement.velocity.set(0, 0, 0);
                disc.pickup(nearest);
                this.groundedTimer = 0;
                this.point.start();
            }
        } else {
            this.groundedTimer = 0;
        }

        const offenseT =
            this.offenseTeam === 'home' ? homeTeam : awayTeam;
        this.point.update(
            dt,
            disc,
            offenseT,
            this.attackingEndzone[this.offenseTeam],
        );

        if (this.point.turnover) {
            // Callahan: defensive interception caught in the defense's attacking endzone
            const defenseTeam: TeamSide = this.offenseTeam === 'home' ? 'away' : 'home';
            if (
                this.point.turnoverReason === 'interception' &&
                disc.holder &&
                isInEndzone(disc.holder.movement.position, this.attackingEndzone[defenseTeam])
            ) {
                // Callahan goal — score for the defensive team
                this.phase = 'score';
                this.phaseTimer = 0;
                this.lastScorerInfo = {
                    team: defenseTeam,
                    playerId: disc.holder.id,
                    playerName:
                        disc.holder.stats?.fullName ??
                        `${disc.holder.role} #${disc.holder.index + 1}`,
                };
                const idx = defenseTeam === 'home' ? 0 : 1;
                this.score[idx]++;
                // Swap offense so point_reset correctly makes the scorer pull
                this.offenseTeam = defenseTeam;
                if (this.score[idx] >= this.gameTo) {
                    this.showText(defenseTeam === 'home' ? 'HOME WINS!' : 'AWAY WINS!');
                } else {
                    this.showText('CALLAHAN!');
                }
            } else {
                this.phase = 'turnover_reset';
                this.phaseTimer = 0;
                this.swapPossession();
                this.showText('TURNOVER');
            }
        }

        if (this.point.scored) {
            this.phase = 'score';
            this.phaseTimer = 0;
            const scorer = disc.holder;
            if (scorer) {
                this.lastScorerInfo = {
                    team: this.offenseTeam,
                    playerId: scorer.id,
                    playerName:
                        scorer.stats?.fullName ??
                        `${scorer.role} #${scorer.index + 1}`,
                };
            } else {
                this.lastScorerInfo = null;
            }
            const idx = this.offenseTeam === 'home' ? 0 : 1;
            this.score[idx]++;
            if (this.score[idx] >= this.gameTo) {
                this.showText(this.offenseTeam === 'home' ? 'HOME WINS!' : 'AWAY WINS!');
            } else {
                this.showText('SCORE!');
            }
        }
    }

    private handleTurnoverReset(
        dt: number,
        disc: Disc,
        homeTeam: Team,
        awayTeam: Team,
    ): void {
        // On first frame: snap disc to correct position, release from old holder
        if (this.phaseTimer === 0) {
            // Release disc from old holder and mark as ground disc
            if (disc.holder) {
                disc.holder.holdingDisc = false;
                disc.holder = null;
            }
            disc.state = 'on_ground';
            disc.previousState = 'on_ground'; // Prevent Point from re-triggering turnover
            disc.velocity.set(0, 0, 0);

            // Snap disc to nearest in-bounds point if it landed OB
            if (!isInBounds(disc.position)) {
                const inBounds = nearestInBoundsPoint(disc.position);
                disc.position.copy(inBounds);
                disc.mesh.position.copy(inBounds);
            }

            // If disc is in the new offense's own (defending) endzone, walk to goal line
            const atkEz = this.attackingEndzone[this.offenseTeam];
            const defEz = atkEz === 0 ? FIELD_LENGTH : 0;
            if (isInEndzone(disc.position, defEz)) {
                const goalLineZ = defEz === 0
                    ? ENDZONE_DEPTH
                    : FIELD_LENGTH - ENDZONE_DEPTH;
                disc.position.setZ(goalLineZ).setY(0);
                disc.mesh.position.copy(disc.position);
            }
        }

        this.phaseTimer += dt;

        // Brief delay for "TURNOVER" text, then resume play — let players run to disc
        if (this.phaseTimer > 0.5) {
            this.phase = 'live_play';
            this.point.start();
        }
    }

    private handleScore(dt: number): void {
        if (this.score[0] >= this.gameTo || this.score[1] >= this.gameTo) {
            return;
        }
        this.phaseTimer += dt;
        if (this.phaseTimer > 2.0) {
            this.phase = 'point_reset';
        }
    }

    private handlePointReset(
        homeTeam: Team,
        awayTeam: Team,
        disc: Disc,
    ): void {
        this.pointsPlayed++;
        // Scoring team pulls next
        this.pullingTeam = this.offenseTeam;
        this.offenseTeam =
            this.offenseTeam === 'home' ? 'away' : 'home';
        this.lastScorerInfo = null;

        // Teams switch ends after each score (USAU/WFDF rule)
        const tmp = this.attackingEndzone.home;
        this.attackingEndzone.home = this.attackingEndzone.away;
        this.attackingEndzone.away = tmp;

        // Reset all players
        for (const p of [...homeTeam.players, ...awayTeam.players]) {
            p.holdingDisc = false;
        }

        this.phase = 'pre_pull';
        this.pullReady = false;
    }

    showStatusText(text: string, active: boolean): void {
        this.stateText = text;
        this.stateTextTimer = active ? 1.5 : 0;
    }

    private swapPossession(): void {
        this.offenseTeam =
            this.offenseTeam === 'home' ? 'away' : 'home';
    }

    private showText(text: string): void {
        this.stateText = text;
        this.stateTextTimer = 1.5;
    }
}
