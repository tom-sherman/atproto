import { InvalidRequestError } from '@atproto/xrpc-server'
import { UserDb } from '../user-db'

export class PreferencesService {
  constructor(public db: UserDb) {}

  static creator() {
    return (db: UserDb) => new PreferencesService(db)
  }

  async getPreferences(
    did: string,
    namespace?: string,
  ): Promise<UserPreference[]> {
    const prefsRes = await this.db.db
      .selectFrom('user_pref')
      .orderBy('id')
      .selectAll()
      .execute()
    return prefsRes
      .filter((pref) => !namespace || matchNamespace(namespace, pref.name))
      .map((pref) => JSON.parse(pref.valueJson))
  }

  async putPreferences(
    did: string,
    values: UserPreference[],
    namespace: string,
  ): Promise<void> {
    this.db.assertTransaction()
    if (!values.every((value) => matchNamespace(namespace, value.$type))) {
      throw new InvalidRequestError(
        `Some preferences are not in the ${namespace} namespace`,
      )
    }
    // get all current prefs for user and prep new pref rows
    const allPrefs = await this.db.db
      .selectFrom('user_pref')
      .select(['id', 'name'])
      .execute()
    const putPrefs = values.map((value) => {
      return {
        did,
        name: value.$type,
        valueJson: JSON.stringify(value),
      }
    })
    const allPrefIdsInNamespace = allPrefs
      .filter((pref) => matchNamespace(namespace, pref.name))
      .map((pref) => pref.id)
    // replace all prefs in given namespace
    if (allPrefIdsInNamespace.length) {
      await this.db.db
        .deleteFrom('user_pref')
        .where('id', 'in', allPrefIdsInNamespace)
        .execute()
    }
    if (putPrefs.length) {
      await this.db.db.insertInto('user_pref').values(putPrefs).execute()
    }
  }
}

export type UserPreference = Record<string, unknown> & { $type: string }

const matchNamespace = (namespace: string, fullname: string) => {
  return fullname === namespace || fullname.startsWith(`${namespace}.`)
}
