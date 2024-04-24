import { CachedGetter, SimpleStore } from '@atproto-labs/simple-store'
import { SimpleStoreMemory } from '@atproto-labs/simple-store-memory'
import { ResolveOptions, HandleResolver, ResolvedHandle } from './types.js'

export type HandleCache = SimpleStore<string, ResolvedHandle>

export class CachedHandleResolver
  extends CachedGetter<string, ResolvedHandle>
  implements HandleResolver
{
  constructor(
    /**
     * The resolver that will be used to resolve handles.
     */
    resolver: HandleResolver,
    cache: HandleCache = new SimpleStoreMemory<string, ResolvedHandle>({
      max: 1000,
      ttl: 10 * 60e3,
    }),
  ) {
    super((handle, options) => resolver.resolve(handle, options), cache)
  }

  async resolve(
    handle: string,
    options?: ResolveOptions,
  ): Promise<ResolvedHandle> {
    return this.get(handle, options)
  }
}
