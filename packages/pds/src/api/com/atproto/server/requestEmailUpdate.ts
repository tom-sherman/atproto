import { InvalidRequestError } from '@atproto/xrpc-server'
import { DAY, HOUR } from '@atproto/common'
import { Server } from '../../../../lexicon'
import AppContext from '../../../../context'

export default function (server: Server, ctx: AppContext) {
  server.com.atproto.server.requestEmailUpdate({
    rateLimit: [
      {
        durationMs: DAY,
        points: 15,
        calcKey: ({ auth }) => auth.credentials.did,
      },
      {
        durationMs: HOUR,
        points: 5,
        calcKey: ({ auth }) => auth.credentials.did,
      },
    ],
    auth: ctx.authVerifier.accessCheckTakedown,
    handler: async ({ auth }) => {
      const did = auth.credentials.did
      const user = await ctx.services.account(ctx.db).getAccount(did)
      if (!user) {
        throw new InvalidRequestError('user not found')
      }

      const tokenRequired = !!user.emailConfirmedAt
      if (tokenRequired) {
        const token = await ctx.services
          .account(ctx.db)
          .createEmailToken(did, 'update_email')
        await ctx.mailer.sendUpdateEmail({ token }, { to: user.email })
      }

      return {
        encoding: 'application/json',
        body: {
          tokenRequired,
        },
      }
    },
  })
}
