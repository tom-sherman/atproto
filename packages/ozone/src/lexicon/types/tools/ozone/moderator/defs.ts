/**
 * GENERATED CODE - DO NOT MODIFY
 */
import { ValidationResult, BlobRef } from '@atproto/lexicon'
import { lexicons } from '../../../../lexicons'
import { isObj, hasProp } from '../../../../util'
import { CID } from 'multiformats/cid'
import * as AppBskyActorDefs from '../../../app/bsky/actor/defs'

export interface User {
  handle?: string
  did: string
  disabled?: boolean
  profile?: AppBskyActorDefs.ProfileViewDetailed
  role:
    | 'lex:tools.ozone.moderator.defs#modRoleAdmin'
    | 'lex:tools.ozone.moderator.defs#modRoleModerator'
    | 'lex:tools.ozone.moderator.defs#modRoleTriage'
    | (string & {})
  [k: string]: unknown
}

export function isUser(v: unknown): v is User {
  return (
    isObj(v) &&
    hasProp(v, '$type') &&
    v.$type === 'tools.ozone.moderator.defs#user'
  )
}

export function validateUser(v: unknown): ValidationResult {
  return lexicons.validate('tools.ozone.moderator.defs#user', v)
}

/** Admin role. Highest level of access, can perform all actions. */
export const MODROLEADMIN = 'tools.ozone.moderator.defs#modRoleAdmin'
/** Moderator role. Can perform most actions. */
export const MODROLEMODERATOR = 'tools.ozone.moderator.defs#modRoleModerator'
/** Triage role. Mostly intended for monitoring and escalating issues. */
export const MODROLETRIAGE = 'tools.ozone.moderator.defs#modRoleTriage'