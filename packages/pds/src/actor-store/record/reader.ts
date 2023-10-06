import { AtUri, ensureValidAtUri } from '@atproto/syntax'
import * as syntax from '@atproto/syntax'
import { cborToLexRecord } from '@atproto/repo'
import { notSoftDeletedClause } from '../../db/util'
import { ids } from '../../lexicon/lexicons'
import { ActorDb, Backlink } from '../db'

export class RecordReader {
  constructor(public db: ActorDb) {}

  async listCollections(): Promise<string[]> {
    const collections = await this.db.db
      .selectFrom('record')
      .select('collection')
      .groupBy('collection')
      .execute()

    return collections.map((row) => row.collection)
  }

  async listRecordsForCollection(opts: {
    collection: string
    limit: number
    reverse: boolean
    cursor?: string
    rkeyStart?: string
    rkeyEnd?: string
    includeSoftDeleted?: boolean
  }): Promise<{ uri: string; cid: string; value: object }[]> {
    const {
      collection,
      limit,
      reverse,
      cursor,
      rkeyStart,
      rkeyEnd,
      includeSoftDeleted = false,
    } = opts

    const { ref } = this.db.db.dynamic
    let builder = this.db.db
      .selectFrom('record')
      .innerJoin('ipld_block', 'ipld_block.cid', 'record.cid')
      .where('record.collection', '=', collection)
      .if(!includeSoftDeleted, (qb) =>
        qb.where(notSoftDeletedClause(ref('record'))),
      )
      .orderBy('record.rkey', reverse ? 'asc' : 'desc')
      .limit(limit)
      .selectAll()

    // prioritize cursor but fall back to soon-to-be-depcreated rkey start/end
    if (cursor !== undefined) {
      if (reverse) {
        builder = builder.where('record.rkey', '>', cursor)
      } else {
        builder = builder.where('record.rkey', '<', cursor)
      }
    } else {
      if (rkeyStart !== undefined) {
        builder = builder.where('record.rkey', '>', rkeyStart)
      }
      if (rkeyEnd !== undefined) {
        builder = builder.where('record.rkey', '<', rkeyEnd)
      }
    }
    const res = await builder.execute()
    return res.map((row) => {
      return {
        uri: row.uri,
        cid: row.cid,
        value: cborToLexRecord(row.content),
      }
    })
  }

  async getRecord(
    uri: AtUri,
    cid: string | null,
    includeSoftDeleted = false,
  ): Promise<{
    uri: string
    cid: string
    value: object
    indexedAt: string
    takedownId: string | null
  } | null> {
    const { ref } = this.db.db.dynamic
    let builder = this.db.db
      .selectFrom('record')
      .innerJoin('ipld_block', 'ipld_block.cid', 'record.cid')
      .where('record.uri', '=', uri.toString())
      .selectAll()
      .if(!includeSoftDeleted, (qb) =>
        qb.where(notSoftDeletedClause(ref('record'))),
      )
    if (cid) {
      builder = builder.where('record.cid', '=', cid)
    }
    const record = await builder.executeTakeFirst()
    if (!record) return null
    return {
      uri: record.uri,
      cid: record.cid,
      value: cborToLexRecord(record.content),
      indexedAt: record.indexedAt,
      takedownId: record.takedownId,
    }
  }

  async hasRecord(
    uri: AtUri,
    cid: string | null,
    includeSoftDeleted = false,
  ): Promise<boolean> {
    const { ref } = this.db.db.dynamic
    let builder = this.db.db
      .selectFrom('record')
      .select('uri')
      .where('record.uri', '=', uri.toString())
      .if(!includeSoftDeleted, (qb) =>
        qb.where(notSoftDeletedClause(ref('record'))),
      )
    if (cid) {
      builder = builder.where('record.cid', '=', cid)
    }
    const record = await builder.executeTakeFirst()
    return !!record
  }

  async getRecordBacklinks(opts: {
    collection: string
    path: string
    linkTo: string
  }) {
    const { collection, path, linkTo } = opts
    return await this.db.db
      .selectFrom('record')
      .innerJoin('backlink', 'backlink.uri', 'record.uri')
      .where('backlink.path', '=', path)
      .if(linkTo.startsWith('at://'), (q) =>
        q.where('backlink.linkToUri', '=', linkTo),
      )
      .if(!linkTo.startsWith('at://'), (q) =>
        q.where('backlink.linkToDid', '=', linkTo),
      )
      .where('record.collection', '=', collection)
      .selectAll('record')
      .execute()
  }

  // @NOTE this logic a placeholder until we allow users to specify these constraints themselves.
  // Ensures that we don't end-up with duplicate likes, reposts, and follows from race conditions.

  async getBacklinkConflicts(uri: AtUri, record: unknown): Promise<AtUri[]> {
    const recordBacklinks = getBacklinks(uri, record)
    const conflicts = await Promise.all(
      recordBacklinks.map((backlink) =>
        this.getRecordBacklinks({
          collection: uri.collection,
          path: backlink.path,
          linkTo: backlink.linkToDid ?? backlink.linkToUri ?? '',
        }),
      ),
    )
    return conflicts
      .flat()
      .map(({ rkey }) => AtUri.make(uri.hostname, uri.collection, rkey))
  }
}

// @NOTE in the future this can be replaced with a more generic routine that pulls backlinks based on lex docs.
// For now we just want to ensure we're tracking links from follows, blocks, likes, and reposts.

export const getBacklinks = (uri: AtUri, record: unknown): Backlink[] => {
  if (
    record?.['$type'] === ids.AppBskyGraphFollow ||
    record?.['$type'] === ids.AppBskyGraphBlock
  ) {
    const subject = record['subject']
    if (typeof subject !== 'string') {
      return []
    }
    try {
      syntax.ensureValidDid(subject)
    } catch {
      return []
    }
    return [
      {
        uri: uri.toString(),
        path: 'subject',
        linkToDid: subject,
        linkToUri: null,
      },
    ]
  }
  if (
    record?.['$type'] === ids.AppBskyFeedLike ||
    record?.['$type'] === ids.AppBskyFeedRepost
  ) {
    const subject = record['subject']
    if (typeof subject['uri'] !== 'string') {
      return []
    }
    try {
      ensureValidAtUri(subject['uri'])
    } catch {
      return []
    }
    return [
      {
        uri: uri.toString(),
        path: 'subject.uri',
        linkToUri: subject.uri,
        linkToDid: null,
      },
    ]
  }
  return []
}