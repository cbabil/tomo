import { createLogger } from "./logger.js";
import { slugify } from "./utils.js";
import type { App } from "./app.js";
import type { ExternalApp, Store } from "./store.js";

const log = createLogger("external-apps");

export async function addExternal(
  store: Store,
  instances: Map<string, App>,
  input: { name: string; url: string; icon?: string },
): Promise<ExternalApp> {
  const id = slugify(input.name);
  if (!id) throw new Error("Invalid app name");
  if (instances.has(id)) {
    throw new Error(`App ID already in use: ${id}`);
  }

  const config = store.get();
  if (config.apps.external.some((e) => e.id === id)) {
    throw new Error(`External app already exists: ${id}`);
  }

  const entry: ExternalApp = {
    id,
    name: input.name,
    url: input.url,
    icon: input.icon,
    addedAt: new Date().toISOString(),
  };

  await store.update({
    apps: {
      ...config.apps,
      external: [...config.apps.external, entry],
    },
  });

  log.info("External app added", { id, url: input.url });
  return entry;
}

export async function removeExternal(
  store: Store,
  id: string,
): Promise<void> {
  const config = store.get();
  const filtered = config.apps.external.filter((e) => e.id !== id);
  if (filtered.length === config.apps.external.length) {
    throw new Error(`External app not found: ${id}`);
  }

  await store.update({
    apps: { ...config.apps, external: filtered },
  });
  log.info("External app removed", { id });
}

export async function updateExternal(
  store: Store,
  id: string,
  input: { name?: string; url?: string; icon?: string },
): Promise<ExternalApp> {
  const config = store.get();
  const index = config.apps.external.findIndex((e) => e.id === id);
  if (index === -1) {
    throw new Error(`External app not found: ${id}`);
  }

  const updated: ExternalApp = {
    ...config.apps.external[index],
    ...(input.name !== undefined && { name: input.name }),
    ...(input.url !== undefined && { url: input.url }),
    ...(input.icon !== undefined && { icon: input.icon }),
  };

  const external = config.apps.external.map((e) =>
    e.id === id ? updated : e,
  );

  await store.update({
    apps: { ...config.apps, external },
  });

  log.info("External app updated", { id });
  return updated;
}

export function listExternal(store: Store): ExternalApp[] {
  return store.get().apps.external;
}
