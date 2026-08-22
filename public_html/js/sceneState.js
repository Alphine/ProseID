/**
 * Scene State — client-side source of truth for the current scene, keyed by
 * card id (SDD 3.4 / section 4). This is what makes multi-turn patch-based
 * editing possible: each turn we only send a lightweight summary (id, card,
 * key params) to the server instead of the whole render state.
 */
export class SceneState {
  constructor() {
    /** @type {Map<string, {card:string, params:object, position:{x:number,y:number,z:number}, relation?:object}>} */
    this.entries = new Map();
  }

  has(id) {
    return this.entries.has(id);
  }

  get(id) {
    return this.entries.get(id);
  }

  add(id, card, params, position, relation) {
    this.entries.set(id, { card, params: params || {}, position, relation: relation || null });
  }

  modify(id, params) {
    const e = this.entries.get(id);
    if (!e) return false;
    e.params = { ...e.params, ...params };
    return true;
  }

  remove(id) {
    return this.entries.delete(id);
  }

  count() {
    return this.entries.size;
  }

  /** Lightweight summary sent to the LLM/proxy each turn (SDD section 4 step 1). */
  summary() {
    return Array.from(this.entries.entries()).map(([id, e]) => ({
      id,
      card: e.card,
      params: e.params,
    }));
  }

  toJSON() {
    return Object.fromEntries(this.entries);
  }
}
