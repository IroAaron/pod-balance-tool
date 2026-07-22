import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * Dev-server-only endpoint backing the Sources page's "Подгрузить спрайты" button — `apply: 'serve'` means Vite
 * never includes this in `vite build`, so it (and the private-repo token it needs) simply doesn't exist on the
 * deployed site. See scripts/sync-sprites.mjs for the actual git-sparse-checkout work.
 */
function spriteSyncPlugin(): Plugin {
  return {
    name: 'sprite-sync-dev-middleware',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__sync-sprites', async (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405
          res.end()
          return
        }

        res.setHeader('Content-Type', 'application/json')
        try {
          const mod = (await import('./scripts/sync-sprites.mjs')) as {
            syncSprites: () => Promise<{ files: number }>
          }
          const result = await mod.syncSprites()
          res.end(JSON.stringify({ ok: true, files: result.files }))
        } catch (error) {
          res.statusCode = 500
          res.end(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error) }))
        }
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // SPRITE_REPO_TOKEN is deliberately unprefixed (not VITE_SPRITE_REPO_TOKEN) — loadEnv's third argument ('')
  // widens it to read unprefixed vars too, but only for this server-side config file. Vite only ever exposes
  // VITE_-prefixed vars to client code via import.meta.env, so this token can't end up in the built bundle.
  const env = loadEnv(mode, process.cwd(), '')
  if (env.SPRITE_REPO_TOKEN) process.env.SPRITE_REPO_TOKEN = env.SPRITE_REPO_TOKEN

  return {
    base: '/pod-balance-tool/',
    plugins: [react(), spriteSyncPlugin()],
  }
})
