import type { NudgeApi } from './index';

// Makes `window.nudge` typed in the renderer.
declare global {
  interface Window {
    nudge: NudgeApi;
  }
}
