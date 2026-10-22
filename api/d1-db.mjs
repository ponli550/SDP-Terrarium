/* Cloudflare D1 storage, same methods as memory-db.mjs. Not exercised by the tests (no D1 here): the SQL is plain and schema.sql is the contract. */
export function d1Db(d1) {
  const one = (sql, ...a) => d1.prepare(sql).bind(...a).first();
  const run = (sql, ...a) => d1.prepare(sql).bind(...a).run();
  return {
    getUser: async (email) => { const r = await one('SELECT email, pass, home, set_up, created FROM users WHERE email = ?', email); return r ? { email: r.email, pass: r.pass, home: JSON.parse(r.home), setUp: !!r.set_up, created: r.created } : null; },
    createUser: (u) => run('INSERT INTO users (email, pass, home, set_up, created) VALUES (?, ?, ?, 0, ?)', u.email, u.pass, JSON.stringify(u.home), u.created),
    saveHome: (email, home, setUp) => run('UPDATE users SET home = ?, set_up = MAX(set_up, ?) WHERE email = ?', JSON.stringify(home), setUp ? 1 : 0, email),
    putSession: (hash, s) => run('INSERT OR REPLACE INTO sessions (hash, email, exp) VALUES (?, ?, ?)', hash, s.email, s.exp),
    getSession: (hash) => one('SELECT email, exp FROM sessions WHERE hash = ?', hash),
    delSession: (hash) => run('DELETE FROM sessions WHERE hash = ?', hash),
    getFails: async (email) => (await one('SELECT n, t FROM fails WHERE email = ?', email)) || { n: 0, t: 0 },
    setFails: (email, f) => run('INSERT OR REPLACE INTO fails (email, n, t) VALUES (?, ?, ?)', email, f.n, f.t),
  };
}
