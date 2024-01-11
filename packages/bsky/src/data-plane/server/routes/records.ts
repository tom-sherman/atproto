import { keyBy } from '@atproto/common'
import { AtUri } from '@atproto/syntax'
import { Timestamp } from '@bufbuild/protobuf'
import { ServiceImpl } from '@connectrpc/connect'
import * as ui8 from 'uint8arrays'
import { ids } from '../../../lexicon/lexicons'
import { Service } from '../../gen/bsky_connect'
import { PostRecordMeta, Record } from '../../gen/bsky_pb'
import { Database } from '../db'

export default (db: Database): Partial<ServiceImpl<typeof Service>> => ({
  getBlockRecords: getRecords(db, ids.AppBskyGraphBlock),
  getFeedGeneratorRecords: getRecords(db, ids.AppBskyFeedGenerator),
  getFollowRecords: getRecords(db, ids.AppBskyGraphFollow),
  getLikeRecords: getRecords(db, ids.AppBskyFeedLike),
  getListBlockRecords: getRecords(db, ids.AppBskyGraphListblock),
  getListItemRecords: getRecords(db, ids.AppBskyGraphListitem),
  getListRecords: getRecords(db, ids.AppBskyGraphList),
  getPostRecords: getPostRecords(db),
  getProfileRecords: getRecords(db, ids.AppBskyActorProfile),
  getRepostRecords: getRecords(db, ids.AppBskyFeedRepost),
  getThreadGateRecords: getRecords(db, ids.AppBskyFeedThreadgate),
  getModServiceRecords: getRecords(db, ids.AppBskyModerationService),
})

export const getRecords =
  (db: Database, collection?: string) =>
  async (req: { uris: string[] }): Promise<{ records: Record[] }> => {
    const validUris = collection
      ? req.uris.filter((uri) => new AtUri(uri).collection === collection)
      : req.uris
    const res = validUris.length
      ? await db.db
          .selectFrom('record')
          .selectAll()
          .where('uri', 'in', validUris)
          .execute()
      : []
    const byUri = keyBy(res, 'uri')
    const records: Record[] = req.uris.map((uri) => {
      const row = byUri[uri]
      const json = row ? row.json : JSON.stringify(null)
      const indexedAt = row?.indexedAt
        ? Timestamp.fromDate(new Date(row?.indexedAt))
        : undefined
      const recordBytes = ui8.fromString(json, 'utf8')
      return new Record({
        record: recordBytes,
        cid: row?.cid,
        indexedAt,
        takenDown: !!row?.takedownRef,
      })
    })
    return { records }
  }

export const getPostRecords = (db: Database) => {
  const getBaseRecords = getRecords(db, ids.AppBskyFeedPost)
  return async (req: {
    uris: string[]
  }): Promise<{ records: Record[]; meta: PostRecordMeta[] }> => {
    const [{ records }, details] = await Promise.all([
      getBaseRecords(req),
      req.uris.length
        ? await db.db
            .selectFrom('post')
            .where('uri', 'in', req.uris)
            .select(['uri', 'violatesThreadGate'])
            .execute()
        : [],
    ])
    const byKey = keyBy(details, 'uri')
    const meta = req.uris.map((uri) => {
      return new PostRecordMeta({
        violatesThreadGate: !!byKey[uri]?.violatesThreadGate,
      })
    })
    return { records, meta }
  }
}
