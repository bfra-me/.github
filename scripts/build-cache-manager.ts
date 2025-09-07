#!/usr/bin/env tsx

/**
 * Build Cache Manager
 *
 * Manages TypeScript build cache files for optimal CI/CD performance
 * and local development experience.
 */

import {execSync} from 'node:child_process'
import * as fs from 'node:fs'
import * as path from 'node:path'
import process from 'node:process'

interface CacheStats {
  totalFiles: number
  totalSize: number
  oldestFile: Date
  newestFile: Date
  cacheDirectories: string[]
}

class BuildCacheManager {
  private workspaceRoot: string

  constructor(workspaceRoot: string) {
    this.workspaceRoot = workspaceRoot
  }

  /**
   * Get comprehensive cache statistics
   */
  getCacheStats(): CacheStats {
    const cacheFiles: {path: string; stats: fs.Stats}[] = []
    const cacheDirectories: string[] = []

    // Find all cache files
    this.findCacheFiles(this.workspaceRoot, cacheFiles, cacheDirectories)

    if (cacheFiles.length === 0) {
      return {
        totalFiles: 0,
        totalSize: 0,
        oldestFile: new Date(),
        newestFile: new Date(),
        cacheDirectories: [],
      }
    }

    const totalSize = cacheFiles.reduce((sum, {stats}) => sum + stats.size, 0)
    const dates = cacheFiles.map(({stats}) => stats.mtime)
    const oldestFile = new Date(Math.min(...dates.map(d => d.getTime())))
    const newestFile = new Date(Math.max(...dates.map(d => d.getTime())))

    return {
      totalFiles: cacheFiles.length,
      totalSize,
      oldestFile,
      newestFile,
      cacheDirectories: [...new Set(cacheDirectories)],
    }
  }

  /**
   * Recursively find all cache files
   */
  private findCacheFiles(
    dir: string,
    cacheFiles: {path: string; stats: fs.Stats}[],
    cacheDirectories: string[],
  ): void {
    if (!fs.existsSync(dir)) return

    try {
      const entries = fs.readdirSync(dir, {withFileTypes: true})

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name)

        if (entry.isDirectory()) {
          // Skip node_modules and other irrelevant directories
          if (['node_modules', '.git', 'coverage'].includes(entry.name)) {
            continue
          }

          // Check if this is a cache directory
          if (entry.name === '.cache') {
            cacheDirectories.push(fullPath)
            this.findCacheFilesInDirectory(fullPath, cacheFiles)
          } else {
            this.findCacheFiles(fullPath, cacheFiles, cacheDirectories)
          }
        } else if (entry.isFile() && entry.name.endsWith('.tsbuildinfo')) {
          // Direct cache files (legacy pattern)
          const stats = fs.statSync(fullPath)
          cacheFiles.push({path: fullPath, stats})
        }
      }
    } catch (error) {
      // Skip directories we can't read
      console.warn(
        `Skipping directory ${dir}: ${error instanceof Error ? error.message : String(error)}`,
      )
    }
  }

  /**
   * Find cache files within a specific cache directory
   */
  private findCacheFilesInDirectory(
    cacheDir: string,
    cacheFiles: {path: string; stats: fs.Stats}[],
  ): void {
    try {
      const entries = fs.readdirSync(cacheDir)
      for (const entry of entries) {
        if (entry.endsWith('.tsbuildinfo')) {
          const fullPath = path.join(cacheDir, entry)
          const stats = fs.statSync(fullPath)
          cacheFiles.push({path: fullPath, stats})
        }
      }
    } catch (error) {
      console.warn(
        `Error reading cache directory ${cacheDir}: ${error instanceof Error ? error.message : String(error)}`,
      )
    }
  }

  /**
   * Clean all build cache files
   */
  cleanAllCache(): number {
    const cacheFiles: {path: string; stats: fs.Stats}[] = []
    const cacheDirectories: string[] = []

    this.findCacheFiles(this.workspaceRoot, cacheFiles, cacheDirectories)

    let cleanedFiles = 0

    // Remove cache files
    for (const {path: filePath} of cacheFiles) {
      try {
        fs.unlinkSync(filePath)
        cleanedFiles++
        console.log(`Removed cache file: ${path.relative(this.workspaceRoot, filePath)}`)
      } catch (error) {
        console.warn(
          `Failed to remove ${filePath}: ${error instanceof Error ? error.message : String(error)}`,
        )
      }
    }

    // Remove empty cache directories
    for (const cacheDir of cacheDirectories) {
      try {
        const entries = fs.readdirSync(cacheDir)
        if (entries.length === 0) {
          fs.rmdirSync(cacheDir)
          console.log(
            `Removed empty cache directory: ${path.relative(this.workspaceRoot, cacheDir)}`,
          )
        }
      } catch {
        // Directory might not be empty or might not exist
      }
    }

    return cleanedFiles
  }

  /**
   * Clean stale cache files (older than specified days)
   */
  cleanStaleCache(daysOld = 7): number {
    const cutoffDate = new Date(Date.now() - daysOld * 24 * 60 * 60 * 1000)
    const cacheFiles: {path: string; stats: fs.Stats}[] = []
    const cacheDirectories: string[] = []

    this.findCacheFiles(this.workspaceRoot, cacheFiles, cacheDirectories)

    let cleanedFiles = 0

    for (const {path: filePath, stats} of cacheFiles) {
      if (stats.mtime < cutoffDate) {
        try {
          fs.unlinkSync(filePath)
          cleanedFiles++
          console.log(
            `Removed stale cache file: ${path.relative(this.workspaceRoot, filePath)} (${stats.mtime.toISOString()})`,
          )
        } catch (error) {
          console.warn(
            `Failed to remove ${filePath}: ${error instanceof Error ? error.message : String(error)}`,
          )
        }
      }
    }

    return cleanedFiles
  }

  /**
   * Validate cache integrity
   */
  validateCache(): {valid: number; invalid: number; details: string[]} {
    const cacheFiles: {path: string; stats: fs.Stats}[] = []
    const cacheDirectories: string[] = []

    this.findCacheFiles(this.workspaceRoot, cacheFiles, cacheDirectories)

    let valid = 0
    let invalid = 0
    const details: string[] = []

    for (const {path: filePath, stats} of cacheFiles) {
      try {
        // Try to read the cache file to validate it's not corrupted
        const content = fs.readFileSync(filePath, 'utf8')

        // Basic validation - should be JSON
        JSON.parse(content)

        // Check file size is reasonable (not empty, not too large)
        if (stats.size === 0) {
          details.push(`Empty cache file: ${path.relative(this.workspaceRoot, filePath)}`)
          invalid++
        } else if (stats.size > 50 * 1024 * 1024) {
          // 50MB
          details.push(
            `Large cache file (${(stats.size / 1024 / 1024).toFixed(1)}MB): ${path.relative(this.workspaceRoot, filePath)}`,
          )
          valid++ // Still valid, just large
        } else {
          valid++
        }
      } catch (error) {
        details.push(
          `Corrupted cache file: ${path.relative(this.workspaceRoot, filePath)} - ${error instanceof Error ? error.message : String(error)}`,
        )
        invalid++
      }
    }

    return {valid, invalid, details}
  }

  /**
   * Create cache directory structure
   */
  ensureCacheDirectories(): void {
    const cacheDirectories = [
      path.join(this.workspaceRoot, '.cache'),
      path.join(this.workspaceRoot, '.github/actions/renovate-changesets/.cache'),
      path.join(this.workspaceRoot, '.github/actions/update-metadata/.cache'),
    ]

    for (const dir of cacheDirectories) {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, {recursive: true})
        console.log(`Created cache directory: ${path.relative(this.workspaceRoot, dir)}`)
      }
    }
  }

  /**
   * Get cache size by project
   */
  getCacheSizeByProject(): {project: string; size: number; files: number}[] {
    const cacheFiles: {path: string; stats: fs.Stats}[] = []
    const cacheDirectories: string[] = []

    this.findCacheFiles(this.workspaceRoot, cacheFiles, cacheDirectories)

    const projectSizes = new Map<string, {size: number; files: number}>()

    for (const {path: filePath, stats} of cacheFiles) {
      const relativePath = path.relative(this.workspaceRoot, filePath)
      let project = 'root'

      if (relativePath.includes('.github/actions/renovate-changesets')) {
        project = 'renovate-changesets'
      } else if (relativePath.includes('.github/actions/update-metadata')) {
        project = 'update-metadata'
      }

      const current = projectSizes.get(project) || {size: 0, files: 0}
      projectSizes.set(project, {
        size: current.size + stats.size,
        files: current.files + 1,
      })
    }

    return Array.from(projectSizes.entries()).map(([project, data]) => ({
      project,
      ...data,
    }))
  }

  /**
   * Display cache information
   */
  displayCacheInfo(format: 'text' | 'json' = 'text'): string {
    const stats = this.getCacheStats()
    const validation = this.validateCache()
    const projectSizes = this.getCacheSizeByProject()

    if (format === 'json') {
      return JSON.stringify(
        {
          stats,
          validation,
          projectSizes,
        },
        null,
        2,
      )
    }

    let output = ''
    output += '\n=== Build Cache Information ===\n'
    output += `Total Files: ${stats.totalFiles}\n`
    output += `Total Size: ${(stats.totalSize / 1024).toFixed(1)} KB\n`

    if (stats.totalFiles > 0) {
      output += `Oldest Cache: ${stats.oldestFile.toISOString()}\n`
      output += `Newest Cache: ${stats.newestFile.toISOString()}\n`
    }

    output += `Cache Directories: ${stats.cacheDirectories.length}\n\n`

    output += '📊 Cache by Project:\n'
    for (const {project, size, files} of projectSizes) {
      output += `  ${project}: ${files} files, ${(size / 1024).toFixed(1)} KB\n`
    }
    output += '\n'

    output += '✅ Cache Validation:\n'
    output += `  Valid: ${validation.valid}\n`
    output += `  Invalid: ${validation.invalid}\n`

    if (validation.details.length > 0) {
      output += '  Issues:\n'
      for (const detail of validation.details) {
        output += `    • ${detail}\n`
      }
    }

    return output
  }
}

// CLI Interface
async function main() {
  const args = process.argv.slice(2)
  const command = args[0] || 'info'
  const format = args.includes('--json') ? 'json' : 'text'

  const manager = new BuildCacheManager(process.cwd())

  try {
    switch (command) {
      case 'info':
        console.log(manager.displayCacheInfo(format))
        break

      case 'clean':
        {
          const cleaned = manager.cleanAllCache()
          console.log(`Cleaned ${cleaned} cache files`)
        }
        break

      case 'clean-stale':
        {
          const days = args.includes('--days')
            ? Number.parseInt(args[args.indexOf('--days') + 1], 10) || 7
            : 7
          const cleaned = manager.cleanStaleCache(days)
          console.log(`Cleaned ${cleaned} stale cache files (older than ${days} days)`)
        }
        break

      case 'validate':
        {
          const validation = manager.validateCache()
          if (format === 'json') {
            console.log(JSON.stringify(validation, null, 2))
          } else {
            console.log(`\nCache Validation Results:`)
            console.log(`  Valid: ${validation.valid}`)
            console.log(`  Invalid: ${validation.invalid}`)
            if (validation.details.length > 0) {
              console.log('  Issues:')
              for (const detail of validation.details) {
                console.log(`    • ${detail}`)
              }
            }
          }
        }
        break

      case 'ensure-directories':
        manager.ensureCacheDirectories()
        break

      case 'warm':
        // Warm up the cache by running a build
        console.log('Warming up build cache...')
        manager.ensureCacheDirectories()
        execSync('pnpm build:composite:clean', {stdio: 'inherit'})
        execSync('pnpm build:composite', {stdio: 'inherit'})
        console.log('Cache warmed up successfully')
        break

      default:
        console.log(`
Usage: tsx build-cache-manager.ts [command] [options]

Commands:
  info                Display cache information (default)
  clean               Clean all build cache files
  clean-stale         Clean stale cache files (default: 7 days)
  validate            Validate cache file integrity
  ensure-directories  Create cache directory structure
  warm                Warm up build cache with a clean build

Options:
  --json              Output in JSON format
  --days <number>     Days for stale cleanup (default: 7)
        `)
        break
    }
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : String(error))
    process.exit(1)
  }
}

// Only run main if this is the entry point
const isMainModule = import.meta.url === `file://${process.argv[1]}`
if (isMainModule) {
  main().catch(console.error)
}

export {BuildCacheManager, type CacheStats}
