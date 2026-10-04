import { readFileSync, realpathSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, isAbsolute, join, resolve } from 'node:path';
import { BoardError, type NativeProject } from './types.js';

export interface ProjectSource { list(): readonly NativeProject[]; }
export function canonicalRoot(path: string): string {
  try { return realpathSync(path); } catch { return resolve(path); }
}

// Isolate the local metadata compatibility adapter from board storage. Codex
// owns this registry; Threadboard only extracts project IDs, names, and roots.
export class CodexProjects implements ProjectSource {
  private signature = '';
  private cached: readonly NativeProject[] = [];
  private projectJson = '[]';
  constructor(private readonly directory = process.env.THREADBOARD_CODEX_HOME || process.env.CODEX_HOME || join(homedir(), '.codex')) {
    if (!isAbsolute(directory)) throw new BoardError('INVALID_DIRECTORY', 'The Codex data directory must be an absolute path.');
  }
  private fileSignature(file: string): string {
    try { const s = statSync(file); return `${file}:${s.ino}:${s.mtimeMs}:${s.size}`; }
    catch (error: any) { if (error.code === 'ENOENT') return ''; throw error; }
  }
  private records(values: unknown): NativeProject[] {
    if (!values || typeof values !== 'object') throw new Error('Unrecognised project registry');
    const projects = Object.values(values);
    if (projects.length > 10_000) throw new Error('Project registry is too large');
    const ids = new Set<string>();
    // Codex uses this reserved namespace for local mirrors of ChatGPT cloud
    // projects. Its native local-project catalogue excludes those mirrors.
    const local = projects.filter((value: any) => !(typeof value?.id === 'string' && value.id.startsWith('g-p-')));
    return local.map((value: any) => {
      if (!value || typeof value.id !== 'string' || !value.id || value.id.length > 200 || /[\x00-\x1f]/.test(value.id)
        || typeof value.name !== 'string' || !Array.isArray(value.rootPaths) || !value.rootPaths.length
        || value.rootPaths.some((root: unknown) => typeof root !== 'string' || !isAbsolute(root) || root.length > 4096)
        || ids.has(value.id)) throw new Error('Unrecognised project record');
      ids.add(value.id);
      const rootPaths = [...new Set<string>(value.rootPaths.map(canonicalRoot))];
      return { id: value.id, name: value.name.trim() || basename(rootPaths[0]), rootPaths };
    });
  }
  private remember(projects: NativeProject[], signature: string): readonly NativeProject[] {
    const json = JSON.stringify(projects);
    if (json !== this.projectJson) { this.cached = projects; this.projectJson = json; }
    this.signature = signature; return this.cached;
  }
  list(): readonly NativeProject[] {
    try {
      const desktopFile = join(this.directory, '.codex-global-state.json');
      const desktopSignature = this.fileSignature(desktopFile);
      if (!desktopSignature) return this.remember([], '');
      if (this.signature === desktopSignature) return this.cached;
      if (statSync(desktopFile).size > 16 * 1024 * 1024) throw new Error('Project registry is too large');
      const state = JSON.parse(readFileSync(desktopFile, 'utf8'));
      if (!state || !Object.hasOwn(state, 'local-projects')) throw new Error('Unrecognised project registry');
      // An empty registry is authoritative. Database project IDs can differ
      // from desktop IDs, so never invent a fallback identity for saved boards.
      return this.remember(this.records(state['local-projects']), desktopSignature);
    } catch (error: any) {
      if (error.code === 'ENOENT') return this.remember([], '');
      throw new BoardError('CODEX_PROJECTS_UNAVAILABLE', 'Codex projects could not be read. Open Codex, then refresh the board. Your saved tasks have been preserved.');
    }
  }
}
