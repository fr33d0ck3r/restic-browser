import { css, html, LitElement } from "lit";
import { customElement, property, state } from "lit/decorators.js";

import { restic } from "../backend/restic";
import "./icons";


export interface ContextMenuItem {
  id: string;
  label: string;
  icon?: string;
  shortcut?: string;
  divider?: boolean;
  disabled?: boolean;
  hidden?: boolean;
  action?: () => void;
}


export function getFileContextMenuItems(
  file: restic.File,
  handlers: {
    onOpen?: () => void;
    onRestore?: () => void;
    onCopyPath?: () => void;
    onViewProperties?: () => void;
  }
): ContextMenuItem[] {
  const isDir = file.type === "dir";

  return [
    {
      id: "open",
      label: isDir ? "Open Folder" : "Open File",
      icon: "level-up",
      shortcut: "Enter",
      action: handlers.onOpen,
      hidden: !handlers.onOpen,
    },
    { id: "divider1", label: "", divider: true },
    {
      id: "restore",
      label: "Restore...",
      icon: "download",
      action: handlers.onRestore,
      hidden: !handlers.onRestore,
    },
    { id: "divider2", label: "", divider: true },
    {
      id: "copy-path",
      label: "Copy Path",
      icon: "copy",
      shortcut: "Ctrl+C",
      action: handlers.onCopyPath,
      hidden: !handlers.onCopyPath,
    },
    {
      id: "properties",
      label: "Properties",
      icon: "info-circle",
      action: handlers.onViewProperties,
      hidden: !handlers.onViewProperties,
    },
  ];
}


@customElement("restic-browser-context-menu")
export class ResticBrowserContextMenu extends LitElement {
  @property({ type: Array })
  items: ContextMenuItem[] = [];

  @property({ type: Number })
  x = 0;

  @property({ type: Number })
  y = 0;

  @state()
  private _visible = false;

  private _boundClickOutside = this._handleClickOutside.bind(this);
  private _boundKeyDown = this._handleKeyDown.bind(this);

  static styles = css`
    :host {
      display: block;
      position: fixed;
      z-index: 10000;
    }

    .context-menu {
      background: var(--lumo-base-color);
      border: 1px solid var(--lumo-contrast-10pct);
      border-radius: 6px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
      min-width: 180px;
      max-width: 280px;
      padding: 4px 0;
      animation: menuAppear 0.08s ease-out;
    }

    @keyframes menuAppear {
      from {
        opacity: 0;
        transform: scale(0.96);
      }
      to {
        opacity: 1;
        transform: scale(1);
      }
    }

    .menu-item {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 7px 14px;
      cursor: pointer;
      font-size: 13px;
      color: var(--lumo-body-text-color);
      transition: background 0.05s;
      user-select: none;
    }

    .menu-item:hover:not(.disabled) {
      background: var(--lumo-primary-color-10pct);
      color: var(--lumo-primary-text-color);
    }

    .menu-item.disabled {
      opacity: 0.4;
      cursor: not-allowed;
    }

    .menu-item tabler-icon {
      width: 16px;
      height: 16px;
      flex-shrink: 0;
      color: var(--lumo-secondary-text-color);
    }

    .menu-item:hover:not(.disabled) tabler-icon {
      color: var(--lumo-primary-text-color);
    }

    .menu-item-label {
      flex: 1;
    }

    .menu-item-shortcut {
      font-size: 13px;
      color: var(--lumo-tertiary-text-color);
      margin-left: 8px;
    }

    .menu-item:hover:not(.disabled) .menu-item-shortcut {
      color: var(--lumo-primary-text-color);
      opacity: 0.7;
    }

    .divider {
      height: 1px;
      background: var(--lumo-contrast-10pct);
      margin: 4px 8px;
    }
  `;

  connectedCallback(): void {
    super.connectedCallback();
    document.addEventListener("click", this._boundClickOutside);
    document.addEventListener("keydown", this._boundKeyDown);
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    document.removeEventListener("click", this._boundClickOutside);
    document.removeEventListener("keydown", this._boundKeyDown);
  }

  show(x: number, y: number) {
    
    const menuWidth = 200;
    const menuHeight = Math.min(this.items.filter((i) => !i.hidden).length * 36, 400);

    let adjustedX = x;
    let adjustedY = y;

    if (x + menuWidth > window.innerWidth) {
      adjustedX = window.innerWidth - menuWidth - 8;
    }
    if (y + menuHeight > window.innerHeight) {
      adjustedY = window.innerHeight - menuHeight - 8;
    }

    this.x = Math.max(4, adjustedX);
    this.y = Math.max(4, adjustedY);
    this._visible = true;
    this.requestUpdate();
  }

  hide() {
    this._visible = false;
    this.requestUpdate();
  }

  private _handleClickOutside(e: MouseEvent) {
    if (!this._visible) return;
    const path = e.composedPath();
    if (!path.includes(this)) {
      this.hide();
    }
  }

  private _handleKeyDown(e: KeyboardEvent) {
    if (!this._visible) return;
    if (e.key === "Escape") {
      this.hide();
    }
  }

  private _onItemClick(item: ContextMenuItem) {
    if (item.disabled || item.divider) return;
    this.hide();
    item.action?.();
  }

  render() {
    if (!this._visible) return html``;

    const visibleItems = this.items.filter((item) => !item.hidden);

    return html`
      <div class="context-menu" style="left: ${this.x}px; top: ${this.y}px;">
        ${visibleItems.map(
          (item) =>
            html`
              ${item.divider
                ? html`<div class="divider"></div>`
                : html`
                    <div
                      class="menu-item ${item.disabled ? "disabled" : ""}"
                      @click=${() => this._onItemClick(item)}
                    >
                      ${item.icon
                        ? html`<tabler-icon name="${item.icon}"></tabler-icon>`
                        : html`<span style="width: 16px;"></span>`}
                      <span class="menu-item-label">${item.label}</span>
                      ${item.shortcut
                        ? html`<span class="menu-item-shortcut">${item.shortcut}</span>`
                        : ""}
                    </div>
                  `}
            `
        )}
      </div>
    `;
  }
}


declare global {
  interface HTMLElementTagNameMap {
    "restic-browser-context-menu": ResticBrowserContextMenu;
  }
}
