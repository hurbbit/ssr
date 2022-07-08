import * as Vue from 'vue'
import { h, createSSRApp, renderSlot } from 'vue'
import { findRoute, getManifest, logGreen, normalizePath, getAsyncCssChunk, getAsyncJsChunk, getUserScriptVue, remInitial } from 'ssr-server-utils'
import { setStore } from 'ssr-common-utils'
import { ISSRContext, IConfig } from 'ssr-types'
import { createPinia } from 'pinia'
import { serialize } from 'ssr-serialize-javascript'
import { Routes } from './combine-router'
import { IFeRouteItem, RoutesType } from './interface'
import { createRouter, createStore } from './create'

const { FeRoutes, App, layoutFetch, Layout } = Routes as RoutesType

const serverRender = async (ctx: ISSRContext, config: IConfig) => {
  const { mode, customeHeadScript, customeFooterScript, parallelFetch, prefix, isVite, isDev, clientPrefix } = config
  const store = createStore()
  const router = createRouter()
  const pinia = createPinia()
  setStore(store)
  const [path, url] = [normalizePath(ctx.request.path, prefix), normalizePath(ctx.request.url, prefix)]
  const routeItem = findRoute<IFeRouteItem>(FeRoutes, path)

  if (!routeItem) {
    throw new Error(`
    With Path: ${path} search component failed
    If you create new folder or component file, please restart server by npm start
    `)
  }

  const { fetch, webpackChunkName } = routeItem
  const dynamicCssOrder = await getAsyncCssChunk(ctx, webpackChunkName)
  const dynamicJsOrder = await getAsyncJsChunk(ctx)
  const manifest = await getManifest(config)
  const isCsr = !!(mode === 'csr' || ctx.request.query?.csr)
  const customeHeadScriptArr: Vue.VNode[] = getUserScriptVue(customeHeadScript, ctx, h, 'vue3')
  const customeFooterScriptArr: Vue.VNode[] = getUserScriptVue(customeFooterScript, ctx, h, 'vue3')

  const cssInject = (isVite && isDev) ? [h('script', {
    type: 'module',
    src: '/@vite/client'
  })] : dynamicCssOrder.map(css => manifest[css]).filter(Boolean).map(css => h('link', {
    rel: 'stylesheet',
    href: css
  }))

  const jsInject = (isVite && isDev) ? [h('script', {
    type: 'module',
    src: '/node_modules/ssr-plugin-vue3/esm/entry/client-entry.js'
  })] : dynamicJsOrder.map(js =>
    h('script', {
      src: manifest[js],
      type: isVite ? 'module' : ''
    })
  )

  const app = createSSRApp({
    render: function () {
      const initialData = !isCsr ? h('script', {
        innerHTML: `window.__USE_SSR__=true; window.__INITIAL_DATA__ = ${serialize(state)};window.__INITIAL_PINIA_DATA__ = ${serialize(pinia.state.value)};window.__USE_VITE__=${isVite}; window.prefix="${prefix}" ;${clientPrefix ? `window.clientPrefix="${clientPrefix}";` : ''}`
      }) : h('script', { innerHTML: `window.__USE_VITE__=${isVite}; window.prefix="${prefix}"` })
      const children = h(App, { ctx, config, asyncData, fetchData: combineAysncData, reactiveFetchData: { value: combineAysncData }, ssrApp: app })

      return h(Layout,
        { ctx, config, asyncData, fetchData: layoutFetchData, reactiveFetchData: { value: layoutFetchData } },
        {
          remInitial: () => h('script', { innerHTML: remInitial }),

          customeHeadScript: () => customeHeadScriptArr,

          customeFooterScript: () => customeFooterScriptArr,

          children: () => children,

          initialData: () => initialData,

          cssInject: () => cssInject,

          jsInject: () => jsInject,

          injectHeader: () => [
            customeHeadScriptArr,
            cssInject
          ],

          content: () => [
            h('div', {
              id: 'app'
            }, renderSlot(this.$slots, 'default', {}, () => [children])),
            initialData,
            customeFooterScriptArr,
            jsInject
          ]
        }
      )
    }
  })

  app.use(router)
  app.use(store)
  app.use(pinia)

  let layoutFetchData = {}
  let fetchData = {}

  if (!isCsr) {
    router.push(url)
    await router.isReady()
    const currentFetch = fetch ? (await fetch()).default : null
    // don't need getData when csr
    if (parallelFetch) {
      [layoutFetchData, fetchData] = await Promise.all([
        layoutFetch ? layoutFetch({ store, router: router.currentRoute.value, ctx }, ctx) : Promise.resolve({}),
        currentFetch ? currentFetch({ store, router: router.currentRoute.value, ctx }, ctx) : Promise.resolve({})
      ])
    } else {
      layoutFetchData = layoutFetch ? await layoutFetch({ store, router: router.currentRoute.value, ctx }, ctx) : {}
      fetchData = currentFetch ? await currentFetch({ store, router: router.currentRoute.value, ctx }, ctx) : {}
    }
  } else {
    logGreen(`Current path ${path} use csr render mode`)
  }
  const combineAysncData = Object.assign({}, layoutFetchData ?? {}, fetchData ?? {})

  const asyncData = {
    value: combineAysncData
  }

  const state = Object.assign({}, store.state ?? {}, asyncData.value)

  return app
}

export {
  serverRender
}
