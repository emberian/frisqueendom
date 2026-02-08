import * as THREE from 'three';
import { DiscSimulator } from '../../frisque-physics/pkg/frisque_physics.js';
import { ThrowParams } from '../data/Types';

export class DiscBridge {
    private sim: DiscSimulator;
    private predSim: DiscSimulator | null = null;
    private lastWindSpeed = 0;
    private lastWindDir = 0;

    constructor(sim: DiscSimulator) {
        this.sim = sim;
    }

    throw(params: ThrowParams): void {
        this.sim.throw_disc(
            params.speed,
            params.direction.x,
            params.direction.y,
            params.direction.z,
            params.spinRate,
            params.noseAngle,
            params.hyzerAngle,
            params.releaseHeight,
            params.offAxis,
            params.isForehand,
        );
        this.sim.set_position(params.position.x, params.position.y, params.position.z);
    }

    step(dt: number): boolean {
        return this.sim.step(dt);
    }

    getPosition(out: THREE.Vector3): THREE.Vector3 {
        return out.set(this.sim.pos_x(), this.sim.pos_y(), this.sim.pos_z());
    }

    getQuaternion(out: THREE.Quaternion): THREE.Quaternion {
        return out.set(this.sim.quat_x(), this.sim.quat_y(), this.sim.quat_z(), this.sim.quat_w());
    }

    getVelocity(out: THREE.Vector3): THREE.Vector3 {
        return out.set(this.sim.vel_x(), this.sim.vel_y(), this.sim.vel_z());
    }

    isGrounded(): boolean {
        return this.sim.is_grounded();
    }

    getSpinRate(): number {
        return this.sim.spin_rate();
    }

    setWind(speed: number, direction: number): void {
        this.lastWindSpeed = speed;
        this.lastWindDir = direction;
        this.sim.set_base_wind(speed, direction);
    }

    updateWind(dt: number): void {
        this.sim.update_wind(dt);
    }

    getWindAt(pos: THREE.Vector3): THREE.Vector3 {
        return new THREE.Vector3(
            this.sim.wind_at_x(pos.x, pos.y, pos.z),
            this.sim.wind_at_y(pos.x, pos.y, pos.z),
            this.sim.wind_at_z(pos.x, pos.y, pos.z),
        );
    }

    predict(duration: number, steps: number): Float32Array {
        const arr = this.sim.predict(duration, steps);
        return new Float32Array(arr);
    }

    /**
     * Predict trajectory for a hypothetical throw using a separate simulator
     * to avoid wasm-bindgen RefCell borrow conflicts with the main sim.
     */
    predictThrow(params: ThrowParams, duration: number, steps: number): Float32Array {
        if (!this.predSim) {
            this.predSim = new DiscSimulator();
        }
        // Sync wind to prediction sim
        this.predSim.set_base_wind(this.lastWindSpeed, this.lastWindDir);

        const arr = this.predSim.predict_throw(
            params.speed,
            params.direction.x, params.direction.y, params.direction.z,
            params.spinRate, params.noseAngle, params.hyzerAngle,
            params.releaseHeight, params.offAxis, params.isForehand,
            params.position.x, params.position.y, params.position.z,
            duration, steps,
        );
        return new Float32Array(arr);
    }
}
