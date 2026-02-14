import * as THREE from 'three';
import { FIELD_LENGTH, FIELD_WIDTH, ENDZONE_DEPTH, BRICK_MARK_DISTANCE } from '../data/Constants';

const MOWING_STRIPE_WIDTH = 5.0;
const MOWING_BRIGHTNESS_DIFF = 0.07;

export function createField(): THREE.Group {
    const group = new THREE.Group();

    // Main surface with mowing stripe pattern
    const fieldGeo = new THREE.PlaneGeometry(FIELD_WIDTH, FIELD_LENGTH);
    const fieldMat = new THREE.MeshStandardMaterial({ color: 0x2d8c2d });

    // Inject mowing stripes into the field surface shader
    fieldMat.onBeforeCompile = (shader) => {
        shader.vertexShader = `
            varying vec3 vFieldWorldPos;
        ` + shader.vertexShader;

        shader.vertexShader = shader.vertexShader.replace(
            '#include <begin_vertex>',
            `
            #include <begin_vertex>
            vFieldWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
            `
        );

        shader.fragmentShader = `
            varying vec3 vFieldWorldPos;
        ` + shader.fragmentShader;

        shader.fragmentShader = shader.fragmentShader.replace(
            '#include <color_fragment>',
            `
            #include <color_fragment>
            // Mowing stripe pattern perpendicular to endzones (along X axis)
            float stripePhase = floor(vFieldWorldPos.z / ${MOWING_STRIPE_WIDTH.toFixed(1)});
            float stripeMod = mod(stripePhase, 2.0);
            float mowFactor = mix(1.0, ${(1.0 - MOWING_BRIGHTNESS_DIFF).toFixed(3)}, stripeMod);
            diffuseColor.rgb *= mowFactor;
            `
        );
    };

    const fieldMesh = new THREE.Mesh(fieldGeo, fieldMat);
    fieldMesh.rotation.x = -Math.PI / 2;
    fieldMesh.position.set(0, 0, FIELD_LENGTH / 2);
    fieldMesh.receiveShadow = true;
    group.add(fieldMesh);

    const whiteMat = new THREE.MeshStandardMaterial({ color: 0xffffff });
    const lineHeight = 0.02;

    // Sidelines
    const sidelineGeo = new THREE.BoxGeometry(0.1, lineHeight, FIELD_LENGTH);
    const leftSideline = new THREE.Mesh(sidelineGeo, whiteMat);
    leftSideline.position.set(-FIELD_WIDTH / 2, lineHeight / 2, FIELD_LENGTH / 2);
    group.add(leftSideline);

    const rightSideline = new THREE.Mesh(sidelineGeo, whiteMat);
    rightSideline.position.set(FIELD_WIDTH / 2, lineHeight / 2, FIELD_LENGTH / 2);
    group.add(rightSideline);

    // Cross lines (endzone lines and back lines)
    const crossLineGeo = new THREE.BoxGeometry(FIELD_WIDTH, lineHeight, 0.1);

    const crossLinePositions = [
        0,                                  // back line 1
        ENDZONE_DEPTH,                      // endzone line 1
        FIELD_LENGTH - ENDZONE_DEPTH,       // endzone line 2
        FIELD_LENGTH,                       // back line 2
    ];

    for (const z of crossLinePositions) {
        const line = new THREE.Mesh(crossLineGeo, whiteMat);
        line.position.set(0, lineHeight / 2, z);
        group.add(line);
    }

    // Brick marks
    const brickGeo = new THREE.BoxGeometry(1, lineHeight, 0.1);
    const brickPositions = [BRICK_MARK_DISTANCE, FIELD_LENGTH - BRICK_MARK_DISTANCE];

    for (const z of brickPositions) {
        const brick = new THREE.Mesh(brickGeo, whiteMat);
        brick.position.set(0, lineHeight / 2, z);
        group.add(brick);
    }

    // Corner cones at all 8 intersections
    const coneGeo = new THREE.ConeGeometry(0.15, 0.4, 8);
    const orangeMat = new THREE.MeshStandardMaterial({ color: 0xff6600 });

    const coneXPositions = [-FIELD_WIDTH / 2, FIELD_WIDTH / 2];
    const coneZPositions = [0, ENDZONE_DEPTH, FIELD_LENGTH - ENDZONE_DEPTH, FIELD_LENGTH];

    for (const x of coneXPositions) {
        for (const z of coneZPositions) {
            const cone = new THREE.Mesh(coneGeo, orangeMat);
            cone.position.set(x, 0.2, z);
            group.add(cone);
        }
    }

    return group;
}
