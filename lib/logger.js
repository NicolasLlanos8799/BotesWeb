/**
 * Conditional logger — silences console.log in production.
 * console.error and console.warn always fire (visible in Vercel logs).
 */
const IS_PROD = process.env.APP_ENV === 'production';

export const log  = IS_PROD ? () => {} : (...args) => console.log(...args);
export const warn  = (...args) => console.warn(...args);
export const error = (...args) => console.error(...args);
