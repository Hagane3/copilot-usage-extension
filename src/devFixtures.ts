import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';

export function getDevFixturesRoot(extensionPath: string): string {
  return path.join(extensionPath, 'dev-fixtures', 'workspaceStorage');
}

export function getDevStoreDir(extensionPath: string): string {
  return path.join(extensionPath, 'dev-fixtures', 'store');
}

export function hasDevFixtures(extensionPath: string): boolean {
  try {
    return fs.readdirSync(getDevFixturesRoot(extensionPath)).length > 0;
  } catch {
    return false;
  }
}

/**
 * Returns true when synthetic dev fixtures should be used.
 *
 * Explicit `copilotCredits.useDevFixtures` (workspace / user setting) always wins.
 * When unset, auto-enables in Extension Development Host (F5) if fixtures exist on
 * disk — so opening any project in the debug window still works.
 */
export function shouldUseDevFixtures(context: vscode.ExtensionContext): boolean {
  const inspected = vscode.workspace
    .getConfiguration('copilotCredits')
    .inspect<boolean>('useDevFixtures');

  const explicit =
    inspected?.workspaceFolderValue ??
    inspected?.workspaceValue ??
    inspected?.globalValue;

  if (explicit === true) return true;
  if (explicit === false) return false;

  return (
    context.extensionMode === vscode.ExtensionMode.Development &&
    hasDevFixtures(context.extensionPath)
  );
}
