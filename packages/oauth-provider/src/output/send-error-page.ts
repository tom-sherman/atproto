import { IncomingMessage, ServerResponse } from 'node:http'

import { Html, html } from '@atproto/html'

import { getAsset } from '../assets/index.js'
import { Branding, buildBrandingCss, buildBrandingData } from './branding.js'
import { buildErrorPayload, buildErrorStatus } from './build-error-payload.js'
import { declareBrowserGlobalVar, sendWebApp } from './send-web-app.js'

export async function sendErrorPage(
  req: IncomingMessage,
  res: ServerResponse,
  err: unknown,
  branding?: Branding,
): Promise<void> {
  return sendWebApp(req, res, {
    status: buildErrorStatus(err),
    scripts: [
      declareBrowserGlobalVar('__brandingData', buildBrandingData(branding)),
      declareBrowserGlobalVar('__errorData', buildErrorPayload(err)),
      await getAsset('main.js'),
    ],
    styles: [
      await getAsset('main.css'),
      Html.dangerouslyCreate([buildBrandingCss(branding)]),
    ],
    title: 'Error',
    body: html`<div id="root"></div>`,
  })
}
