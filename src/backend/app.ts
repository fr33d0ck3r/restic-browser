import { core } from "@tauri-apps/api";

import type { restic } from "./restic";


export function frontendLog(level: "info" | "warn" | "error", message: string): void {
  core.invoke("frontend_log", { level, message }).catch(() => {});
}


export interface RepoStats {
  total_size: number;
  total_file_count: number;
  snapshots_count: number;
}

export interface DiffResult {
  added: string[];
  removed: string[];
  modified: string[];
  metadata_changed: string[];
  type_changed: string[];
}

export interface RestoreReport {
  target_dir: string;
  restored_files: number;
  zero_byte_files: number;
  fixed_files: number;
  failed_files: number;
  details: RestoreDetail[];
}

export interface RestoreDetail {
  path: string;
  status: string;
  source_snapshot: string | null;
}

export namespace resticApp {
  export function supportedRepoLocationTypes(): Promise<restic.RepositoryLocationType[]> {
    return core.invoke<restic.RepositoryLocationType[]>("supported_repo_location_types");
  }

  export function defaultRepoLocation(): Promise<restic.Location> {
    return core.invoke<restic.Location>("default_repo_location");
  }

  export function openFileOrUrl(path: string): Promise<void> {
    return core.invoke<void>("open_file_or_url", { path });
  }

  export function verifyResticPath(): Promise<void> {
    return core.invoke<void>("verify_restic_path");
  }

  export function openRepository(location: restic.Location): Promise<void> {
    return core.invoke<void>("open_repository", { location });
  }

  export function getSnapshots(): Promise<Array<restic.Snapshot>> {
    return core.invoke<Array<restic.Snapshot>>("get_snapshots");
  }

  export function getFiles(snapshotId: string, path: string): Promise<Array<restic.File>> {
    return core.invoke<Array<restic.File>>("get_files", { snapshotId, path });
  }

  export function dumpFile(snapshotId: string, file: restic.File): Promise<string> {
    return core.invoke<string>("dump_file", { snapshotId, file });
  }

  export function dumpFileToTemp(snapshotId: string, file: restic.File): Promise<string> {
    return core.invoke<string>("dump_file_to_temp", { snapshotId, file });
  }

  export function restoreFile(snapshotId: string, file: restic.File): Promise<string> {
    return core.invoke<string>("restore_file", { snapshotId, file });
  }

  export function restoreFiles(snapshotId: string, files: restic.File[]): Promise<string> {
    return core.invoke<string>("restore_files", { snapshotId, files });
  }

  export function restoreSnapshot(snapshotId: string): Promise<RestoreReport> {
    return core.invoke<RestoreReport>("restore_snapshot", { snapshotId });
  }

  export function forgetSnapshots(snapshotIds: string[]): Promise<void> {
    return core.invoke<void>("forget_snapshots", { snapshotIds });
  }

  
  export function getRepoStats(snapshotIds?: string[]): Promise<RepoStats> {
    return core.invoke<RepoStats>("get_repo_stats", { snapshotIds });
  }

  export function checkRepository(): Promise<string> {
    return core.invoke<string>("check_repository");
  }

  export function unlockRepository(): Promise<string> {
    return core.invoke<string>("unlock_repository");
  }

  export function pruneRepository(): Promise<string> {
    return core.invoke<string>("prune_repository");
  }

  
  export function diffSnapshots(snapshotId1: string, snapshotId2: string): Promise<DiffResult> {
    return core.invoke<DiffResult>("diff_snapshots", { snapshotId1, snapshotId2 });
  }

  export function createBackup(paths: string[], tags: string[]): Promise<string> {
    return core.invoke<string>("create_backup", { paths, tags });
  }

  
  export function searchFiles(pattern: string, snapshotIds?: string[]): Promise<restic.File[]> {
    const params: { pattern: string; snapshotIds?: string[] } = { pattern };
    if (snapshotIds && snapshotIds.length > 0) {
      params.snapshotIds = snapshotIds;
    }
    console.log("[searchFiles] Calling with params:", params);
    return core.invoke<restic.File[]>("search_files", params);
  }
}
