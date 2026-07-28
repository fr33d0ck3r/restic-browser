import { LitElement, css, html } from "lit";
import { customElement } from "lit/decorators.js";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { PhysicalSize, PhysicalPosition } from "@tauri-apps/api/dpi";


@customElement("restic-browser-window-resize-overlay")
export class WindowResizeOverlay extends LitElement {
  static styles = css`
    :host {
      position: fixed;
      inset: 0;
      pointer-events: none;
      z-index: 99999;
    }
    .resize-edge {
      position: absolute;
      pointer-events: auto;
    }
    .edge-n { top: 0; left: 6px; right: 6px; height: 6px; cursor: n-resize; }
    .edge-s { bottom: 0; left: 6px; right: 6px; height: 6px; cursor: s-resize; }
    .edge-w { left: 0; top: 6px; bottom: 6px; width: 6px; cursor: w-resize; }
    .edge-e { right: 0; top: 6px; bottom: 6px; width: 6px; cursor: e-resize; }
    .edge-nw { top: 0; left: 0; width: 12px; height: 12px; cursor: nw-resize; z-index: 10; background: rgba(0,0,0,0.001); }
    .edge-ne { top: 0; right: 0; width: 12px; height: 12px; cursor: ne-resize; z-index: 10; background: rgba(0,0,0,0.001); }
    .edge-sw { bottom: 0; left: 0; width: 12px; height: 12px; cursor: sw-resize; z-index: 10; background: rgba(0,0,0,0.001); }
    .edge-se { bottom: 0; right: 0; width: 12px; height: 12px; cursor: se-resize; z-index: 10; background: rgba(0,0,0,0.001); }
  `;

  private _startX = 0;
  private _startY = 0;
  private _startWidth = 0;
  private _startHeight = 0;
  private _startPosX = 0;
  private _startPosY = 0;
  private _edge = "";
  private _rafId = 0;
  private _pendingDx = 0;
  private _pendingDy = 0;
  private _win: any = null;

  private async _onMouseDown(edge: string, e: MouseEvent) {
    e.preventDefault();
    this._edge = edge;
    this._startX = e.screenX;
    this._startY = e.screenY;
    this._win = getCurrentWebviewWindow();

    const size = await this._win.outerSize();
    const pos = await this._win.outerPosition();
    this._startWidth = size.width;
    this._startHeight = size.height;
    this._startPosX = pos.x;
    this._startPosY = pos.y;

    const onMove = (ev: MouseEvent) => this._onMouseMove(ev);
    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      if (this._rafId) {
        cancelAnimationFrame(this._rafId);
        this._rafId = 0;
      }
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }

  private _onMouseMove(e: MouseEvent) {
    this._pendingDx = e.screenX - this._startX;
    this._pendingDy = e.screenY - this._startY;
    if (!this._rafId) {
      this._rafId = requestAnimationFrame(() => this._applyResize());
    }
  }

  private async _applyResize() {
    this._rafId = 0;
    const dx = this._pendingDx;
    const dy = this._pendingDy;
    const win = this._win;
    if (!win) return;

    let newWidth = this._startWidth;
    let newHeight = this._startHeight;
    let newX = this._startPosX;
    let newY = this._startPosY;

    const minW = 400;
    const minH = 300;

    if (this._edge.includes("e")) {
      newWidth = Math.max(minW, this._startWidth + dx);
    }
    if (this._edge.includes("w")) {
      const candidate = this._startWidth - dx;
      if (candidate >= minW) {
        newWidth = candidate;
        newX = this._startPosX + dx;
      }
    }
    if (this._edge.includes("s")) {
      newHeight = Math.max(minH, this._startHeight + dy);
    }
    if (this._edge.includes("n")) {
      const candidate = this._startHeight - dy;
      if (candidate >= minH) {
        newHeight = candidate;
        newY = this._startPosY + dy;
      }
    }

    const rw = Math.round(newWidth);
    const rh = Math.round(newHeight);
    const rx = Math.round(newX);
    const ry = Math.round(newY);

    if (rw !== Math.round(this._startWidth) || rh !== Math.round(this._startHeight)) {
      await win.setSize(new PhysicalSize(rw, rh));
    }
    if (rx !== Math.round(this._startPosX) || ry !== Math.round(this._startPosY)) {
      await win.setPosition(new PhysicalPosition(rx, ry));
    }
  }

  render() {
    const edges = ["n", "s", "w", "e", "nw", "ne", "sw", "se"] as const;
    return html`
      ${edges.map(
        (edge) => html`
          <div
            class="resize-edge edge-${edge}"
            @mousedown=${(e: MouseEvent) => this._onMouseDown(edge, e)}
          ></div>
        `,
      )}
    `;
  }
}


declare global {
  interface HTMLElementTagNameMap {
    "restic-browser-window-resize-overlay": WindowResizeOverlay;
  }
}
