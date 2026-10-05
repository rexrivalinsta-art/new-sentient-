import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { VRMLoaderPlugin, VRMUtils } from "@pixiv/three-vrm";

const MAX = 3;
const cache = new Map();

const disposeEntry = (e) => e.promise.then((vrm) => VRMUtils.deepDispose(vrm.scene)).catch(() => {});

function evict() {
  for (const [url, e] of cache) {
    if (cache.size <= MAX) break;
    if (e.users > 0) continue;
    cache.delete(url);
    disposeEntry(e);
  }
}

/** LRU-cached VRM loader (~3 recently used avatars kept in memory). */
export function acquireVRM(url, onProgress) {
  let e = cache.get(url);
  if (e) {
    cache.delete(url);
    cache.set(url, e);
  } else {
    const loader = new GLTFLoader();
    loader.register((p) => new VRMLoaderPlugin(p));
    const promise = loader
      .loadAsync(url, (ev) => ev.total && onProgress?.(ev.loaded / ev.total))
      .then((gltf) => {
        const vrm = gltf.userData.vrm;
        if (!vrm) throw new Error("Not a VRM file");
        VRMUtils.removeUnnecessaryVertices(gltf.scene);
        if (VRMUtils.combineSkeletons) VRMUtils.combineSkeletons(gltf.scene);
        VRMUtils.rotateVRM0(vrm);
        vrm.scene.traverse((o) => {
          o.frustumCulled = false;
          if (o.isMesh) {
            o.castShadow = true;
            o.receiveShadow = false;
          }
        });
        return vrm;
      });
    e = { promise, users: 0 };
    cache.set(url, e);
    promise.catch(() => cache.delete(url));
  }
  e.users += 1;
  evict();
  return e.promise;
}

export function releaseVRM(url) {
  const e = cache.get(url);
  if (e) e.users = Math.max(0, e.users - 1);
  evict();
}

export const cacheInfo = () => [...cache.keys()];
