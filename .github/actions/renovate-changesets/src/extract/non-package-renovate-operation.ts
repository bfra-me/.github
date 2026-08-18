export type NoPackageDisposition =
  {kind: 'skip'; reason: 'config-migration' | 'onboarding'} | {kind: 'unsupported'}

const CONFIG_MIGRATION_BODY = /the renovate config in this repository needs migrating\./iu

export function classifyNoPackageOperation(
  body: string,
  branchName: string,
  branchPrefix = 'renovate/',
): NoPackageDisposition {
  const normalizedBranch = branchName.toLowerCase()
  const normalizedPrefix = branchPrefix.toLowerCase()
  const hasConfigMigrationBranch =
    normalizedBranch === `${normalizedPrefix}config-migration` ||
    normalizedBranch.startsWith(`${normalizedPrefix}config-migration/`)
  if (hasConfigMigrationBranch && CONFIG_MIGRATION_BODY.test(body)) {
    return {kind: 'skip', reason: 'config-migration'}
  }

  const hasOnboardingBranch =
    normalizedBranch === `${normalizedPrefix}onboarding` ||
    normalizedBranch.startsWith(`${normalizedPrefix}onboarding/`) ||
    normalizedBranch === `${normalizedPrefix}configure` ||
    normalizedBranch.startsWith(`${normalizedPrefix}configure/`)
  if (
    hasOnboardingBranch &&
    /welcome to renovate/iu.test(body) &&
    /renovate-config-hash/iu.test(body)
  ) {
    return {kind: 'skip', reason: 'onboarding'}
  }

  return {kind: 'unsupported'}
}
