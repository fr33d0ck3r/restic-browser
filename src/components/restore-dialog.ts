import { MobxLitElement } from "@adobe/lit-mobx";
import { css, html } from "lit";
import { customElement, state } from "lit/decorators.js";
import { dialogRenderer } from "@vaadin/dialog/lit.js";
import { appState } from "../states/app-state";
import "@vaadin/dialog";
import "@vaadin/button";
import "./icons";


@customElement("restic-browser-restore-dialog")
export class RestoreDialog extends MobxLitElement {
  @state() private _wasRestoring = false;

  static styles = css`
    :host { display: block; }
    .restore-content {
      padding: 28px 32px;
      min-width: 280px;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 16px;
    }
    .restore-title {
      font-size: 13px;
      font-weight: 500;
      color: var(--lumo-body-text-color);
    }
    .progress-track {
      width: 100%;
      height: 4px;
      background: var(--lumo-contrast-10pct);
      border-radius: 2px;
      overflow: hidden;
    }
    .progress-bar {
      height: 100%;
      width: 35%;
      background: var(--lumo-primary-color);
      border-radius: 2px;
      animation: progress-slide 1.1s ease-in-out infinite;
    }
    @keyframes progress-slide {
      0% { transform: translateX(-120%); }
      100% { transform: translateX(320%); }
    }
    .restore-done {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 14px;
    }
    .success-icon {
      color: var(--lumo-success-color);
    }
    .error-icon {
      color: var(--lumo-error-color);
    }
  `;

  willUpdate() {
    const isRestoring = appState.isRestoring || appState.pendingFileDumps.length > 0;
    if (isRestoring) {
      this._wasRestoring = true;
    }
  }

  private _close() {
    this._wasRestoring = false;
    appState.restoreDialogError = "";
  }

  render() {
    const isRestoring = appState.isRestoring || appState.pendingFileDumps.length > 0;
    const done = this._wasRestoring && !isRestoring;

    if (!isRestoring && !done) {
      this._wasRestoring = false;
      return html``;
    }

    const hasError = !!appState.restoreDialogError;
    const message = isRestoring
      ? appState.maintenanceMessage || `Restoring '${appState.pendingFileDumps[appState.pendingFileDumps.length - 1]?.file.name || ""}'...`
      : hasError
        ? appState.restoreDialogError
        : "Restored";

    const content = done
      ? html`
          <div class="restore-content">
            <div class="restore-done">
              ${hasError
                ? html`<tabler-icon name="circle-x" size="32" class="error-icon"></tabler-icon>`
                : html`<tabler-icon name="check" size="32" class="success-icon"></tabler-icon>`}
              <span class="restore-title">${message}</span>
              <vaadin-button theme="primary" @click=${() => this._close()}>OK</vaadin-button>
            </div>
          </div>
        `
      : html`
          <div class="restore-content">
            <span class="restore-title">${message || "Restoring..."}</span>
            <div class="progress-track">
              <div class="progress-bar"></div>
            </div>
          </div>
        `;

    return html`
      <vaadin-dialog
        .opened=${true}
        .noCloseOnOutsideClick=${true}
        .noCloseOnEsc=${true}
        theme="no-padding"
        style="--lumo-overlay-shadow: 0 8px 32px rgba(0,0,0,0.25);"
        @opened-changed=${(e: CustomEvent) => {
          if (!e.detail.value) {
            this._close();
          }
        }}
        ${dialogRenderer(() => content, [done, message, hasError])}
      ></vaadin-dialog>
    `;
  }
}


declare global {
  interface HTMLElementTagNameMap {
    "restic-browser-restore-dialog": RestoreDialog;
  }
}
