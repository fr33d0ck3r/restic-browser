import { MobxLitElement } from "@adobe/lit-mobx";
import type {
  Grid,
  GridActiveItemChangedEvent,
  GridColumn,
  GridItemModel,
} from "@vaadin/grid";
import { css, html, type PropertyValues, render } from "lit";
import { customElement, query, state } from "lit/decorators.js";
import * as mobx from "mobx";
import prettyBytes from "pretty-bytes";
import { Notification } from "@vaadin/notification";

import type { restic } from "../backend/restic";
import { appState } from "../states/app-state";
import { resticApp } from "../backend/app";

import "./spinner";

import "@vaadin/horizontal-layout";
import "@vaadin/grid";
import "@vaadin/grid/vaadin-grid-sort-column.js";
import "@vaadin/grid/vaadin-grid-selection-column.js";
import "@vaadin/button";
import "./icons";


@customElement("restic-browser-snapshot-list")
export class ResticBrowserSnapshotList extends MobxLitElement {
  @query("#grid")
  private _grid!: Grid<restic.Snapshot> | null;
  private _recalculateColumnWidths: boolean = false;

  private _actionDisposers: mobx.IReactionDisposer[] = [];

  
  private _loadingSizes = new Set<string>();

  @state()
  private _selectedItems: restic.Snapshot[] = [];

  @state()
  private _showConfirmDialog: boolean = false;

  constructor() {
    super();
    this._timeRenderer = this._timeRenderer.bind(this);
    this._shortIdRenderer = this._shortIdRenderer.bind(this);
    this._sizeRenderer = this._sizeRenderer.bind(this);
  }

  connectedCallback() {
    super.connectedCallback();
    this._actionDisposers.push(
      mobx.reaction(
        () => appState.snapShots,
        () => { this._recalculateColumnWidths = true; },
        { fireImmediately: true },
      ),
      mobx.reaction(
        () => appState.snapshotSizes.size,
        () => { this._recalculateColumnWidths = true; this.requestUpdate(); },
      ),
    );
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    for (const disposer of this._actionDisposers) {
      disposer();
    }
    this._actionDisposers = [];
  }

  private _activeItemChanged(e: GridActiveItemChangedEvent<restic.Snapshot>) {
    const item = e.detail.value;
    if (item && appState.snapShots.includes(item)) {
      appState.setNewSnapshotId(item.id);
    }
  }

  private _selectedItemsChanged(e: CustomEvent) {
    this._selectedItems = (e.detail.value as restic.Snapshot[]) || [];
    appState.setSelectedSnapshotIDs(this._selectedItems.map((s) => s.id));
  }

  private _onForgetClick() {
    if (this._selectedItems.length === 0) return;
    this._showConfirmDialog = true;
  }

  private _confirmForget() {
    this._showConfirmDialog = false;
    appState.deleteSelectedSnapshots().catch((err) => {
      console.error("Failed to forget snapshots:", err);
    });
  }

  private _cancelForget() {
    this._showConfirmDialog = false;
  }

  private _onCheckClick() {
    appState.checkRepository().catch((err) => {
      console.error("Failed to check repository:", err);
    });
  }

  private _onBackupClick() {
    appState.createBackup().catch((err) => {
      console.error("Failed to create backup:", err);
    });
  }

  private _onRestoreClick() {
    if (!appState.selectedSnapshotID) return;
    appState
      .restoreSnapshot(appState.selectedSnapshotID)
      .catch((err) => {
        Notification.show(`Restore failed: ${err.message || err}`, {
          position: "middle",
          theme: "error",
          duration: 5000,
        });
      });
  }

  private _onCloseClick() {
    this.dispatchEvent(new CustomEvent("close-snapshots", { bubbles: true, composed: true }));
  }

  private _selectAndClose(snap: restic.Snapshot) {
    appState.setNewSnapshotId(snap.id);
    this.dispatchEvent(new CustomEvent("close-snapshots", { bubbles: true, composed: true }));
  }

  private _shortIdRenderer(
    root: HTMLElement,
    _column: GridColumn<restic.Snapshot>,
    model: GridItemModel<restic.Snapshot>,
  ) {
    const snap = model.item;
    const isActive = snap.id === appState.selectedSnapshotID;
    render(html`
      <span
        style="cursor: pointer; color: var(--lumo-body-text-color); font-weight: ${isActive ? 600 : 400};"
        @click=${() => this._selectAndClose(snap)}
        title="Select snapshot"
      >${snap.short_id}</span>
    `, root);
  }

  private _timeRenderer(
    root: HTMLElement,
    _column: GridColumn<restic.Snapshot>,
    model: GridItemModel<restic.Snapshot>,
  ) {
    render(html`${new Date(model.item.time).toLocaleString()}`, root);
  }

  private _sizeRenderer(
    root: HTMLElement,
    _column: GridColumn<restic.Snapshot>,
    model: GridItemModel<restic.Snapshot>,
  ) {
    const snap = model.item;
    const cachedSize = appState.snapshotSizes.get(snap.id);

    if (cachedSize !== undefined) {
      render(html`${prettyBytes(cachedSize)}`, root);
      return;
    }

    
    if (!this._loadingSizes.has(snap.id)) {
      this._loadingSizes.add(snap.id);
      resticApp.getRepoStats([snap.id])
        .then((stats) => {
          mobx.runInAction(() => {
            appState.snapshotSizes.set(snap.id, stats.total_size);
          });
        })
        .catch(() => {
          
        })
        .finally(() => {
          this._loadingSizes.delete(snap.id);
        });
    }

    render(html`<span style="color: var(--lumo-tertiary-text-color);">-</span>`, root);
  }

  static styles = css`
    :host {
      display: flex;
      flex-direction: column;
      position: relative;
    }
    #header {
      align-items: center;
      background: var(--lumo-shade-10pct);
      padding: 4px 8px;
      flex-wrap: wrap;
      gap: 8px;
    }
    #header #title {
      margin: 0px 6px;
      padding: 4px 0px;
      margin-right: 12px;
    }
    #header .spacer {
      flex: 1;
    }
    #header vaadin-button {
      margin-right: 2px;
    }

    #loading {
      height: 100%;
      align-items: center;
      justify-content: center;
    }
    #grid {
      height: 100%;
      flex: 1;
      margin: 0px 8px;
      scrollbar-gutter: stable;
    }

    /* Confirm dialog overlay */
    .confirm-overlay {
      position: fixed;
      top: 0; left: 0; right: 0; bottom: 0;
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
    .confirm-dialog .warning {
      color: var(--lumo-error-text-color);
      font-weight: 500;
    }
    .confirm-actions {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
    }
  `;

  firstUpdated() {
    if (this._grid) {
      this._grid.recalculateColumnWidths();
    }
  }

  updated(changedProperties: PropertyValues) {
    super.updated(changedProperties);
    if (this._recalculateColumnWidths) {
      this._recalculateColumnWidths = false;
      if (this._grid) {
        this._grid.recalculateColumnWidths();
      }
    }
  }

  private _renderConfirmDialog() {
    if (!this._showConfirmDialog) return html``;

    return html`
      <div class="confirm-overlay" @click=${this._cancelForget}>
        <div class="confirm-dialog" @click=${(e: Event) => e.stopPropagation()}>
          <h3>Forget Snapshots</h3>
          <p>
            Are you sure you want to forget ${this._selectedItems.length} snapshot(s)?
            <br><br>
            <span class="warning">This action cannot be undone.</span>
          </p>
          <div class="confirm-actions">
            <vaadin-button theme="small tertiary-inline" @click=${this._cancelForget}>Cancel</vaadin-button>
            <vaadin-button theme="small tertiary-inline" @click=${this._confirmForget}>Forget</vaadin-button>
          </div>
        </div>
      </div>
    `;
  }

  render() {
    const isDeleting = appState.isDeletingSnapshots;
    const totalCount = appState.snapShots.length;
    const selectedCount = this._selectedItems.length;
    const hasSelection = selectedCount > 0;

    const header = html`
      <vaadin-horizontal-layout id="header">
        <strong id="title">Snapshots (${totalCount})</strong>

        <vaadin-button
          theme="small tertiary-inline"
          ?disabled=${!appState.selectedSnapshotID || isDeleting}
          @click=${this._onRestoreClick}
          title="Restore snapshot to directory"
        >
          <tabler-icon name="cloud-download" size="18" slot="prefix"></tabler-icon>
          Restore
        </vaadin-button>

        <vaadin-button
          theme="small tertiary-inline"
          ?disabled=${!hasSelection || isDeleting}
          @click=${this._onCheckClick}
          title="Check repository"
        >
          <tabler-icon name="check-circle" size="18" slot="prefix"></tabler-icon>
          Check
        </vaadin-button>

        <vaadin-button
          theme="small tertiary-inline"
          ?disabled=${isDeleting}
          @click=${this._onBackupClick}
          title="Create backup"
        >
          <tabler-icon name="cloud-upload" size="18" slot="prefix"></tabler-icon>
          Backup
        </vaadin-button>

        <vaadin-button
          theme="small tertiary-inline"
          ?disabled=${!hasSelection || isDeleting}
          @click=${this._onForgetClick}
          title="Forget selected snapshots"
        >
          <tabler-icon name="trash" size="18" slot="prefix"></tabler-icon>
          ${isDeleting ? "Forgetting..." : "Forget"}
        </vaadin-button>

        <span class="spacer"></span>

        <vaadin-button
          theme="small icon tertiary-inline"
          @click=${this._onCloseClick}
          title="Close"
        >
          <tabler-icon name="close" size="18"></tabler-icon>
        </vaadin-button>
      </vaadin-horizontal-layout>
    `;

    if (appState.isLoadingSnapshots > 0) {
      return html`
        ${header}
        <vaadin-horizontal-layout id="loading">
          <restic-browser-spinner size="24px"></restic-browser-spinner>
        </vaadin-horizontal-layout>
        ${this._renderConfirmDialog()}
      `;
    }

    return html`
      ${header}
      <vaadin-grid
        id="grid"
        theme="compact no-border"
        .items=${appState.snapShots}
        .selectedItems=${this._selectedItems}
        @active-item-changed=${this._activeItemChanged}
        @selected-items-changed=${this._selectedItemsChanged}
      >
        <vaadin-grid-selection-column .autoWidth=${true} .flexGrow=${0}></vaadin-grid-selection-column>
        <vaadin-grid-column .flexGrow=${0} .autoWidth=${true} path="short_id" .renderer=${this._shortIdRenderer}></vaadin-grid-column>
        <vaadin-grid-sort-column .flexGrow=${0} .autoWidth=${true} path="time"
           .renderer=${this._timeRenderer} direction="desc"></vaadin-grid-sort-column>
        <vaadin-grid-column .flexGrow=${0} .autoWidth=${true} header="Size" .renderer=${this._sizeRenderer}></vaadin-grid-column>
        <vaadin-grid-sort-column .flexGrow=${1} path="paths"></vaadin-grid-sort-column>
        <vaadin-grid-sort-column .flexGrow=${0} .autoWidth=${true} path="tags"></vaadin-grid-sort-column>
        <vaadin-grid-sort-column .flexGrow=${0} .autoWidth=${true} path="hostname"></vaadin-grid-sort-column>
      </vaadin-grid>
      ${this._renderConfirmDialog()}
    `;
  }
}


declare global {
  interface HTMLElementTagNameMap {
    "restic-browser-snapshot-list": ResticBrowserSnapshotList;
  }
}
