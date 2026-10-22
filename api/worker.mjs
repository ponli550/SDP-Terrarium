/* Cloudflare Worker entry. Bindings: DB (a D1 database) and ALLOWED_ORIGINS (comma-separated site origins), set in wrangler.toml. No secrets are needed. */
import { createApi } from './auth.mjs';
import { d1Db } from './d1-db.mjs';
export default {
  fetch(req, env) {
    return createApi({ db: d1Db(env.DB), allowedOrigins: String(env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean) }).fetch(req);
  },
};
