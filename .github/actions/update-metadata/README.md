# Update Metadata Action

Generate and update repository metadata, autofix lint, create changeset, and open a pull request if needed. Designed for use in .github repos and organization-wide automation.

## Inputs
- `token`: GitHub token with repo write access (required)
- `node-version`: Node.js version (default: 20)
- `autofix`: Autofix lint errors (default: true)
- `pr-branch`: Branch name for PR (default: ci/update-metadata)
- `commit-message`: Commit message (default: chore: update repository metadata)
- `pr-title`: PR title (default: chore: update repository metadata)
- `pr-body`: PR body (default: This PR updates the repository metadata files based on the latest organization scan.)
- `skip-changeset`: Skip creating a changeset (default: false)

## Outputs
- `unstaged-changes`: Unstaged changes after running metadata update
- `pr-url`: URL of the created pull request

## Example Usage
```yaml
jobs:
  update-metadata:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: ./.github/actions/update-metadata
        with:
          token: ${{ secrets.GITHUB_TOKEN }}
```

## Development
- Main logic in `src/index.ts`, built to `dist/index.js`
- Test with `npm test` (Jest)
- Lint with `npm run lint`

## License
MIT
