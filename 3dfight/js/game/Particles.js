import * as THREE from '../../vendor/three.module.min.js?v=20261122222828';

/**
 * 90年代風ローポリ（立方体・三角錐・八面体）のヒットスパーク＆土煙＆紙吹雪エフェクト管理
 */
export class ParticleManager {
  constructor(scene) {
    this.scene = scene;
    this.particles = [];
    this.boxGeo = new THREE.BoxGeometry(0.16, 0.16, 0.16);
    this.tetraGeo = new THREE.TetrahedronGeometry(0.16, 0);
    this.octGeo = new THREE.OctahedronGeometry(0.14, 0);
  }

  spawnHitSparks(position, color = 0xffe066, count = 10) {
    for (let i = 0; i < count; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 1,
      });
      const geo = i % 3 === 0 ? this.tetraGeo : i % 3 === 1 ? this.boxGeo : this.octGeo;
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.copy(position);

      const speed = 3.2 + Math.random() * 4.8;
      const theta = Math.random() * Math.PI * 2;
      const phi = (Math.random() - 0.35) * Math.PI;
      const vx = Math.cos(theta) * Math.cos(phi) * speed;
      const vy = Math.abs(Math.sin(phi)) * speed + 1.2;
      const vz = Math.sin(theta) * Math.cos(phi) * speed;

      this.scene.add(mesh);
      this.particles.push({
        mesh,
        vx,
        vy,
        vz,
        life: 0,
        maxLife: 0.24 + Math.random() * 0.16,
        gravity: 14,
        spin: (Math.random() - 0.5) * 18,
      });
    }
  }

  spawnDust(position, count = 5) {
    for (let i = 0; i < count; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: 0xd6d1c4,
        transparent: true,
        opacity: 0.85,
      });
      const mesh = new THREE.Mesh(this.boxGeo, mat);
      mesh.position.copy(position);
      mesh.position.y = Math.max(0.08, position.y);

      const angle = Math.random() * Math.PI * 2;
      const spd = 1.1 + Math.random() * 1.6;
      this.scene.add(mesh);
      this.particles.push({
        mesh,
        vx: Math.cos(angle) * spd,
        vy: 0.6 + Math.random() * 0.8,
        vz: Math.sin(angle) * spd,
        life: 0,
        maxLife: 0.28 + Math.random() * 0.12,
        gravity: 2.0,
        spin: 4,
      });
    }
  }

  spawnConfetti(position, count = 28) {
    const colors = [0xfacc15, 0x38bdf8, 0xf472b6, 0x4ade80, 0xfb923c];
    for (let i = 0; i < count; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: colors[i % colors.length],
        transparent: true,
        opacity: 1,
      });
      const mesh = new THREE.Mesh(this.boxGeo, mat);
      mesh.scale.set(1.2, 0.25, 1.2);
      mesh.position.set(
        position.x + (Math.random() - 0.5) * 2.4,
        position.y + 2.4 + Math.random() * 1.8,
        position.z + (Math.random() - 0.5) * 2.4
      );
      this.scene.add(mesh);
      this.particles.push({
        mesh,
        vx: (Math.random() - 0.5) * 3.5,
        vy: 2.2 + Math.random() * 3.0,
        vz: (Math.random() - 0.5) * 3.5,
        life: 0,
        maxLife: 1.4 + Math.random() * 0.6,
        gravity: 4.5,
        spin: (Math.random() - 0.5) * 12,
      });
    }
  }

  update(dt) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life += dt;
      if (p.life >= p.maxLife) {
        this.scene.remove(p.mesh);
        p.mesh.material.dispose();
        this.particles.splice(i, 1);
        continue;
      }

      p.vy -= p.gravity * dt;
      p.mesh.position.x += p.vx * dt;
      p.mesh.position.y += p.vy * dt;
      p.mesh.position.z += p.vz * dt;
      p.mesh.rotation.x += p.spin * dt;
      p.mesh.rotation.y += p.spin * dt;

      const t = 1 - p.life / p.maxLife;
      p.mesh.scale.setScalar(0.5 + t * 0.8);
      p.mesh.material.opacity = t;
    }
  }

  clear() {
    for (const p of this.particles) {
      this.scene.remove(p.mesh);
      p.mesh.material.dispose();
    }
    this.particles.length = 0;
  }
}
