/**
 * constants.js — frontend vocabulary & platform constants (single source of truth).
 */
export const ENVIRONMENTS = ['dev', 'qa', 'prod'];
export const ENV_ALL = 'all';
export const ENV_PINNED = 'pinned';                       // pseudo-env for the task's "Pinned" tab
export const ENV_LABEL = { dev: 'DEV', qa: 'QA', prod: 'PROD' }; // tabs render uppercase
export const ENV_ORDER = [...ENVIRONMENTS, ENV_PINNED];
export const PLATFORM = Object.freeze({
  name: 'Talend TAC',
  zone: 'SL3/SL4',
  label: 'Talend TAC - SL3/SL4',
});
export const PIN_STORAGE_KEY = 'pinned_servers';
export const POLL_MS = 10000;
