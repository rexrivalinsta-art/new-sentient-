import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { CharacterAnimator } from "@/three/CharacterAnimator";
import { acquireVRM, releaseVRM } from "@/three/avatarCache";
import { QUALITY } from "@/lib/device";

const RIM_BY_EMOTION = {
  IDLE: 0x00f0ff, SPEAKING: 0x00f0ff, THINKING: 0x7aa2ff, EXCITED: 0x00e699, CELEBRATING: 0xffb800,
  SHOCKED: 0xff2e51, ANGRY: 0xff2e51, SMUG: 0x00e699, DISAPPOINTED: 0x5b6b8a,
};

function radialTexture(inner, outer) {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const g = c.getContext("2d");
  const grd = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  grd.addColorStop(0, inner);
  grd.addColorStop(1, outer);
  g.fillStyle = grd;
  g.fillRect(0, 0, 256, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Imperative Three.js stage: cinematic lighting, framing, render loop with visibility throttling. */
export class StageRenderer {
  constructor(container, { quality = "high", framing = "upper" } = {}) {
    this.container = container;
    this.q = QUALITY[quality] || QUALITY.high;
    this.framing = framing;
    this.driver = null;
    this.visible = true;
    this.disposables = [];

    const r = new THREE.WebGLRenderer({ antialias: this.q.antialias, alpha: true, powerPreference: "high-performance" });
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.q.dpr));
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.05;
    r.shadowMap.enabled = this.q.shadows;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.domElement.style.display = "block";
    container.appendChild(r.domElement);
    this.renderer = r;

    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0x050608, 7, 16);
    const pm = new THREE.PMREMGenerator(r);
    const envTex = pm.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = envTex;
    scene.environmentIntensity = 0.35;
    this.disposables.push(envTex, pm);
    this.scene = scene;

    this.camera = new THREE.PerspectiveCamera(24, 1, 0.05, 60);
    this.camera.position.set(0, 1.3, 4);
    this.lookAt = new THREE.Vector3(0, 1.1, 0);

    scene.add(new THREE.HemisphereLight(0xbac6dc, 0x08090b, 0.55));
    const key = new THREE.DirectionalLight(0xfff1e2, 2.6);
    key.position.set(1.6, 2.8, 2.6);
    key.castShadow = this.q.shadows;
    key.shadow.mapSize.set(this.q.shadowSize, this.q.shadowSize);
    key.shadow.camera.near = 0.5;
    key.shadow.camera.far = 10;
    key.shadow.camera.left = key.shadow.camera.bottom = -2;
    key.shadow.camera.right = key.shadow.camera.top = 2;
    key.shadow.bias = -0.0004;
    key.shadow.normalBias = 0.02;
    scene.add(key);
    const fill = new THREE.DirectionalLight(0x9db8ff, 0.55);
    fill.position.set(-2.4, 1.5, 1.8);
    scene.add(fill);
    this.rim = new THREE.DirectionalLight(0x00f0ff, 2.2);
    this.rim.position.set(-1.6, 2.4, -2.6);
    scene.add(this.rim);
    const rim2 = new THREE.DirectionalLight(0xffffff, 1.4);
    rim2.position.set(1.9, 2.1, -2.3);
    scene.add(rim2);
    this.rimColor = new THREE.Color(0x00f0ff);

    const floor = new THREE.Mesh(new THREE.CircleGeometry(4, 64), new THREE.ShadowMaterial({ opacity: 0.55 }));
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);
    const discTex = radialTexture("rgba(40,48,62,0.55)", "rgba(5,6,8,0)");
    const disc = new THREE.Mesh(new THREE.CircleGeometry(2.4, 64), new THREE.MeshBasicMaterial({ map: discTex, transparent: true, depthWrite: false }));
    disc.rotation.x = -Math.PI / 2;
    disc.position.y = 0.001;
    scene.add(disc);
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.95, 0.955, 96), new THREE.MeshBasicMaterial({ color: 0x00f0ff, transparent: true, opacity: 0.18 }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.002;
    scene.add(ring);
    this.ring = ring;
    const glowTex = radialTexture("rgba(70,90,120,0.35)", "rgba(5,6,8,0)");
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(7, 7), new THREE.MeshBasicMaterial({ map: glowTex, transparent: true, depthWrite: false }));
    glow.position.set(0, 1.4, -2.2);
    scene.add(glow);
    this.glow = glow;
    this.disposables.push(floor.geometry, floor.material, disc.geometry, disc.material, discTex, ring.geometry, ring.material, glow.geometry, glow.material, glowTex);

    this.clock = new THREE.Clock();
    this.lastFrame = 0;
    this.loop = this.loop.bind(this);
    this.raf = requestAnimationFrame(this.loop);

    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(container);
    this.io = new IntersectionObserver(([e]) => (this.visible = e.isIntersecting));
    this.io.observe(container);
    this.resize();
  }

  resize() {
    const w = this.container.clientWidth || 1;
    const h = this.container.clientHeight || 1;
    this.renderer.setSize(w, h, false);
    this.renderer.domElement.style.width = "100%";
    this.renderer.domElement.style.height = "100%";
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.frame();
  }

  frame() {
    if (!this.headY) return;
    const H = this.headY;
    const a = this.camera.aspect;
    const tan = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
    let top;
    let bottom;
    if (this.framing === "full") {
      top = H * 1.08;
      bottom = -H * 0.02;
    } else {
      top = H * 1.07;
      bottom = H * 0.36;
    }
    const span = top - bottom;
    const dv = span / 2 / tan;
    const dh = (H * 0.8) / 2 / (tan * a);
    this.dist = Math.max(dv, dh) * 1.04;
    this.baseTarget = new THREE.Vector3(0, (top + bottom) / 2, 0);
    this.ring.scale.setScalar(Math.max(0.5, H * 0.38));
    this.glow.position.y = H * 0.7;
  }

  async setAvatar(url, params, onProgress) {
    const token = Symbol("load");
    this.loadToken = token;
    const vrm = await acquireVRM(url, onProgress);
    if (this.loadToken !== token || this.disposed) {
      releaseVRM(url);
      return null;
    }
    if (this.vrm) {
      this.scene.remove(this.vrm.scene);
      releaseVRM(this.url);
    }
    this.vrm = vrm;
    this.url = url;
    vrm.scene.position.set(0, 0, 0);
    this.scene.add(vrm.scene);
    this.animator = new CharacterAnimator(vrm, params);
    this.scene.add(this.animator.lookTarget);
    vrm.scene.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(vrm.scene);
    this.headY = Math.max(0.4, box.max.y);
    this.frame();
    return vrm;
  }

  setParams(params) {
    this.animator?.setParams(params || {});
  }

  loop(now) {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.loop);
    const minDelta = this.visible ? 1000 / 60 : 1000 / 6;
    if (now - this.lastFrame < minDelta - 1) return;
    this.lastFrame = now;
    const dt = Math.min(this.clock.getDelta(), 0.1);
    const t = this.clock.elapsedTime;
    const f = this.driver?.() || {};
    const emotion = f.emotion || "IDLE";

    this.rimColor.lerp(new THREE.Color(RIM_BY_EMOTION[emotion] || 0x00f0ff), 1 - Math.exp(-dt * 3));
    this.rim.color.copy(this.rimColor);
    this.ring.material.color.copy(this.rimColor);

    if (this.baseTarget) {
      const push = ["EXCITED", "SHOCKED", "CELEBRATING", "ANGRY"].includes(emotion) ? 0.93 : 1;
      this.curPush = (this.curPush || 1) + (push - (this.curPush || 1)) * (1 - Math.exp(-dt * 1.5));
      const ang = Math.sin(t * 0.11) * 0.09;
      const d = this.dist * this.curPush;
      this.camera.position.set(Math.sin(ang) * d, this.baseTarget.y + 0.03 * this.headY + Math.sin(t * 0.17) * 0.01, Math.cos(ang) * d);
      this.camera.lookAt(this.baseTarget);
    }
    if (this.vrm && this.animator) {
      this.animator.update(dt, t, f, this.camera);
      this.vrm.update(dt);
    }
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.ro.disconnect();
    this.io.disconnect();
    if (this.vrm) {
      this.scene.remove(this.vrm.scene);
      releaseVRM(this.url);
    }
    this.disposables.forEach((d) => d.dispose?.());
    this.renderer.dispose();
    this.renderer.forceContextLoss?.();
    this.renderer.domElement.remove();
  }
}
