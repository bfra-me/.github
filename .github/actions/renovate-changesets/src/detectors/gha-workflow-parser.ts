import type {ActionReference, WorkflowFile} from './gha-types.js'
import {load} from 'js-yaml'

export function isGitHubActionsFile(filename: string): boolean {
  const workflowPatterns = ['.github/workflows/', '.github/actions/', 'workflow-templates/']
  const extensions = ['.yaml', '.yml']

  return (
    workflowPatterns.some(pattern => filename.includes(pattern)) &&
    extensions.some(ext => filename.endsWith(ext))
  )
}

export function extractInlineVersions(content: string): Map<string, string> {
  const versions = new Map<string, string>()
  const pattern = /uses:\s*([^@\s]+)@(\S+)\s+#\s*(v?[\d.]+(?:-[a-zA-Z0-9.-]+)?)/g
  let match = pattern.exec(content)
  while (match != null) {
    const ref = match[2]?.split('#')[0]?.trim() ?? ''
    if (ref && match[3]) {
      versions.set(ref, match[3])
    }
    match = pattern.exec(content)
  }
  return versions
}

export async function parseActionReferences(
  content: string,
  filename: string,
): Promise<ActionReference[]> {
  const actions: ActionReference[] = []
  const inlineVersions = extractInlineVersions(content)

  try {
    const workflow = load(content) as WorkflowFile
    if (!workflow || typeof workflow !== 'object') {
      return actions
    }

    if (workflow.jobs && typeof workflow.jobs === 'object') {
      for (const [jobId, job] of Object.entries(workflow.jobs)) {
        if (job.uses && typeof job.uses === 'string') {
          const actionRef = parseActionUses(job.uses, jobId)
          if (actionRef) {
            actionRef.inlineVersion = actionRef.inlineVersion ?? inlineVersions.get(actionRef.ref)
            actions.push(actionRef)
          }
        }

        if (job.steps && Array.isArray(job.steps)) {
          for (const [stepIndex, step] of job.steps.entries()) {
            if (step.uses && typeof step.uses === 'string') {
              const actionRef = parseActionUses(
                step.uses,
                step.name || `${jobId}-step-${stepIndex}`,
              )
              if (actionRef) {
                actionRef.inlineVersion =
                  actionRef.inlineVersion ?? inlineVersions.get(actionRef.ref)
                actions.push(actionRef)
              }
            }
          }
        }
      }
    }
  } catch (error) {
    console.warn(`Failed to parse workflow YAML in ${filename}:`, error)
  }

  return actions
}

export function parseActionUses(uses: string, stepName: string): ActionReference | null {
  if (uses.startsWith('./')) {
    return null
  }

  const match = uses.match(/^([^@]+)@(.+)$/)
  if (!match || !match[1] || !match[2]) {
    return null
  }

  const [, name, fullRef] = match
  const commentMatch = uses.match(/#\s*(v?[\d.]+(?:-[a-zA-Z0-9.-]+)?(?:\+[a-zA-Z0-9.-]+)?)/)
  const inlineVersion = commentMatch ? commentMatch[1] : undefined
  const ref = (fullRef || '').split('#')[0]?.trim() || ''

  return {
    name: name.trim(),
    ref,
    uses,
    stepName,
    inlineVersion,
  }
}
