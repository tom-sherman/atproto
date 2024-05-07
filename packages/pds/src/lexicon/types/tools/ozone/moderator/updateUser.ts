/**
 * GENERATED CODE - DO NOT MODIFY
 */
import express from 'express'
import { ValidationResult, BlobRef } from '@atproto/lexicon'
import { lexicons } from '../../../../lexicons'
import { isObj, hasProp } from '../../../../util'
import { CID } from 'multiformats/cid'
import { HandlerAuth, HandlerPipeThrough } from '@atproto/xrpc-server'
import * as ToolsOzoneModeratorDefs from './defs'

export interface QueryParams {}

export interface InputSchema {
  did: string
  disabled: boolean
  role:
    | 'lex:tools.ozone.moderator.updateUser#modRoleAdmin'
    | 'lex:tools.ozone.moderator.updateUser#modRoleModerator'
    | 'lex:tools.ozone.moderator.updateUser#modRoleTriage'
    | (string & {})
  [k: string]: unknown
}

export type OutputSchema = ToolsOzoneModeratorDefs.User

export interface HandlerInput {
  encoding: 'application/json'
  body: InputSchema
}

export interface HandlerSuccess {
  encoding: 'application/json'
  body: OutputSchema
  headers?: { [key: string]: string }
}

export interface HandlerError {
  status: number
  message?: string
  error?: 'ModeratorAlreadyExists'
}

export type HandlerOutput = HandlerError | HandlerSuccess | HandlerPipeThrough
export type HandlerReqCtx<HA extends HandlerAuth = never> = {
  auth: HA
  params: QueryParams
  input: HandlerInput
  req: express.Request
  res: express.Response
}
export type Handler<HA extends HandlerAuth = never> = (
  ctx: HandlerReqCtx<HA>,
) => Promise<HandlerOutput> | HandlerOutput