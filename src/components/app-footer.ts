import { MobxLitElement } from "@adobe/lit-mobx";
import { css, html } from "lit";
import { customElement, state } from "lit/decorators.js";
import * as mobx from "mobx";
import { Notification } from "@vaadin/notification";

import { appState } from "../states/app-state";

import "@vaadin/button";
import "./icons";


function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

@customElement("restic-browser-app-footer")
export class ResticBrowserAppFooter extends MobxLitElement {
  @state() private _statusMessage = "";
  @state() private _showPruneConfirm = false;

  constructor() {
    super();
    let messageTimeoutId: ReturnType<typeof setTimeout> | undefined;
    mobx.autorun(() => {
      let newMessage = "";
      if (appState.isRunningMaintenance) newMessage = appState.maintenanceMessage;
      else if (appState.pendingFileDumps.length) {
        const last = appState.pendingFileDumps[appState.pendingFileDumps.length - 1];
        const verb = last.mode === "open" ? "Opening" : "Restoring";
        newMessage = `${verb} '${last.file.name}'`;
        if (appState.pendingFileDumps.length > 2) newMessage += ` and ${appState.pendingFileDumps.length - 1} others`;
        else if (appState.pendingFileDumps.length > 1) newMessage += " and 1 other";
        newMessage += "...";
      } else if (appState.isRestoring) newMessage = appState.maintenanceMessage || "Restoring...";
      else if (appState.isLoadingSnapshots > 0) newMessage = "Loading snapshots...";
      else if (appState.isLoadingFiles > 0) newMessage = "Loading files...";
      else if (appState.isSearching) newMessage = "Searching...";
      else if (appState.lastRestoreMessage) {
        const age = Date.now() - appState.lastRestoreTimestamp;
        if (age < 30000) newMessage = appState.lastRestoreMessage;
      }

      if (newMessage) {
        if (messageTimeoutId) { clearTimeout(messageTimeoutId); messageTimeoutId = undefined; }
        this._statusMessage = newMessage;
      } else {
        messageTimeoutId = setTimeout(() => { this._statusMessage = ""; messageTimeoutId = undefined; }, 800);
      }
    });

    mobx.reaction(() => appState.snapShots.length, () => {
      if (appState.snapShots.length > 0 && !appState.repoStats) appState.fetchRepoStats();
    }, { fireImmediately: true });
  }

  private _dispatch(name: string, detail?: unknown) {
    this.dispatchEvent(new CustomEvent(name, { detail, bubbles: true, composed: true }));
  }

  private _showNotification(promise: Promise<string>, action: string) {
    promise
      .then((msg) => Notification.show(msg, { position: "bottom-center", theme: "success", duration: 3000 }))
      .catch((err) => Notification.show(`${action} failed: ${err}`, { position: "middle", theme: "error", duration: 5000 }));
  }

  private _onPruneClick(): void {
    this._showPruneConfirm = true;
  }

  private _confirmPrune(): void {
    this._showPruneConfirm = false;
    this._showNotification(appState.pruneRepository(), "Prune");
  }

  private _cancelPrune(): void {
    this._showPruneConfirm = false;
  }

  private _restoreSelected(): void {
    const files = appState.selectedFiles.filter((f) => f.name !== "..");
    if (!files.length) return;
    appState.restoreSelectedFiles()
      .catch((err) => {
        Notification.show(`Restore failed: ${err.message || err}`, {
          position: "middle", theme: "error", duration: 5000,
        });
      });
  }

  static styles = css`
    :host {
      display: flex;
      align-items: center;
      gap: 0;
      padding: 0 12px;
      border-top: 1px solid var(--lumo-contrast-10pct);
      height: 32px;
      font-size: 13px;
      color: var(--lumo-secondary-text-color);
      flex-shrink: 0;
    }
    .flex-1 { flex: 1; }
    .truncate { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .max-w-200 { max-width: 200px; }
    .footer-group {
      display: flex;
      align-items: center;
      gap: 4px;
      padding: 0 10px;
      height: 100%;
    }
    .footer-group + .footer-group {
      border-left: 1px solid var(--lumo-contrast-10pct);
    }
    .btn-group {
      display: flex;
      align-items: center;
      gap: 2px;
    }
    .snapshot-nav {
      display: flex;
      align-items: center;
      gap: 2px;
    }
    .snapshot-date {
      font-size: 11px;
      color: var(--lumo-secondary-text-color);
      white-space: nowrap;
      padding: 0 4px;
      cursor: pointer;
      transition: color var(--transition-fast);
    }
    .snapshot-date:hover {
      color: var(--lumo-primary-text-color);
    }
    /* Confirm dialog overlay */
    .confirm-overlay {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.45);
      z-index: 1000;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .confirm-dialog {
      background: var(--lumo-base-color);
      border-radius: var(--lumo-border-radius-xl);
      padding: 24px;
      max-width: 480px;
      width: 90vw;
      box-shadow: 0 8px 32px rgba(0,0,0,0.25);
      border: 1px solid var(--lumo-contrast-20pct);
    }
    .confirm-dialog h3 {
      margin: 0 0 12px 0;
      font-size: 1rem;
      font-weight: 600;
    }
    .confirm-dialog p {
      margin: 0 0 20px 0;
      font-size: 0.875rem;
      color: var(--lumo-body-text-color);
      line-height: 1.5;
    }
    .confirm-actions {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
    }
  `;

  render() {
    const stats = appState.repoStats;
    const selected = appState.selectedFiles.filter((f) => f.name !== "..");
    const selText = selected.length === 0 ? "" : selected.length === 1 ? selected[0].name : `${selected.length} selected`;

    const snaps = appState.snapShots;
    const idx = snaps.findIndex((s) => s.id === appState.selectedSnapshotID);
    const snap = snaps[idx];
    const snapDate = snap ? new Date(snap.time).toLocaleString() : "No snapshot";

    return html`
      <!-- Left: repo actions -->
      <div class="footer-group btn-group">
        <vaadin-button theme="small icon tertiary-inline"
          title="Unlock repository"
          @click=${() => this._showNotification(appState.unlockRepository(), "Unlock")}>
          <tabler-icon name="unlock" size="18"></tabler-icon>
        </vaadin-button>
        <vaadin-button theme="small icon tertiary-inline"
          title="Prune repository"
          @click=${() => this._onPruneClick()}>
          <tabler-icon name="trash" size="18"></tabler-icon>
        </vaadin-button>
        <vaadin-button theme="small icon tertiary-inline"
          title="Check repository"
          @click=${() => this._showNotification(appState.checkRepository(), "Check")}>
          <tabler-icon name="check-circle" size="18"></tabler-icon>
        </vaadin-button>
      </div>

      <!-- Restore -->
      <div class="footer-group">
        <vaadin-button theme="small tertiary-inline"
          ?disabled=${selected.length === 0}
          @click=${() => this._restoreSelected()}
          title="Restore selected">
          <tabler-icon name="download" size="18" slot="prefix"></tabler-icon>
          Restore
        </vaadin-button>
      </div>

      <div class="flex-1"></div>

      <!-- Status / selected -->
      ${selText ? html`<div class="footer-group"><span class="truncate max-w-200">${selText}</span></div>` : ""}
      <div class="footer-group"><span class="truncate">${this._statusMessage}</span></div>

      <!-- Snapshot nav -->
      ${snaps.length > 0 ? html`
        <div class="footer-group snapshot-nav">
          <vaadin-button theme="small icon tertiary-inline"
            ?disabled=${idx <= 0}
            @click=${() => idx > 0 && appState.setNewSnapshotId(snaps[idx - 1].id)}
            title="Previous snapshot">
            <tabler-icon name="angle-left" size="18"></tabler-icon>
          </vaadin-button>
          <span class="snapshot-date"
            @click=${() => this._dispatch("open-snapshots")}
            title="Click to open snapshots">
            ${snapDate}
          </span>
          <vaadin-button theme="small icon tertiary-inline"
            ?disabled=${idx >= snaps.length - 1}
            @click=${() => idx < snaps.length - 1 && appState.setNewSnapshotId(snaps[idx + 1].id)}
            title="Next snapshot">
            <tabler-icon name="angle-right" size="18"></tabler-icon>
          </vaadin-button>
        </div>
      ` : ""}

      ${stats ? html`
        <div class="footer-group"><span>${formatBytes(stats.total_size)}</span></div>
        <div class="footer-group"><span>${stats.total_file_count.toLocaleString()} files</span></div>
      ` : ""}

      ${this._showPruneConfirm ? html`
        <div class="confirm-overlay" @click=${() => this._cancelPrune()}>
          <div class="confirm-dialog" @click=${(e: Event) => e.stopPropagation()}>
            <h3>Prune Repository</h3>
            <p>Prune will remove unused data from the repository.<br><br>This may take a while. Continue?</p>
            <div class="confirm-actions">
              <vaadin-button theme="small tertiary" @click=${() => this._cancelPrune()}>No</vaadin-button>
              <vaadin-button theme="small primary" @click=${() => this._confirmPrune()}>Yes</vaadin-button>
            </div>
          </div>
        </div>
      ` : ""}
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "restic-browser-app-footer": ResticBrowserAppFooter;
  }
}
