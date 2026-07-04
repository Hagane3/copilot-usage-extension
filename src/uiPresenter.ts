import * as vscode from 'vscode';

export interface TooltipStats {
  todayAiu: number;
  todayReq: number;
  weekAiu: number;
  weekReq: number;
  monthAiu: number;
  monthReq: number;
  topModel: string;
  budgetAiu: number;
}

export class UiPresenter implements vscode.Disposable {
  private readonly statusBarItem: vscode.StatusBarItem;

  constructor() {
    this.statusBarItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Right,
      100
    );
    this.statusBarItem.command = 'copilotCredits.showMonthlyUsage';
    this.statusBarItem.show();
  }

  setLoading(): void {
    this.statusBarItem.text = '$(sync~spin) Copilot usage: …';
    this.statusBarItem.tooltip = 'Copilot Credits — scanning logs…';
  }

  update(
    totalAiu: number | null,
    eventCount?: number,
    budgetAiu?: number,
    stats?: TooltipStats
  ): void {
    if (totalAiu === null) {
      this.statusBarItem.text = 'Copilot usage: n/a';
      this.statusBarItem.backgroundColor = undefined;
      this.statusBarItem.tooltip = 'Copilot Credits — no data found. Click for details.';
      return;
    }

    const req = eventCount !== undefined ? `  ·  ${eventCount} req` : '';
    this.statusBarItem.text = `Copilot usage: ${Math.round(totalAiu)} AIU${req}`;

    // Background colour based on budget %
    if (budgetAiu && budgetAiu > 0) {
      const pct = totalAiu / budgetAiu;
      if (pct >= 1.0) {
        this.statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
      } else if (pct >= 0.8) {
        this.statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
      } else {
        this.statusBarItem.backgroundColor = undefined;
      }
    } else {
      this.statusBarItem.backgroundColor = undefined;
    }

    // Rich Markdown tooltip
    this.statusBarItem.tooltip = stats
      ? buildTooltip(stats)
      : 'GitHub Copilot — click for chart.';
  }

  dispose(): void {
    this.statusBarItem.dispose();
  }
}

function fmt(aiu: number): string {
  return `${Math.round(aiu)} AIU ($${(aiu * 0.01).toFixed(2)})`;
}

function buildTooltip(s: TooltipStats): vscode.MarkdownString {
  const lines: string[] = [];

  lines.push('**$(graph) Copilot Usage**');
  lines.push('');
  lines.push(`$(calendar) **Today** &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; ${fmt(s.todayAiu)} · ${s.todayReq} req`);
  lines.push(`$(history) **This week** &nbsp;&nbsp; ${fmt(s.weekAiu)} · ${s.weekReq} req`);
  lines.push(`$(clock) **This month** &nbsp; ${fmt(s.monthAiu)} · ${s.monthReq} req`);

  if (s.topModel) {
    lines.push('');
    lines.push(`$(star) **Top model:** ${s.topModel}`);
  }

  if (s.budgetAiu > 0) {
    const pct = Math.min(100, Math.round((s.monthAiu / s.budgetAiu) * 100));
    const bar = buildBar(pct);
    lines.push('');
    lines.push(`$(flame) **Budget:** ${Math.round(s.monthAiu)} / ${Math.round(s.budgetAiu)} AIU`);
    lines.push(`${bar} ${pct}%`);
  }

  lines.push('');
  lines.push('---');
  lines.push('*Click to open usage chart*');

  const md = new vscode.MarkdownString(lines.join('\n\n'), true);
  md.isTrusted = false;
  md.supportThemeIcons = true;
  return md;
}

/** Renders a simple ASCII progress bar for the tooltip. */
function buildBar(pct: number): string {
  const filled = Math.round(pct / 10);
  const empty = 10 - filled;
  return '`' + '█'.repeat(filled) + '░'.repeat(empty) + '`';
}
