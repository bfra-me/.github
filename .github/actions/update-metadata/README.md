# Update Metadata Action

Generate and update repository metadata. Designed for use in .github repos and organization-wide automation.

## Inputs
- `token`: GitHub token with repo write access (required)

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
- Test with `pnpm test` (Vitest)
- Lint with `pnpm lint`
- Build with `pnpm build`

## License
MIT
