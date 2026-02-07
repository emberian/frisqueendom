import * as THREE from 'three';

export function createSky(scene: THREE.Scene): void {
    // Sky dome
    const skyGeo = new THREE.SphereGeometry(200, 32, 32);
    const skyMat = new THREE.ShaderMaterial({
        side: THREE.BackSide,
        uniforms: {
            topColor: { value: new THREE.Color(0x4a90d9) },
            horizonColor: { value: new THREE.Color(0x87ceeb) },
            bottomColor: { value: new THREE.Color(0xf5e6c8) },
        },
        vertexShader: `
            varying vec3 vWorldPosition;
            void main() {
                vec4 worldPosition = modelMatrix * vec4(position, 1.0);
                vWorldPosition = worldPosition.xyz;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
        `,
        fragmentShader: `
            uniform vec3 topColor;
            uniform vec3 horizonColor;
            uniform vec3 bottomColor;
            varying vec3 vWorldPosition;
            void main() {
                float h = normalize(vWorldPosition).y;
                vec3 color;
                if (h > 0.0) {
                    color = mix(horizonColor, topColor, pow(h, 0.5));
                } else {
                    color = mix(horizonColor, bottomColor, pow(-h, 0.5));
                }
                gl_FragColor = vec4(color, 1.0);
            }
        `,
    });

    const sky = new THREE.Mesh(skyGeo, skyMat);
    scene.add(sky);

    // Sun sprite
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d')!;
    const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    gradient.addColorStop(0, 'rgba(255, 255, 240, 1)');
    gradient.addColorStop(0.3, 'rgba(255, 255, 200, 0.8)');
    gradient.addColorStop(1, 'rgba(255, 255, 200, 0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 64, 64);

    const sunTex = new THREE.CanvasTexture(canvas);
    const sunMat = new THREE.SpriteMaterial({
        map: sunTex,
        transparent: true,
        blending: THREE.AdditiveBlending,
    });
    const sunSprite = new THREE.Sprite(sunMat);
    sunSprite.scale.set(30, 30, 1);
    sunSprite.position.set(30, 50, 20);
    scene.add(sunSprite);
}
