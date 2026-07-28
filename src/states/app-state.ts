import { BaseDirectory, exists, readFile, writeFile } from "@tauri-apps/plugin-fs";
import * as mobx from "mobx";

import { resticApp, frontendLog, type RepoStats, type DiffResult, type RestoreReport } from "../backend/app";
import { restic } from "../backend/restic";
import { decodeTextData, encodeTextData } from "../utils/text-encoding";
import { getSavedTheme, applyTheme, type Theme } from "../utils/theme-manager";
import type { Location } from "./location";
import { LocationPreset } from "./location-preset";


export interface SnapshotFilter {
  hostname?: string;
  tags?: string[];
  dateFrom?: Date;
  dateTo?: Date;
}


class AppState {
  
  @mobx.observable
  locationPresets: LocationPreset[] = [new LocationPreset()];
  @mobx.observable
  selectedLocationPreset: LocationPreset = this.locationPresets[0];

  
  @mobx.computed
  get repoLocation(): Location {
    return this.selectedLocationPreset.location;
  }
  
  @mobx.observable
  repoPassword: string = "";
  
  @mobx.observable
  repoError: string = "";

  
  @mobx.observable
  snapShots: restic.Snapshot[] = [];
  @mobx.observable
  selectedSnapshotID: string = "";
  @mobx.observable
  selectedSnapshotIDs: string[] = [];

  
  @mobx.observable
  isDeletingSnapshots: boolean = false;

  
  @mobx.observable
  repoStats: RepoStats | null = null;
  @mobx.observable
  isLoadingStats: boolean = false;

  
  @mobx.observable
  snapshotSizes = new Map<string, number>();

  
  @mobx.observable
  snapshotFilter: SnapshotFilter = {};

  
  @mobx.computed
  get filteredSnapshots(): restic.Snapshot[] {
    let result = this.snapShots;
    const f = this.snapshotFilter;

    if (f.hostname) {
      result = result.filter((s) => s.hostname === f.hostname);
    }
    if (f.tags && f.tags.length > 0) {
      result = result.filter((s) =>
        f.tags!.some((tag) => s.tags?.includes(tag))
      );
    }
    if (f.dateFrom) {
      result = result.filter((s) => new Date(s.time) >= f.dateFrom!);
    }
    if (f.dateTo) {
      result = result.filter((s) => new Date(s.time) <= f.dateTo!);
    }
    return result;
  }

  
  @mobx.computed
  get uniqueHostnames(): string[] {
    return [...new Set(this.snapShots.map((s) => s.hostname))].sort();
  }

  
  @mobx.computed
  get uniqueTags(): string[] {
    const tags = new Set<string>();
    for (const s of this.snapShots) {
      if (s.tags) {
        for (const t of s.tags) {
          tags.add(t);
        }
      }
    }
    return [...tags].sort();
  }

  
  @mobx.observable
  diffResult: DiffResult | null = null;
  @mobx.observable
  isLoadingDiff: boolean = false;

  
  @mobx.observable
  searchResults: restic.File[] = [];
  @mobx.observable
  isSearching: boolean = false;
  @mobx.observable
  searchPattern: string = "";

  
  @mobx.observable
  selectedFiles: restic.File[] = [];

  
  @mobx.observable
  isRunningMaintenance: boolean = false;
  @mobx.observable
  maintenanceMessage: string = "";

  
  @mobx.observable
  isLoadingSnapshots: number = 0;

  @mobx.observable
  isLoadingFiles: number = 0;

  @mobx.observable
  presetsLoaded: boolean = false;

  
  @mobx.observable
  pendingFileDumps: { file: restic.File; mode: "open" | "restore" }[] = [];

  
  @mobx.observable
  isRestoring: boolean = false;
  @mobx.observable
  restoreDialogError: string = "";
  @mobx.observable
  lastRestoreMessage: string = "";
  @mobx.observable
  lastRestoreTimestamp: number = 0;

  
  @mobx.observable
  supportedLocationTypes: restic.RepositoryLocationType[] = [];

  
  @mobx.observable
  currentTheme: Theme = getSavedTheme();

  
  constructor() {
    mobx.makeObservable(this);

    
    applyTheme(this.currentTheme);

    (async () => {
      await resticApp.verifyResticPath();

      this.supportedLocationTypes = await resticApp.supportedRepoLocationTypes();
      frontendLog("info", `supportedLocationTypes: ${JSON.stringify(this.supportedLocationTypes.map(t => ({ type: t.type, prefix: t.prefix })))}`);

      try {
        const defaultLoc = await resticApp.defaultRepoLocation();
        frontendLog("info", `defaultRepoLocation raw: prefix='${defaultLoc.prefix}', path='${defaultLoc.path}', credentials=${defaultLoc.credentials?.length ?? 0}, password=${defaultLoc.password ? 'set' : 'empty'}`);
        this.repoLocation.setFromResticLocation(defaultLoc);
        frontendLog("info", `repoLocation after set: type='${this.repoLocation.type}', prefix='${this.repoLocation.prefix}', path='${this.repoLocation.path}', password=${this.repoLocation.password ? 'set' : 'empty'}, credentials=${this.repoLocation.credentials.length}`);
        if (this.repoLocation.path) {
          const needsPassword = !this.repoLocation.allowEmptyPassword && !this.repoLocation.password;
          frontendLog("info", `auto-open check: needsPassword=${needsPassword}, allowEmpty=${this.repoLocation.allowEmptyPassword}`);
          if (!needsPassword) {
            frontendLog("info", "calling openRepository()...");
            this.openRepository();
          }
        }
      } catch (err: any) {
        frontendLog("error", `Failed to fetch default location: ${err.message || String(err)}`);
        console.error("Failed to fetch default location: '%s'", err.message || String(err));
      }

      
      try {
        await this._autoLoadPresets();
      } catch (err: any) {
        console.warn("Failed to load location presets file: '%s'", err.message || String(err));
      }
      mobx.runInAction(() => {
        this.presetsLoaded = true;
        const presets = this.locationPresets.slice(1);
        if (!this.repoLocation.path && presets.length > 0) {
          this.selectedLocationPreset = presets[0];
          this.openRepository();
        }
      });
      
      this._autoSavePresets();
    })().catch((err) => {
      console.error("Failed to initialize appState: '%s'", err.message || String(err));
    });
  }

  
  @mobx.action
  setSelectedLocationPreset(locationPreset: LocationPreset): void {
    console.assert(
      this.locationPresets.includes(locationPreset),
      "Trying to select an invalid location preset",
    );
    this.selectedLocationPreset = locationPreset;
  }

  
  @mobx.action
  addLocationPreset(location: Location, displayName: string, savePasswords: boolean) {
    const newPreset = new LocationPreset();
    newPreset.name = displayName;
    newPreset.location.setFromOtherLocation(location, savePasswords);
    this.locationPresets.push(newPreset);
    this.selectedLocationPreset = newPreset;
  }

  
  @mobx.action
  removeLocationPreset(index: number) {
    if (index !== 0) {
      const deletingSelected = this.selectedLocationPreset === this.locationPresets[index];
      this.locationPresets.splice(index, 1);
      if (deletingSelected) {
        this.selectedLocationPreset = this.locationPresets[0];
      }
    } else {
      console.error("Trying to delete the first location preset");
    }
  }

  
  @mobx.action
  setRepositoryLocation(location: Location): void {
    this.repoLocation.setFromOtherLocation(location);
  }

  
  @mobx.action
  setRepositoryPassword(password: string): void {
    this.repoPassword = password;
  }

  @mobx.action
  openRepository(): void {
    const location = new restic.Location(this.repoLocation);
    frontendLog("info", `openRepository: prefix='${location.prefix}', path='${location.path}', credentials=${location.credentials.length}, password=${location.password ? 'set' : 'empty'}`);
    if (!location.allowEmptyPassword && !location.password && this.repoPassword) {
      location.password = this.repoPassword;
    }
    if (!location.allowEmptyPassword && !location.password) {
      frontendLog("error", "openRepository: password required but missing");
      this.repoError = "Repository password is required";
      return;
    }
    ++this.isLoadingSnapshots;
    this.selectedSnapshotID = "";
    this.selectedSnapshotIDs = [];
    this.snapShots = [];
    this.repoError = "";
    frontendLog("info", "openRepository: calling resticApp.openRepository...");
    resticApp
      .openRepository(location)
      .then(() => {
        frontendLog("info", "openRepository: open succeeded, calling getSnapshots...");
        return resticApp.getSnapshots();
      })
      .then(
        mobx.action((result) => {
          frontendLog("info", `openRepository: got ${result.length} snapshots`);
          this.repoError = "";
          this.snapShots = result;
          if (!result.find((s) => s.short_id === this.selectedSnapshotID)) {
            if (result.length) {
              this.selectedSnapshotID = result[result.length - 1].id;
            } else {
              this.selectedSnapshotID = "";
            }
          }
          this._filesCache.clear();
          --this.isLoadingSnapshots;
        }),
      )
      .catch(
        mobx.action((err) => {
          frontendLog("error", `openRepository: CATCH error: ${err.message || String(err)}`);
          this.repoError = err.message || String(err);
          this.snapShots = [];
          this.selectedSnapshotID = "";
          --this.isLoadingSnapshots;
        }),
      );
  }

  
  @mobx.action
  setNewSnapshotId(id: string): void {
    console.assert(
      this.snapShots.find((s) => s.id === id) !== undefined,
      "Trying to select an invalid snapshot",
    );
    this.selectedSnapshotID = id;
  }

  
  @mobx.action
  setSelectedSnapshotIDs(ids: string[]): void {
    this.selectedSnapshotIDs = ids;
    
    if (ids.length > 0) {
      this.selectedSnapshotID = ids[0];
    }
  }

  
  @mobx.action
  deleteSelectedSnapshots(): Promise<void> {
    if (this.selectedSnapshotIDs.length === 0) {
      return Promise.reject(new Error("No snapshots selected"));
    }
    this.isDeletingSnapshots = true;
    return resticApp
      .forgetSnapshots(this.selectedSnapshotIDs)
      .then(
        mobx.action(() => {
          this.isDeletingSnapshots = false;
          
          this.openRepository();
        }),
      )
      .catch(
        mobx.action((err) => {
          this.isDeletingSnapshots = false;
          throw err;
        }),
      );
  }

  

  @mobx.action
  setSnapshotFilter(filter: SnapshotFilter): void {
    this.snapshotFilter = filter;
  }

  @mobx.action
  clearSnapshotFilter(): void {
    this.snapshotFilter = {};
  }

  

  @mobx.action
  fetchRepoStats(snapshotIds?: string[]): Promise<void> {
    this.isLoadingStats = true;
    
    const ids = snapshotIds ?? (this.selectedSnapshotIDs.length > 0 ? this.selectedSnapshotIDs : undefined);
    return resticApp
      .getRepoStats(ids)
      .then(
        mobx.action((stats) => {
          this.repoStats = stats;
          this.isLoadingStats = false;
        }),
      )
      .catch(
        mobx.action((err) => {
          this.isLoadingStats = false;
          console.error("Failed to fetch stats:", err);
        }),
      );
  }

  

  @mobx.action
  checkRepository(): Promise<string> {
    this.isRunningMaintenance = true;
    this.maintenanceMessage = "Checking repository integrity...";
    return resticApp
      .checkRepository()
      .then(
        mobx.action((result) => {
          this.isRunningMaintenance = false;
          this.maintenanceMessage = result || "Repository check completed successfully";
          return result;
        }),
      )
      .catch(
        mobx.action((err) => {
          this.isRunningMaintenance = false;
          this.maintenanceMessage = `Check failed: ${err}`;
          throw err;
        }),
      );
  }

  @mobx.action
  unlockRepository(): Promise<string> {
    this.isRunningMaintenance = true;
    this.maintenanceMessage = "Unlocking repository...";
    return resticApp
      .unlockRepository()
      .then(
        mobx.action((result) => {
          this.isRunningMaintenance = false;
          this.maintenanceMessage = result || "Repository unlocked successfully";
          return result;
        }),
      )
      .catch(
        mobx.action((err) => {
          this.isRunningMaintenance = false;
          this.maintenanceMessage = `Unlock failed: ${err}`;
          throw err;
        }),
      );
  }

  @mobx.action
  pruneRepository(): Promise<string> {
    this.isRunningMaintenance = true;
    this.maintenanceMessage = "Pruning repository...";
    return resticApp
      .pruneRepository()
      .then(
        mobx.action((result) => {
          this.isRunningMaintenance = false;
          this.maintenanceMessage = result || "Prune completed successfully";
          
          this.fetchRepoStats();
          return result;
        }),
      )
      .catch(
        mobx.action((err) => {
          this.isRunningMaintenance = false;
          this.maintenanceMessage = `Prune failed: ${err}`;
          throw err;
        }),
      );
  }

  

  @mobx.action
  diffSnapshots(snapshotId1: string, snapshotId2: string): Promise<void> {
    this.isLoadingDiff = true;
    this.diffResult = null;
    return resticApp
      .diffSnapshots(snapshotId1, snapshotId2)
      .then(
        mobx.action((result) => {
          this.diffResult = result;
          this.isLoadingDiff = false;
        }),
      )
      .catch(
        mobx.action((err) => {
          this.isLoadingDiff = false;
          throw err;
        }),
      );
  }

  @mobx.action
  clearDiffResult(): void {
    this.diffResult = null;
  }

  

  @mobx.action
  createBackup(paths: string[] = [], tags: string[] = []): Promise<string> {
    this.isRunningMaintenance = true;
    this.maintenanceMessage = "Creating backup...";
    return resticApp
      .createBackup(paths, tags)
      .then(
        mobx.action((result) => {
          this.isRunningMaintenance = false;
          this.maintenanceMessage = "Backup completed successfully";
          
          this.openRepository();
          return result;
        }),
      )
      .catch(
        mobx.action((err) => {
          this.isRunningMaintenance = false;
          this.maintenanceMessage = `Backup failed: ${err}`;
          throw err;
        }),
      );
  }

  

  @mobx.action
  searchFiles(pattern: string, snapshotIds?: string[]): Promise<void> {
    console.log(`[Search] Starting search for "${pattern}" in snapshots ${JSON.stringify(snapshotIds)}`);
    this.isSearching = true;
    this.searchPattern = pattern;
    this.searchResults = [];
    return resticApp
      .searchFiles(pattern, snapshotIds)
      .then(
        mobx.action((files) => {
          console.log(`[Search] Received ${files.length} results`, files);
          this.searchResults = files;
          this.isSearching = false;
        }),
      )
      .catch(
        mobx.action((err) => {
          console.error(`[Search] Error:`, err);
          this.isSearching = false;
          throw err;
        }),
      );
  }

  @mobx.action
  clearSearch(): void {
    this.searchPattern = "";
    this.searchResults = [];
  }

  

  @mobx.action
  setSelectedFiles(files: restic.File[]): void {
    this.selectedFiles = files;
  }

  @mobx.action
  async restoreSelectedFiles(): Promise<string> {
    const files = this.selectedFiles.filter(f => f.name !== "..");
    if (files.length === 0) {
      return Promise.reject(new Error("No files selected"));
    }

    this.isRestoring = true;
    this.restoreDialogError = "";

    
    for (const file of files) {
      this.pendingFileDumps.push({ file, mode: "restore" });
    }

    const removePendingFiles = mobx.action(() => {
      for (const file of files) {
        const index = this.pendingFileDumps.findIndex(
          (item) => item.file.path === file.path && item.mode === "restore",
        );
        if (index !== -1) {
          this.pendingFileDumps.splice(index, 1);
        }
      }
    });

    return resticApp
      .restoreFiles(this.selectedSnapshotID, files)
      .then((path) => {
        removePendingFiles();
        this.isRestoring = false;
        this.lastRestoreMessage = `Restored ${files.length} item(s)`;
        this.lastRestoreTimestamp = Date.now();
        return path;
      })
      .catch((err) => {
        removePendingFiles();
        this.isRestoring = false;
        this.restoreDialogError = err.message || String(err);
        this.lastRestoreMessage = `Restore failed: ${err.message || String(err)}`;
        this.lastRestoreTimestamp = Date.now();
        throw err;
      });
  }

  @mobx.action
  async restoreSnapshot(snapshotId: string): Promise<RestoreReport> {
    this.isRunningMaintenance = true;
    this.isRestoring = true;
    this.restoreDialogError = "";
    this.maintenanceMessage = "Restoring snapshot...";
    return resticApp
      .restoreSnapshot(snapshotId)
      .then(
        mobx.action((report) => {
          this.isRunningMaintenance = false;
          this.isRestoring = false;
          this.maintenanceMessage = `Restored ${report.restored_files} files, fixed ${report.fixed_files} zero-byte files`;
          this.lastRestoreMessage = `Restored ${report.restored_files} files, fixed ${report.fixed_files} zero-byte files`;
          this.lastRestoreTimestamp = Date.now();
          return report;
        }),
      )
      .catch(
        mobx.action((err) => {
          this.isRunningMaintenance = false;
          this.isRestoring = false;
          this.restoreDialogError = err.message || String(err);
          this.maintenanceMessage = `Restore failed: ${err}`;
          this.lastRestoreMessage = `Restore failed: ${err.message || String(err)}`;
          this.lastRestoreTimestamp = Date.now();
          throw err;
        }),
      );
  }

  
  @mobx.action
  fetchFiles(rootPath: string): Promise<restic.File[]> {
    const selectedSnapshotID = this.selectedSnapshotID;
    if (!selectedSnapshotID) {
      return Promise.reject(new Error("No snapshot selected"));
    }
    
    const cachedFiles = this._getCachedFiles(selectedSnapshotID, rootPath);
    if (cachedFiles) {
      return Promise.resolve(cachedFiles);
    }
    
    ++this.isLoadingFiles;
    return resticApp
      .getFiles(this.selectedSnapshotID, rootPath || "/")
      .then(
        mobx.action((files) => {
          --this.isLoadingFiles;
          this._addCachedFiles(selectedSnapshotID, rootPath, files);
          return files;
        }),
      )
      .catch(
        mobx.action((error) => {
          --this.isLoadingFiles;
          throw error;
        }),
      );
  }

  
  @mobx.action
  async openFile(file: restic.File): Promise<void> {
    this.pendingFileDumps.push({ file, mode: "open" });

    const removePendingFile = mobx.action(() => {
      const index = this.pendingFileDumps.findIndex(
        (item) => item.file.path === file.path && item.mode === "open",
      );
      if (index !== -1) {
        this.pendingFileDumps.splice(index, 1);
      }
    });

    return resticApp
      .dumpFileToTemp(this.selectedSnapshotID, file)
      .then((path) => {
        removePendingFile();
        resticApp.openFileOrUrl(path).catch((err) => {
          throw err;
        });
      })
      .catch((err) => {
        removePendingFile();
        throw err;
      });
  }

  
  
  @mobx.action
  dumpFile(file: restic.File): Promise<string> {
    this.pendingFileDumps.push({ file, mode: "restore" });

    const removePendingFile = mobx.action(() => {
      const index = this.pendingFileDumps.findIndex(
        (item) => item.file.path === file.path && item.mode === "restore",
      );
      if (index !== -1) {
        this.pendingFileDumps.splice(index, 1);
      }
    });

    return resticApp
      .dumpFile(this.selectedSnapshotID, file)
      .then((path) => {
        removePendingFile();
        return path;
      })
      .catch((err) => {
        removePendingFile();
        throw err;
      });
  }

  
  @mobx.action
  restoreFile(file: restic.File): Promise<string> {
    this.isRestoring = true;
    this.restoreDialogError = "";
    this.pendingFileDumps.push({ file, mode: "restore" });

    const removePendingFile = mobx.action(() => {
      const index = this.pendingFileDumps.findIndex(
        (item) => item.file.path === file.path && item.mode === "restore",
      );
      if (index !== -1) {
        this.pendingFileDumps.splice(index, 1);
      }
    });

    return resticApp
      .restoreFile(this.selectedSnapshotID, file)
      .then((path) => {
        removePendingFile();
        this.isRestoring = false;
        this.lastRestoreMessage = `Restored '${file.name}'`;
        this.lastRestoreTimestamp = Date.now();
        return path;
      })
      .catch((err) => {
        removePendingFile();
        this.isRestoring = false;
        this.restoreDialogError = err.message || String(err);
        this.lastRestoreMessage = `Restore failed: ${err.message || String(err)}`;
        this.lastRestoreTimestamp = Date.now();
        throw err;
      });
  }

  

  
  static readonly MAX_CACHED_FILE_ENTRIES = 50;

  
  private _filesCache = new Map<string, { files: restic.File[]; lastAccessTime: number }>();

  
  private static _cachedFilesKey(snapShotId: string, path: string): string {
    const normalizedPath = !path ? "/" : path.replace(/\\/g, "/");
    return `${snapShotId}:${normalizedPath}`;
  }

  
  
  private _getCachedFiles(snapShotId: string, path: string): restic.File[] | undefined {
    const entry = this._filesCache.get(AppState._cachedFilesKey(snapShotId, path));
    if (entry) {
      entry.lastAccessTime = Date.now();
      return entry.files;
    }
    return undefined;
  }

  
  private _addCachedFiles(snapShotId: string, path: string, files: restic.File[]) {
    const currentTime = Date.now();
    if (this._filesCache.size > AppState.MAX_CACHED_FILE_ENTRIES) {
      
      let oldestTime = currentTime;
      let oldestKey = "";
      for (const [key, value] of Array.from(this._filesCache)) {
        if (value.lastAccessTime < oldestTime) {
          oldestTime = value.lastAccessTime;
          oldestKey = key;
        }
      }
      this._filesCache.delete(oldestKey);
    }
    
    this._filesCache.set(AppState._cachedFilesKey(snapShotId, path), {
      files: files,
      lastAccessTime: currentTime,
    });
  }

  
  private async _autoLoadPresets() {
    if (await exists("presets.json", { baseDir: BaseDirectory.AppConfig })) {
      const fileContent = await readFile("presets.json", {
        baseDir: BaseDirectory.AppConfig,
      });
      const textContent = decodeTextData(fileContent);
      const presetsObject = JSON.parse(textContent);
      if (!Array.isArray(presetsObject)) {
        throw "Content is not an array";
      }
      
      mobx.runInAction(() =>
        this.locationPresets.push(
          ...presetsObject.map((presetObject) => {
            const newPreset = new LocationPreset();
            newPreset.fromJSON(presetObject);
            return newPreset;
          }),
        ),
      );
    }
  }

  
  private _autoSavePresets() {
    
    mobx.reaction(
      
      () => JSON.stringify(this.locationPresets.slice(1)),
      (contents) => {
        const fileContent = encodeTextData(contents);
        writeFile("presets.json", fileContent, {
          baseDir: BaseDirectory.AppConfig,
        }).catch((err) => {
          console.error("Failed to save location presets: '%s'", err.message || String(err));
        });
      },
      { delay: 500 },
    );
  }
}


export const appState = new AppState();
