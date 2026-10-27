import type { Query, QueryClient } from "@tanstack/react-query";

/** Reconcile after the server resumes delivery. An older in-flight read cannot
 * satisfy that boundary; queue one follow-up without cancelling the old read. */
export function createLiveQueryRecovery(client: QueryClient, isCurrent: () => boolean) {
  const waiting = new WeakSet<Query>();
  return () => {
    if (!isCurrent()) return;
    for (const query of client.getQueryCache().findAll({ type: "active" })) {
      if (waiting.has(query)) continue;
      const refresh = () => client.invalidateQueries({ queryKey: query.queryKey, exact: true }, { cancelRefetch: false });
      if (query.state.fetchStatus !== "fetching") {
        void refresh();
        continue;
      }
      waiting.add(query);
      void (query.promise ?? refresh()).catch(() => undefined).then(() => {
        waiting.delete(query);
        if (isCurrent() && query.isActive() && client.getQueryCache().get(query.queryHash) === query) return refresh();
      }).catch(() => undefined);
    }
  };
}
