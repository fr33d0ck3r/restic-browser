import { MobxLitElement } from "@adobe/lit-mobx";
import { dialogFooterRenderer } from "@vaadin/dialog/lit";
import { Notification } from "@vaadin/notification";
import { type CSSResultGroup, css, html, render, type TemplateResult } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import * as mobx from "mobx";

import { appState } from "../states/app-state";
import { Location } from "../states/location";
import type { LocationPreset } from "../states/location-preset";
import type { ResticBrowserLocationProperties } from "./location-properties";

import "./location-properties";
import "./location-presets";
import "./location-save-preset-dialog";
import "./location-password-dialog";

import "@vaadin/dialog";
import "@vaadin/horizontal-layout";
import "@vaadin/vertical-layout";
import "@vaadin/button";
import "@vaadin/notification";


@customElement("restic-browser-location-dialog")
export class ResticBrowserLocationDialog extends MobxLitElement {
  
  @property()
  onClose!: () => void;

  
  @property()
  onCancel!: () => void;

  
  @state()
  private _showSavePresetDialog: boolean = false;
  
  @state()
  private _showPasswordDialog: boolean = false;

  
  @state()
  private _editingPreset: boolean = false;

  
  private _newPresetLocation: Location = new Location();
  
  private _initialLocation: Location = new Location();

  
  private _handledClose: boolean = false;

  
  private _dialogContentRoot: HTMLElement | undefined = undefined;

  constructor() {
    super();

    
    this._initialLocation.setFromOtherLocation(appState.repoLocation);

    
    this._handleMainDialogCancel = this._handleMainDialogCancel.bind(this);
    this._handleMainDialogClose = this._handleMainDialogClose.bind(this);

    this._handlePresetDoubleClick = this._handlePresetDoubleClick.bind(this);

    this._handleShowSavePresetDialog = this._handleShowSavePresetDialog.bind(this);
    this._handleSavePresetDialogClose = this._handleSavePresetDialogClose.bind(this);
    this._handleSavePresetDialogCancel = this._handleSavePresetDialogCancel.bind(this);

    this._handleShowPasswordDialog = this._handleShowPasswordDialog.bind(this);
    this._handlePasswordDialogClose = this._handlePasswordDialogClose.bind(this);
    this._handlePasswordDialogCancel = this._handlePasswordDialogCancel.bind(this);

    this._handleStartEditingPreset = this._handleStartEditingPreset.bind(this);
    this._handleFinishEditingPreset = this._handleFinishEditingPreset.bind(this);
    this._handleCancelEditingPreset = this._handleCancelEditingPreset.bind(this);
  }

  static dialogStyles: CSSResultGroup = css`
    #locationPresets {
      margin-right: 1rem;
    }
    #locationPropertyButtons {
      margin-top: 1rem
    }
  `;

  static footerStyles: CSSResultGroup = css``;

  render() {
    
    if (this._showSavePresetDialog) {
      return html`
        <restic-browser-location-save-preset-dialog 
          .onClose=${this._handleSavePresetDialogClose} 
          .onCancel=${this._handleSavePresetDialogCancel}
        >
        </restic-browser-location-save-preset-dialog>
      `;
    }

    
    if (this._showPasswordDialog) {
      return html`
        <restic-browser-location-password-dialog 
          .onClose=${this._handlePasswordDialogClose} 
          .onCancel=${this._handlePasswordDialogCancel}
        >
        </restic-browser-location-password-dialog>
      `;
    }

    
    const newLocationPresetSelected =
      appState.selectedLocationPreset === appState.locationPresets[0];

    let propertyButtons: TemplateResult;
    if (newLocationPresetSelected) {
      propertyButtons = html`
        <vaadin-horizontal-layout id="locationPropertyButtons">
          <vaadin-button 
            theme="primary"
            @click=${this._handleShowSavePresetDialog}
          > Save as new Preset
          </vaadin-button>
        </vaadin-horizontal-layout>
      `;
    } else if (!this._editingPreset) {
      propertyButtons = html`
        <vaadin-horizontal-layout id="locationPropertyButtons">
          <vaadin-button theme="primary" 
            @click=${this._handleStartEditingPreset}
          > Edit
          </vaadin-button>
        </vaadin-horizontal-layout>
      `;
    } else {
      propertyButtons = html`
          <vaadin-horizontal-layout id="locationPropertyButtons">
            <vaadin-button 
              theme="primary" 
              @click=${this._handleFinishEditingPreset}
            > Save
            </vaadin-button>
            <div style="width: 4px"></div>
            <vaadin-button 
              @click=${this._handleCancelEditingPreset}
            > Cancel
            </vaadin-button>
          </vaadin-horizontal-layout>
        `;
    }

    const hasRepo = appState.repoLocation.path !== "";
    const isBusy = appState.isRunningMaintenance;

    const maintenanceButtons = hasRepo && !newLocationPresetSelected ? html`
      <vaadin-horizontal-layout id="maintenanceButtons" style="margin-top: 16px; gap: 8px;">
        <vaadin-button theme="small tertiary" ?disabled=${isBusy} @click=${this._onBackupClick}>
          Backup
        </vaadin-button>
        <vaadin-button theme="small tertiary" ?disabled=${isBusy} @click=${this._onCheckClick}>
          Check
        </vaadin-button>
        <vaadin-button theme="small tertiary" ?disabled=${isBusy} @click=${this._onUnlockClick}>
          Unlock
        </vaadin-button>
        <vaadin-button theme="small tertiary" ?disabled=${isBusy} @click=${this._onPruneClick}>
          Prune
        </vaadin-button>
      </vaadin-horizontal-layout>
    ` : "";

    const dialogLayout = html`
      <style>${ResticBrowserLocationDialog.dialogStyles}</style>
      <vaadin-horizontal-layout id="dialogContent">
        <restic-browser-location-presets 
          id="locationPresets"
          .onDoubleClick=${this._handlePresetDoubleClick}
        ></restic-browser-location-presets>
        <vaadin-vertical-layout>
          <restic-browser-location-properties 
            id="locationProperties"
            .allowEditing=${newLocationPresetSelected || this._editingPreset}
          >
          </restic-browser-location-properties> 
          ${propertyButtons}
          ${maintenanceButtons}
        </vaadin-vertical-layout>
      </vaadin-horizontal-layout>
    `;

    const footerLayout = html`
      <style>${ResticBrowserLocationDialog.footerStyles}</style>
      <vaadin-horizontal-layout id="footerContent">
        <div style="flex-grow: 1"></div>
        <vaadin-button 
          @click=${this._handleMainDialogCancel}
        > Cancel 
        </vaadin-button>
        <div style="width: 4px"></div>
        <vaadin-button 
          theme="primary" 
          .disabled=${this._editingPreset && !newLocationPresetSelected} 
          @click=${this._handleMainDialogClose}
        > Okay
        </vaadin-button>
      </vaadin-horizontal-layout>
    `;

    return html`
      <vaadin-dialog
        header-title="Open Repository"
        .opened=${true}
        .noCloseOnOutsideClick=${true}
        @opened-changed=${(event: CustomEvent) => {
          if (
            !event.detail.value &&
            !this._handledClose &&
            !this._showSavePresetDialog &&
            !this._showPasswordDialog
          ) {
            this._handleMainDialogCancel();
          }
        }}
        ${dialogFooterRenderer(() => footerLayout, [])}
        .renderer=${(root: HTMLElement) => {
          this._dialogContentRoot = root;
          render(dialogLayout, root);
        }}
      ></vaadin-dialog>
    `;
  }

  private get _locationProperties(): ResticBrowserLocationProperties | undefined {
    if (this._dialogContentRoot) {
      return this._dialogContentRoot.querySelector(
        "#locationProperties",
      ) as ResticBrowserLocationProperties;
    } else {
      return undefined;
    }
  }

  private _handleMainDialogClose() {
    
    const locationProperties = this._locationProperties;
    if (locationProperties) {
      appState.repoLocation.setFromOtherLocation(locationProperties.location);
    } else {
      console.error("Failed to fetch location properties component");
    }
    
    appState.setRepositoryPassword("");
    if (
      appState.repoLocation.path &&
      !appState.repoLocation.allowEmptyPassword &&
      !appState.repoLocation.password
    ) {
      this._handleShowPasswordDialog();
      return;
    }
    
    this._handledClose = true;
    this._editingPreset = false;
    this.onClose();
  }

  private _handleMainDialogCancel() {
    
    mobx.runInAction(() => {
      appState.setRepositoryPassword("");
      appState.setSelectedLocationPreset(appState.locationPresets[0]);
      appState.setRepositoryLocation(this._initialLocation);
    });
    
    this._handledClose = true;
    this._editingPreset = false;
    this.onCancel();
  }

  private _handlePresetDoubleClick(preset: LocationPreset) {
    
    appState.setRepositoryLocation(preset.location);
    
    appState.setRepositoryPassword("");
    if (appState.repoLocation.path && !appState.repoLocation.password) {
      this._handleShowPasswordDialog();
      return;
    }
    
    this._handledClose = true;
    this._editingPreset = false;
    this.onClose();
  }

  private _handleShowSavePresetDialog() {
    
    const locationProperties = this._locationProperties;
    if (locationProperties) {
      this._newPresetLocation.setFromOtherLocation(locationProperties.location);
    } else {
      console.error("Failed to fetch location properties component");
    }
    
    this._showSavePresetDialog = true;
  }

  private _handleSavePresetDialogClose(presetName: string, savePasswords: boolean): boolean {
    if (presetName) {
      
      appState.addLocationPreset(this._newPresetLocation, presetName, savePasswords);
      
      this._showSavePresetDialog = false;
      this._editingPreset = false;
      return true;
    } else {
      Notification.show("No preset name set", {
        position: "middle",
        theme: "info",
        duration: 2000,
      });
      return false;
    }
  }

  private _handleSavePresetDialogCancel() {
    
    this._showSavePresetDialog = false;
    this._editingPreset = false;
  }

  private _handleShowPasswordDialog() {
    this._showPasswordDialog = true;
  }

  private _handlePasswordDialogClose(password: string) {
    
    appState.setRepositoryPassword(password);
    
    this._showPasswordDialog = false;
    this._handledClose = true;
    this._editingPreset = false;
    this.onClose();
  }

  private _handlePasswordDialogCancel() {
    
    appState.setRepositoryPassword("");
    this._showPasswordDialog = false;
  }

  private _handleStartEditingPreset() {
    
    this._editingPreset = true;
  }

  private _handleFinishEditingPreset() {
    
    const locationProperties = this._locationProperties;
    if (locationProperties) {
      appState.repoLocation.setFromOtherLocation(locationProperties.location);
    } else {
      console.error("Failed to fetch location properties component");
    }
    
    this._editingPreset = false;
  }

  private _handleCancelEditingPreset() {
    
    this._editingPreset = false;
  }

  private _onBackupClick() {
    appState.createBackup().catch((err) => {
      Notification.show(`Backup failed: ${err}`, { position: "middle", theme: "error" });
    });
  }

  private _onCheckClick() {
    appState.checkRepository().catch((err) => {
      Notification.show(`Check failed: ${err}`, { position: "middle", theme: "error" });
    });
  }

  private _onUnlockClick() {
    appState.unlockRepository().catch((err) => {
      Notification.show(`Unlock failed: ${err}`, { position: "middle", theme: "error" });
    });
  }

  private _onPruneClick() {
    appState.pruneRepository().catch((err) => {
      Notification.show(`Prune failed: ${err}`, { position: "middle", theme: "error" });
    });
  }
}


declare global {
  interface HTMLElementTagNameMap {
    "restic-browser-location-dialog": ResticBrowserLocationDialog;
  }
}
