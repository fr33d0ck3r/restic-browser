import { css, html, LitElement } from "lit";
import { customElement, property } from "lit/decorators.js";
import { unsafeSVG } from "lit/directives/unsafe-svg.js";

import folderSvg from "../assets/icons/folder.svg?raw";
import arrowUpSvg from "../assets/icons/arrow-up.svg?raw";


function sizeSvg(raw: string, size: number): string {
  return raw
    .replace(/width="[^"]*"/, `width="${size}"`)
    .replace(/height="[^"]*"/, `height="${size}"`);
}

function makeFilledFolder(raw: string): string {
  return raw
    .replace(/fill="none"/g, 'fill="currentColor" fill-opacity="0.18"')
    .replace(/stroke-width="[\d.]+"/, 'stroke-width="1.5"');
}

function makeFilledArrow(raw: string): string {
  return raw
    .replace(/fill="none"/g, 'fill="currentColor" fill-opacity="0.18"')
    .replace(/stroke-width="[\d.]+"/, 'stroke-width="1.5"');
}

const folderFilledSvg = makeFilledFolder(folderSvg);
const arrowUpFilledSvg = makeFilledArrow(arrowUpSvg);

const genericFileSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 24 24"><path fill="currentColor" fill-opacity="0.85" d="M6 2a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8.828a2 2 0 0 0-.586-1.414l-4.828-4.828A2 2 0 0 0 13.172 2H6zm7 1.5V9a1 1 0 0 0 1 1h5.5L13 3.5z"/></svg>`;


@customElement("restic-browser-file-icon")
export class ResticBrowserFileIcon extends LitElement {
  @property({ type: String })
  filename = "";

  @property({ type: String })
  fileType: "file" | "dir" = "file";

  @property({ type: Number })
  size = 16;

  @property({ type: Boolean })
  isOpen = false;

  @property({ type: Boolean })
  isParent = false;

  static styles = css`
    :host {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      color: var(--lumo-body-text-color);
    }
    svg {
      display: block;
      flex-shrink: 0;
    }
  `;

  render() {
    const isDir = this.fileType === "dir";
    let rawSvg: string;

    if (this.isParent) {
      rawSvg = arrowUpFilledSvg;
    } else if (isDir) {
      rawSvg = folderFilledSvg;
    } else {
      rawSvg = genericFileSvg;
    }

    return html`${unsafeSVG(sizeSvg(rawSvg, this.size))}`;
  }
}


declare global {
  interface HTMLElementTagNameMap {
    "restic-browser-file-icon": ResticBrowserFileIcon;
  }
}
