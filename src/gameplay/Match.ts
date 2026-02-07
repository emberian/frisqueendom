import * as THREE from 'three';
import type { Team } from '../entities/Team';
import type { Disc } from '../entities/Disc';
import { PointFlow } from './Point';
import { positionForPull, createAIPullParams } from './Pull';
import { FIELD_LENGTH, ENDZONE_DEPTH } from '../data/Constants';
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

    private stateText = '';
    private stateTextTimer = 0;

    get statusText(): string {
        return this.stateText;
    }

    get statusTextActive(): boolean {
        return this.stateTextTimer > 0;
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
                this.handlePulling(disc);
                break;
            case 'live_play':
                this.handleLivePlay(dt, homeTeam, awayTeam, disc);
                break;
            case 'turnover_reset':
                this.handleTurnoverReset(dt, disc);
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

    private handlePulling(disc: Disc): void {
        if (disc.state === 'held' || disc.state === 'on_ground') {
            // Reset previousState so PointFlow doesn't treat pull landing as a turnover
            disc.previousState = disc.state;
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
        const offenseT =
            this.offenseTeam === 'home' ? homeTeam : awayTeam;
        this.point.update(
            dt,
            disc,
            offenseT,
            this.attackingEndzone[this.offenseTeam],
        );

        if (this.point.turnover) {
            this.phase = 'turnover_reset';
            this.phaseTimer = 0;
            this.swapPossession();
            this.showText('TURNOVER');
        }

        if (this.point.scored) {
            this.phase = 'score';
            this.phaseTimer = 0;
            const idx = this.offenseTeam === 'home' ? 0 : 1;
            this.score[idx]++;
            this.showText('SCORE!');
        }
    }

    private handleTurnoverReset(dt: number, disc: Disc): void {
        this.phaseTimer += dt;
        if (this.phaseTimer > 1.0) {
            // Auto-pickup: disc stays where it is, new offense picks up
            this.phase = 'live_play';
            this.point.start();
        }
    }

    private handleScore(dt: number): void {
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

        // Reset all players
        for (const p of [...homeTeam.players, ...awayTeam.players]) {
            p.holdingDisc = false;
        }

        this.phase = 'pre_pull';
        this.pullReady = false;
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
