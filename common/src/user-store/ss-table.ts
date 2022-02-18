import { CID } from "multiformats"
import * as check from "../type-check.js"
import { IdMapping } from "../types.js"
import IpldStore from "../blockstore/ipld-store.js"
import Timestamp from "../timestamp.js"

export class SSTable {

  store: IpldStore
  cid: CID
  size: TableSize
  data: IdMapping

  constructor(store: IpldStore, cid: CID, data: IdMapping) {
    this.store = store
    this.cid = cid
    this.data = data
    this.size = nameForSize(Object.keys(data).length)
  }

  static async create(store: IpldStore): Promise<SSTable> {
    const cid = await store.put({})
    return new SSTable(store, cid, {})
  }

  static async get(store: IpldStore, cid: CID): Promise<SSTable> {
    const data = await store.get(cid, check.assureIdMapping)
    return new SSTable(store, cid, data)
  }

  static async merge(tables: SSTable[]): Promise<SSTable> {
    if(tables.length < 1) {
      throw new Error("Must provide at least one table")
    } 
    const store = tables[0].store
    const data = tables
      .map(t => t.data)
      .reduce((acc, cur) => {
        Object.entries(cur).forEach(([key, val]) => {
          if(acc[key] !== undefined) {
            throw new Error(`Merge conflict on key: ${key}`)
          }
          acc[key] = val
        })
        return acc
      }, {} as IdMapping)

    const cid = await store.put(data)
    return new SSTable(store, cid, data) 
  }

  getEntry(id: Timestamp): CID | null {
    return this.data[id.toString()] || null
  }

  hasEntry(id: Timestamp): boolean {
    return this.getEntry(id) !== null
  }

  async addEntry(id: Timestamp, cid: CID): Promise<void> {
    // @TODO allow some leeway room?
    if (this.isFull()) {
      throw new Error("Table is full")
    }
    if(this.hasEntry(id)) {
      throw new Error(`Entry already exists for id ${id}`)
    }
    this.data[id.toString()] = cid
    this.cid = await this.store.put(this.data)
  }

  async addEntries(ids: IdMapping): Promise<void> {
    Object.entries(ids).forEach(([id, cid]) => {
      if(this.data[id]) {
        throw new Error(`Entry already exists for id ${id}`)
      }
      this.data[id] = cid
    })
    this.cid = await this.store.put(this.data)
  }

  async editEntry(id: Timestamp, cid: CID): Promise<void> {
    const idStr = id.toString()
    if(!this.data[idStr]) {
      throw new Error(`Entry does not exist for id ${idStr}`)
    }
    this.data[idStr] = cid
    this.cid = await this.store.put(this.data)
  }

  async deleteEntry(id: Timestamp): Promise<void> {
    const idStr = id.toString()
    if(!this.data[idStr]) {
      throw new Error(`Entry does not exist for id ${idStr}`)
    }
    delete this.data[idStr]
    this.cid = await this.store.put(this.data)
  }

  oldestId(): Timestamp | null {
    const str = Object.keys(this.data).sort()[0]
    return str ? Timestamp.parse(str) : null
  }

  ids(newestFirst = false): Timestamp[] {
    const sorted = Object.keys(this.data).sort()
    const ordered= newestFirst ? sorted : sorted.reverse()
    return ordered.map(k => Timestamp.parse(k))
  }

  cids(): CID[] {
    return Object.values(this.data)
  }

  currSize(): number {
    return Object.keys(this.data).length
  }

  maxSize(): number {
    return sizeForName(this.size)
  }

  isFull(): boolean {
    return this.currSize() >= this.maxSize()
  }
}


export enum TableSize {
  sm = 'sm',
  md = 'md',
  lg = 'lg',
  xl = 'xl',
}

const sizeForName = (size: TableSize): number => {
  switch (size) {
    case TableSize.sm: return 100
    case TableSize.md: return 400
    case TableSize.lg: return 1600
    case TableSize.xl: return 6400
  }
}

const nameForSize = (size: number): TableSize => {
  if (size <= 100) {
    return TableSize.sm
  } else if (size <= 400) {
    return TableSize.md
  } else if (size <= 1600) {
    return TableSize.lg
  } else {
    return TableSize.xl
  } 
}

export default SSTable
