#!/usr/bin/env tsx

/**
 * TypeScript Type-Only Imports/Exports Validation Script
 *
 * Analyzes TypeScript files in the monorepo to validate proper usage of type-only
 * imports and exports. Ensures optimal bundle sizes and proper type safety by
 * detecting when imports/exports should use the `import type` or `export type` syntax.
 */

import {existsSync, readFileSync} from 'node:fs'
import {relative} from 'node:path'
import process from 'node:process'
import {getPackages, type Package} from '@manypkg/get-packages'
import {glob} from 'glob'

interface ImportDeclaration {
  type: 'regular' | 'type-only' | 'namespace' | 'default'
  specifiers: string[]
  source: string
  line: number
  rawText: string
}

interface ExportDeclaration {
  type: 'regular' | 'type-only' | 'namespace' | 'default' | 're-export'
  specifiers: string[]
  source?: string
  line: number
  rawText: string
}

interface TypeUsageInfo {
  name: string
  line: number
  context: 'type-annotation' | 'value-usage' | 'both' | 'generic' | 'extends' | 'implements'
}

interface FileAnalysis {
  filePath: string
  imports: ImportDeclaration[]
  exports: ExportDeclaration[]
  typeUsages: TypeUsageInfo[]
  violations: ValidationViolation[]
}

interface ValidationViolation {
  type: 'import-should-be-type-only' | 'export-should-be-type-only' | 'unnecessary-type-only'
  severity: 'error' | 'warning' | 'info'
  line: number
  description: string
  suggestion: string
  currentCode: string
  suggestedCode: string
}

interface ValidationReport {
  timestamp: Date
  packages: Package[]
  fileAnalyses: FileAnalysis[]
  summary: {
    totalFiles: number
    totalImports: number
    totalExports: number
    totalViolations: number
    violationsByType: Record<string, number>
    violationsBySeverity: Record<string, number>
  }
  recommendations: string[]
  healthScore: number
}

class TypeOnlyValidator {
  private workspaceRoot: string
  private packages: Package[]

  constructor(workspaceRoot: string, packages: Package[]) {
    this.workspaceRoot = workspaceRoot
    this.packages = packages
  }

  /**
   * Parse import declarations from TypeScript source code
   */
  private parseImports(content: string): ImportDeclaration[] {
    const imports: ImportDeclaration[] = []
    const lines = content.split('\n')

    for (const [index, rawLine] of lines.entries()) {
      const line = rawLine.trim()
      const lineNumber = index + 1

      // Skip comments and empty lines
      if (line.startsWith('//') || line.startsWith('/*') || !line.includes('import')) {
        continue
      }

      // Match various import patterns
      const importPatterns = [
        // import type { ... } from '...'
        /^import\s+type\s+\{([^}]+)\}\s+from\s+['"`]([^'"`]+)['"`]/,
        // import type ... from '...'
        /^import\s+type\s+([^{][^,\s]+)\s+from\s+['"`]([^'"`]+)['"`]/,
        // import type * as ... from '...'
        /^import\s+type\s+\*\s+as\s+(\w+)\s+from\s+['"`]([^'"`]+)['"`]/,
        // import { ... } from '...'
        /^import\s+\{([^}]+)\}\s+from\s+['"`]([^'"`]+)['"`]/,
        // import ... from '...'
        /^import\s+([^{][^,\s]+)\s+from\s+['"`]([^'"`]+)['"`]/,
        // import * as ... from '...'
        /^import\s+\*\s+as\s+(\w+)\s+from\s+['"`]([^'"`]+)['"`]/,
      ]

      for (const pattern of importPatterns) {
        const match = line.match(pattern)
        if (match) {
          let type: ImportDeclaration['type'] = 'regular'
          let specifiers: string[] = []

          if (line.includes('import type')) {
            type = 'type-only'
          } else if (line.includes('* as')) {
            type = 'namespace'
          } else if (line.includes('{')) {
            type = 'regular'
          } else {
            type = 'default'
          }

          if (match[1] && match[1].includes(',')) {
            // Named imports like { a, b, c }
            specifiers = match[1].split(',').map(s => s.trim())
          } else if (match[1]) {
            specifiers = [match[1].trim()]
          }

          imports.push({
            type,
            specifiers,
            source: match[2] || match.at(-1) || '',
            line: lineNumber,
            rawText: line,
          })
          break
        }
      }
    }

    return imports
  }

  /**
   * Parse export declarations from TypeScript source code
   */
  private parseExports(content: string): ExportDeclaration[] {
    const exports: ExportDeclaration[] = []
    const lines = content.split('\n')

    for (const [index, rawLine] of lines.entries()) {
      const line = rawLine.trim()
      const lineNumber = index + 1

      // Skip comments and empty lines
      if (line.startsWith('//') || line.startsWith('/*') || !line.includes('export')) {
        continue
      }

      // Match various export patterns
      const exportPatterns = [
        // export type { ... } from '...'
        /^export\s+type\s+\{([^}]+)\}\s+from\s+['"`]([^'"`]+)['"`]/,
        // export type { ... }
        /^export\s+type\s+\{([^}]+)\}/,
        // export type ...
        /^export\s+type\s+([^{][^=,\s]+)/,
        // export { ... } from '...'
        /^export\s+\{([^}]+)\}\s+from\s+['"`]([^'"`]+)['"`]/,
        // export { ... }
        /^export\s+\{([^}]+)\}/,
        // export * from '...'
        /^export\s+\*\s+from\s+['"`]([^'"`]+)['"`]/,
        // export * as ... from '...'
        /^export\s+\*\s+as\s+(\w+)\s+from\s+['"`]([^'"`]+)['"`]/,
        // export default ...
        /^export\s+default\s+/,
      ]

      for (const pattern of exportPatterns) {
        const match = line.match(pattern)
        if (match) {
          let type: ExportDeclaration['type'] = 'regular'
          let specifiers: string[] = []
          let source: string | undefined

          if (line.includes('export type')) {
            type = 'type-only'
          } else if (line.includes('export default')) {
            type = 'default'
          } else if (line.includes('* as')) {
            type = 'namespace'
          } else if (line.includes('from')) {
            type = 're-export'
          }

          if (match[1] && match[1].includes(',')) {
            // Named exports like { a, b, c }
            specifiers = match[1].split(',').map(s => s.trim())
          } else if (match[1]) {
            specifiers = [match[1].trim()]
          }

          // Check for 'from' clause
          if (match[2]) {
            source = match[2]
          } else if (match.at(-1) && line.includes('from')) {
            source = match.at(-1)
          }

          exports.push({
            type,
            specifiers,
            source,
            line: lineNumber,
            rawText: line,
          })
          break
        }
      }
    }

    return exports
  }

  /**
   * Analyze how imported/exported identifiers are used in the file
   */
  private analyzeTypeUsages(content: string): TypeUsageInfo[] {
    const usages: TypeUsageInfo[] = []
    const lines = content.split('\n')

    for (const [index, rawLine] of lines.entries()) {
      const line = rawLine.trim()
      const lineNumber = index + 1

      // Skip import/export lines and comments
      if (
        line.startsWith('import') ||
        line.startsWith('export') ||
        line.startsWith('//') ||
        line.startsWith('/*')
      ) {
        continue
      }

      // Look for type annotations, generics, extends, implements
      const typePatterns = [
        // Type annotations: variable: Type, parameter: Type
        /(\w+):\s*([A-Z]\w*)/g,
        // Generic usage: Class<Type>
        /(\w+)<([A-Z]\w*)>/g,
        // extends Type
        /extends\s+([A-Z]\w*)/g,
        // implements Type
        /implements\s+([A-Z]\w*)/g,
        // as Type
        /as\s+([A-Z]\w*)/g,
      ]

      for (const pattern of typePatterns) {
        let match = pattern.exec(line)
        while (match !== null) {
          const typeName = match[2] || match[1]
          let context: TypeUsageInfo['context'] = 'type-annotation'

          if (line.includes('extends')) {
            context = 'extends'
          } else if (line.includes('implements')) {
            context = 'implements'
          } else if (line.includes('<')) {
            context = 'generic'
          }

          usages.push({
            name: typeName,
            line: lineNumber,
            context,
          })

          match = pattern.exec(line)
        }
      }

      // Look for value usage (non-type contexts)
      const valueUsagePatterns = [
        // Constructor usage: new ClassName()
        /new\s+(\w+)/g,
        // instanceof usage: instanceof ClassName
        /instanceof\s+(\w+)/g,
        // Function/method calls: functionName()
        /(\w+)\s*\(/g,
        // Static method calls: ClassName.method
        /(\w+)\./g,
        // Variable assignment: const x = ClassName
        /=\s*(\w+)$/g,
        // Object destructuring: { prop } = obj
        /=\s*\{[^}]*\}\s*(\w+)/g,
      ]

      for (const pattern of valueUsagePatterns) {
        let valueMatch = pattern.exec(line)
        while (valueMatch !== null) {
          const identifier = valueMatch[1]
          if (identifier && /^[A-Z]/.test(identifier)) {
            // Likely a class or constructor name
            const existingUsage = usages.find(u => u.name === identifier && u.line === lineNumber)
            if (existingUsage) {
              existingUsage.context = 'both'
            } else {
              usages.push({
                name: identifier,
                line: lineNumber,
                context: 'value-usage',
              })
            }
          }
          valueMatch = pattern.exec(line)
        }
      }
    }

    return usages
  }

  /**
   * Validate a single file for type-only import/export violations
   */
  private validateFile(filePath: string): FileAnalysis {
    const content = readFileSync(filePath, 'utf-8')
    const imports = this.parseImports(content)
    const exports = this.parseExports(content)
    const typeUsages = this.analyzeTypeUsages(content)
    const violations: ValidationViolation[] = []

    // Check imports for violations
    for (const importDecl of imports) {
      for (const specifier of importDecl.specifiers) {
        const cleanSpecifier = specifier.replace(/\s+as\s+\w+$/, '') // Remove 'as alias'
        const allUsages = typeUsages.filter(u => u.name === cleanSpecifier)

        // Determine the most permissive context (value-usage > both > type contexts)
        const hasValueUsage = allUsages.some(
          u => u.context === 'value-usage' || u.context === 'both',
        )
        const hasTypeUsage = allUsages.some(
          u =>
            u.context === 'type-annotation' ||
            u.context === 'generic' ||
            u.context === 'extends' ||
            u.context === 'implements',
        )

        if (
          importDecl.type === 'regular' &&
          hasTypeUsage &&
          !hasValueUsage // Only suggest type-only if there's NO value usage
        ) {
          // Should be type-only import
          violations.push({
            type: 'import-should-be-type-only',
            severity: 'warning',
            line: importDecl.line,
            description: `'${cleanSpecifier}' is only used as a type and should use 'import type'`,
            suggestion: `Use 'import type' for type-only imports to optimize bundle size`,
            currentCode: importDecl.rawText,
            suggestedCode: importDecl.rawText.replace(/^import\s+/, 'import type '),
          })
        } else if (importDecl.type === 'type-only' && hasValueUsage) {
          // Unnecessary type-only import
          violations.push({
            type: 'unnecessary-type-only',
            severity: 'error',
            line: importDecl.line,
            description: `'${cleanSpecifier}' is used as a value but imported as type-only`,
            suggestion: `Remove 'type' from import to allow value usage`,
            currentCode: importDecl.rawText,
            suggestedCode: importDecl.rawText.replace(/^import\s+type\s+/, 'import '),
          })
        }
      }
    }

    // Check exports for violations
    for (const exportDecl of exports) {
      // For re-exports from type-only modules or when exporting types
      if (
        exportDecl.type === 'regular' &&
        (exportDecl.source?.includes('types') ||
          exportDecl.specifiers.some(s => /^[A-Z]/.test(s.trim())))
      ) {
        // Check if all specifiers are types
        const allAreTypes = exportDecl.specifiers.every(specifier => {
          const cleanSpecifier = specifier.replace(/\s+as\s+\w+$/, '')
          return /^[A-Z]/.test(cleanSpecifier.trim()) // Convention: types start with uppercase
        })

        if (allAreTypes) {
          violations.push({
            type: 'export-should-be-type-only',
            severity: 'info',
            line: exportDecl.line,
            description: `Export appears to be type-only and could use 'export type'`,
            suggestion: `Use 'export type' for type-only exports to optimize bundle size`,
            currentCode: exportDecl.rawText,
            suggestedCode: exportDecl.rawText.replace(/^export\s+/, 'export type '),
          })
        }
      }
    }

    return {
      filePath,
      imports,
      exports,
      typeUsages,
      violations,
    }
  }

  /**
   * Run validation across all TypeScript files in the workspace
   */
  async validate(): Promise<ValidationReport> {
    const fileAnalyses: FileAnalysis[] = []
    const timestamp = new Date()

    // Find all TypeScript files in the workspace
    for (const pkg of this.packages) {
      const packagePath = pkg.dir
      const tsFiles = await glob('**/*.ts', {
        cwd: packagePath,
        ignore: ['node_modules/**', 'dist/**', '**/*.d.ts', '**/*.test.ts', '**/*.spec.ts'],
        absolute: true,
      })

      for (const filePath of tsFiles) {
        if (existsSync(filePath)) {
          try {
            const analysis = this.validateFile(filePath)
            fileAnalyses.push(analysis)
          } catch (error) {
            console.warn(`Failed to analyze ${filePath}:`, error)
          }
        }
      }
    }

    // Also check root-level TypeScript files
    const rootTsFiles = await glob('**/*.ts', {
      cwd: this.workspaceRoot,
      ignore: [
        'node_modules/**',
        'dist/**',
        '**/*.d.ts',
        '**/*.test.ts',
        '**/*.spec.ts',
        '.github/actions/**',
      ],
      absolute: true,
    })

    for (const filePath of rootTsFiles) {
      if (existsSync(filePath)) {
        try {
          const analysis = this.validateFile(filePath)
          fileAnalyses.push(analysis)
        } catch (error) {
          console.warn(`Failed to analyze ${filePath}:`, error)
        }
      }
    }

    // Calculate summary statistics
    const totalFiles = fileAnalyses.length
    const totalImports = fileAnalyses.reduce((sum, f) => sum + f.imports.length, 0)
    const totalExports = fileAnalyses.reduce((sum, f) => sum + f.exports.length, 0)
    const totalViolations = fileAnalyses.reduce((sum, f) => sum + f.violations.length, 0)

    const violationsByType: Record<string, number> = {}
    const violationsBySeverity: Record<string, number> = {}

    for (const file of fileAnalyses) {
      for (const violation of file.violations) {
        violationsByType[violation.type] = (violationsByType[violation.type] || 0) + 1
        violationsBySeverity[violation.severity] =
          (violationsBySeverity[violation.severity] || 0) + 1
      }
    }

    // Generate recommendations
    const recommendations: string[] = []

    if (violationsByType['import-should-be-type-only'] > 0) {
      recommendations.push(
        `Consider using 'import type' for ${violationsByType['import-should-be-type-only']} imports that are only used for type annotations`,
      )
    }

    if (violationsByType['unnecessary-type-only'] > 0) {
      recommendations.push(
        `Fix ${violationsByType['unnecessary-type-only']} imports marked as type-only but used as values`,
      )
    }

    if (violationsByType['export-should-be-type-only'] > 0) {
      recommendations.push(
        `Consider using 'export type' for ${violationsByType['export-should-be-type-only']} exports that appear to be type-only`,
      )
    }

    if (totalViolations === 0) {
      recommendations.push('✅ All type-only imports/exports are properly configured!')
    }

    // Calculate health score (100 - percentage of violations)
    const violationPercentage =
      totalImports + totalExports > 0 ? (totalViolations / (totalImports + totalExports)) * 100 : 0
    const healthScore = Math.max(0, Math.round(100 - violationPercentage))

    return {
      timestamp,
      packages: this.packages,
      fileAnalyses,
      summary: {
        totalFiles,
        totalImports,
        totalExports,
        totalViolations,
        violationsByType,
        violationsBySeverity,
      },
      recommendations,
      healthScore,
    }
  }
}

/**
 * Format the validation report for console output
 */
function formatReport(report: ValidationReport): string {
  const output: string[] = []

  output.push('🔍 TypeScript Type-Only Imports/Exports Validation Report')
  output.push('='.repeat(60))
  output.push('')

  // Summary
  output.push('📊 Summary:')
  output.push(`   📁 Files analyzed: ${report.summary.totalFiles}`)
  output.push(`   📥 Total imports: ${report.summary.totalImports}`)
  output.push(`   📤 Total exports: ${report.summary.totalExports}`)
  output.push(`   ⚠️  Total violations: ${report.summary.totalViolations}`)
  output.push(`   🏥 Health score: ${report.healthScore}%`)
  output.push('')

  // Violations by type
  if (Object.keys(report.summary.violationsByType).length > 0) {
    output.push('📋 Violations by Type:')
    for (const [type, count] of Object.entries(report.summary.violationsByType)) {
      const emoji = type.includes('should-be-type-only')
        ? '⚠️ '
        : type.includes('unnecessary')
          ? '❌'
          : 'ℹ️ '
      output.push(`   ${emoji} ${type}: ${count}`)
    }
    output.push('')
  }

  // Violations by severity
  if (Object.keys(report.summary.violationsBySeverity).length > 0) {
    output.push('🚨 Violations by Severity:')
    for (const [severity, count] of Object.entries(report.summary.violationsBySeverity)) {
      const emoji = severity === 'error' ? '❌' : severity === 'warning' ? '⚠️ ' : 'ℹ️ '
      output.push(`   ${emoji} ${severity}: ${count}`)
    }
    output.push('')
  }

  // Detailed violations
  const filesWithViolations = report.fileAnalyses.filter(f => f.violations.length > 0)
  if (filesWithViolations.length > 0) {
    output.push('🔍 Detailed Violations:')
    output.push('')

    for (const file of filesWithViolations) {
      const relativePath = relative(process.cwd(), file.filePath)
      output.push(`📄 ${relativePath}:`)

      for (const violation of file.violations) {
        const emoji =
          violation.severity === 'error' ? '❌' : violation.severity === 'warning' ? '⚠️ ' : 'ℹ️ '
        output.push(`   ${emoji} Line ${violation.line}: ${violation.description}`)
        output.push(`      💡 ${violation.suggestion}`)
        output.push(`      📝 Current:  ${violation.currentCode.trim()}`)
        output.push(`      ✨ Suggested: ${violation.suggestedCode.trim()}`)
        output.push('')
      }
    }
  }

  // Recommendations
  if (report.recommendations.length > 0) {
    output.push('💡 Recommendations:')
    for (const recommendation of report.recommendations) {
      output.push(`   • ${recommendation}`)
    }
    output.push('')
  }

  // Summary message
  if (report.summary.totalViolations === 0) {
    output.push('🎉 Excellent! No type-only import/export violations found.')
  } else {
    output.push(
      `🔧 Found ${report.summary.totalViolations} violations that could be addressed for better type safety and bundle optimization.`,
    )
  }

  output.push('')
  output.push(`📅 Report generated: ${report.timestamp.toISOString()}`)

  return output.join('\n')
}

/**
 * Main execution function
 */
async function main(): Promise<void> {
  try {
    const workspaceRoot = process.cwd()
    const {packages} = await getPackages(workspaceRoot)

    console.log('🔍 Starting TypeScript type-only imports/exports validation...\n')

    const validator = new TypeOnlyValidator(workspaceRoot, packages)
    const report = await validator.validate()

    console.log(formatReport(report))

    // Exit with error code if there are violations
    if (report.summary.violationsBySeverity.error > 0) {
      process.exit(1)
    } else if (report.summary.violationsBySeverity.warning > 0) {
      console.log('\n⚠️  Warnings found. Consider addressing them for optimal type safety.')
    }
  } catch (error) {
    console.error('❌ Failed to validate type-only imports/exports:', error)
    process.exit(1)
  }
}

// Run the script
if (import.meta.url === `file://${process.argv[1]}`) {
  await main()
}
