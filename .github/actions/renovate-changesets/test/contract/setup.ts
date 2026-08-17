import process from 'node:process'
import {afterEach, beforeEach, vi} from 'vitest'

type MockFn = ReturnType<typeof vi.fn>

interface ContractState {
  inputs: Record<string, string>
  booleanInputs: Record<string, boolean>
  outputs: Map<string, string>
  info: string[]
  warnings: string[]
  errors: string[]
  debug: string[]
  failed: string[]
  previousEnv: NodeJS.ProcessEnv
}

interface OctokitMocks {
  listFiles: MockFn
  listCommits: MockFn
}

interface ExecMocks {
  getExecOutput: MockFn
}

const contractState = vi.hoisted<ContractState>(() => ({
  inputs: {},
  booleanInputs: {},
  outputs: new Map(),
  info: [],
  warnings: [],
  errors: [],
  debug: [],
  failed: [],
  previousEnv: {},
}))

const octokitMocks = vi.hoisted<OctokitMocks>(() => ({
  listFiles: vi.fn(),
  listCommits: vi.fn(),
}))

const execMocks = vi.hoisted<ExecMocks>(() => ({
  getExecOutput: vi.fn(),
}))

vi.mock('@actions/core', () => ({
  getInput: vi.fn((name: string) => contractState.inputs[name] ?? ''),
  getBooleanInput: vi.fn((name: string) => contractState.booleanInputs[name] ?? false),
  info: vi.fn((message: string) => contractState.info.push(message)),
  warning: vi.fn((message: string) => contractState.warnings.push(message)),
  error: vi.fn((message: string) => contractState.errors.push(message)),
  debug: vi.fn((message: string) => contractState.debug.push(message)),
  setFailed: vi.fn((message: string) => contractState.failed.push(message)),
  setOutput: vi.fn((name: string, value: unknown) => {
    contractState.outputs.set(name, String(value))
  }),
}))

vi.mock('@octokit/rest', () => ({
  Octokit: class {
    readonly rest = {pulls: octokitMocks}
  },
}))

vi.mock('@actions/exec', () => ({
  getExecOutput: execMocks.getExecOutput,
}))

export function getContractState(): ContractState {
  return contractState
}

export function getOctokitMocks(): typeof octokitMocks {
  return octokitMocks
}

export function getExecMocks(): typeof execMocks {
  return execMocks
}

beforeEach(() => {
  contractState.previousEnv = {...process.env}
  contractState.inputs = {}
  contractState.booleanInputs = {}
  contractState.outputs.clear()
  contractState.info.length = 0
  contractState.warnings.length = 0
  contractState.errors.length = 0
  contractState.debug.length = 0
  contractState.failed.length = 0

  octokitMocks.listFiles.mockResolvedValue({data: []})
  octokitMocks.listCommits.mockResolvedValue({data: []})
  execMocks.getExecOutput.mockResolvedValue({stdout: 'contract1\n', stderr: '', exitCode: 0})
})

afterEach(() => {
  for (const key of Object.keys(process.env)) delete process.env[key]
  Object.assign(process.env, contractState.previousEnv)
})
