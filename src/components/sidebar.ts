import { MobxLitElement } from "@adobe/lit-mobx";
import { html, css } from "lit";
import { customElement, state } from "lit/decorators.js";
import * as mobx from "mobx";

import { appState } from "../states/app-state";
import { restic } from "../backend/restic";
import type { LocationPreset } from "../states/location-preset";

import "@vaadin/button";
import "./icons";
import "./file-icon";


interface TreeNode {
  path: string;
  name: string;
  isExpanded: boolean;
  isLoading: boolean;
  children: TreeNode[];
  hasChildren: boolean;
}


@customElement("restic-browser-sidebar")
export class ResticBrowserSidebar extends MobxLitElement {
  @state() private _showPresets = true;
  @state() private _showTree = true;
  @state() private _activePath = "/";
  @state() private _treeRoot: TreeNode = {
    path: "/",
    name: "Root",
    isExpanded: true,
    isLoading: false,
    children: [],
    hasChildren: true,
  };

  private _disposers: mobx.IReactionDisposer[] = [];

  constructor() {
    super();
    mobx.makeObservable(this);
  }

  connectedCallback(): void {
    super.connectedCallback();
    this._refreshTree();
    this._disposers.push(
      mobx.reaction(
        () => appState.selectedSnapshotID,
        () => this._refreshTree(),
        { fireImmediately: false },
      ),
    );
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    this._disposers.forEach((d) => d());
    this._disposers = [];
  }

  private _normalizePath(path: string): string {
    return path.replace(/\/$/, "") || "/";
  }

  private _dedupeDirs(files: restic.File[], excludePath?: string): restic.File[] {
    const seen = new Set<string>();
    const normExclude = excludePath ? this._normalizePath(excludePath) : undefined;
    return files.filter((f) => {
      if (f.type !== "dir" || f.name === ".." || f.name === ".") return false;
      const normPath = this._normalizePath(f.path);
      if (normExclude && normPath === normExclude) return false;
      if (seen.has(normPath)) return false;
      seen.add(normPath);
      return true;
    });
  }

  private async _refreshTree(): Promise<void> {
    if (!appState.selectedSnapshotID) {
      this._treeRoot = { path: "/", name: "Root", isExpanded: true, isLoading: false, children: [], hasChildren: false };
      return;
    }
    this._treeRoot.isLoading = true;
    this.requestUpdate();
    try {
      const files = await appState.fetchFiles("/");
      const dirs = this._dedupeDirs(files, "/");
      this._treeRoot = {
        path: "/", name: "Root", isExpanded: true, isLoading: false,
        children: dirs.map((d) => ({ path: d.path, name: d.name, isExpanded: false, isLoading: false, children: [], hasChildren: true })),
        hasChildren: dirs.length > 0,
      };
    } catch {
      this._treeRoot.isLoading = false;
    }
    this.requestUpdate();
  }

  private async _toggleTreeNode(node: TreeNode): Promise<void> {
    if (!node.hasChildren) return;
    if (node.isExpanded) { node.isExpanded = false; this.requestUpdate(); return; }
    node.isLoading = true; this.requestUpdate();
    try {
      const files = await appState.fetchFiles(node.path);
      const dirs = this._dedupeDirs(files, node.path);
      node.children = dirs.map((d) => ({ path: d.path, name: d.name, isExpanded: false, isLoading: false, children: [], hasChildren: true }));
      node.hasChildren = dirs.length > 0; node.isExpanded = true;
    } catch {  }
    node.isLoading = false; this.requestUpdate();
  }

  private async _loadChildren(node: TreeNode): Promise<void> {
    if (!node.hasChildren || node.children.length > 0) return;
    node.isLoading = true; this.requestUpdate();
    try {
      const files = await appState.fetchFiles(node.path);
      const dirs = this._dedupeDirs(files, node.path);
      node.children = dirs.map((d) => ({ path: d.path, name: d.name, isExpanded: false, isLoading: false, children: [], hasChildren: true }));
      node.hasChildren = dirs.length > 0;
    } catch {  }
    node.isLoading = false; this.requestUpdate();
  }

  private async _expandTreeToPath(path: string): Promise<void> {
    this._activePath = path;
    const parts = path.split("/").filter(Boolean);
    let current = this._treeRoot;
    for (const part of parts) {
      if (!current.isExpanded) {
        current.isExpanded = true;
        await this._loadChildren(current);
      }
      const child = current.children.find((c) => c.name === part);
      if (!child) break;
      current = child;
    }
    this.requestUpdate();
  }

  private _navigateToPath(path: string): void {
    this._activePath = path;
    this.dispatchEvent(new CustomEvent("navigate-to-path", { detail: { path }, bubbles: true, composed: true }));
    this.requestUpdate();
  }

  public expandToPath(path: string): void {
    this._expandTreeToPath(path).catch(() => {});
  }

  private _isActivePath(path: string): boolean {
    return this._normalizePath(path) === this._normalizePath(this._activePath);
  }

  private _renderTreeNode(node: TreeNode, depth = 0): ReturnType<typeof html> {
    const pad = depth * 16 + 4;
    const isExpanded = node.isExpanded;
    const isActive = this._isActivePath(node.path);
    return html`
      <div class="tree-node">
        <div class="tree-row ${isActive ? 'active' : ''}"
             style="padding-left:${pad}px"
             @click=${() => this._navigateToPath(node.path)}>
          ${node.hasChildren
            ? html`<span class="tree-chevron"
                @click=${(e: Event) => { e.stopPropagation(); this._toggleTreeNode(node); }}>
                <tabler-icon name=${isExpanded ? "chevron-down" : "chevron-right"} size="12"></tabler-icon>
              </span>`
            : html`<span style="width:16px;flex-shrink:0;"></span>`}
          <restic-browser-file-icon .filename=${node.name} .fileType=${"dir"} .size=${16} .isOpen=${isExpanded} style="flex-shrink:0;"></restic-browser-file-icon>
          <span class="tree-label">${node.name}</span>
          ${node.isLoading ? html`<tabler-icon name="spinner" class="spinner" size="14"></tabler-icon>` : ""}
        </div>
        ${node.isExpanded ? html`<div class="tree-children">${node.children.map((c) => this._renderTreeNode(c, depth + 1))}</div>` : ""}
      </div>
    `;
  }

  private _onPresetSelect(preset: LocationPreset) {
    appState.setSelectedLocationPreset(preset);
    appState.openRepository();
  }

  private _getLocationTypeIcon(type: string): string {
    const map: Record<string, string> = { local: "folder", sftp: "cloud", s3: "cloud", azure: "cloud-download", b2: "cloud-download", rest: "server", rclone: "arrows-left-right", webdav: "cloud" };
    return map[type] || "database";
  }

  private _section(title: string, show: boolean, toggle: () => void, content: ReturnType<typeof html>) {
    return html`
      <div class="section">
        <div class="section-header" @click=${toggle}>
          <span class="section-title">${title}</span>
          <vaadin-button theme="tertiary-inline small icon" style="padding:0;min-width:20px;height:20px;">
            <tabler-icon name=${show ? "minus" : "plus"} size="14"></tabler-icon>
          </vaadin-button>
        </div>
        ${show ? html`<div class="section-content">${content}</div>` : ""}
      </div>
    `;
  }

  static styles = css`
    :host { display: flex; flex-direction: column; width: 100%; height: 100%; overflow: hidden; }
    .content { flex: 1; overflow-y: auto; padding: 8px 0; }

    .section { margin-bottom: 4px; }
    .section-header {
      display: flex; align-items: center; justify-content: space-between;
      padding: 6px 12px; cursor: pointer; user-select: none;
      border-radius: var(--lumo-border-radius-s);
      transition: background var(--transition-fast);
    }
    .section-header:hover { background: var(--lumo-contrast-5pct); }
    .section-title {
      font-size: 13px; font-weight: 600; text-transform: uppercase;
      letter-spacing: 0.05em; color: var(--lumo-secondary-text-color);
    }
    .section-content { padding: 0 4px; }

    .nav-item {
      display: flex; align-items: center; gap: 8px;
      padding: 6px 12px; cursor: pointer;
      border-radius: var(--lumo-border-radius-s);
      font-size: 16px; color: var(--lumo-body-text-color);
      transition: background var(--transition-fast), color var(--transition-fast);
    }
    .nav-item:hover { background: var(--lumo-contrast-5pct); }
    .nav-item.active {
      background: var(--lumo-primary-color-10pct);
      color: var(--lumo-primary-text-color);
      font-weight: 500;
    }

    .tree-node { position: relative; }
    .tree-row {
      display: flex; align-items: center; gap: 4px;
      cursor: pointer;
      border-radius: var(--lumo-border-radius-s);
      padding: 4px 8px;
      font-size: 13px;
      color: var(--lumo-body-text-color);
      transition: background var(--transition-fast), color var(--transition-fast);
      position: relative;
    }
    .tree-row:hover { background: var(--lumo-contrast-5pct); }
    .tree-row.active {
      background: var(--lumo-primary-color-10pct);
      color: var(--lumo-primary-text-color);
      font-weight: 500;
    }
    .tree-row.active .tree-label { color: var(--lumo-primary-text-color); }
    .tree-chevron {
      display: inline-flex; align-items: center; justify-content: center;
      width: 16px; height: 16px; flex-shrink: 0; cursor: pointer;
      transition: transform var(--transition-fast);
    }
    .tree-label {
      flex: 1;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .tree-children {
      position: relative;
    }
    .tree-children::before {
      content: "";
      position: absolute;
      left: 12px;
      top: 0;
      bottom: 0;
      width: 1px;
      background: var(--lumo-contrast-10pct);
    }
    .spinner { animation: spin 1s linear infinite; }
    @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
  `;

  render() {
    const presets = appState.locationPresets.slice(1);

    return html`
      <div class="content">
        ${this._section("Quick Access", this._showPresets, () => this._showPresets = !this._showPresets, html`
          <div class="nav-item"
               @click=${() => this.dispatchEvent(new CustomEvent("open-repository", { bubbles: true, composed: true }))}>
            <tabler-icon name="plus" size="16"></tabler-icon>
            <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">New Location...</span>
          </div>
          ${presets.map((p) => html`
            <div class="nav-item ${appState.selectedLocationPreset === p ? 'active' : ''}"
                 @click=${() => this._onPresetSelect(p)}>
              <tabler-icon name=${this._getLocationTypeIcon(p.location.type)} size="16"></tabler-icon>
              <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title=${p.location.path}>${p.name}</span>
            </div>
          `)}
        `)}

        ${appState.selectedSnapshotID
          ? this._section("Folders", this._showTree, () => this._showTree = !this._showTree,
              html`<div style="padding-top:4px;padding-bottom:4px;">${this._renderTreeNode(this._treeRoot)}</div>`)
          : ""}
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "restic-browser-sidebar": ResticBrowserSidebar;
  }
}
