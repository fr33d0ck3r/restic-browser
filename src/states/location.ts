import * as mobx from "mobx";

import type { restic } from "../backend/restic";
import { appState } from "./app-state";


export class Location {
  @mobx.observable
  type: string = "local";

  @mobx.observable
  prefix: string = "";

  @mobx.observable
  path: string = "";

  @mobx.observable
  credentials: { name: string; value: string }[] = [];

  @mobx.observable
  allowEmptyPassword: boolean = false;

  @mobx.observable
  password: string = "";

  @mobx.observable
  insecureTls: boolean = false;

  constructor() {
    mobx.makeObservable(this);

    
    mobx.reaction(
      () => this.type,
      () => {
        this._setPrefixFromType();
        this._setCredentialsFromType();
      },
    );
  }

  
  
  get clokedPath(): string {
    let repositoryName = this.path;
    if (repositoryName !== "") {
      try {
        const urlPattern =
          /^(?<protocol>.+:\/\/)?(?:(?<username>[^:@]+)(?::(?<password>[^@]+))?@)?(?<host>[^/]+)(?::(?<port>\d+))?(?<path>.*)$/;
        const matches = urlPattern.exec(repositoryName);
        if (matches?.groups) {
          const {
            protocol = "",
            username = "",
            password = "",
            host = "",
            port = "",
            path = "",
          } = matches.groups;
          if (username && password) {
            repositoryName = `${protocol || ""}${username}:***@${host}${port ? `:${port}` : ""}${path}`;
          }
        }
      } catch (_error) {
        
      }
    }
    return repositoryName;
  }

  
  @mobx.action
  reset(): void {
    this.type = "local";
    this.prefix = "";
    this.path = "";
    this.credentials = [];
    this.allowEmptyPassword = false;
    this.password = "";
    this.insecureTls = false;
  }

  
  @mobx.action
  setFromOtherLocation(other: Location, copyPasswords: boolean = true): void {
    this.type = other.type;
    this.prefix = other.prefix;
    this.path = other.path;
    this.credentials = Array.from(other.credentials);
    this.allowEmptyPassword = other.allowEmptyPassword;
    this.password = copyPasswords ? other.password : "";
    this.insecureTls = other.insecureTls;
  }

  
  @mobx.action
  setFromResticLocation(location: restic.Location): void {
    
    const locationInfo = appState.supportedLocationTypes.find((v) => v.prefix === location.prefix);
    if (!locationInfo) {
      throw Error(`Unexpected/unsupported location prefix: '${location.prefix}'`);
    }
    
    this.type = locationInfo.type;
    this.path = location.path;
    this.allowEmptyPassword = location.allowEmptyPassword;
    this.password = location.password;
    this.insecureTls = location.insecureTls;
    this._setPrefixFromType();
    this._setCredentialsFromType();
    
    for (const credential of locationInfo.credentials) {
      const defaultValue = location.credentials.find((v) => v.name === credential);
      const locationValue = this.credentials.find((v) => v.name === credential);
      if (defaultValue && locationValue) {
        locationValue.value = defaultValue.value;
      }
    }
  }

  
  @mobx.action
  private _setPrefixFromType(): void {
    const locationInfo = appState.supportedLocationTypes.find((v) => v.type === this.type);
    this.prefix = locationInfo?.prefix || "";
  }

  
  @mobx.action
  private _setCredentialsFromType(): void {
    const locationInfo = appState.supportedLocationTypes.find((v) => v.type === this.type);
    const reqiredCredentials = locationInfo?.credentials || [];
    if (this.credentials.map((v) => v.name).toString() !== reqiredCredentials.toString()) {
      this.credentials = reqiredCredentials.map((v) => {
        return { name: v, value: "" };
      });
    }
  }
}
