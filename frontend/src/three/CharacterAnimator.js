import * as THREE from "three";

export const EMOTIONS = ["IDLE", "THINKING", "SPEAKING", "EXCITED", "SHOCKED", "ANGRY", "SMUG", "CELEBRATING", "DISAPPOINTED"];

const BONES = ["hips", "spine", "chest", "upperChest", "neck", "head", "leftShoulder", "rightShoulder",
  "leftUpperArm", "rightUpperArm", "leftLowerArm", "rightLowerArm", "leftHand", "rightHand"];

const BASE = {
  leftUpperArm: [0.05, 0, -1.22], rightUpperArm: [0.05, 0, 1.22],
  leftLowerArm: [0, -0.28, 0], rightLowerArm: [0, 0.28, 0],
  leftHand: [0, 0, -0.08], rightHand: [0, 0, 0.08],
};

// pose: bone offsets, hip lift, bounce, expressions, motion energy
const POSES = {
  IDLE: { bones: {}, expr: {} },
  SPEAKING: { bones: { spine: [0.02, 0, 0] }, expr: {}, energy: 0.4 },
  THINKING: {
    bones: { head: [0.06, 0.22, 0.14], neck: [0, 0.08, 0], rightUpperArm: [-0.5, 0, 1.25], rightLowerArm: [0, 1.9, 0], rightHand: [0, 0, 0.3] },
    expr: { relaxed: 0.3 }, energy: 0.1,
  },
  EXCITED: {
    bones: { spine: [-0.05, 0, 0], head: [-0.1, 0, 0], leftUpperArm: [-0.3, 0, -0.85], rightUpperArm: [-0.3, 0, 0.85], leftLowerArm: [0, -0.9, 0], rightLowerArm: [0, 0.9, 0] },
    expr: { happy: 0.7 }, bounce: 1, energy: 1,
  },
  CELEBRATING: {
    bones: { spine: [-0.08, 0, 0], head: [-0.2, 0, 0], leftUpperArm: [0, 0, 0.95], rightUpperArm: [0, 0, -0.95], leftLowerArm: [0, -0.4, 0.3], rightLowerArm: [0, 0.4, -0.3] },
    expr: { happy: 1 }, bounce: 1.6, energy: 1.2,
  },
  SHOCKED: {
    bones: { spine: [-0.14, 0, 0], chest: [-0.06, 0, 0], head: [-0.2, 0, 0], leftUpperArm: [-0.5, 0, -0.7], rightUpperArm: [-0.5, 0, 0.7], leftLowerArm: [0, -1.3, 0], rightLowerArm: [0, 1.3, 0] },
    expr: { surprised: 1, aa: 0.35 }, hip: -0.02, energy: 0.6,
  },
  ANGRY: {
    bones: { spine: [0.16, 0, 0], head: [0.12, 0, 0], leftUpperArm: [-0.25, 0, -1.15], rightUpperArm: [-0.25, 0, 1.15], leftLowerArm: [0, -1.1, 0], rightLowerArm: [0, 1.1, 0] },
    expr: { angry: 1 }, shake: 1, energy: 0.8,
  },
  SMUG: {
    bones: { head: [-0.1, 0.16, 0.14], chest: [-0.04, 0.12, 0], leftUpperArm: [0.25, 0, -0.95], rightUpperArm: [0.25, 0, 0.95], leftLowerArm: [0, -1.5, 0], rightLowerArm: [0, 1.5, 0] },
    expr: { relaxed: 0.6, happy: 0.3 }, energy: 0.3,
  },
  DISAPPOINTED: {
    bones: { spine: [0.2, 0, 0], neck: [0.15, 0, 0], head: [0.3, 0, 0.06], leftUpperArm: [0.05, 0, -1.35], rightUpperArm: [0.05, 0, 1.35], leftShoulder: [0, 0, -0.08], rightShoulder: [0, 0, 0.08] },
    expr: { sad: 1 }, hip: -0.015, energy: 0.1,
  },
};

const EXPR = ["happy", "angry", "sad", "relaxed", "surprised"];
const VISEMES = ["aa", "ih", "ou", "ee", "oh"];
const damp = (dt, k) => 1 - Math.exp(-dt * k);

export class CharacterAnimator {
  constructor(vrm, params = {}) {
    this.vrm = vrm;
    this.p = { breath: 0.7, sway: 0.5, head: 0.8, bounce: 0.3, jitter: 0, posture: 0.6, speed: 1, ...params };
    this.nodes = {};
    BONES.forEach((b) => (this.nodes[b] = vrm.humanoid?.getNormalizedBoneNode(b) || null));
    this.cur = {};
    BONES.forEach((b) => (this.cur[b] = new THREE.Vector3()));
    this.exprCur = {};
    this.has = new Set();
    const em = vrm.expressionManager;
    [...EXPR, ...VISEMES, "blink", "blinkLeft", "blinkRight"].forEach((n) => em?.getExpression(n) && this.has.add(n));
    this.hips0 = this.nodes.hips ? this.nodes.hips.position.clone() : new THREE.Vector3();
    this.blinkT = 2 + Math.random() * 3;
    this.blinkPhase = -1;
    this.lookTarget = new THREE.Object3D();
    this.lookGoal = new THREE.Vector3(0, 1.4, 3);
    this.saccadeT = 1;
    if (vrm.lookAt) vrm.lookAt.target = this.lookTarget;
    this.mouth = { aa: 0, ih: 0, ou: 0, ee: 0, oh: 0 };
    this.bounceY = 0;
    this.seed = Math.random() * 100;
    // VRM0 normalized rigs are rotated 180deg: X/Z rotations invert.
    this.s = vrm.meta?.metaVersion === "0" ? -1 : 1;
  }

  setParams(params) {
    this.p = { ...this.p, ...params };
  }

  update(dt, t, frame, camera) {
    const { emotion = "IDLE", speaking = false, mouth = null, energy = 0 } = frame || {};
    const pose = POSES[emotion] || POSES.IDLE;
    const p = this.p;
    const ts = t * p.speed + this.seed;
    const k = damp(dt, 5);

    // --- blend body pose ---
    BONES.forEach((b) => {
      const n = this.nodes[b];
      if (!n) return;
      const base = BASE[b] || [0, 0, 0];
      const off = pose.bones[b] || [0, 0, 0];
      const c = this.cur[b];
      c.x += (base[0] + off[0] - c.x) * k;
      c.y += (base[1] + off[1] - c.y) * k;
      c.z += (base[2] + off[2] - c.z) * k;
      n.rotation.set(c.x * this.s, c.y, c.z * this.s);
    });

    const N = this.nodes;
    const s = this.s;
    const add = (b, x, y, z) => N[b] && (N[b].rotation.x += x * s, N[b].rotation.y += y, N[b].rotation.z += z * s);
    const lively = (pose.energy || 0) + (speaking ? 0.4 : 0);

    // breathing
    const br = Math.sin(ts * 1.6) * 0.022 * p.breath;
    add("chest", br, 0, 0);
    add("upperChest", br * 0.6, 0, 0);
    add("leftShoulder", 0, 0, -br * 0.8);
    add("rightShoulder", 0, 0, br * 0.8);
    add("leftUpperArm", 0, 0, br * 0.5);
    add("rightUpperArm", 0, 0, -br * 0.5);

    // weight shifting / idle sway
    const sw = Math.sin(ts * 0.42) * p.sway;
    add("hips", 0, Math.sin(ts * 0.31) * 0.03 * p.sway, sw * 0.035);
    add("spine", 0, 0, -sw * 0.03);
    add("chest", 0, Math.sin(ts * 0.53) * 0.025 * p.sway, -sw * 0.015);
    if (N.hips) {
      const target = (pose.hip || 0) + this.bounceY;
      N.hips.position.set(this.hips0.x + sw * 0.012, this.hips0.y + target, this.hips0.z);
    }

    // bounce for excited states
    const bounceAmt = (pose.bounce || 0) * (0.5 + p.bounce);
    const by = bounceAmt ? Math.max(0, Math.sin(ts * 7)) * 0.018 * bounceAmt : 0;
    this.bounceY += (by - this.bounceY) * damp(dt, 14);

    // head micro motion + speaking nods
    const hm = p.head;
    let hx = Math.sin(ts * 0.7) * 0.025 * hm + Math.sin(ts * 1.9) * 0.008 * hm;
    let hy = Math.sin(ts * 0.45 + 1) * 0.05 * hm;
    let hz = Math.sin(ts * 0.36 + 2) * 0.025 * hm;
    if (speaking) {
      hx += energy * 0.09 * Math.sin(ts * 5.5) + energy * 0.05;
      hy += Math.sin(ts * 2.3) * 0.04 * lively;
      add("rightLowerArm", 0, energy * 0.35 * (0.6 + Math.sin(ts * 3.1)), 0);
      add("leftLowerArm", 0, -energy * 0.2 * (0.6 + Math.sin(ts * 2.7 + 1)), 0);
      add("rightUpperArm", -energy * 0.12, 0, 0);
    }
    if (pose.shake) hy += Math.sin(ts * 23) * 0.02;
    if (p.jitter && Math.random() < 0.02 * p.jitter) hy += (Math.random() - 0.5) * 0.25 * p.jitter;
    add("head", hx, hy, hz);
    add("neck", hx * 0.4, hy * 0.4, 0);

    // eyes: saccades toward camera area
    this.saccadeT -= dt;
    if (this.saccadeT <= 0) {
      this.saccadeT = 0.6 + Math.random() * 2.6;
      const cam = camera ? camera.position : new THREE.Vector3(0, 1.4, 3);
      const away = emotion === "THINKING" ? 0.9 : Math.random() < 0.25 ? 0.5 : 0.08;
      this.lookGoal.set(cam.x + (Math.random() - 0.5) * away, cam.y + (Math.random() - 0.3) * away * (emotion === "THINKING" ? 1.5 : 0.6), cam.z);
    }
    this.lookTarget.position.lerp(this.lookGoal, damp(dt, 18));

    // expressions
    const em = this.vrm.expressionManager;
    if (em) {
      EXPR.forEach((e) => {
        if (!this.has.has(e)) return;
        const goal = (pose.expr[e] || 0) * (speaking ? 0.75 : 1);
        this.exprCur[e] = (this.exprCur[e] || 0) + (goal - (this.exprCur[e] || 0)) * damp(dt, 6);
        em.setValue(e, this.exprCur[e]);
      });
      // lip sync
      const m = mouth || { aa: 0, ih: 0, ou: 0, ee: 0, oh: 0 };
      VISEMES.forEach((v) => {
        let goal = m[v] || 0;
        if (v === "aa" && pose.expr.aa && !speaking) goal = Math.max(goal, pose.expr.aa);
        const rate = goal > this.mouth[v] ? 28 : 14;
        this.mouth[v] += (goal - this.mouth[v]) * damp(dt, rate);
        if (this.has.has(v)) em.setValue(v, Math.min(1, this.mouth[v]));
        else if (v === "aa" && this.has.has("oh")) em.setValue("oh", Math.min(1, this.mouth.aa));
      });
      // blinking
      this.blinkT -= dt;
      if (this.blinkT <= 0 && this.blinkPhase < 0) {
        this.blinkPhase = 0;
        this.blinkT = 1.8 + Math.random() * 4.2;
        if (Math.random() < 0.15) this.blinkT = 0.25;
      }
      let blink = 0;
      if (this.blinkPhase >= 0) {
        this.blinkPhase += dt / 0.16;
        blink = Math.sin(Math.min(1, this.blinkPhase) * Math.PI);
        if (this.blinkPhase >= 1) this.blinkPhase = -1;
      }
      const happyClose = (this.exprCur.happy || 0) > 0.6 ? 0 : 1;
      if (this.has.has("blink")) em.setValue("blink", blink * happyClose);
    }
  }
}
