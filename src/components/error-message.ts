import { css, html, LitElement } from "lit";
import { customElement, property } from "lit/decorators.js";

import "./icons";


@customElement("restic-browser-error-message")
export class ResticBrowserErrorMessage extends LitElement {
  @property()
  type: "info" | "error" = "error";

  @property()
  message: string = "Unknown error";

  static styles = css`
    #layout {
      display: flex;
      height: 100%; 
      width: auto;
      align-items: center; 
      justify-content: center; 
      margin-bottom: 25%;
    }
  `;

  render() {
    const iconColor =
      this.type === "error" ? "--lumo-error-text-color" : "--lumo-primary-text-color";
    const iconName = this.type === "error" ? "circle-x" : "info-circle";
    const errorIcon = html`
      <tabler-icon 
        name=${iconName} 
        style="color: var(${iconColor}); width:64px; height:64px">
      </tabler-icon>`;
    return html`
      <vaadin-horizontal-layout id="layout">
        ${errorIcon}${this.message}
      </vaadin-horizontal-layout>
    `;
  }
}


declare global {
  interface HTMLElementTagNameMap {
    "restic-browser-error-message": ResticBrowserErrorMessage;
  }
}
