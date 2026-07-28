import { MobxLitElement } from "@adobe/lit-mobx";
import type {
  Grid,
  GridActiveItemChangedEvent,
  GridColumn,
  GridItemModel,
} from "@vaadin/grid";
import { Notification } from "@vaadin/notification";
import { css, html, render } from "lit";
import { customElement, query, state } from "lit/decorators.js";
import * as mobx from "mobx";
import prettyBytes from "pretty-bytes";

import { restic } from "../backend/restic";
import { appState } from "../states/app-state";
import {
  getParentPath,
  normalizePath,
} from "../utils/file-operations";

import "./error-message";
import "./spinner";
import "./file-icon";
import "./context-menu";
import { type ContextMenuItem, getFileContextMenuItems } from "./context-menu";

import "@vaadin/grid";
import "@vaadin/grid/vaadin-grid-sort-column.js";
import "@vaadin/grid/vaadin-grid-selection-column.js";
import "@vaadin/grid/vaadin-grid-selection-column.js";
import "@vaadin/text-field";
import "@vaadin/button";
import "@vaadin/notification";
import "@vaadin/dialog";
import "@vaadin/vertical-layout";
import "./icons";

import { FileListDataProvider } from "./file-list-data-provider";


type ViewMode = "list" | "grid";


type SortField = "name" | "size" | "mtime" | "type";
type SortDirection = "asc" | "desc";

interface SortOption {
  field: SortField;
  direction: SortDirection;
}


@customElement("restic-browser-file-list")
export class ResticBrowserFileList extends MobxLitElement {
  @mobx.observable
  private _rootPath: string = "";

  
  private _fileDataProvider = new FileListDataProvider();

  @state()
  private _fetchError: string = "";

  @state()
  private _selectedFiles: restic.File[] = [];

  @state()
  private _searchQuery: string = "";

  @state()
  private _isSearchMode: boolean = false;

  @state()
  private _viewMode: ViewMode = "list";
  @state()
  private _gridVisibleCount: number = 100;

  @state()
  private _sortOption: SortOption = { field: "name", direction: "asc" };

  @state()
  private _sidebarOpen: boolean = true;

  @state()
  private _contextMenuItems: ContextMenuItem[] = [];

  @state()
  private _contextMenuX = 0;

  @state()
  private _contextMenuY = 0;

  @state()
  private _contextMenuVisible = false;

  @state()
  private _lastClickedIndex = -1;

  @state()
  private _dragOverItem: string | null = null;

  @state()
  private _isLassoSelecting = false;

  @state()
  private _lassoLeft = 0;

  @state()
  private _lassoTop = 0;

  @state()
  private _lassoWidth = 0;

  @state()
  private _lassoHeight = 0;

  @query("#grid")
  private _grid!: Grid<restic.File> | null;

  private _actionDisposers: mobx.IReactionDisposer[] = [];

  constructor() {
    super();
    mobx.makeObservable(this);

    
    const savedView = localStorage.getItem("restic-browser.viewMode");
    if (savedView === "list" || savedView === "grid") {
      this._viewMode = savedView;
    }

    
    this._nameRenderer = this._nameRenderer.bind(this);
    this._modeRenderer = this._modeRenderer.bind(this);
    this._cTimeRenderer = this._cTimeRenderer.bind(this);
    this._mTimeRenderer = this._mTimeRenderer.bind(this);
    this._aTimeRenderer = this._aTimeRenderer.bind(this);
  }

  connectedCallback(): void {
    super.connectedCallback();
    
    this._actionDisposers.push(
      mobx.reaction(
        () =>
          appState.repoLocation.type +
          ":" +
          appState.repoLocation.path +
          ":" +
          appState.selectedSnapshotID +
          ":" +
          this._rootPath,
        () => {
          this._fetchFiles();
        },
        { fireImmediately: true },
      ),
    );

    
    document.addEventListener("keydown", this._globalKeyDown.bind(this));
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    for (const disposer of this._actionDisposers) {
      disposer();
    }
    this._actionDisposers = [];
    document.removeEventListener("keydown", this._globalKeyDown.bind(this));
  }

  @mobx.action
  private _setRootPath(newPath: string): void {
    this._rootPath = newPath;
    this.dispatchEvent(new CustomEvent("navigate-to-path", { detail: { path: newPath }, bubbles: true, composed: true }));
  }

  private _openFile(file: restic.File): void {
    appState.openFile(file).catch((err) => {
      Notification.show(`Failed to open file: ${err.message || err}`, {
        position: "middle",
        theme: "error",
        duration: 10000,
      });
    });
  }

  private _restoreFile(file: restic.File): void {
    appState.restoreFile(file)
      .catch((err) => {
        Notification.show(`Restore failed: ${err.message || err}`, {
          position: "middle",
          theme: "error",
          duration: 5000,
        });
      });
  }

  private _copyPath(file: restic.File): void {
    navigator.clipboard.writeText(file.path).then(() => {
      Notification.show("Path copied to clipboard", {
        position: "bottom-center",
        theme: "success",
        duration: 2000,
      });
    }).catch(() => {
      const textarea = document.createElement("textarea");
      textarea.value = file.path;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      Notification.show("Path copied to clipboard", {
        position: "bottom-center",
        theme: "success",
        duration: 2000,
      });
    });
  }

  private _doSearch(): void {
    if (!this._searchQuery.trim()) {
      this._exitSearchMode();
      return;
    }
    this._isSearchMode = true;
    const snapshotIds = appState.selectedSnapshotIDs.length > 1
      ? appState.selectedSnapshotIDs
      : appState.selectedSnapshotID ? [appState.selectedSnapshotID] : undefined;
    appState.searchFiles(this._searchQuery, snapshotIds)
      .then(() => {
        this._selectedFiles = [];
        const results = appState.searchResults;
        console.log(`Search returned ${results.length} results`);
        this._fileDataProvider.files = this._sortFiles(results);
        this._gridVisibleCount = 100;
        if (this._grid) {
          this._grid.clearCache();
          this._grid.requestContentUpdate();
        }
        this.requestUpdate();
      })
      .catch((err) => {
        Notification.show(`Search failed: ${err.message || err}`, {
          position: "middle",
          theme: "error",
        });
        this._isSearchMode = false;
      });
  }

  private _exitSearchMode(): void {
    this._isSearchMode = false;
    this._searchQuery = "";
    appState.clearSearch();
    this._fetchFiles();
  }

  private _parentRootPath(path: string): string | undefined {
    return getParentPath(path);
  }

  private _fetchFiles() {
    if (this._isSearchMode) {
      return;
    }
    if (!appState.selectedSnapshotID) {
      this._fetchError = "No snapshot selected";
      this._selectedFiles = [];
      this._fileDataProvider.files = [];
      return;
    }
    const rootPath = this._rootPath;
    appState
      .fetchFiles(rootPath)
      .then((files) => {
        const normalizedRootPath = normalizePath(rootPath);
        files = files.filter((f) => normalizePath(f.path) !== normalizedRootPath);
        const parentRootPath = this._parentRootPath(rootPath);
        
        if (parentRootPath && this._viewMode === "list") {
          files.push(new restic.File({ name: "..", type: "dir", path: parentRootPath }));
        }
        
        if (this._viewMode === "grid") {
          files = files.filter((f) => f.name !== "..");
        }
        files = this._sortFiles(files);
        this._selectedFiles = [];
        this._gridVisibleCount = 100;
        this._fileDataProvider.files = files;
        if (this._grid) {
          this._grid.clearCache();
        }
        this._fetchError = "";
        if (this._grid) {
          this._grid.recalculateColumnWidths();
        }
      })
      .catch((error) => {
        this._fetchError = error.message || String(error);
        this._selectedFiles = [];
        this._fileDataProvider.files = [];
      });
  }

  private _sortFiles(files: restic.File[]): restic.File[] {
    const { field, direction } = this._sortOption;
    const multiplier = direction === "asc" ? 1 : -1;

    return [...files].sort((a, b) => {
      if (a.name === "..") return -1;
      if (b.name === "..") return 1;
      if (a.type === "dir" && b.type !== "dir") return -1;
      if (a.type !== "dir" && b.type === "dir") return 1;

      switch (field) {
        case "size":
          return ((a.size ?? 0) - (b.size ?? 0)) * multiplier;
        case "mtime":
          return (new Date(a.mtime || 0).getTime() - new Date(b.mtime || 0).getTime()) * multiplier;
        case "type":
          return (a.type || "").localeCompare(b.type || "") * multiplier;
        case "name":
        default:
          return a.name.localeCompare(b.name);
      }
    });
  }

  private _activeItemChanged(e: GridActiveItemChangedEvent<restic.File>) {
    const item = e.detail.value;
    if (!item) return;
  }

  private _onGridDoubleClick(e: MouseEvent) {
    const grid = this._grid;
    if (!grid) return;
    const context = (grid as any).getEventContext(e);
    const item = context?.item as restic.File | undefined;
    if (!item) return;
    e.preventDefault();
    e.stopPropagation();
    if (item.type === "dir") {
      this._setRootPath(item.path);
    } else {
      appState.setSelectedFiles([item]);
      this._openFile(item);
    }
  }

  private _selectedItemsChanged(e: CustomEvent) {
    const selected = (e.detail.value as restic.File[]) ?? [];
    if (this._areSelectionsEqual(selected, this._selectedFiles)) {
      return;
    }
    this._selectedFiles = selected;
    appState.setSelectedFiles(this._selectedFiles);
    this.requestUpdate();
  }

  private _areSelectionsEqual(a: restic.File[], b: restic.File[]): boolean {
    if (a.length !== b.length) return false;
    const pathsA = new Set(a.map((f) => f.path));
    return b.every((f) => pathsA.has(f.path));
  }

  private _keyDownHandler(event: KeyboardEvent) {
    const selectedFile = this._selectedFiles.length ? this._selectedFiles[0] : undefined;
    if (!selectedFile) {
      return;
    }

    const isOpenFileShortcut =
      !event.ctrlKey && (["Space", "Enter"].includes(event.code) || event.key === "o");

    if (isOpenFileShortcut) {
      if (selectedFile.type === "dir") {
        this._setRootPath(selectedFile.path);
      } else {
        this._openFile(selectedFile);
      }
      event.preventDefault();
    }
  }

  private _globalKeyDown(event: KeyboardEvent) {
    if (event.ctrlKey && event.key === "a" && !event.shiftKey) {
      const files = this._fileDataProvider.files;
      if (files.length > 0) {
        this._selectedFiles = [...files];
        appState.setSelectedFiles(this._selectedFiles);
        this.requestUpdate();
        event.preventDefault();
      }
    }
  }

  

  private _showContextMenu(file: restic.File, x: number, y: number) {
    const items = getFileContextMenuItems(file, {
      onOpen: () => {
        if (file.type === "dir") {
          this._setRootPath(file.path);
        } else {
          this._openFile(file);
        }
      },
      onRestore: () => this._restoreFile(file),
      onCopyPath: () => this._copyPath(file),
      onViewProperties: () => {
        appState.setSelectedFiles([file]);
        this.requestUpdate();
      },
    });

    this._contextMenuItems = items;
    this._contextMenuX = x;
    this._contextMenuY = y;
    this._contextMenuVisible = true;
    this.requestUpdate();
  }

  

  

  private _handleGridItemClick(file: restic.File, event: MouseEvent, index: number) {
    const files = this._fileDataProvider.files;

    if (event.ctrlKey || event.metaKey) {
      const idx = this._selectedFiles.findIndex((f) => f.path === file.path);
      if (idx >= 0) {
        this._selectedFiles = this._selectedFiles.filter((f) => f.path !== file.path);
      } else {
        this._selectedFiles = [...this._selectedFiles, file];
      }
    } else if (event.shiftKey && this._lastClickedIndex >= 0) {
      const start = Math.min(this._lastClickedIndex, index);
      const end = Math.max(this._lastClickedIndex, index);
      const rangeFiles = files.slice(start, end + 1);
      this._selectedFiles = rangeFiles;
    } else {
      this._selectedFiles = [file];
      this._lastClickedIndex = index;
    }

    appState.setSelectedFiles(this._selectedFiles);
    this.requestUpdate();
  }

  private _handleGridItemDblClick(file: restic.File) {
    if (file.type === "dir") {
      this._setRootPath(file.path);
    } else {
      appState.setSelectedFiles([file]);
      this._openFile(file);
    }
  }

  private _handleGridItemContextMenu(file: restic.File, event: MouseEvent) {
    event.preventDefault();
    if (!this._selectedFiles.find((f) => f.path === file.path)) {
      this._selectedFiles = [file];
      appState.setSelectedFiles(this._selectedFiles);
      this._lastClickedIndex = this._fileDataProvider.files.findIndex((f) => f.path === file.path);
    }
    this._showContextMenu(file, event.clientX, event.clientY);
  }

  

  private _handleDragStart(file: restic.File, event: DragEvent) {
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = "copy";
      event.dataTransfer.setData("text/plain", file.path);
      event.dataTransfer.setData("application/restic-file", JSON.stringify({
        path: file.path,
        name: file.name,
        type: file.type,
      }));
    }
  }

  private _handleDragOver(file: restic.File, event: DragEvent) {
    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = "copy";
    }
    this._dragOverItem = file.path;
    this.requestUpdate();
  }

  private _handleDragLeave() {
    this._dragOverItem = null;
    this.requestUpdate();
  }

  

  private _onGridViewMouseDown(e: MouseEvent) {
    const target = e.target as HTMLElement;
    if (target.closest(".grid-item") || e.button !== 0) return;
    const container = this.shadowRoot?.querySelector(".grid-view") as HTMLElement | null;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const startX = e.clientX - rect.left + container.scrollLeft;
    const startY = e.clientY - rect.top + container.scrollTop;
    this._isLassoSelecting = true;
    this._lassoLeft = startX;
    this._lassoTop = startY;
    this._lassoWidth = 0;
    this._lassoHeight = 0;

    const mouseMove = (ev: MouseEvent) => {
      const x = ev.clientX - rect.left + container.scrollLeft;
      const y = ev.clientY - rect.top + container.scrollTop;
      this._lassoLeft = Math.min(startX, x);
      this._lassoTop = Math.min(startY, y);
      this._lassoWidth = Math.abs(x - startX);
      this._lassoHeight = Math.abs(y - startY);

      const items = container.querySelectorAll(".grid-item");
      const selected: restic.File[] = [];
      items.forEach((el, i) => {
        const elRect = el.getBoundingClientRect();
        const cRect = container.getBoundingClientRect();
        const ex = elRect.left - cRect.left + container.scrollLeft;
        const ey = elRect.top - cRect.top + container.scrollTop;
        const ew = elRect.width;
        const eh = elRect.height;
        if (
          this._lassoLeft < ex + ew &&
          this._lassoLeft + this._lassoWidth > ex &&
          this._lassoTop < ey + eh &&
          this._lassoTop + this._lassoHeight > ey
        ) {
          const file = this._fileDataProvider.files[i];
          if (file) selected.push(file);
        }
      });
      this._selectedFiles = selected;
      appState.setSelectedFiles(selected);
      this.requestUpdate();
    };

    const mouseUp = () => {
      this._isLassoSelecting = false;
      this._lassoWidth = 0;
      this._lassoHeight = 0;
      document.removeEventListener("mousemove", mouseMove);
      document.removeEventListener("mouseup", mouseUp);
    };

    document.addEventListener("mousemove", mouseMove);
    document.addEventListener("mouseup", mouseUp);
  }

  

  private _nameRenderer(
    root: HTMLElement,
    _column: GridColumn<restic.File>,
    model: GridItemModel<restic.File>,
  ) {
    const displayName = this._isSearchMode ? model.item.path : model.item.name;
    const isDir = model.item.type === "dir";
    const isParent = model.item.name === "..";

    render(
      html`
        <div style="display: flex; align-items: center; min-width: 0;">
          <restic-browser-file-icon
            .filename=${model.item.name}
            .fileType=${isDir ? "dir" : "file"}
            .size=${16}
            .isParent=${isParent}
            style="margin-right: 6px; flex-shrink: 0;"
          ></restic-browser-file-icon>
          <span style="flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
            ${displayName}
          </span>
        </div>
      `,
      root,
    );
  }

  private _sizeRenderer(
    root: HTMLElement,
    _column: GridColumn<restic.File>,
    model: GridItemModel<restic.File>,
  ) {
    render(
      html`
        ${model.item.size ? prettyBytes(model.item.size) : "-"}
      `,
      root,
    );
  }

  private _modeRenderer(
    root: HTMLElement,
    _column: GridColumn<restic.File>,
    model: GridItemModel<restic.File>,
  ) {
    const file = model.item as restic.File & { modeOctal?: string };
    const modeStr = file.modeOctal ?? (model.item.mode ? (model.item.mode & 0xffff).toString(8) : "-");
    render(html`${modeStr}`, root);
  }

  private _aTimeRenderer(
    root: HTMLElement,
    _column: GridColumn<restic.File>,
    model: GridItemModel<restic.File>,
  ) {
    const file = model.item as restic.File & { formattedAtime?: string };
    const timeStr = file.formattedAtime ?? (model.item.atime ? new Date(model.item.atime).toLocaleString() : "-");
    render(html`${timeStr}`, root);
  }

  private _cTimeRenderer(
    root: HTMLElement,
    _column: GridColumn<restic.File>,
    model: GridItemModel<restic.File>,
  ) {
    const file = model.item as restic.File & { formattedCtime?: string };
    const timeStr = file.formattedCtime ?? (model.item.ctime ? new Date(model.item.ctime).toLocaleString() : "-");
    render(html`${timeStr}`, root);
  }

  private _mTimeRenderer(
    root: HTMLElement,
    _column: GridColumn<restic.File>,
    model: GridItemModel<restic.File>,
  ) {
    const file = model.item as restic.File & { formattedMtime?: string };
    const timeStr = file.formattedMtime ?? (model.item.mtime ? new Date(model.item.mtime).toLocaleString() : "-");
    render(html`${timeStr}`, root);
  }

  

  private _renderGridView() {
    const files = this._fileDataProvider.files;
    const visible = files.slice(0, this._gridVisibleCount);
    const hasMore = this._gridVisibleCount < files.length;

    return html`
      <div class="grid-view" @mousedown=${this._onGridViewMouseDown} @scroll=${this._onGridViewScroll}>
        ${visible.map((file, index) => {
          const isSelected = this._selectedFiles.some((f) => f.path === file.path);
          const isDragOver = this._dragOverItem === file.path;
          const isDir = file.type === "dir";
          const isParent = file.name === "..";

          return html`
            <div
              class="grid-item ${isSelected ? "selected" : ""} ${isDragOver ? "drag-over" : ""}"
              @click=${(e: MouseEvent) => this._handleGridItemClick(file, e, index)}
              @dblclick=${() => this._handleGridItemDblClick(file)}
              @contextmenu=${(e: MouseEvent) => this._handleGridItemContextMenu(file, e)}
              draggable="true"
              @dragstart=${(e: DragEvent) => this._handleDragStart(file, e)}
              @dragover=${(e: DragEvent) => this._handleDragOver(file, e)}
              @dragleave=${this._handleDragLeave}
              title="${file.name}${file.size ? "\n" + prettyBytes(file.size) : ""}"
            >
              <div class="grid-item-icon">
                <restic-browser-file-icon
                  .filename=${file.name}
                  .fileType=${isDir ? "dir" : "file"}
                  .size=${72}
                  .isParent=${isParent}
                ></restic-browser-file-icon>
              </div>
              <div class="grid-item-name">${file.name}</div>
            </div>
          `;
        })}
        ${hasMore ? html`<div class="grid-load-more-sentinel" style="width:100%;height:1px;grid-column:1/-1;"></div>` : ""}
        ${this._isLassoSelecting ? html`
          <div class="lasso"
            style="left:${this._lassoLeft}px;top:${this._lassoTop}px;width:${this._lassoWidth}px;height:${this._lassoHeight}px;"
          ></div>
        ` : ""}
      </div>
    `;
  }

  

  private _onGridContextMenu(e: MouseEvent) {
    e.preventDefault();
    const grid = this._grid;
    if (!grid) return;
    const context = (grid as any).getEventContext(e);
    const item = context?.item as restic.File | undefined;
    if (!item) return;
    if (!this._selectedFiles.find((f) => f.path === item.path)) {
      this._selectedFiles = [item];
      appState.setSelectedFiles(this._selectedFiles);
    }
    this._showContextMenu(item, e.clientX, e.clientY);
  }


  private _onGridViewScroll(e: Event): void {
    const el = e.target as HTMLElement;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 200) {
      const total = this._fileDataProvider.files.length;
      if (this._gridVisibleCount < total) {
        this._gridVisibleCount = Math.min(this._gridVisibleCount + 100, total);
      }
    }
  }

  private _renderListView() {
    return html`
      <vaadin-grid
        id="grid"
        theme="compact no-border small"
        .dataProvider=${this._fileDataProvider.provider}
        .selectedItems=${this._selectedFiles}
        @active-item-changed=${this._activeItemChanged}
        @selected-items-changed=${this._selectedItemsChanged}
        @dblclick=${this._onGridDoubleClick}
        @keydown=${this._keyDownHandler}
        @contextmenu=${this._onGridContextMenu}
      >
        <vaadin-grid-selection-column .autoWidth=${true} .flexGrow=${0}></vaadin-grid-selection-column>
        <vaadin-grid-sort-column .flexGrow=${1} path="name" direction="asc"
          .renderer=${this._nameRenderer}></vaadin-grid-sort-column>
        <vaadin-grid-sort-column .width=${"120px"} .flexGrow=${0} path="size" header="Size"
          .renderer=${this._sizeRenderer}></vaadin-grid-sort-column>
        <vaadin-grid-sort-column .width=${"200px"} .flexGrow=${0} path="mtime" header="Modified"
          .renderer=${this._mTimeRenderer}></vaadin-grid-sort-column>
      </vaadin-grid>
    `;
  }

  static styles = css`
    :host {
      display: flex;
      flex-direction: column;
      height: 100%;
      min-height: 0;
      overflow: hidden;
    }
    #header {
      align-items: center;
      background: transparent;
      padding: 4px 8px;
      gap: 4px;
    }
    #header #title {
      flex: 0;
      margin: 0px 6px;
      padding: 4px 0px;
    }
    #header #rootPath {
      flex: 1;
      padding: unset;
      padding-left: 4px;
      padding-right: 4px;
    }
    #header #searchField {
      margin-left: auto;
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
    }

    .view-toggle {
      display: flex;
      gap: 2px;
      margin-left: 4px;
    }
    .view-toggle vaadin-button {
      min-width: 28px;
      height: 28px;
      padding: 0;
      margin: 0;
    }
    .view-toggle vaadin-button[theme~="tertiary"] {
      color: var(--lumo-tertiary-text-color);
    }
    .view-toggle tabler-icon.inactive {
      color: var(--lumo-secondary-text-color);
    }
    .view-toggle tabler-icon.active {
      color: var(--lumo-body-text-color);
    }

    .nav-group {
      display: flex;
      align-items: center;
      gap: 6px;
      flex-shrink: 0;
      margin-right: 10px;
    }
    .nav-group vaadin-button {
      color: var(--lumo-body-text-color);
    }
    .nav-group vaadin-button[disabled] {
      color: var(--lumo-disabled-text-color);
      opacity: 0.5;
    }

    .grid-view {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
      gap: 4px;
      padding: 8px;
      overflow-y: auto;
      flex: 1;
      min-height: 0;
      align-content: start;
    }
    .grid-item {
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 8px 4px;
      border-radius: var(--lumo-border-radius-s);
      cursor: pointer;
      transition: background 0.1s;
      user-select: none;
      border: 1px solid transparent;
    }
    .grid-item:hover {
      border-color: var(--lumo-primary-color-50pct);
    }
    .grid-item.selected {
      background: var(--lumo-primary-color-10pct);
    }
    .grid-item.drag-over {
      background: var(--lumo-success-color-10pct);
    }
    .grid-item-icon {
      margin-bottom: 4px;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .grid-item-name {
      font-size: 13px;
      text-align: center;
      overflow-wrap: break-word;
      max-width: 100%;
      line-height: 1.3;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
      white-space: normal;
    }
    .grid-empty {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      flex: 1;
      color: var(--lumo-tertiary-text-color);
      gap: 12px;
    }

    .lasso {
      position: absolute;
      border: 1px solid var(--lumo-primary-color);
      background: var(--lumo-primary-color-10pct);
      pointer-events: none;
      z-index: 10;
    }
    .grid-view {
      position: relative;
    }
  `;

  render() {
    const header = html`
      <vaadin-horizontal-layout id="header">
        <!-- Navigation -->
        <div class="nav-group">
          <vaadin-button theme="small icon tertiary-inline" title="Toggle sidebar"
            @click=${() => { this._sidebarOpen = !this._sidebarOpen; this.dispatchEvent(new CustomEvent("toggle-sidebar", { bubbles: true, composed: true })); }}>
            <tabler-icon name=${this._sidebarOpen ? "angle-left" : "angle-right"} size="24"></tabler-icon>
          </vaadin-button>
          <vaadin-button theme="small icon tertiary-inline" title="Parent folder"
            ?disabled=${!this._rootPath || this._rootPath === "/"}
            @click=${() => {
              const parent = this._parentRootPath(this._rootPath);
              if (parent) this._setRootPath(parent);
            }}>
            <tabler-icon name="arrow-up" size="24"></tabler-icon>
          </vaadin-button>
          <vaadin-button theme="small icon tertiary-inline" title="Root"
            @click=${() => this._setRootPath("/")}>
            <tabler-icon name="home" size="24"></tabler-icon>
          </vaadin-button>
          <vaadin-button theme="small icon tertiary-inline" title="Refresh"
            @click=${() => appState.openRepository()}>
            <tabler-icon name="refresh" size="24"></tabler-icon>
          </vaadin-button>
        </div>

        <!-- Path text field -->
        <vaadin-text-field
          theme="small"
          .value=${this._rootPath || "/"}
          @keydown=${(e: KeyboardEvent) => {
            if (e.key === "Enter") {
              const target = e.target as HTMLInputElement;
              let path = target.value;
              if (!path.startsWith("/")) path = "/" + path;
              this._setRootPath(path);
            }
          }}
          style="flex: 1; min-width: 0;"
        ></vaadin-text-field>

        ${this._isSearchMode ? html`
          <vaadin-button theme="icon small tertiary-inline"
              title="Exit search mode"
              @click=${() => this._exitSearchMode()}>
            <tabler-icon name="close" size="24"></tabler-icon>
          </vaadin-button>
          <span style="flex: 0; padding: 0 8px; color: var(--lumo-secondary-text-color); white-space:nowrap;">
            "${this._searchQuery}" — ${appState.searchResults.length} results
          </span>
        ` : ""}

        <!-- View mode toggle -->
        <div class="view-toggle">
          <vaadin-button
            theme="small icon tertiary-inline"
            @click=${() => { this._viewMode = "list"; localStorage.setItem("restic-browser.viewMode", "list"); this.requestUpdate(); }}
            title="List view"
          >
            <tabler-icon name="list" size="24" class=${this._viewMode === "list" ? "active" : "inactive"}></tabler-icon>
          </vaadin-button>
          <vaadin-button
            theme="small icon tertiary-inline"
            @click=${() => { this._viewMode = "grid"; localStorage.setItem("restic-browser.viewMode", "grid"); this.requestUpdate(); }}
            title="Grid view"
          >
            <tabler-icon name="grid-small" size="24" class=${this._viewMode === "grid" ? "active" : "inactive"}></tabler-icon>
          </vaadin-button>
        </div>

        <vaadin-text-field
          id="searchField"
          theme="small"
          placeholder="Search files..."
          .value=${this._searchQuery}
          .hidden=${!appState.selectedSnapshotID}
          @input=${(e: InputEvent) => { this._searchQuery = (e.target as HTMLInputElement).value; }}
          @keydown=${(e: KeyboardEvent) => { if (e.key === "Enter") this._doSearch(); }}
          style="width: 180px;"
        >
          <tabler-icon slot="prefix" name="search" size="24"></tabler-icon>
        </vaadin-text-field>
        <vaadin-button theme="icon small tertiary-inline"
            title="Search"
            .hidden=${!appState.selectedSnapshotID}
            .disabled=${appState.isSearching}
            @click=${() => this._doSearch()}>
          ${appState.isSearching
            ? html`<tabler-icon name="spinner" size="24"></tabler-icon>`
            : html`<tabler-icon name="search" size="24"></tabler-icon>`
          }
        </vaadin-button>
      </vaadin-horizontal-layout>
    `;

    if (this._fetchError && appState.isLoadingFiles === 0) {
      let errorMessage = this._fetchError;
      if (appState.selectedSnapshotID) {
        errorMessage = `Failed to fetch files: ${errorMessage}`;
      }
      return html`
        ${header}
        <restic-browser-error-message
          type=${appState.selectedSnapshotID ? "error" : "info"}
          message=${errorMessage}>
        </restic-browser-error-message>
      `;
    }

    const content = this._viewMode === "grid"
      ? this._renderGridView()
      : this._renderListView();

    return html`
      ${header}
      ${appState.isLoadingFiles > 0
        ? html`<div style="display:flex;align-items:center;justify-content:center;flex:1;"><tabler-icon name="spinner" class="spinner" size="32"></tabler-icon></div>`
        : content}
      <restic-browser-context-menu
        id="context-menu"
        .items=${this._contextMenuItems}
        .x=${this._contextMenuX}
        .y=${this._contextMenuY}
        style="${this._contextMenuVisible ? "" : "display: none;"}"
        @click=${(e: MouseEvent) => e.stopPropagation()}
      ></restic-browser-context-menu>
    `;
  }
}


declare global {
  interface HTMLElementTagNameMap {
    "restic-browser-file-list": ResticBrowserFileList;
  }
}
