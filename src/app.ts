import { MobxLitElement } from "@adobe/lit-mobx";
import type { DialogOpenedChangedEvent } from "@vaadin/dialog";
import { dialogRenderer } from "@vaadin/dialog/lit.js";
import { css, html, nothing } from "lit";
import { customElement, state } from "lit/decorators.js";

import { appState } from "./states/app-state";

import "./components/app-footer";
import "./components/file-list";
import "./components/snapshot-list";
import "./components/location-dialog";
import "./components/error-message";
import "./components/sidebar";
import "./components/details-pane";
import "@vaadin/dialog";
import "./components/icons";


@customElement("restic-browser-app")
export class ResticBrowserApp extends MobxLitElement {
  @state()
  
  private _showLocationDialog: boolean = false;

  @state()
  private _showSnapshotDialog: boolean = false;

  @state()
  private _showKeyboardHelp: boolean = false;

  @state()
  private _sidebarWidth: number = 260;

  @state()
  private _sidebarCollapsed: boolean = false;

  

  constructor() {
    super();
    this._keyDownHandler = this._keyDownHandler.bind(this);
  }

  private _keyDownHandler(event: KeyboardEvent) {
    if (event.ctrlKey && event.key === "o") {
      this._showLocationDialog = true;
      event.preventDefault();
    }
    if (event.ctrlKey && event.key === "s") {
      this._showSnapshotDialog = true;
      event.preventDefault();
    }
    if (event.ctrlKey && event.key === "?") {
      this._showKeyboardHelp = true;
      event.preventDefault();
    }
    if (event.key === "Escape" && this._showKeyboardHelp) {
      this._showKeyboardHelp = false;
      event.preventDefault();
    }
  }

  static styles = css`
    :host {
      display: block;
      width: 100vw;
      height: 100vh;
      overflow: hidden;
    }
    /* Dialog overlay theming */
    ::slotted(vaadin-dialog-overlay),
    vaadin-dialog-overlay {
      --lumo-overlay-shadow: 0 8px 32px rgba(0, 0, 0, 0.25);
      border-radius: var(--lumo-border-radius-xl) !important;
      border: 1px solid var(--lumo-contrast-20pct) !important;
    }

    .kbd-help-overlay {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.45);
      z-index: 500;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .kbd-help-dialog {
      background: var(--lumo-base-color);
      border-radius: var(--lumo-border-radius-xl);
      padding: 24px;
      max-width: 512px;
      width: 90vw;
      max-height: 80vh;
      overflow-y: auto;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.25);
      border: 1px solid var(--lumo-contrast-20pct);
    }
    .kbd-help-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 16px;
    }
    .kbd-help-title {
      font-size: 1.125rem;
      font-weight: 600;
    }
    .kbd-section {
      margin-bottom: 16px;
    }
    .kbd-section-title {
      font-size: 0.75rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--lumo-secondary-text-color);
      margin-bottom: 8px;
    }
    .kbd-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 6px 0;
      font-size: 0.875rem;
      border-bottom: 1px solid var(--lumo-contrast-5pct);
    }
    .kbd-keys {
      display: inline-flex;
      align-items: center;
      gap: 2px;
      font-family: monospace;
      font-size: 0.75rem;
    }
    .kbd-key {
      background: var(--lumo-contrast-10pct);
      padding: 2px 6px;
      border-radius: var(--lumo-border-radius-s);
      border: 1px solid var(--lumo-contrast-20pct);
    }
  `;

  connectedCallback(): void {
    super.connectedCallback();
    document.body.addEventListener("keydown", this._keyDownHandler);
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    document.body.removeEventListener("keydown", this._keyDownHandler);
  }

  private _getFileList(): any {
    return this.shadowRoot?.querySelector("restic-browser-file-list");
  }

  private _renderKeyboardHelp() {
    if (!this._showKeyboardHelp) return nothing;

    const shortcuts = [
      { section: "Navigation", items: [
        { key: "↑ / ↓", action: "Navigate files" },
        { key: "Enter", action: "Open selected file/folder" },
        { key: "Backspace", action: "Go to parent folder" },
        { key: "Ctrl+O", action: "Open repository dialog" },
        { key: "Ctrl+S", action: "Open snapshots dialog" },
      ]},
      { section: "Selection", items: [
        { key: "Ctrl+A", action: "Select all files" },
        { key: "Ctrl+Click", action: "Toggle selection" },
        { key: "Shift+Click", action: "Select range" },
      ]},
      { section: "Actions", items: [
        { key: "Ctrl+?", action: "Show this help" },
        { key: "Esc", action: "Close dialogs / exit search" },
      ]},
    ];

    return html`
      <div class="kbd-help-overlay"
        @click=${() => this._showKeyboardHelp = false}>
        <div class="kbd-help-dialog"
          @click=${(e: Event) => e.stopPropagation()}>
          <div class="kbd-help-header">
            <span class="kbd-help-title">Keyboard Shortcuts</span>
            <vaadin-button theme="small icon tertiary-inline" @click=${() => this._showKeyboardHelp = false}>
              <tabler-icon name="close"></tabler-icon>
            </vaadin-button>
          </div>
          ${shortcuts.map((section) => html`
            <div class="kbd-section">
              <div class="kbd-section-title">${section.section}</div>
              ${section.items.map((item) => html`
                <div class="kbd-row">
                  <span>${item.action}</span>
                  <span class="kbd-keys">
                    ${item.key.split("+").map((k, i) => html`
                      ${i > 0 ? " + " : ""}
                      <span class="kbd-key">${k.trim()}</span>
                    `)}
                  </span>
                </div>
              `)}
            </div>
          `)}
        </div>
      </div>
    `;
  }

  render() {
    const locationDialog = this._showLocationDialog
      ? html`
        <restic-browser-location-dialog
          .onClose=${() => {
            this._showLocationDialog = false;
            appState.openRepository();
          }}
          .onCancel=${() => {
            this._showLocationDialog = false;
          }}>
        </restic-browser-location-dialog>
      `
      : nothing;

    const snapshotDialog = html`
      <vaadin-dialog
        .opened=${this._showSnapshotDialog}
        @opened-changed=${(e: DialogOpenedChangedEvent) => { if (!e.detail.value) this._showSnapshotDialog = false; }}
        theme="no-padding"
        style="--lumo-overlay-shadow: 0 8px 32px rgba(0, 0, 0, 0.25);"
        ${dialogRenderer(() => html`
          <div style="width: 85vw; max-width: 1200px; height: 75vh; max-height: 800px;">
            <restic-browser-snapshot-list style="height: 100%;"
              @close-snapshots=${() => { this._showSnapshotDialog = false; }}>
            </restic-browser-snapshot-list>
          </div>
        `, [])}
      ></vaadin-dialog>
    `;

    const sidebarWidth = this._sidebarCollapsed ? 0 : this._sidebarWidth;

    const commonLayout = html`
      <div style="display: flex; flex-direction: column; width: 100vw; height: 100vh; overflow: hidden;">
        <div style="display: flex; flex: 1; min-height: 0; overflow: hidden;">
          <div style="width: ${sidebarWidth}px; flex-shrink: 0; height: 100%; border-right: 1px solid var(--lumo-contrast-10pct); overflow: hidden; transition: width 200ms;"
            ?hidden=${this._sidebarCollapsed}>
            <restic-browser-sidebar style="height: 100%;"
              @navigate-to-path=${(e: CustomEvent) => {
                const fileList = this._getFileList();
                if (fileList) fileList._setRootPath?.(e.detail.path);
                const sidebar = this.shadowRoot?.querySelector("restic-browser-sidebar") as any;
                if (sidebar) sidebar.expandToPath?.(e.detail.path);
              }}
              @open-repository=${() => { this._showLocationDialog = true; }}
            ></restic-browser-sidebar>
          </div>
          ${!this._sidebarCollapsed ? html`
            <div style="width: 4px; cursor: col-resize; flex-shrink: 0; background: transparent;"
              @mousedown=${(e: MouseEvent) => {
                e.preventDefault();
                const startX = e.clientX;
                const startWidth = this._sidebarWidth;
                const onMove = (ev: MouseEvent) => {
                  const newWidth = Math.max(160, Math.min(480, startWidth + ev.clientX - startX));
                  this._sidebarWidth = newWidth;
                };
                const onUp = () => {
                  document.removeEventListener("mousemove", onMove);
                  document.removeEventListener("mouseup", onUp);
                };
                document.addEventListener("mousemove", onMove);
                document.addEventListener("mouseup", onUp);
              }}
            ></div>
          ` : ""}
          <div style="display: flex; flex-direction: column; flex: 1; min-width: 0; overflow: hidden;">
            <restic-browser-file-list style="flex: 1; min-height: 0;"
              @toggle-sidebar=${() => { this._sidebarCollapsed = !this._sidebarCollapsed; }}
              @navigate-to-path=${(e: CustomEvent) => {
                const sidebar = this.shadowRoot?.querySelector("restic-browser-sidebar") as any;
                if (sidebar) sidebar.expandToPath?.(e.detail.path);
              }}
            ></restic-browser-file-list>
          </div>
        </div>

        <restic-browser-app-footer style="flex-shrink: 0;"
          @open-snapshots=${() => { this._showSnapshotDialog = true; }}
          @open-repository=${() => { this._showLocationDialog = true; }}
        ></restic-browser-app-footer>
      </div>
    `;

    if (!appState.presetsLoaded) {
      return html`
        <div style="display: flex; flex-direction: column; width: 100vw; height: 100vh; overflow: hidden;">
          <div style="display: flex; flex: 1; min-height: 0; align-items: center; justify-content: center;">
            <tabler-icon name="spinner" class="animate-spin" size="32"></tabler-icon>
          </div>
        </div>
      `;
    }

    if (appState.repoError || !appState.repoLocation.path) {
      const presets = appState.locationPresets.slice(1);
      const hasNoPresets = presets.length === 0;
      const errorMessage = appState.repoError
        ? `Failed to open repository: ${appState.repoError}`
        : "No repository selected";
      return html`
        <div style="display: flex; flex-direction: column; width: 100vw; height: 100vh; overflow: hidden;">
          <div style="display: flex; flex: 1; min-height: 0; align-items: center; justify-content: center;">
            <restic-browser-error-message
                type=${appState.repoError ? "error" : "info"}
                message=${errorMessage}>
            </restic-browser-error-message>
          </div>
          <restic-browser-app-footer style="flex-shrink: 0;"
            @open-snapshots=${() => { this._showSnapshotDialog = true; }}
            @open-repository=${() => { this._showLocationDialog = true; }}
          ></restic-browser-app-footer>
        </div>
        ${hasNoPresets ? html`
          <restic-browser-location-dialog
            .onClose=${() => {
              this._showLocationDialog = false;
              appState.openRepository();
            }}
            .onCancel=${() => {
              this._showLocationDialog = false;
            }}>
          </restic-browser-location-dialog>
        ` : locationDialog}
        ${snapshotDialog}
        ${this._renderKeyboardHelp()}
      `;
    }

    return html`
      ${commonLayout}
      ${locationDialog}
      ${snapshotDialog}
      ${this._renderKeyboardHelp()}
      <restic-browser-window-resize-overlay></restic-browser-window-resize-overlay>
    `;
  }
}


declare global {
  interface HTMLElementTagNameMap {
    "restic-browser-app": ResticBrowserApp;
  }
}
