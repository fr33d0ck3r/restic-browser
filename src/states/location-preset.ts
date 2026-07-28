
import * as mobx from "mobx";

import { restic } from "../backend/restic";
import { Location } from "./location";


export class LocationPreset {
  @mobx.observable
  name: string = "New Location";

  @mobx.observable
  location: Location = new Location();

  constructor() {
    mobx.makeObservable(this);
  }

  
  fromJSON(json: any) {
    const name = (json["name"] as string) || "Untitled Preset";
    const location = new restic.Location(json["location"]);
    this.name = name;
    this.location.setFromResticLocation(location);
  }

  
  toJSON(): any {
    return {
      name: this.name,
      location: new restic.Location(this.location),
    };
  }

  
  @mobx.action
  reset(): void {
    this.name = "Untitled";
    this.location.reset();
  }
}
