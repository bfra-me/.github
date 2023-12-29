import {fileURLToPath} from 'url';
import {dirname, join} from 'path';
import process from 'process';
import {exec, getExecOutput} from '@actions/exec';
import {version} from '../package.json';

const tag = `v${version}`;
const [major] = version.split('.');

process.chdir(join(dirname(fileURLToPath(import.meta.url)), '..'));

async function main() {
  const {exitCode, stderr} = await getExecOutput(
    'git',
    ['ls-remote', '--exit-code', 'origin', '--tags', `refs/tags/${tag}`],
    {ignoreReturnCode: true},
  );
  if (exitCode === 0) {
    console.log(`Tag ${tag} already exists`);
    return;
  }
  if (exitCode !== 2) {
    throw new Error(`git ls-remote exited with ${exitCode}:\n${stderr}`);
  }

  // https://github.com/changesets/changesets/blob/main/docs/command-line-options.md#tag
  await exec('changeset', ['tag']);
  await exec('git', ['push', '--force', '--follow-tags', 'origin', `HEAD:refs/heads/v${major}`]);
}

await main();
