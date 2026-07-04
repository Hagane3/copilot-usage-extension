import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

/**
 * Returns the VS Code user data directory for the current platform.
 * Used for the FileSystemWatcher in extension.ts (needs a single path).
 * Supports macOS, Windows, and Linux.
 */
export function getVsCodeDataDir(): string {
  const home = os.homedir();
  switch (process.platform) {
    case 'darwin':
      return path.join(home, 'Library', 'Application Support', 'Code');
    case 'win32':
      return path.join(
        process.env['APPDATA'] ?? path.join(home, 'AppData', 'Roaming'),
        'Code'
      );
    default:
      return path.join(home, '.config', 'Code');
  }
}

/**
 * Returns all candidate editor data directories to scan for Copilot logs.
 * Includes VS Code, VS Code Insiders, and Cursor — whichever exist on disk.
 */
export function getAllEditorDataDirs(): string[] {
  const home = os.homedir();
  let candidates: string[];

  switch (process.platform) {
    case 'darwin': {
      const base = path.join(home, 'Library', 'Application Support');
      candidates = [
        path.join(base, 'Code'),
        path.join(base, 'Code - Insiders'),
        path.join(base, 'Cursor'),
      ];
      break;
    }
    case 'win32': {
      const appData =
        process.env['APPDATA'] ?? path.join(home, 'AppData', 'Roaming');
      candidates = [
        path.join(appData, 'Code'),
        path.join(appData, 'Code - Insiders'),
        path.join(appData, 'Cursor'),
      ];
      break;
    }
    default: {
      const config = path.join(home, '.config');
      candidates = [
        path.join(config, 'Code'),
        path.join(config, 'Code - Insiders'),
        path.join(config, 'Cursor'),
      ];
      break;
    }
  }

  return candidates;
}

/**
 * Returns all workspaceStorage directories to scan across:
 *   - the default VS Code profile  (User/workspaceStorage)
 *   - every named profile          (User/profiles/<id>/workspaceStorage)
 *
 * This ensures requests made in non-default profiles are not missed.
 */
async function collectWorkspaceStorageDirs(editorDataDir: string): Promise<string[]> {
  const userDir = path.join(editorDataDir, 'User');
  const dirs: string[] = [];

  // Default profile
  dirs.push(path.join(userDir, 'workspaceStorage'));

  // Named profiles: User/profiles/<id>/workspaceStorage
  const profilesRoot = path.join(userDir, 'profiles');
  let profileIds: string[];
  try {
    profileIds = await fs.promises.readdir(profilesRoot);
  } catch {
    profileIds = [];
  }
  for (const id of profileIds) {
    dirs.push(path.join(profilesRoot, id, 'workspaceStorage'));
  }

  return dirs;
}

/**
 * Scans workspaceStorage directories for Copilot Chat debug log files.
 *
 * When `extraRoots` is provided (dev fixtures), those directories are scanned
 * in addition to the real VS Code workspaceStorage paths.
 */
export async function findLogFiles(extraRoots: string[] = []): Promise<string[]> {
  const editorDataDir = getVsCodeDataDir();
  const workspaceStorageDirs = [
    ...(await collectWorkspaceStorageDirs(editorDataDir)),
    ...extraRoots.map((r) => path.resolve(r)),
  ];

  const COPILOT_DIR_NAMES = ['GitHub.copilot-chat', 'github.copilot-chat'];
  const candidates: string[] = [];

  for (const workspaceStorageDir of workspaceStorageDirs) {
    let workspaceHashes: string[];
    try {
      workspaceHashes = await fs.promises.readdir(workspaceStorageDir);
    } catch {
      continue; // this storage dir doesn't exist — skip
    }

    const resolvedStorageDir = path.resolve(workspaceStorageDir);

    for (const hash of workspaceHashes) {
      for (const copilotDir of COPILOT_DIR_NAMES) {
        const debugLogsBase = path.join(
          workspaceStorageDir,
          hash,
          copilotDir,
          'debug-logs'
        );

        let sessions: string[];
        try {
          sessions = await fs.promises.readdir(debugLogsBase);
        } catch {
          continue;
        }

        for (const session of sessions) {
          const sessionDir = path.join(debugLogsBase, session);

          let files: string[];
          try {
            files = await fs.promises.readdir(sessionDir);
          } catch {
            continue;
          }

          for (const file of files) {
            // Only process JSONL files (covers main.jsonl, main.1.jsonl, etc.)
            if (!file.endsWith('.jsonl')) {
              continue;
            }

            const candidate = path.join(sessionDir, file);

            // Guard against path traversal
            const resolved = path.resolve(candidate);
            if (!resolved.startsWith(resolvedStorageDir + path.sep)) {
              continue;
            }

            try {
              await fs.promises.access(candidate, fs.constants.R_OK);
              candidates.push(candidate);
            } catch {
              // not readable — skip
            }
          }
        }
      }
    }
  }

  // Deduplicate by realpath to handle case-insensitive filesystems (macOS)
  const seenRealpaths = new Set<string>();
  const found: string[] = [];
  for (const candidate of candidates) {
    let real: string;
    try {
      real = await fs.promises.realpath(candidate);
    } catch {
      real = candidate;
    }
    if (!seenRealpaths.has(real)) {
      seenRealpaths.add(real);
      found.push(candidate);
    }
  }

  return found;
}
