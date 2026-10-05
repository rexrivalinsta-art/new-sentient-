export function detectDevice() {
  const ua = navigator.userAgent || "";
  const mobile = /Android|iPhone|iPad|iPod|Mobile/i.test(ua) || window.matchMedia?.("(pointer: coarse)").matches;
  const memory = navigator.deviceMemory || null;
  const cores = navigator.hardwareConcurrency || 4;
  const webgpu = !!navigator.gpu;
  let webgl = false;
  try {
    const c = document.createElement("canvas");
    webgl = !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch (e) {
    webgl = false;
  }
  return { mobile, memory, cores, webgpu, webgl };
}

export function qualityPreset(device = detectDevice()) {
  if (!device.webgl) return "none";
  if (device.mobile || (device.memory && device.memory <= 4) || device.cores <= 4) return "medium";
  return "high";
}

export const QUALITY = {
  low: { dpr: 1, shadows: false, antialias: false, shadowSize: 512 },
  medium: { dpr: 1.5, shadows: true, antialias: true, shadowSize: 1024 },
  high: { dpr: 2, shadows: true, antialias: true, shadowSize: 2048 },
};
