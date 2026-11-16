/** Where saved scenarios are kept (U5). Scenarios cross it as serialized text. */
export interface ScenarioStorage {
  /** Saved names in alphabetical order. */
  list(): Promise<string[]>;
  load(name: string): Promise<string | null>;
  save(name: string, scenario: string): Promise<void>;
}

const PREFIX = "web-rts:scenario:";

/** Keeps scenarios in the browser's local storage, or anything shaped like it. */
export function createLocalStorage(
  store: Pick<Storage, "getItem" | "setItem" | "key" | "length">,
): ScenarioStorage {
  return {
    async list() {
      const names: string[] = [];
      for (let i = 0; i < store.length; i++) {
        const key = store.key(i);
        if (key?.startsWith(PREFIX)) names.push(key.slice(PREFIX.length));
      }
      return names.sort();
    },
    async load(name) {
      return store.getItem(PREFIX + name);
    },
    async save(name, scenario) {
      store.setItem(PREFIX + name, scenario);
    },
  };
}
