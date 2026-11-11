import { contextBridge } from 'electron';

// The renderer has no Node access. Everything it can do goes through this
// small, explicit bridge. Channels are added here as features land.
const api = {
  platform: process.platform,
};

contextBridge.exposeInMainWorld('nudge', api);

export type NudgeApi = typeof api;
