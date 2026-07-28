import { dialogFooterRenderer, dialogRenderer } from "@vaadin/dialog/lit";
import { html, LitElement } from "lit";
import { customElement, property, state } from "lit/decorators.js";

import "@vaadin/dialog";
import "@vaadin/horizontal-layout";
import "@vaadin/vertical-layout";
import "@vaadin/password-field";
import "@vaadin/button";


@customElement("restic-browser-location-password-dialog")
export class ResticBrowserLocationPasswordDialog extends LitElement {
  
  @property()
  label?: string;

  
  @property()
  onClose!: (password: string) => void;

  
  @property()
  onCancel!: () => void;

  @state()
  private _password: string = "";

  @state()
  private _handledClose: boolean = false;

  constructor() {
    super();

    
    this._handleClose = this._handleClose.bind(this);
    this._handleCancel = this._handleCancel.bind(this);
  }

  override connectedCallback(): void {
    super.connectedCallback();
    
    this._password = "";
    this._handledClose = false;
  }

  render() {
    const dialogLayout = html`
      <vaadin-vertical-layout id="dialogContent">
        <vaadin-password-field
          id="passwordField"
          label=${this.label || "Password"}
          style="width: 100%;"
          required
          autofocus
          value=${this._password}
          @change=${(event: CustomEvent) => {
            this._password = (event.target as HTMLInputElement).value;
          }}
          @keydown=${(event: KeyboardEvent) => {
            if (event.key === "Enter") {
              this._handleClose();
            }
          }}
        ></vaadin-password-field>
      </vaadin-vertical-layout>
    `;

    const footerLayout = html`
      <vaadin-horizontal-layout id="footerContent">
        <div style="flex-grow: 1"></div>
        <vaadin-button @click=${this._handleCancel}>
          Cancel 
        </vaadin-button>
        <div style="width: 4px"></div>
        <vaadin-button theme="primary" @click=${this._handleClose}>
          Okay
        </vaadin-button>
      </vaadin-horizontal-layout>
    `;

    return html`
      <vaadin-dialog
        header-title="Repository Password"
        .opened=${true}
        .noCloseOnOutsideClick=${true}
        @opened-changed=${(event: CustomEvent) => {
          if (!event.detail.value && !this._handledClose) {
            this._handleCancel();
          }
        }}
        ${dialogFooterRenderer(() => footerLayout, [])}
        ${dialogRenderer(() => dialogLayout, [])}
      ></vaadin-dialog>
    `;
  }

  private _handleClose() {
    this._handledClose = true;
    this.onClose(this._password);
  }

  private _handleCancel() {
    this._handledClose = true;
    this.onCancel();
  }
}


declare global {
  interface HTMLElementTagNameMap {
    "restic-browser-location-password-dialog": ResticBrowserLocationPasswordDialog;
  }
}
