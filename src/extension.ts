import * as path from 'path';
import * as vscode from 'vscode';
import { findLogFiles, getVsCodeDataDir } from './logScanner';
import { parseLogFile, UsageEvent } from './usageParser';
import { aggregateCurrentMonth } from './monthlyAggregator';
import { UiPresenter, TooltipStats } from './uiPresenter';
import { showUsageChart } from './chartView';
import { registerDiagnosticsCommand } from './diagnostics';
import { persistNewEvents, loadPersistedEvents } from './eventStore';

interface ScanResult {
  logFiles: string[];
  /** All events: persisted history + fresh from current log files. */
  allEvents: UsageEvent[];
}

async function scan(storageDir: string): Promise<ScanResult> {
  const logFiles = await findLogFiles();
  const freshEvents =
    logFiles.length === 0
      ? []
      : (await Promise.all(logFiles.map((f) => parseLogFile(f)))).flat();

  await persistNewEvents(freshEvents, storageDir);
  const allEvents = await loadPersistedEvents(storageDir);

  return { logFiles, allEvents };
}

function getCfg<T>(key: string, fallback: T): T {
  return vscode.workspace.getConfiguration('copilotCredits').get<T>(key, fallback);
}

async function checkExpensiveRequests(
  allEvents: UsageEvent[],
  context: vscode.ExtensionContext
): Promise<void> {
  const threshold = getCfg<number>('expensiveRequestThresholdAiu', 0);
  if (threshold <= 0) return;

  const lastCheckedTs = context.globalState.get<number>('lastExpensiveCheckTs', 0);
  const recent = allEvents.filter((e) => e.ts > lastCheckedTs);
  if (recent.length === 0) return;

  const maxTs = recent.reduce((m, e) => Math.max(m, e.ts), lastCheckedTs);
  await context.globalState.update('lastExpensiveCheckTs', maxTs);

  const expensive = recent.filter((e) => e.nanoAiu / 1e9 > threshold);
  if (expensive.length === 0) return;

  const worst = expensive.reduce((a, b) => (a.nanoAiu > b.nanoAiu ? a : b));
  const aiu = (worst.nanoAiu / 1e9).toFixed(1);
  vscode.window.showWarningMessage(
    `Copilot: expensive request — ${aiu} AIU (${worst.model})` +
      (expensive.length > 1 ? ` and ${expensive.length - 1} more` : '')
  );
}

function buildTooltipStats(allEvents: UsageEvent[], budgetAiu: number): TooltipStats {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();

  const dow = (now.getDay() + 6) % 7;
  const weekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dow).getTime();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();

  const todayEvts = allEvents.filter((e) => e.ts >= todayStart);
  const weekEvts  = allEvents.filter((e) => e.ts >= weekStart);
  const monthEvts = allEvents.filter((e) => e.ts >= monthStart);

  const modelAiu = new Map<string, number>();
  for (const e of monthEvts) {
    modelAiu.set(e.model, (modelAiu.get(e.model) ?? 0) + e.nanoAiu / 1e9);
  }
  const topModel = [...modelAiu.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';

  return {
    todayAiu:  todayEvts.reduce((s, e) => s + e.nanoAiu / 1e9, 0),
    todayReq:  todayEvts.length,
    weekAiu:   weekEvts.reduce((s, e) => s + e.nanoAiu / 1e9, 0),
    weekReq:   weekEvts.length,
    monthAiu:  monthEvts.reduce((s, e) => s + e.nanoAiu / 1e9, 0),
    monthReq:  monthEvts.length,
    topModel,
    budgetAiu,
  };
}

async function runScan(
  presenter: UiPresenter,
  storageDir: string,
  context: vscode.ExtensionContext
): Promise<void> {
  presenter.setLoading();
  try {
    const { allEvents } = await scan(storageDir);
    const usage  = aggregateCurrentMonth(allEvents);
    const budget = getCfg<number>('monthlyBudgetAiu', 0);
    const stats  = buildTooltipStats(allEvents, budget);
    presenter.update(usage.totalAiu, usage.eventCount, budget, stats);
    await checkExpensiveRequests(allEvents, context);
  } catch {
    presenter.update(null);
  }
}

function debounce(fn: () => void, ms: number): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return () => {
    if (timer) {
      clearTimeout(timer);
    }
    timer = setTimeout(fn, ms);
  };
}

export function activate(context: vscode.ExtensionContext): void {
  const storageDir = context.globalStorageUri.fsPath;

  const presenter = new UiPresenter();
  context.subscriptions.push(presenter);

  runScan(presenter, storageDir, context);

  const watchDir = path.join(getVsCodeDataDir(), 'User', 'workspaceStorage');
  const debouncedScan = debounce(() => runScan(presenter, storageDir, context), 1000);

  const watcher = vscode.workspace.createFileSystemWatcher(
    new vscode.RelativePattern(
      vscode.Uri.file(watchDir),
      '**/debug-logs/**/*.jsonl'
    )
  );

  watcher.onDidChange(debouncedScan, null, context.subscriptions);
  watcher.onDidCreate(debouncedScan, null, context.subscriptions);
  context.subscriptions.push(watcher);

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'copilotCredits.showMonthlyUsage',
      async () => {
        try {
          const { logFiles, allEvents } = await scan(storageDir);
          const now = new Date();

          showUsageChart(context, {
            allEvents,
            currentYear: now.getFullYear(),
            currentMonth: now.getMonth() + 1,
            logFileCount: logFiles.length,
            monthlyBudgetAiu: getCfg<number>('monthlyBudgetAiu', 0),
          });
        } catch (err) {
          vscode.window.showErrorMessage(
            `Copilot Credits: Failed to read usage data — ${String(err)}`
          );
        }
      }
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('copilotCredits.refresh', () => {
      runScan(presenter, storageDir, context);
    })
  );

  registerDiagnosticsCommand(context, storageDir);
}

export function deactivate(): void {}
