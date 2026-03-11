import * as core from '@actions/core'

async function run(): Promise<void> {
  core.info('update-repository-settings')
}

run().catch(error => {
  core.setFailed(error instanceof Error ? error.message : String(error))
})
