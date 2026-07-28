import { MobxLitElement } from "@adobe/lit-mobx";
import { css, html } from "lit";
import { customElement, state } from "lit/decorators.js";
import * as mobx from "mobx";
import prettyBytes from "pretty-bytes";

import "@vaadin/button";
import "@vaadin/vertical-layout";
import "@vaadin/horizontal-layout";
import "./icons";

import { appState } from "../states/app-state";
import { restic } from "../backend/restic";
import "./file-icon";


@customElement("restic-browser-details-pane")
export class ResticBrowserDetailsPane extends MobxLitElement {
  @state()
  private _isCollapsed = false;

  @state()
  private _width = 280;

  private _resizeStartX = 0;
  private _resizeStartWidth = 0;
  private _isResizing = false;

  constructor() {
    super();
    mobx.makeObservable(this);
  }

  private _toggleCollapse() {
    this._isCollapsed = !this._isCollapsed;
  }

  private _startResize(e: MouseEvent) {
    this._isResizing = true;
    this._resizeStartX = e.clientX;
    this._resizeStartWidth = this._width;
    document.addEventListener("mousemove", this._onResizeMove);
    document.addEventListener("mouseup", this._onResizeEnd);
    e.preventDefault();
  }

  private _onResizeMove = (e: MouseEvent) => {
    if (!this._isResizing) return;
    const delta = this._resizeStartX - e.clientX;
    const newWidth = Math.max(200, Math.min(500, this._resizeStartWidth + delta));
    this._width = newWidth;
  };

  private _onResizeEnd = () => {
    this._isResizing = false;
    document.removeEventListener("mousemove", this._onResizeMove);
    document.removeEventListener("mouseup", this._onResizeEnd);
  };

  private _formatMode(mode?: number): string {
    if (mode === undefined) return "-";
    const octal = (mode & 0xffff).toString(8).padStart(4, "0");
    return octal;
  }

  private _formatTime(time?: string): string {
    if (!time) return "-";
    const date = new Date(time);
    if (isNaN(date.getTime())) return "-";
    return date.toLocaleString();
  }

  private _getFileTypeLabel(file: restic.File): string {
    if (file.type === "dir") return "Folder";
    const ext = file.name.split(".").pop()?.toLowerCase() || "";
    if (ext) return `${ext.toUpperCase()} File`;
    return "File";
  }

  private _onOpen() {
    const file = appState.selectedFiles[0];
    if (file && file.type !== "dir") {
      appState.openFile(file).catch((err: Error) => {
        import("@vaadin/notification").then(({ Notification }) => {
          Notification.show(`Failed to open file: ${err.message}`, {
            position: "middle",
            theme: "error",
            duration: 5000,
          });
        });
      });
    }
  }

  private _onRestore() {
    const files = appState.selectedFiles.filter((f) => f.name !== "..");
    if (files.length === 0) return;
    appState
      .restoreSelectedFiles()
      .catch((err: Error) => {
        import("@vaadin/notification").then(({ Notification }) => {
          Notification.show(`Restore failed: ${err.message}`, {
            position: "middle",
            theme: "error",
            duration: 5000,
          });
        });
      });
  }

  private _onCopyPath() {
    const file = appState.selectedFiles[0];
    if (!file) return;
    navigator.clipboard
      .writeText(file.path)
      .then(() => {
        import("@vaadin/notification").then(({ Notification }) => {
          Notification.show("Path copied to clipboard", {
            position: "bottom-center",
            theme: "success",
            duration: 2000,
          });
        });
      })
      .catch(() => {
        import("@vaadin/notification").then(({ Notification }) => {
          Notification.show("Failed to copy path", {
            position: "bottom-center",
            theme: "error",
            duration: 2000,
          });
        });
      });
  }

  static styles = css`
    :host {
      display: flex;
      flex-direction: row;
      height: 100%;
      flex-shrink: 0;
    }
    .pane {
      display: flex;
      flex-direction: column;
      height: 100%;
      background: var(--lumo-base-color);
      border-left: 1px solid var(--lumo-contrast-10pct);
      overflow: hidden;
      transition: width 0.15s ease;
    }
    .pane.collapsed {
      width: 36px !important;
    }
    .resize-handle {
      width: 4px;
      cursor: col-resize;
      background: transparent;
      transition: background 0.15s;
      flex-shrink: 0;
    }
    .resize-handle:hover {
      background: var(--lumo-primary-color-50pct);
    }
    .pane-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 8px 12px;
      border-bottom: 1px solid var(--lumo-contrast-10pct);
      flex-shrink: 0;
    }
    .pane-title {
      font-size: 13px;
      font-weight: 600;
      color: var(--lumo-body-text-color);
    }
    .pane-content {
      flex: 1;
      overflow-y: auto;
      padding: 12px;
    }
    .empty-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 100%;
      color: var(--lumo-tertiary-text-color);
      font-size: 13px;
      text-align: center;
      padding: 16px;
    }
    .file-preview {
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 16px 0;
      gap: 8px;
    }
    .file-icon-large {
      width: 64px;
      height: 64px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 8px;
      background: var(--lumo-contrast-5pct);
    }
    .file-name {
      font-size: 13px;
      font-weight: 600;
      text-align: center;
      word-break: break-word;
      max-width: 100%;
    }
    .file-type {
      font-size: 13px;
      color: var(--lumo-secondary-text-color);
    }
    .info-section {
      margin-top: 16px;
    }
    .info-section-title {
      font-size: 13px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: var(--lumo-secondary-text-color);
      margin-bottom: 8px;
      padding-bottom: 4px;
      border-bottom: 1px solid var(--lumo-contrast-5pct);
    }
    .info-row {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      padding: 6px 0;
      font-size: 13px;
      gap: 8px;
    }
    .info-row:not(:last-child) {
      border-bottom: 1px solid var(--lumo-contrast-5pct);
    }
    .info-label {
      color: var(--lumo-secondary-text-color);
      flex-shrink: 0;
    }
    .info-value {
      color: var(--lumo-body-text-color);
      text-align: right;
      word-break: break-word;
      max-width: 60%;
    }
    .action-buttons {
      display: flex;
      gap: 4px;
      padding: 12px;
      border-top: 1px solid var(--lumo-contrast-10pct);
      flex-shrink: 0;
    }
    .collapsed-bar {
      display: flex;
      flex-direction: column;
      align-items: center;
      width: 36px;
      height: 100%;
      background: var(--lumo-base-color);
      border-left: 1px solid var(--lumo-contrast-10pct);
      padding-top: 8px;
      gap: 4px;
    }
    .collapsed-bar vaadin-button {
      min-width: 28px;
      width: 28px;
      height: 28px;
      padding: 0;
    }
    .selection-count {
      font-size: 13px;
      color: var(--lumo-secondary-text-color);
      text-align: center;
      padding: 4px 0;
    }
    .multi-select-hint {
      font-size: 13px;
      color: var(--lumo-secondary-text-color);
      text-align: center;
      padding: 8px;
      font-style: italic;
    }
  `;

  render() {
    const selectedFiles = appState.selectedFiles;
    const hasSelection = selectedFiles.length > 0 && selectedFiles[0].name !== "..";
    const fileCount = selectedFiles.filter((f) => f.name !== "..").length;

    if (this._isCollapsed) {
      return html`
        <div class="collapsed-bar">
          <vaadin-button theme="small icon tertiary-inline" @click=${this._toggleCollapse} title="Expand details pane">
            <tabler-icon name="angle-left"></tabler-icon>
          </vaadin-button>
          ${fileCount > 0
            ? html`
                <span style="font-size: 10px; color: var(--lumo-primary-color); font-weight: 600;">${fileCount}</span>
              `
            : ""}
        </div>
      `;
    }

    return html`
      <div class="resize-handle" @mousedown=${this._startResize}></div>
      <div class="pane" style="width: ${this._width}px;">
        <div class="pane-header">
          <span class="pane-title">Details</span>
          <vaadin-button theme="small icon tertiary-inline" @click=${this._toggleCollapse} title="Collapse">
            <tabler-icon name="angle-right"></tabler-icon>
          </vaadin-button>
        </div>

        <div class="pane-content">
          ${!hasSelection
            ? html`
                <div class="empty-state">
                  <tabler-icon name="info-circle" style="width: 32px; height: 32px; margin-bottom: 8px; color: var(--lumo-tertiary-text-color);"></tabler-icon>
                  <span>Select a file or folder to view details</span>
                </div>
              `
            : fileCount > 1
              ? html`
                  <div class="file-preview">
                    <div class="file-icon-large">
                      <tabler-icon name="copy" style="width: 32px; height: 32px; color: var(--lumo-primary-color);"></tabler-icon>
                    </div>
                    <span class="file-name">${fileCount} items selected</span>
                    <span class="file-type">Multiple selection</span>
                  </div>
                  <div class="info-section">
                    <div class="info-section-title">Selection</div>
                    <div class="info-row">
                      <span class="info-label">Items</span>
                      <span class="info-value">${fileCount}</span>
                    </div>
                    <div class="info-row">
                      <span class="info-label">Total size</span>
                      <span class="info-value">
                        ${prettyBytes(
                          selectedFiles
                            .filter((f) => f.name !== "..")
                            .reduce((sum, f) => sum + (f.size || 0), 0),
                        )}
                      </span>
                    </div>
                  </div>
                  <div class="multi-select-hint">Select a single item to see full details</div>
                `
              : this._renderSingleFileDetails(selectedFiles[0])}
        </div>

        ${hasSelection && fileCount === 1
          ? html`
              <div class="action-buttons">
                <vaadin-button theme="small tertiary-inline" ?disabled=${selectedFiles[0].type === "dir"} @click=${this._onOpen}>
                  <tabler-icon name="eye" slot="prefix"></tabler-icon>
                  Open
                </vaadin-button>
                <vaadin-button theme="small tertiary-inline" @click=${this._onRestore}>
                  <tabler-icon name="download" slot="prefix"></tabler-icon>
                  Restore
                </vaadin-button>
                <vaadin-button theme="small tertiary-inline" @click=${this._onCopyPath}>
                  <tabler-icon name="copy" slot="prefix"></tabler-icon>
                </vaadin-button>
              </div>
            `
          : hasSelection && fileCount > 1
            ? html`
                <div class="action-buttons">
                  <vaadin-button theme="small tertiary-inline" @click=${this._onRestore}>
                    <tabler-icon name="download" slot="prefix"></tabler-icon>
                    Restore All
                  </vaadin-button>
                </div>
              `
            : ""}
      </div>
    `;
  }

  private _renderSingleFileDetails(file: restic.File) {
    const isDir = file.type === "dir";

    return html`
      <div class="file-preview">
        <div class="file-icon-large">
          <restic-browser-file-icon
            .filename=${file.name}
            .fileType=${isDir ? "dir" : "file"}
            .size=${32}
          ></restic-browser-file-icon>
        </div>
        <span class="file-name">${file.name}</span>
        <span class="file-type">${this._getFileTypeLabel(file)}</span>
      </div>

      <div class="info-section">
        <div class="info-section-title">General</div>
        <div class="info-row">
          <span class="info-label">Size</span>
          <span class="info-value">${file.size !== undefined ? prettyBytes(file.size) : isDir ? "—" : "Unknown"}</span>
        </div>
        <div class="info-row">
          <span class="info-label">Type</span>
          <span class="info-value">${isDir ? "Directory" : "File"}</span>
        </div>
        <div class="info-row">
          <span class="info-label">Mode</span>
          <span class="info-value">${this._formatMode(file.mode)}</span>
        </div>
      </div>

      <div class="info-section">
        <div class="info-section-title">Location</div>
        <div class="info-row">
          <span class="info-label">Path</span>
          <span class="info-value">${file.path}</span>
        </div>
        ${file.uid !== undefined
          ? html`
              <div class="info-row">
                <span class="info-label">UID</span>
                <span class="info-value">${file.uid}</span>
              </div>
            `
          : ""}
        ${file.gid !== undefined
          ? html`
              <div class="info-row">
                <span class="info-label">GID</span>
                <span class="info-value">${file.gid}</span>
              </div>
            `
          : ""}
      </div>

      <div class="info-section">
        <div class="info-section-title">Timestamps</div>
        <div class="info-row">
          <span class="info-label">Created</span>
          <span class="info-value">${this._formatTime(file.ctime)}</span>
        </div>
        <div class="info-row">
          <span class="info-label">Modified</span>
          <span class="info-value">${this._formatTime(file.mtime)}</span>
        </div>
        <div class="info-row">
          <span class="info-label">Accessed</span>
          <span class="info-value">${this._formatTime(file.atime)}</span>
        </div>
      </div>
    `;
  }
}


declare global {
  interface HTMLElementTagNameMap {
    "restic-browser-details-pane": ResticBrowserDetailsPane;
  }
}
