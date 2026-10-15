import * as fs from "fs";
import { ProjectStore } from "./paths";

/** Small persisted state: enough to make `restore --undo` work. */
export interface RewindexState {
  /** Safety snapshot taken immediately before the most recent restore. */
  lastSafetySnapshot?: string;
  /** The checkpoint the last restore targeted (for messaging). */
  lastRestoredTo?: string;
}

export function readState(store: ProjectStore): RewindexState {
  try {
    return JSON.parse(fs.readFileSync(store.stateFile, "utf8"));
  } catch {
    return {};
  }
}

export function writeState(store: ProjectStore, state: RewindexState): void {
  fs.mkdirSync(store.dir, { recursive: true });
  fs.writeFileSync(store.stateFile, JSON.stringify(state, null, 2));
}
