import axios from "axios";

export const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
export const API = `${BACKEND_URL}/api`;
export const WS_BASE = BACKEND_URL.replace(/^http/, "ws") + "/api/ws";

export const http = axios.create({ baseURL: API, timeout: 30000 });

export const api = {
  tokens: (params) => http.get("/tokens", { params }).then((r) => r.data.items),
  token: (key) => http.get(`/tokens/${key}`).then((r) => r.data),
  createToken: (body) => http.post("/tokens", body).then((r) => r.data),
  generate: (body) => http.post("/characters/generate", body).then((r) => r.data),
  avatars: (params) => http.get("/avatars", { params }).then((r) => r.data),
  avatarStats: () => http.get("/avatars/stats").then((r) => r.data),
  vibes: () => http.get("/vibes").then((r) => r.data),
  upload: (file) => {
    const fd = new FormData();
    fd.append("file", file);
    return http.post("/upload", fd).then((r) => r.data);
  },
  labSession: (marketCap) => http.post("/lab/session", { marketCap }).then((r) => r.data),
  sim: (mint, action, value) => http.post(`/sim/${mint}`, { action, value }).then((r) => r.data),
  launchMock: (tokenId, launchMarketCap) => http.post("/launch/mock", { tokenId, launchMarketCap }).then((r) => r.data),
  launchPrepare: (body) => http.post("/launch/pumpportal/prepare", body).then((r) => r.data),
  launchConfirm: (body) => http.post("/launch/confirm", body, { timeout: 60000 }).then((r) => r.data),
  launchStatus: (tokenId) => http.get(`/launch/status/${tokenId}`).then((r) => r.data),
  launchLink: (tokenId, mint) => http.post("/launch/link", { tokenId, mint }).then((r) => r.data),
  brain: (body) => http.post("/brain/line", body, { timeout: 10000 }).then((r) => r.data),
  brainModels: () => http.get("/brain/models").then((r) => r.data),
  importToken: (body) => http.post("/tokens/import", body, { timeout: 30000 }).then((r) => r.data),
  wallet: (wallet) => http.post("/users/wallet", { wallet }).catch(() => null),
};

export const errMsg = (e) => e?.response?.data?.detail || e?.message || "Something went wrong";
