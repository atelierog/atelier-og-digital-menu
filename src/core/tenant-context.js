export function createTenantContextStore(ttlMs = 30_000, now = () => Date.now()) {
  let current = null;
  return {
    set({ businessId, userId, business, membership, enabledRows = [] }) {
      current = { businessId, userId, business, membership, enabledRows, loadedAt: now() };
      return current;
    },
    get(businessId, userId) {
      if (!current || current.businessId !== businessId || current.userId !== userId) return null;
      if (now() - current.loadedAt >= ttlMs) {
        current = null;
        return null;
      }
      return current;
    },
    clear() { current = null; },
  };
}
