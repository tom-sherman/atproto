import express from 'express'
import * as plc from '@did-plc/lib'
import { IdResolver } from '@atproto/identity'
import { AtpAgent } from '@atproto/api'
import { Keypair, Secp256k1Keypair } from '@atproto/crypto'
import { createServiceAuthHeaders } from '@atproto/xrpc-server'
import { Database } from './db'
import { OzoneConfig, OzoneSecrets } from './config'
import { ModerationService, ModerationServiceCreator } from './mod-service'
import { BackgroundQueue } from './background'
import assert from 'assert'
import { EventPusher } from './daemon'
import Sequencer from './sequencer/sequencer'
import {
  CommunicationTemplateService,
  CommunicationTemplateServiceCreator,
} from './communication-service/template'
import { BlobDiverter } from './daemon/blob-diverter'
import { AuthVerifier } from './auth-verifier'
import { ImageInvalidator } from './image-invalidator'
import { ModeratorService, ModeratorServiceCreator } from './moderator'
import {
  defaultLabelerHeader,
  getSigningKeyId,
  LABELER_HEADER_NAME,
  ParsedLabelers,
  parseLabelerHeader,
} from './util'

export type AppContextOptions = {
  db: Database
  cfg: OzoneConfig
  modService: ModerationServiceCreator
  communicationTemplateService: CommunicationTemplateServiceCreator
  moderatorService: ModeratorServiceCreator
  appviewAgent: AtpAgent
  pdsAgent: AtpAgent | undefined
  chatAgent: AtpAgent | undefined
  blobDiverter?: BlobDiverter
  signingKey: Keypair
  signingKeyId: number
  idResolver: IdResolver
  imgInvalidator?: ImageInvalidator
  backgroundQueue: BackgroundQueue
  sequencer: Sequencer
  authVerifier: AuthVerifier
}

export class AppContext {
  constructor(
    private opts: AppContextOptions,
    private secrets: OzoneSecrets,
  ) {}

  static async fromConfig(
    cfg: OzoneConfig,
    secrets: OzoneSecrets,
    overrides?: Partial<AppContextOptions>,
  ): Promise<AppContext> {
    const db = new Database({
      url: cfg.db.postgresUrl,
      schema: cfg.db.postgresSchema,
      poolSize: cfg.db.poolSize,
      poolMaxUses: cfg.db.poolMaxUses,
      poolIdleTimeoutMs: cfg.db.poolIdleTimeoutMs,
    })
    const signingKey = await Secp256k1Keypair.import(secrets.signingKeyHex)
    const signingKeyId = await getSigningKeyId(db, signingKey.did())
    const appviewAgent = new AtpAgent({ service: cfg.appview.url })
    const pdsAgent = cfg.pds
      ? new AtpAgent({ service: cfg.pds.url })
      : undefined
    const chatAgent = cfg.chat
      ? new AtpAgent({ service: cfg.chat.url })
      : undefined

    const idResolver = new IdResolver({
      plcUrl: cfg.identity.plcUrl,
    })

    const createAuthHeaders = (aud: string) =>
      createServiceAuthHeaders({
        iss: `${cfg.service.did}#atproto_labeler`,
        aud,
        keypair: signingKey,
      })

    const backgroundQueue = new BackgroundQueue(db)
    const blobDiverter = cfg.blobDivert
      ? new BlobDiverter(db, {
          idResolver,
          serviceConfig: cfg.blobDivert,
        })
      : undefined
    const eventPusher = new EventPusher(db, createAuthHeaders, {
      appview: cfg.appview.pushEvents ? cfg.appview : undefined,
      pds: cfg.pds ?? undefined,
    })
    const modService = ModerationService.creator(
      signingKey,
      signingKeyId,
      cfg,
      backgroundQueue,
      idResolver,
      eventPusher,
      appviewAgent,
      createAuthHeaders,
      overrides?.imgInvalidator,
    )

    const communicationTemplateService = CommunicationTemplateService.creator()
    const moderatorService = ModeratorService.creator()

    const sequencer = new Sequencer(modService(db))

    const authVerifier = new AuthVerifier(idResolver, {
      serviceDid: cfg.service.did,
      admins: cfg.access.admins,
      moderators: cfg.access.moderators,
      triage: cfg.access.triage,
      adminPassword: secrets.adminPassword,
      moderatorService: moderatorService(db),
    })

    return new AppContext(
      {
        db,
        cfg,
        modService,
        communicationTemplateService,
        moderatorService,
        appviewAgent,
        pdsAgent,
        chatAgent,
        signingKey,
        signingKeyId,
        idResolver,
        backgroundQueue,
        sequencer,
        authVerifier,
        blobDiverter,
        ...(overrides ?? {}),
      },
      secrets,
    )
  }

  assignPort(port: number) {
    assert(
      !this.cfg.service.port || this.cfg.service.port === port,
      'Conflicting port in config',
    )
    this.opts.cfg.service.port = port
  }

  get db(): Database {
    return this.opts.db
  }

  get cfg(): OzoneConfig {
    return this.opts.cfg
  }

  get modService(): ModerationServiceCreator {
    return this.opts.modService
  }

  get blobDiverter(): BlobDiverter | undefined {
    return this.opts.blobDiverter
  }

  get communicationTemplateService(): CommunicationTemplateServiceCreator {
    return this.opts.communicationTemplateService
  }

  get moderatorService(): ModeratorServiceCreator {
    return this.opts.moderatorService
  }

  get appviewAgent(): AtpAgent {
    return this.opts.appviewAgent
  }

  get pdsAgent(): AtpAgent | undefined {
    return this.opts.pdsAgent
  }

  get chatAgent(): AtpAgent | undefined {
    return this.opts.chatAgent
  }

  get signingKey(): Keypair {
    return this.opts.signingKey
  }

  get signingKeyId(): number {
    return this.opts.signingKeyId
  }

  get plcClient(): plc.Client {
    return new plc.Client(this.cfg.identity.plcUrl)
  }

  get idResolver(): IdResolver {
    return this.opts.idResolver
  }

  get backgroundQueue(): BackgroundQueue {
    return this.opts.backgroundQueue
  }

  get sequencer(): Sequencer {
    return this.opts.sequencer
  }

  get authVerifier(): AuthVerifier {
    return this.opts.authVerifier
  }

  async serviceAuthHeaders(aud: string) {
    const iss = `${this.cfg.service.did}#atproto_labeler`
    return createServiceAuthHeaders({
      iss,
      aud,
      keypair: this.signingKey,
    })
  }

  async pdsAuth() {
    if (!this.cfg.pds) {
      return undefined
    }
    return this.serviceAuthHeaders(this.cfg.pds.did)
  }

  async appviewAuth() {
    return this.serviceAuthHeaders(this.cfg.appview.did)
  }

  async chatAuth() {
    if (!this.cfg.chat) {
      throw new Error('No chat service configured')
    }
    return this.serviceAuthHeaders(this.cfg.chat.did)
  }

  devOverride(overrides: Partial<AppContextOptions>) {
    this.opts = {
      ...this.opts,
      ...overrides,
    }
  }

  reqLabelers(req: express.Request): ParsedLabelers {
    const val = req.header(LABELER_HEADER_NAME)
    let parsed: ParsedLabelers | null
    try {
      parsed = parseLabelerHeader(val, this.cfg.service.did)
    } catch (err) {
      parsed = null
    }
    if (!parsed) return defaultLabelerHeader([])
    return parsed
  }
}
export default AppContext
