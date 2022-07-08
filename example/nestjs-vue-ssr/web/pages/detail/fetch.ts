import { Store } from 'vuex'
import { Route } from 'vue-router'
import { ISSRNestContext } from 'ssr-types'
import { Ddata } from '~/typings/data'

interface ApiDeatilservice {
  index: (id: string) => Promise<Ddata>
}
interface Params {
  store: Store<any>
  router: Route
  ctx?: ISSRNestContext<{
    apiDeatilservice?: ApiDeatilservice
  }>
}
export default async ({ store, router, ctx }: Params) => {
  // 阅读文档获得更多信息 http://doc.ssr-fc.com/docs/features$fetch#%E5%88%A4%E6%96%AD%E5%BD%93%E5%89%8D%E7%8E%AF%E5%A2%83
  const data = __isBrowser__ ? await (await window.fetch(`/api/detail/${router.params.id}`)).json() : await ctx?.apiDeatilservice?.index(ctx.request.params.id)
  await store.dispatch('detailStore/initialData', { payload: data })
}
