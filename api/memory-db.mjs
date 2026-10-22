/* In-memory storage with the same methods as d1-db.mjs. Used by the tests; also the shape any other store must have. */
export function memoryDb() {
  const users = new Map(), sessions = new Map(), fails = new Map();
  return {
    getUser: async (email) => users.get(email) || null,
    createUser: async (u) => { users.set(u.email, { ...u }); },
    saveHome: async (email, home, setUp) => { const u = users.get(email); if (u) { u.home = home; if (setUp) u.setUp = true; } },
    putSession: async (hash, s) => { sessions.set(hash, s); },
    getSession: async (hash) => sessions.get(hash) || null,
    delSession: async (hash) => { sessions.delete(hash); },
    getFails: async (email) => fails.get(email) || { n: 0, t: 0 },
    setFails: async (email, f) => { fails.set(email, f); },
    _sessions: sessions, _users: users,
  };
}
