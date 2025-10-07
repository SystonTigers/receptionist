export function isBrowserE2ETestEnvironment(): boolean {
  return typeof process !== 'undefined' && process.env.NEXT_PUBLIC_E2E_TEST === 'true';
}

export function isServerE2ETestEnvironment(): boolean {
  return typeof process !== 'undefined' && process.env.E2E_TEST === 'true';
}
