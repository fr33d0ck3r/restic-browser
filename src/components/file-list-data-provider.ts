import type {
  GridDataProviderCallback,
  GridDataProviderParams,
  GridSorterDefinition,
} from "@vaadin/grid";

import type { restic } from "../backend/restic";


function normalizeEmptyValue(value: any): any {
  if ([undefined, null].includes(value)) {
    return "";
  } else if (Number.isNaN(value)) {
    return value.toString();
  }
  return value;
}

function compare(a: any, b: any): number {
  a = normalizeEmptyValue(a);
  b = normalizeEmptyValue(b);

  if (a < b) {
    return -1;
  }
  if (a > b) {
    return 1;
  }
  return 0;
}

function get(path: string, object: any): any {
  return path.split(".").reduce((obj, property) => obj[property], object);
}


export class FileListDataProvider {
  private _files: restic.File[] = [];
  private _sortedFiles: restic.File[] = [];
  private _sortedFilesOrder?: GridSorterDefinition = undefined;

  constructor() {
    
    this.provider = this.provider.bind(this);
  }

  
  get sortedFiles(): restic.File[] {
    return this._files;
  }

  
  get files(): restic.File[] {
    return this._files;
  }

  
  set files(files: restic.File[]) {
    this._files = files;
    
    this._sortedFiles = [];
    this._sortedFilesOrder = undefined;
  }

  
  provider(
    params: GridDataProviderParams<restic.File>,
    callback: GridDataProviderCallback<restic.File>,
  ) {
    const items = this._sortFiles(params);
    const count = Math.min(items.length, params.pageSize);
    const start = params.page * count;
    const end = start + count;
    if (start !== 0 || end !== items.length) {
      callback(items.slice(start, end), items.length);
    } else {
      callback(items, items.length);
    }
  }

  private _sortFiles(params: GridDataProviderParams<restic.File>): restic.File[] {
    
    let sortOrder: GridSorterDefinition = {
      path: "name",
      direction: "asc",
    };
    if (params.sortOrders?.length) {
      if (params.sortOrders[0].direction) {
        sortOrder = params.sortOrders[0];
      }
    }

    
    if (
      this._sortedFilesOrder &&
      this._sortedFilesOrder.direction === sortOrder.direction &&
      this._sortedFilesOrder.path === sortOrder.path
    ) {
      return this._sortedFiles;
    }

    
    this._sortedFiles = Array.from(this._files);
    this._sortedFiles.sort((a: restic.File, b: restic.File) => {
      
      if (a.type === "dir" && a.name === "..") {
        return -1;
      } else if (b.type === "dir" && b.name === "..") {
        return 1;
      }
      
      if (sortOrder.path === "name") {
        if (a.type === "dir" && b.type !== "dir") {
          return sortOrder.direction === "asc" ? -1 : 1;
        } else if (a.type !== "dir" && b.type === "dir") {
          return sortOrder.direction === "asc" ? 1 : -1;
        }
        
        const options: Intl.CollatorOptions = {
          numeric: true,
          sensitivity: "base",
        };
        if (sortOrder.direction === "asc") {
          return a.name.localeCompare(b.name, undefined, options);
        } else {
          return b.name.localeCompare(a.name, undefined, options);
        }
      } else {
        
        if (sortOrder.direction === "asc") {
          return compare(get(sortOrder.path, a), get(sortOrder.path, b));
        } else {
          return compare(get(sortOrder.path, b), get(sortOrder.path, a));
        }
      }
    });

    return this._sortedFiles;
  }
}
