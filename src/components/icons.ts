import { LitElement, html, css } from "lit";
import { customElement, property } from "lit/decorators.js";
import { unsafeSVG } from "lit/directives/unsafe-svg.js";

import trashSvg from "../assets/icons/trash.svg?raw";
import checkSvg from "../assets/icons/check.svg?raw";
import checkCircleSvg from "../assets/icons/check-circle.svg?raw";
import cloudUploadSvg from "../assets/icons/cloud-upload.svg?raw";
import downloadSvg from "../assets/icons/download.svg?raw";
import lockOpenSvg from "../assets/icons/lock-open.svg?raw";
import lockSvg from "../assets/icons/lock.svg?raw";
import chevronLeftSvg from "../assets/icons/chevron-left.svg?raw";
import chevronRightSvg from "../assets/icons/chevron-right.svg?raw";
import chevronDownSvg from "../assets/icons/chevron-down.svg?raw";
import xSvg from "../assets/icons/x.svg?raw";
import searchSvg from "../assets/icons/search.svg?raw";
import refreshSvg from "../assets/icons/refresh.svg?raw";
import homeSvg from "../assets/icons/home.svg?raw";
import arrowUpRightSvg from "../assets/icons/arrow-up-right.svg?raw";
import arrowUpSvg from "../assets/icons/arrow-up.svg?raw";
import listSvg from "../assets/icons/list.svg?raw";
import gridSvg from "../assets/icons/grid.svg?raw";
import plusSvg from "../assets/icons/plus.svg?raw";
import folderSvg from "../assets/icons/folder.svg?raw";
import spinnerSvg from "../assets/icons/spinner.svg?raw";
import cloudSvg from "../assets/icons/cloud.svg?raw";
import cloudDownloadSvg from "../assets/icons/cloud-download.svg?raw";
import serversSvg from "../assets/icons/servers.svg?raw";
import databaseSvg from "../assets/icons/database.svg?raw";
import arrowLeftRightSvg from "../assets/icons/arrow-left-right.svg?raw";
import eyeSvg from "../assets/icons/eye.svg?raw";
import copySvg from "../assets/icons/copy.svg?raw";
import infoCircleSvg from "../assets/icons/info-circle.svg?raw";
import xCircleSvg from "../assets/icons/x-circle.svg?raw";
import minusSvg from "../assets/icons/minus.svg?raw";
import homeFilledSvg from "../assets/icons/home-solid.svg?raw";
import gridFilledSvg from "../assets/icons/grid-solid.svg?raw";


const ICONS: Record<string, string> = {
  trash: trashSvg,
  check: checkSvg,
  "check-circle": checkCircleSvg,
  "cloud-upload": cloudUploadSvg,
  download: downloadSvg,
  unlock: lockOpenSvg,
  lock: lockSvg,
  "angle-left": chevronLeftSvg,
  "angle-right": chevronRightSvg,
  "angle-down": chevronDownSvg,
  "chevron-right": chevronRightSvg,
  "chevron-down": chevronDownSvg,
  close: xSvg,
  search: searchSvg,
  refresh: refreshSvg,
  home: homeSvg,
  "level-up": arrowUpRightSvg,
  "arrow-up": arrowUpSvg,
  list: listSvg,
  "grid-small": gridSvg,
  plus: plusSvg,
  folder: folderSvg,
  spinner: spinnerSvg,
  cloud: cloudSvg,
  "cloud-download": cloudDownloadSvg,
  server: serversSvg,
  database: databaseSvg,
  "arrows-left-right": arrowLeftRightSvg,
  eye: eyeSvg,
  copy: copySvg,
  "info-circle": infoCircleSvg,
  "circle-x": xCircleSvg,
  minus: minusSvg,
  "home-filled": homeFilledSvg,
  "layout-grid-filled": gridFilledSvg,
};

function sizeSvg(raw: string, size: number): string {
  return raw
    .replace(/width="[^"]*"/, `width="${size}"`)
    .replace(/height="[^"]*"/, `height="${size}"`)
    .replace(/stroke-width="[\d.]+"/, `stroke-width="${size <= 16 ? 2 : 2.5}"`);
}


@customElement("tabler-icon")
export class TablerIcon extends LitElement {
  @property({ type: String })
  name = "";

  @property({ type: Number })
  size = 16;

  static styles = css`
    :host {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      color: var(--lumo-body-text-color);
      transition: color 0.15s ease;
    }
    :host(:hover) {
      color: var(--lumo-body-text-color);
    }
    :host([accent]) {
      color: var(--lumo-primary-text-color);
    }
    svg {
      display: block;
      flex-shrink: 0;
    }
  `;

  render() {
    const raw = ICONS[this.name];
    if (!raw) return html``;
    return html`${unsafeSVG(sizeSvg(raw, this.size))}`;
  }
}


declare global {
  interface HTMLElementTagNameMap {
    "tabler-icon": TablerIcon;
  }
}
