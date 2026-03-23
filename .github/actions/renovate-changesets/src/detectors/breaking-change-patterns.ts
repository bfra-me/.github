import type {RenovateDependency, RenovateManagerType} from '../renovate-parser.js'

interface FrameworkPatterns {
  [framework: string]: {
    breakingKeywords: string[]
    deprecationKeywords: string[]
    configChanges: string[]
    apiChanges: string[]
  }
}

export const FRAMEWORK_PATTERNS: FrameworkPatterns = {
  react: {
    breakingKeywords: [
      'breaking change',
      'breaking changes',
      'removed in react',
      'deprecated react',
      'no longer supported',
      'legacy mode removed',
    ],
    deprecationKeywords: [
      'componentwillmount',
      'componentwillreceiveprops',
      'componentwillupdate',
      'finddomnode',
      'string refs',
    ],
    configChanges: ['react.config', 'webpack.config', 'babel.config'],
    apiChanges: ['createelement', 'render', 'hydrate', 'unmount'],
  },
  vue: {
    breakingKeywords: [
      'breaking change',
      'vue 3 migration',
      'composition api',
      'vue 2 removed',
      'options api deprecated',
    ],
    deprecationKeywords: [
      '$listeners',
      '$scopedslots',
      'functional components',
      'filters',
      'inline-template',
    ],
    configChanges: ['vue.config', 'vite.config'],
    apiChanges: ['createapp', 'mount', 'global properties'],
  },
  angular: {
    breakingKeywords: [
      'breaking change',
      'angular update',
      'ivy renderer',
      'viewengine removed',
      'deprecated api',
    ],
    deprecationKeywords: ['viewchild', 'contentchild', 'elementref', 'renderer', 'http module'],
    configChanges: ['angular.json', 'tsconfig.json', 'karma.conf'],
    apiChanges: ['component', 'directive', 'service', 'module'],
  },
  node: {
    breakingKeywords: [
      'breaking change',
      'node.js removed',
      'deprecated in node',
      'runtime breaking',
      'esm only',
    ],
    deprecationKeywords: [
      'util.isarray',
      'buffer constructor',
      'domain module',
      'punycode',
      'url.parse',
    ],
    configChanges: ['package.json', '.nvmrc', 'tsconfig.json'],
    apiChanges: ['require', 'import', 'exports', 'module'],
  },
  typescript: {
    breakingKeywords: [
      'breaking change',
      'typescript removed',
      'strict mode',
      'type checking',
      'compilation error',
    ],
    deprecationKeywords: [
      'namespace',
      'module declaration',
      'ambient modules',
      'export =',
      'import require',
    ],
    configChanges: ['tsconfig.json', 'tslint.json', '.eslintrc'],
    apiChanges: ['interface', 'type', 'enum', 'class'],
  },
  express: {
    breakingKeywords: [
      'breaking change',
      'middleware removed',
      'deprecated middleware',
      'router changes',
      'request/response api',
    ],
    deprecationKeywords: ['bodyparser', 'express.static', 'req.param', 'res.send', 'app.configure'],
    configChanges: ['server.js', 'app.js', 'middleware'],
    apiChanges: ['router', 'middleware', 'request', 'response'],
  },
  docker: {
    breakingKeywords: [
      'breaking change',
      'image removed',
      'deprecated tag',
      'base image change',
      'entrypoint change',
    ],
    deprecationKeywords: [
      'legacy dockerfile',
      'old base image',
      'deprecated instruction',
      'unsupported flag',
    ],
    configChanges: ['dockerfile', 'docker-compose.yml', '.dockerignore'],
    apiChanges: ['from', 'run', 'cmd', 'entrypoint'],
  },
  'github-actions': {
    breakingKeywords: [
      'breaking change',
      'action removed',
      'deprecated action',
      'workflow syntax',
      'runner requirement',
    ],
    deprecationKeywords: ['set-output', 'save-state', 'add-path', 'node 12', 'ubuntu-18.04'],
    configChanges: ['action.yml', 'action.yaml', 'workflow'],
    apiChanges: ['inputs', 'outputs', 'runs', 'steps'],
  },
}

export function detectEcosystem(dependencyName: string, manager: RenovateManagerType): string {
  const name = dependencyName.toLowerCase()

  if (name.includes('react') || name.includes('@react')) return 'react'
  if (name.includes('vue') || name.includes('@vue')) return 'vue'
  if (name.includes('angular') || name.includes('@angular')) return 'angular'
  if (name.includes('express') || name.includes('fastify')) return 'express'
  if (name.includes('typescript') || name.includes('@types')) return 'typescript'

  if (manager === 'docker' || manager === 'dockerfile') return 'docker'
  if (manager === 'github-actions') return 'github-actions'
  if (manager === 'npm' || manager === 'pnpm' || manager === 'yarn') return 'node'

  return 'generic'
}

export function getFrameworkPatterns(dependency: RenovateDependency):
  | {
      breakingKeywords: string[]
      deprecationKeywords: string[]
      configChanges: string[]
      apiChanges: string[]
    }
  | undefined {
  return FRAMEWORK_PATTERNS[detectEcosystem(dependency.name, dependency.manager)]
}
