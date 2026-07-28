

import { parseJsonSource } from "../utils/json-converter";


interface RepositoryLocationTypeSource {
  type?: string;
  prefix?: string;
  displayName?: string;
  credentials?: string[];
}

interface EnvValueSource {
  name?: string;
  value?: string;
}

interface LocationSource {
  prefix?: string;
  path?: string;
  credentials?: EnvValueSource[];
  allowEmptyPassword?: boolean;
  password?: string;
  insecureTls?: boolean;
}

interface SnapshotSource {
  id?: string;
  short_id?: string;
  time?: string;
  paths?: string[];
  tags?: string[];
  hostname?: string;
  username?: string;
}

interface FileSource {
  name?: string;
  type?: string;
  path?: string;
  uid?: number;
  gid?: number;
  size?: number;
  mode?: number;
  mtime?: string;
  atime?: string;
  ctime?: string;
}

export namespace restic {
  
  export class RepositoryLocationType {
    readonly type: string;
    readonly prefix: string;
    readonly displayName: string;
    readonly credentials: string[];

    constructor(source: RepositoryLocationTypeSource | string = {}) {
      const data = parseJsonSource(source) as RepositoryLocationTypeSource;
      this.type = data.type ?? "";
      this.prefix = data.prefix ?? "";
      this.displayName = data.displayName ?? "";
      this.credentials = data.credentials ?? [];
    }
  }

  
  export class EnvValue {
    readonly name: string;
    readonly value: string;

    constructor(source: EnvValueSource | string = {}) {
      const data = parseJsonSource(source) as EnvValueSource;
      this.name = data.name ?? "";
      this.value = data.value ?? "";
    }
  }

  
  export class Location {
    prefix: string;
    path: string;
    credentials: EnvValue[];
    allowEmptyPassword: boolean;
    password: string;
    insecureTls: boolean;

    constructor(source: LocationSource | string = {}) {
      const data = parseJsonSource(source) as LocationSource;
      this.prefix = data.prefix ?? "";
      this.path = data.path ?? "";
      this.credentials = ((data.credentials ?? []) as EnvValueSource[]).map((c) => new EnvValue(c));
      this.allowEmptyPassword = data.allowEmptyPassword ?? false;
      this.password = data.password ?? "";
      this.insecureTls = data.insecureTls ?? false;
    }
  }

  
  export class Snapshot {
    readonly id: string;
    readonly short_id: string;
    readonly time: string;
    readonly paths: string[];
    readonly tags: string[];
    readonly hostname: string;
    readonly username: string;

    constructor(source: SnapshotSource | string = {}) {
      const data = parseJsonSource(source) as SnapshotSource;
      this.id = data.id ?? "";
      this.short_id = data.short_id ?? "";
      this.time = data.time ?? "";
      this.paths = data.paths ?? [];
      this.tags = data.tags ?? [];
      this.hostname = data.hostname ?? "";
      this.username = data.username ?? "";
    }

    
    get timeAsDate(): Date {
      return new Date(this.time);
    }

    
    get formattedTime(): string {
      return this.timeAsDate.toLocaleString();
    }
  }

  
  export class File {
    readonly name: string;
    readonly type: string;
    readonly path: string;
    readonly uid?: number;
    readonly gid?: number;
    readonly size?: number;
    readonly mode?: number;
    readonly mtime?: string;
    readonly atime?: string;
    readonly ctime?: string;

    constructor(source: FileSource | string = {}) {
      const data = parseJsonSource(source) as FileSource;
      this.name = data.name ?? "";
      this.type = data.type ?? "";
      this.path = data.path ?? "";
      this.uid = data.uid;
      this.gid = data.gid;
      this.size = data.size;
      this.mode = data.mode;
      this.mtime = data.mtime;
      this.atime = data.atime;
      this.ctime = data.ctime;
    }

    
    get isDirectory(): boolean {
      return this.type === "dir";
    }

    
    get modeOctal(): string {
      return this.mode ? (this.mode & 0xffff).toString(8) : "-";
    }

    
    get formattedMtime(): string {
      return this.mtime ? new Date(this.mtime).toLocaleString() : "-";
    }

    
    get formattedAtime(): string {
      return this.atime ? new Date(this.atime).toLocaleString() : "-";
    }

    
    get formattedCtime(): string {
      return this.ctime ? new Date(this.ctime).toLocaleString() : "-";
    }
  }
}
