/**
 * The Eye — DEV logger.
 * All logs are prefixed with [the-eye:<channel>] and only active in development.
 */

const DEV = import.meta.env.DEV;

export const theEyeLog = {
  core: (msg: string, ...args: unknown[]) => {
    if (DEV) console.log('[the-eye:core]', msg, ...args);
  },
  adapter: (msg: string, ...args: unknown[]) => {
    if (DEV) console.log('[the-eye:adapter]', msg, ...args);
  },
  rule: (msg: string, ...args: unknown[]) => {
    if (DEV) console.log('[the-eye:rule]', msg, ...args);
  },
  insight: (msg: string, ...args: unknown[]) => {
    if (DEV) console.log('[the-eye:insight]', msg, ...args);
  },
  error: (msg: string, ...args: unknown[]) => {
    if (DEV) console.error('[the-eye:error]', msg, ...args);
  },
};
