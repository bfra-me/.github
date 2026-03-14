import type {
  JVMDependencyChange,
  MavenChangeLoaderOptions,
  MavenCoordinate,
  MavenPlugin,
  MavenPOM,
} from './jvm-detector-types.js'
import {
  calculateSemverImpact,
  determineUpdateType,
  isPropertyReference,
  mapMavenScopeToJVMType,
} from './jvm-version-comparator.js'

export async function parseMavenChanges({
  filename,
  prNumber,
  loadContent,
}: MavenChangeLoaderOptions): Promise<JVMDependencyChange[]> {
  const [oldContent, newContent] = await Promise.all([
    loadContent(filename, `refs/pull/${prNumber}/base`),
    loadContent(filename, `refs/pull/${prNumber}/head`),
  ])
  if (oldContent == null || newContent == null) return []

  const oldPom = parseMavenPOM(oldContent)
  const newPom = parseMavenPOM(newContent)

  return [
    ...compareMavenDependencies(filename, oldPom.dependencies ?? [], newPom.dependencies ?? []),
    ...compareMavenDependencies(
      filename,
      oldPom.dependencyManagement?.dependencies ?? [],
      newPom.dependencyManagement?.dependencies ?? [],
    ),
    ...compareMavenParent(filename, oldPom.parent, newPom.parent),
    ...compareMavenPlugins(filename, oldPom.build?.plugins ?? [], newPom.build?.plugins ?? []),
  ]
}

export function parseMavenPOM(content: string): MavenPOM {
  const parentSection = readSection(content, 'parent')
  const pluginsSection = readSection(content, 'plugins')

  return {
    groupId: readTag(content, 'groupId'),
    artifactId: readTag(content, 'artifactId'),
    version: readTag(content, 'version'),
    parent: parentSection == null ? undefined : (parseCoordinate(parentSection) ?? undefined),
    dependencies: extractCoordinates(content, 'dependencies'),
    dependencyManagement: {dependencies: extractCoordinates(content, 'dependencyManagement')},
    build: {plugins: pluginsSection == null ? [] : extractPlugins(pluginsSection)},
  }
}

function compareMavenDependencies(
  filename: string,
  oldDeps: MavenCoordinate[],
  newDeps: MavenCoordinate[],
): JVMDependencyChange[] {
  return newDeps.flatMap(newDep => {
    const oldDep = oldDeps.find(
      dep => dep.groupId === newDep.groupId && dep.artifactId === newDep.artifactId,
    )
    if (oldDep == null || oldDep.version === newDep.version) return []
    return [createMavenChange(filename, oldDep, newDep)]
  })
}

function compareMavenParent(
  filename: string,
  oldParent?: MavenCoordinate,
  newParent?: MavenCoordinate,
): JVMDependencyChange[] {
  if (oldParent == null || newParent == null || oldParent.version === newParent.version) return []
  return [createMavenChange(filename, oldParent, newParent, true)]
}

function compareMavenPlugins(
  filename: string,
  oldPlugins: MavenPlugin[],
  newPlugins: MavenPlugin[],
): JVMDependencyChange[] {
  return newPlugins.flatMap(newPlugin => {
    const oldPlugin = oldPlugins.find(
      plugin => plugin.groupId === newPlugin.groupId && plugin.artifactId === newPlugin.artifactId,
    )
    if (oldPlugin == null || oldPlugin.version === newPlugin.version || newPlugin.version == null) {
      return []
    }

    return [createPluginChange(filename, oldPlugin, newPlugin)]
  })
}

function createMavenChange(
  filename: string,
  oldDep: MavenCoordinate,
  newDep: MavenCoordinate,
  isParent = false,
): JVMDependencyChange {
  return {
    name: `${newDep.groupId}:${newDep.artifactId}`,
    buildFile: filename,
    dependencyType: isParent ? 'parent' : mapMavenScopeToJVMType(newDep.scope),
    currentVersion: oldDep.version,
    newVersion: newDep.version,
    currentCoordinate: `${oldDep.groupId}:${oldDep.artifactId}:${oldDep.version ?? ''}`,
    newCoordinate: `${newDep.groupId}:${newDep.artifactId}:${newDep.version ?? ''}`,
    manager: 'maven',
    updateType: determineUpdateType(oldDep.version, newDep.version),
    semverImpact: calculateSemverImpact(oldDep.version, newDep.version),
    isSecurityUpdate: false,
    isPlugin: false,
    groupId: newDep.groupId,
    artifactId: newDep.artifactId,
    scope: newDep.scope,
    isParent,
    isPropertyReference: isPropertyReference(newDep.version),
  }
}

function createPluginChange(
  filename: string,
  oldPlugin: MavenPlugin,
  newPlugin: MavenPlugin,
): JVMDependencyChange {
  return {
    name: `${newPlugin.groupId ?? 'org.apache.maven.plugins'}:${newPlugin.artifactId}`,
    buildFile: filename,
    dependencyType: 'plugin',
    currentVersion: oldPlugin.version,
    newVersion: newPlugin.version,
    currentCoordinate: `${oldPlugin.groupId ?? ''}:${oldPlugin.artifactId}:${oldPlugin.version ?? ''}`,
    newCoordinate: `${newPlugin.groupId ?? ''}:${newPlugin.artifactId}:${newPlugin.version ?? ''}`,
    manager: 'maven',
    updateType: determineUpdateType(oldPlugin.version, newPlugin.version),
    semverImpact: calculateSemverImpact(oldPlugin.version, newPlugin.version),
    isSecurityUpdate: false,
    isPlugin: true,
    groupId: newPlugin.groupId,
    artifactId: newPlugin.artifactId,
    isParent: false,
    isPropertyReference: isPropertyReference(newPlugin.version),
  }
}

function extractCoordinates(content: string, section: string): MavenCoordinate[] {
  const sectionContent = readSection(content, section)
  if (sectionContent == null) return []

  return [...sectionContent.matchAll(/<dependency>(.*?)<\/dependency>/gs)]
    .map(match => parseCoordinate(match[1] ?? ''))
    .filter((coordinate): coordinate is MavenCoordinate => coordinate != null)
}

function extractPlugins(content: string): MavenPlugin[] {
  return [...content.matchAll(/<plugin>(.*?)<\/plugin>/gs)]
    .map(match => parsePlugin(match[1] ?? ''))
    .filter((plugin): plugin is MavenPlugin => plugin != null)
}

function parseCoordinate(content: string): MavenCoordinate | null {
  const groupId = readTag(content, 'groupId')
  const artifactId = readTag(content, 'artifactId')
  if (groupId == null || artifactId == null) return null

  return {
    groupId,
    artifactId,
    version: readTag(content, 'version'),
    scope: readTag(content, 'scope'),
  }
}

function parsePlugin(content: string): MavenPlugin | null {
  const artifactId = readTag(content, 'artifactId')
  if (artifactId == null) return null

  return {
    groupId: readTag(content, 'groupId'),
    artifactId,
    version: readTag(content, 'version'),
  }
}

function readSection(content: string, tag: string): string | undefined {
  return content.match(new RegExp(`<${tag}>(.*?)<\/${tag}>`, 's'))?.[1]
}

function readTag(content: string, tag: string): string | undefined {
  return content.match(new RegExp(`<${tag}>(.*?)<\/${tag}>`))?.[1]
}
