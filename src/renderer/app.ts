// The popover page: 사용량 현황 (WF-S001), Claude Code 연동 안내 (WF-S002), Codex 전체 리셋 (WF-S003),
// 설정 (developer, 2026-11-04; no PRS screen) and 도움말 (developer, 2026-11-12). Every word comes from
// src/shared/messages in the chosen language (developer, 2026-11-12).
// Messages marked HTML in ko.ts get HTML fills; every other fill is escaped first.
// Built from plan v3: the layout and elements follow the wireframe; the look is the app's own CSS.

import {
  isLanguage,
  languageNames,
  languages,
  languageTags,
  setLanguage,
  t,
  type Language,
  type MessageKey,
} from '../shared/i18n';
import { isThemeId, themeGroups, themes, type Theme } from '../shared/themes';
import {
  claudeStale,
  currentWatch,
  watchName,
  currentPercent,
  describePast,
  describeReset,
  formatClock,
  formatDateTime,
  formatDuration,
  resetPassed,
  resetTypeName,
  shorterFirst,
  windowName,
  isOverallWindow,
} from '../shared/format';
import { nearLimit } from '../shared/limits';
import { evenUse } from '../shared/pace';
import type {
  AreaState,
  CliId,
  CliUsage,
  IntegrationStatus,
  LoginItemStatus,
  MonitorApi,
  ResetEntry,
  ResetHistory,
  ResetStatus,
  ResetWatch,
  ResetsSnapshot,
  SourceState,
  UsageWindow,
  UsageCard,
  UsageSnapshot,
  View,
  WindowSettings,
} from '../shared/types';

declare global {
  interface Window {
    monitor: MonitorApi;
  }
}

const monitor = window.monitor;
const root = document.getElementById('app')!;

/** While the popover is open the usage screen re-reads every 30 seconds (LHS-5 개발 항목 1; owner 2026-10-30). */
const usageRefreshMs = 30_000;
const resetsSite = 'https://codex-resets.com';
const resetsLink = `<button class="link" data-action="external" data-url="${resetsSite}">codex-resets.com</button>`;

const state: {
  view: View;
  usage: UsageSnapshot | null;
  refreshing: boolean;
  integration: IntegrationStatus | null;
  applying: boolean;
  resets: ResetsSnapshot | null;
  window: WindowSettings;
  loginItem: LoginItemStatus | null;
  /** A login item change is being asked of macOS; the switch waits for the answer. */
  savingLoginItem: boolean;
  /** The screens to go back through: 도움말 › Claude Code 연동 안내 goes back to 도움말 (2026-11-12). */
  backStack: View[];
} = {
  view: 'usage',
  usage: null,
  refreshing: false,
  integration: null,
  applying: false,
  resets: null,
  window: {
    alwaysOnTop: false,
    workdaysOnly: false,
    theme: 'default',
    collapsed: [],
    menuBarHidden: [],
    language: 'ko',
  },
  loginItem: null,
  savingLoginItem: false,
  backStack: [],
};

const escapeHtml = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );

const cliNames: Record<CliId, string> = { claude: 'Claude Code', codex: 'Codex' };

const chevronRight =
  '<svg class="icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M6 3.5 10.5 8 6 12.5" /></svg>';
const chevronDown =
  '<svg class="icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 6 8 10.5 12.5 6" /></svg>';
const refreshIcon =
  '<svg class="icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M13 8a5 5 0 1 1-1.46-3.54" /><path d="M13 2.5v3h-3" /></svg>';
const gearIcon =
  '<svg class="icon" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="2" /><path d="M8 1.75v1.5M8 12.75v1.5M1.75 8h1.5M12.75 8h1.5M3.58 3.58l1.06 1.06M11.36 11.36l1.06 1.06M3.58 12.42l1.06-1.06M11.36 4.64l1.06-1.06" /><circle cx="8" cy="8" r="4.75" /></svg>';
const chevronLeft =
  '<svg class="icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M10 3.5 5.5 8 10 12.5" /></svg>';

const chip = (text: string, tone = '') => `<span class="chip${tone ? ` ${tone}` : ''}">${text}</span>`;
const skeleton = '<div class="skeleton"></div><div class="skeleton short"></div>';

// ---------- 사용량 현황 ----------

/**
 * The even-use mark and the explanation shown while the pointer is over it (developer, 2026-11-05:
 * the mark alone was not understood, and a legend under the cards was replaced by this). The tip is
 * placed along the bar under the mark, kept inside the bar's width.
 */
function evenMark(expected: number, workdays: boolean): string {
  const at = expected.toFixed(1);
  // With «주말·공휴일 제외» the mark stands still on days off; say so where it is explained.
  const daysOff = workdays ? t('even.daysOff') : '';
  const text = escapeHtml(t('even.tip', { daysOff, percent: Math.round(expected) }));
  return `<div class="even" style="left:${at}%" role="img" aria-label="${text}"></div>
    <div class="even-tip" style="--at:${at}%" aria-hidden="true">${text}</div>`;
}

/** «리셋 내일 09:00 (3시간 뒤)»; once passed, «오늘 17:20에 리셋됨 · 새 기록을 기다려요». */
function resetLine(w: UsageWindow, now: number): string {
  if (w.resetsAt === null) return t('reset.noTime');
  if (resetPassed(w, now)) return t('reset.happened', { when: formatDateTime(w.resetsAt, now) });
  return t('reset.line', { when: describeReset(w.resetsAt, now) });
}

function windowsHtml(usage: CliUsage, now = Date.now()): string {
  if (usage.windows.length === 0) return `<p class="empty">${t('usage.noValues')}</p>`;
  return [...usage.windows]
    .sort(shorterFirst)
    .map((w) => {
      // Past its reset time the window counts 0% until a newer value comes (currentPercent).
      const used = currentPercent(w, now);
      const percent = Math.max(0, Math.min(100, used));
      // Two colours only: the warning colour from the limit alert threshold (LHS-9, 80%), else the usual one.
      const tone = nearLimit(used) ? 'high' : '';
      // The even-use mark (Usage4Claude's guide): where the bar would be if spent evenly until the reset.
      const workdays = state.window.workdaysOnly && (w.windowMinutes ?? 0) >= 1440;
      const expected = evenUse(w, now, workdays);
      const even = expected === null ? '' : evenMark(expected, workdays);
      return `
        <div class="window">
          <div class="window-top">
            <span class="window-name">${escapeHtml(t('usage.limit', { name: windowName(w) }))}</span>
            <span class="window-percent ${tone}">${t('usage.used', { percent: `<span class="num">${Math.round(used)}%</span>` })}</span>
          </div>
          <div class="track" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(percent)}"
               aria-label="${escapeHtml(t('usage.usedRatio', { name: windowName(w) }))}">
            <div class="fill ${tone}" style="width:${percent}%"></div>${even}
          </div>
          <div class="sub">${resetLine(w, now)}</div>
        </div>`;
    })
    .join('');
}

/**
 * Under the card title, as CodexBar's «Updated just now»: how old the values are and, for Claude
 * Code, where they came from (developer, 2026-11-03). The full time is in the tooltip.
 */
function freshnessHtml(cli: CliId, usage: CliUsage | null, now = Date.now()): string {
  if (!usage) return '';
  const age = usage.updatedAt
    ? t('time.agoShort', { duration: formatDuration(now - usage.updatedAt) })
    : t('usage.unknownAge');
  const full = usage.updatedAt ? ` title="${describePast(usage.updatedAt, now)}"` : '';
  if (cli === 'codex') return `<p class="card-sub"${full}>${t('usage.codexFresh', { age })}</p>`;
  const from = t(usage.source === 'account' ? 'usage.fromAccount' : 'usage.fromStatusline');
  return `<p class="card-sub"${full}>${t('usage.claudeFresh', { age, from })}</p>`;
}

/**
 * Why the account could not be asked, and, once the values are over 10 minutes old, how old they
 * are and why the record falls behind (developer, 2026-11-11: the card said 정상 on a 14-hour-old
 * record while Anthropic's page showed more use).
 */
function accountProblemHtml(usage: CliUsage, now = Date.now()): string {
  let line = '';
  if (usage.accountProblem)
    line = `<p class="card-note">${t('usage.accountProblem', { problem: escapeHtml(usage.accountProblem) })}</p>`;
  else if (usage.accountRetryAt)
    line = `<p class="card-note quiet">${t('usage.accountPaused', { time: formatClock(usage.accountRetryAt) })}</p>`;
  if (!claudeStale(usage, now) || usage.updatedAt === null) return line;
  const why = usage.source === 'statusline' ? t('usage.staleWhy') : '';
  return `${line}<p class="card-note">${t('usage.stale', { duration: formatDuration(now - usage.updatedAt), why })}</p>`;
}

function waitingHtml(cli: CliId): string {
  return cli === 'claude'
    ? `<div class="empty"><p>${t('usage.waitingClaude')}</p>
         <p>${t('usage.waitingClaudeHow')}
         <button class="link" data-action="go" data-view="claude-setup">${t('usage.openSetup')}</button></p></div>`
    : `<div class="empty"><p>${t('usage.waitingCodex')}</p>
         <p>${t('usage.waitingCodexHow')}</p></div>`;
}

/** The same words as the reset areas (areaError): 자동 재시도 중 while the automatic re-read runs (LHS-6 검증 10). */
function retryLine(cli: CliId, source: Extract<SourceState, { kind: 'error' }>): string {
  const next = source.nextRetryAt ? t('retry.next', { time: formatClock(source.nextRetryAt) }) : '';
  return `<div class="row-actions">
      <button class="small" data-action="retry" data-cli="${cli}" data-key="retry-${cli}">${t('retry.button')}</button>
      <span>${source.retrying ? t('retry.running') : t('retry.auto', { next })}</span>
    </div>`;
}

const cardName = (card: UsageCard) => (card === 'upcoming' ? t('card.upcoming') : cliNames[card]);

const isCollapsed = (card: UsageCard) => state.window.collapsed.includes(card);

/**
 * Folds a usage screen card to its title line, or opens it (developer, 2026-11-11). The arrow
 * points up while open and down while folded, so it never looks like the › that opens the reset
 * screen.
 */
function collapseButton(card: UsageCard): string {
  const collapsed = isCollapsed(card);
  const label = escapeHtml(t(collapsed ? 'card.expand' : 'card.collapse', { name: cardName(card) }));
  return `<button class="icon-button collapse-toggle" data-action="collapse" data-card="${card}"
            data-key="collapse-${card}" aria-expanded="${!collapsed}" aria-label="${label}" title="${label}">
            ${chevronDown}</button>`;
}

/** Folded, the usage card keeps its windows as «20/14%», shorter first, as the menu bar does. */
function foldedSummary(usage: CliUsage | null): string {
  if (!usage || usage.windows.length === 0) return '';
  const now = Date.now();
  const values = usage.windows
    .filter(isOverallWindow)
    .sort(shorterFirst)
    .map((w) => Math.round(currentPercent(w, now)));
  if (values.length === 0) return '';
  return `<span class="head-summary">${values.join('/')}%</span>`;
}

function sourceCard(cli: CliId, source: SourceState): string {
  let badge = '';
  let body = '';
  let stale = false;
  switch (source.kind) {
    case 'loading':
      badge = chip(t('chip.loading'));
      body = skeleton;
      break;
    case 'waiting':
      badge = chip(t('chip.waiting'));
      body = waitingHtml(cli);
      break;
    case 'ok':
      // The record shown because the account could not be asked may be hours old: say so.
      badge = source.usage.accountProblem
        ? chip(t('chip.accountFailed'), 'warn')
        : claudeStale(source.usage)
          ? chip(t('chip.stale'), 'warn')
          : chip(t('chip.ok'), 'ok');
      body = windowsHtml(source.usage) + accountProblemHtml(source.usage);
      break;
    case 'error':
      if (source.lastGood) {
        badge = chip(t('chip.notCurrent'), 'warn');
        stale = true;
        body = `
          <div class="notice warn" role="alert">
            <p>${t('usage.lastGood', { message: escapeHtml(source.message) })}</p>
            ${retryLine(cli, source)}
          </div>
          <div class="stale">${windowsHtml(source.lastGood)}</div>`;
      } else {
        badge = chip(t(source.retrying ? 'retry.running' : 'chip.unavailable'), 'error');
        body = `
          <div class="notice error" role="alert">
            <p>${t('usage.neverRead', { message: escapeHtml(source.message) })}</p>
            ${retryLine(cli, source)}
          </div>`;
      }
      break;
  }
  const shown = source.kind === 'ok' ? source.usage : source.kind === 'error' ? source.lastGood : null;
  const plan = shown?.planType
    ? `<span class="head-note">${t('usage.plan', { plan: escapeHtml(shown.planType) })}</span>`
    : '';
  const collapsed = isCollapsed(cli);
  return `
    <section class="card${stale ? ' is-stale' : ''}${collapsed ? ' is-collapsed' : ''}" data-cli="${cli}" aria-label="${cliNames[cli]}">
      <div class="card-head"><h2>${cliNames[cli]}${collapsed ? '' : plan}</h2>
        <span class="head-end">${collapsed ? foldedSummary(shown) : ''}${badge}${collapseButton(cli)}</span></div>
      ${collapsed ? '' : freshnessHtml(cli, shown) + body}
    </section>`;
}

const typeName = resetTypeName;
const firstLine = (text: string) => text.split('\n')[0] ?? '';

/**
 * With no reset announced, the site's reset watch when there is one (developer, 2026-11-11: the site
 * said «Possible reset within 2 days» while this card said 예정 리셋 없음): the grade and chance, until
 * when it holds, and the post it comes from. It is a hint, not a scheduled reset, so it says so.
 */
function watchBody(watch: ResetWatch): string {
  const chance =
    watch.chancePercent === null ? '' : ` · ${t('watch.chance', { percent: watch.chancePercent })}`;
  const line = `${t('watch.signal', { when: formatDateTime(watch.observedAt) })}${watch.text ? ` · ${escapeHtml(firstLine(watch.text))}` : ''}`;
  return `<p class="upcoming-main"><span>${watchName(watch)}${chance}</span><span class="due">${t('watch.until', { when: formatDateTime(watch.expiresAt) })}</span></p>
    <p class="sub one-line" title="${line}">${line}</p>
    <p class="sub">${t('watch.notAnnounced')}</p>`;
}

/** The scheduled reset only; the rest of the status is on the reset screen (PR-P015, FC-F008). */
function upcomingBody(value: ResetStatus): string {
  const next = value.scheduled;
  if (!next) {
    const watch = currentWatch(value);
    if (watch) return watchBody(watch);
    return `<p class="upcoming-main">${t('upcoming.none')}</p>
      <p class="sub">${t('upcoming.noneNote')}</p>`;
  }
  // The due time when the announcement gives one, the same time the menu bar counts down to (LHS-5 검증 16).
  const due =
    next.scheduledFor === null ? '' : `<span class="due">${formatDateTime(next.scheduledFor)}</span>`;
  const line = `${t('upcoming.announced', { when: formatDateTime(next.announcedAt) })}${next.text ? ` · ${escapeHtml(firstLine(next.text))}` : ''}`;
  return `<p class="upcoming-main"><span>${t('upcoming.scheduled', { type: escapeHtml(typeName(next.type)) })}</span>${due}</p>
    <p class="sub one-line" title="${line}">${line}</p>`;
}

/**
 * Codex 예정 리셋, right under the Codex card (WF-S001). Anywhere in it opens the reset screen,
 * also when there is no scheduled reset or it could not be loaded (PR-P015); there is no separate
 * button for the reset screen (FC-F008). The area itself takes the keyboard (planner, 2026-10-30):
 * a button stretched over the whole card is what gets focus, Enter and Space, and the name
 * «Codex 전체 리셋 자세히 보기». It sits under the card's content rather than around it, so
 * «다시 시도» and the source link stay buttons of their own for screen readers. › is only a sign.
 */
function upcomingCard(): string {
  const s = state.resets?.status;
  const refreshing = state.resets?.refreshing.status ?? false;
  let badge: string;
  let content: string;
  if (!s || s.kind === 'idle' || s.kind === 'loading') {
    badge = chip(t('chip.loading'));
    content = '<div class="skeleton short"></div>';
  } else if (s.kind === 'ok') {
    badge = refreshing ? chip(t('chip.refreshing')) : '';
    content = upcomingBody(s.value);
  } else if (s.kind === 'empty') {
    badge = refreshing ? chip(t('chip.refreshing')) : chip(t('chip.empty'));
    content = `<p class="upcoming-main muted">${t('upcoming.noInfo')}</p>`;
  } else {
    badge = refreshing ? chip(t('chip.refreshing')) : errorChip(s);
    content =
      areaError('status', s, t('upcoming.label')) +
      (s.lastGood ? `<div class="stale">${upcomingBody(s.lastGood)}</div>` : '');
  }
  const collapsed = isCollapsed('upcoming');
  return `
    <section class="card upcoming${collapsed ? ' is-collapsed' : ''}" data-area="upcoming" data-action="go" data-view="resets" aria-label="${t('card.upcoming')}">
      <button class="upcoming-open" data-action="go" data-view="resets" data-key="open-resets"
              aria-label="${t('upcoming.open')}" title="${t('upcoming.open')}"></button>
      <div class="card-head">
        <h2>${t('card.upcoming')}</h2>
        <span class="head-end">${badge}<span class="chevron" aria-hidden="true">${chevronRight}</span>${collapseButton('upcoming')}</span>
      </div>
      ${
        collapsed
          ? ''
          : `${content}
      <p class="source">${t('source.label')} ${resetsLink}</p>`
      }
    </section>`;
}

function usageView(): string {
  const usage = state.usage;
  if (!usage) return `<main><section class="card">${skeleton}</section></main>`;
  const bothFailed = usage.claude.kind === 'error' && usage.codex.kind === 'error';
  return `
    <main>
      ${
        usage.alertNotice
          ? `<div class="notice warn" role="alert"><p>${escapeHtml(usage.alertNotice)}</p>
               <div class="row-actions"><button class="small" data-action="dismiss-alert">${t('notice.close')}</button></div></div>`
          : ''
      }
      ${
        usage.resetNotice
          ? `<div class="notice warn" role="alert"><p>${escapeHtml(usage.resetNotice)}</p>
               <div class="row-actions"><button class="small" data-action="dismiss-reset">${t('notice.close')}</button></div></div>`
          : ''
      }
      ${bothFailed ? `<div class="notice error" role="alert"><p>${t('usage.bothFailed')}</p></div>` : ''}
      ${sourceCard('claude', usage.claude)}
      ${sourceCard('codex', usage.codex)}
      ${upcomingCard()}
    </main>`;
}

// ---------- 도움말 ----------

/**
 * 도움말 (developer, 2026-11-12: «Claude Code 연동 안내 should be on a separate screen such as
 * 도움말»): the setup guide's entry and the login note, which stood under the usage cards, and where
 * the reset information comes from.
 */
function helpView(): string {
  return `
    <main>
      <section class="card" data-area="help-claude" aria-label="${t('help.claudeTitle')}">
        <div class="card-head"><h2>${t('help.claudeTitle')}</h2></div>
        <p class="sub">${t('help.claudeBody')}</p>
        <div class="card-actions">
          <button class="text-button" data-action="go" data-view="claude-setup" data-key="open-setup">${t('view.claudeSetup')}${chevronRight}</button>
        </div>
        <p class="sub">${t('help.loginNote')}</p>
      </section>
      <section class="card" data-area="help-resets" aria-label="${t('help.resetsTitle')}">
        <div class="card-head"><h2>${t('help.resetsTitle')}</h2></div>
        <p class="sub">${t('help.resetsBody', { link: resetsLink })}</p>
      </section>
    </main>`;
}

// ---------- Claude Code 연동 안내 ----------

function claudeSetupView(): string {
  const status = state.integration;
  if (!status) return `<main><section class="card">${skeleton}</section></main>`;
  const result = status.lastApply;
  const existing = status.previousCommand
    ? `<p>${t('setup.existing', { command: `<code>${escapeHtml(status.previousCommand)}</code>` })}</p>`
    : `<p>${t('setup.noExisting')}</p>`;
  return `
    <main>
      <section class="card">
        <div class="card-head"><h2>${t('setup.title')}</h2>
          ${status.applied ? chip(t('setup.applied'), 'ok') : status.missingFiles.length > 0 ? chip(t('setup.broken'), 'error') : chip(t('setup.notApplied'))}
        </div>
        <div class="prose">
          <p>${t('setup.intro')}</p>
          ${existing}
          <p class="sub">${t('setup.changes', { path: `<code>${escapeHtml(status.settingsPath)}</code>`, key: '<code>statusLine</code>' })}</p>
        </div>
        <div class="card-actions">
          <button class="primary" data-action="apply" data-key="apply" ${status.applied || state.applying ? 'disabled' : ''}>
            ${t(state.applying ? 'setup.applying' : status.applied ? 'setup.applied' : status.missingFiles.length > 0 ? 'setup.reapply' : 'setup.apply')}
          </button>
        </div>
      </section>

      ${
        result
          ? `<div class="notice ${result.ok ? 'ok' : 'error'}" role="${result.ok ? 'status' : 'alert'}"><p>${escapeHtml(result.message)}</p></div>`
          : ''
      }
      ${
        status.missingFiles.length > 0
          ? `<div class="notice error" role="alert"><p>${t('setup.missing', { paths: status.missingFiles.map((path) => `<code>${escapeHtml(path)}</code>`).join(', ') })}</p><p>${t('setup.missingWhy')}</p></div>`
          : ''
      }
      ${
        status.hookError
          ? `<div class="notice error" role="alert"><p>${t('setup.hookError', { when: formatDateTime(status.hookError.at), message: escapeHtml(status.hookError.message) })}</p><p>${t('setup.hookErrorWhy')}</p></div>`
          : ''
      }

      <section class="card">
        <div class="card-head"><h2>${t('setup.readsTitle')}</h2></div>
        <ul class="list">
          <li><span class="list-label">${t('setup.readsLabel')}</span><span>${t('setup.reads', { codexDir: '<code>~/.codex/sessions</code>' })}</span></li>
          <li><span class="list-label">${t('setup.loginLabel')}</span><span>${t('setup.login', { host: '<code>api.anthropic.com</code>' })}</span></li>
          <li><span class="list-label">${t('setup.freshLabel')}</span><span>${t('setup.fresh')}</span></li>
        </ul>
      </section>
    </main>`;
}

// ---------- Codex 전체 리셋 ----------

function errorChip<T>(s: Extract<AreaState<T>, { kind: 'error' }>): string {
  if (s.lastGood) return chip(t('chip.notCurrent'), 'warn');
  return chip(t(s.retry?.running ? 'retry.running' : 'chip.loadFailed'), 'error');
}

function areaError<T>(
  area: 'status' | 'history',
  s: Extract<AreaState<T>, { kind: 'error' }>,
  label: string,
): string {
  const retry = s.retry
    ? s.retry.running
      ? t('area.retryRunning', { of: s.retry.of, attempt: s.retry.attempt })
      : t('area.retryAt', { time: formatClock(s.retry.at), of: s.retry.of, attempt: s.retry.attempt })
    : t('area.retryStopped');
  const lead = s.lastGood
    ? t('area.lastGood', {
        message: escapeHtml(s.message),
        when: s.lastGoodAt ? formatDateTime(s.lastGoodAt) : t('area.previously'),
        label,
      })
    : t('area.failed', { label, message: escapeHtml(s.message) });
  return `<div class="notice ${s.lastGood ? 'warn' : 'error'}" role="alert">
      <p>${lead}</p>
      <div class="row-actions"><button class="small" data-action="retry-resets" data-area="${area}" data-key="retry-${area}">${t('retry.button')}</button><span>${retry}</span></div>
    </div>`;
}

/** The type beside a date only when it is not what the row's name already says («전체 리셋»). */
const otherType = (type: string) => (type === 'regular' ? '' : `<span class="type">${typeName(type)}</span>`);

function statusBody(value: ResetStatus): string {
  const latest = value.latest
    ? `${formatDateTime(value.latest.announcedAt)}${otherType(value.latest.type)}`
    : t('resets.noRecord');
  const scheduledAt = value.scheduled
    ? value.scheduled.scheduledFor === null
      ? t('resets.announcedOnly', { when: formatDateTime(value.scheduled.announcedAt) })
      : formatDateTime(value.scheduled.scheduledFor)
    : '';
  const scheduled = value.scheduled
    ? `${scheduledAt}${otherType(value.scheduled.type)}`
    : `<span class="muted">${t('resets.noScheduled')}</span>`;
  const average =
    value.avgIntervalDays === null
      ? t('resets.unknown')
      : t('resets.average', { days: value.avgIntervalDays.toFixed(1) });
  const since =
    value.daysSinceLast === null
      ? ''
      : `<p class="sub facts-note">${t('resets.since', { duration: formatDuration(value.daysSinceLast * 86_400_000), total: value.total })}</p>`;
  const watch = currentWatch(value);
  const watchRow = watch
    ? `<div><dt>${watchName(watch)}</dt><dd>${watch.chancePercent === null ? '' : `${t('watch.chance', { percent: watch.chancePercent })} · `}${t('watch.until', { when: formatDateTime(watch.expiresAt) })}${
        watch.sourceUrl
          ? ` <button class="link small-link" data-action="external" data-url="${escapeHtml(watch.sourceUrl)}">${t('resets.post')}</button>`
          : ''
      }</dd></div>`
    : '';
  return `<dl class="facts">
      <div><dt>${t('resets.latest')}</dt><dd>${latest}</dd></div>
      <div><dt>${t('resets.scheduled')}</dt><dd>${scheduled}</dd></div>${watchRow}
      <div><dt>${t('resets.interval')}</dt><dd>${average}</dd></div>
    </dl>${since}`;
}

function historyRow(entry: ResetEntry): string {
  const original = entry.sourceUrl
    ? `<button class="link small-link" data-action="external" data-url="${escapeHtml(entry.sourceUrl)}">${t('resets.announcement')}</button>`
    : '';
  return `<li>
      <div class="row-top"><strong>${formatDateTime(entry.announcedAt)}</strong>
        <span class="head-end">${chip(escapeHtml(typeName(entry.type)))}${original}</span></div>
      <p class="snippet" title="${escapeHtml(entry.text)}">${escapeHtml(firstLine(entry.text))}</p>
    </li>`;
}

function historyBody(value: ResetHistory): string {
  const refreshing = state.resets?.refreshing.history ?? false;
  const more = value.nextCursor
    ? `<div class="card-actions">
         <button class="small" data-action="more" data-key="more" ${value.loadingMore || refreshing ? 'disabled' : ''}>${t(value.loadingMore ? 'resets.loadingMore' : 'resets.more')}</button>
       </div>`
    : `<p class="sub end-note">${t('resets.allLoaded')}</p>`;
  const moreError = value.moreError
    ? `<div class="notice error" role="alert"><p>${t('resets.moreFailed', { message: escapeHtml(value.moreError) })}</p></div>`
    : '';
  return `<ul class="history">${value.entries.map(historyRow).join('')}</ul>${moreError}${more}`;
}

function areaCard<T>(
  area: 'status' | 'history',
  title: string,
  label: string,
  s: AreaState<T> | undefined,
  body: (v: T) => string,
  emptyText: string,
): string {
  const refreshing = state.resets?.refreshing[area] ?? false;
  let badge = refreshing ? chip(t('chip.refreshing')) : '';
  let content: string;
  if (!s || s.kind === 'idle' || s.kind === 'loading') {
    badge = chip(t('chip.loading'));
    content = skeleton;
  } else if (s.kind === 'ok') {
    content = body(s.value);
  } else if (s.kind === 'empty') {
    badge ||= chip(t('chip.empty'));
    content = `<p class="empty">${emptyText}</p>`;
  } else {
    badge = refreshing ? chip(t('chip.refreshing')) : errorChip(s);
    content = areaError(area, s, label) + (s.lastGood ? `<div class="stale">${body(s.lastGood)}</div>` : '');
  }
  return `<section class="card" data-area="${area}" aria-label="${title}">
      <div class="card-head"><h2>${title}</h2>${badge}</div>${content}</section>`;
}

function resetsView(): string {
  const snapshot = state.resets;
  return `
    <main>
      ${areaCard('status', t('resets.statusTitle'), t('resets.statusLabel'), snapshot?.status, statusBody, t('resets.statusEmpty'))}
      ${areaCard('history', t('resets.historyTitle'), t('resets.historyLabel'), snapshot?.history, historyBody, t('resets.historyEmpty'))}
      <p class="footnote">${t('resets.footnote', { link: resetsLink })}</p>
    </main>`;
}

// ---------- 설정 ----------

/**
 * «로그인 시 자동 실행» (developer, 2026-11-04). macOS holds the setting, so the switch shows what
 * macOS answered, also after a change made in System Settings. Off until the person turns it on.
 */
function settingsView(): string {
  const item = state.loginItem;
  if (!item) return `<main><section class="card">${skeleton}</section></main>`;
  const disabled = !item.supported || state.savingLoginItem;
  const note = !item.supported
    ? `<p class="sub">${t('settings.sourceOnly')}</p>`
    : `<p class="sub">${t('settings.loginNote')}</p>`;
  return `
    <main>
      ${languageCard()}
      <section class="card" data-area="login-item" aria-label="${t('settings.start')}">
        <div class="card-head"><h2>${t('settings.start')}</h2></div>
        <div class="setting-row">
          <span class="setting-name" id="login-item-name">${t('settings.openAtLogin')}</span>
          <label class="switch">
            <input type="checkbox" role="switch" data-key="login-item" aria-labelledby="login-item-name"
                   ${item.openAtLogin ? 'checked' : ''} ${disabled ? 'disabled' : ''} />
            <span class="switch-track" aria-hidden="true"><span class="switch-thumb"></span></span>
          </label>
        </div>
        ${note}
      </section>
      ${
        item.needsApproval
          ? `<div class="notice warn" role="status"><p>${t('settings.needsApproval')}</p>
               <div class="row-actions"><button class="small" data-action="open-login-items" data-key="open-login-items">${t('settings.openSystemSettings')}</button></div></div>`
          : ''
      }
      ${item.error ? `<div class="notice error" role="alert"><p>${escapeHtml(item.error)}</p></div>` : ''}
      <section class="card" data-area="workdays" aria-label="${t('settings.pace')}">
        <div class="card-head"><h2>${t('settings.pace')}</h2></div>
        <div class="setting-row">
          <span class="setting-name" id="workdays-name">${t('settings.workdays')}</span>
          <label class="switch">
            <input type="checkbox" role="switch" data-key="workdays" aria-labelledby="workdays-name"
                   ${state.window.workdaysOnly ? 'checked' : ''} />
            <span class="switch-track" aria-hidden="true"><span class="switch-thumb"></span></span>
          </label>
        </div>
        <p class="sub">${t('settings.workdaysNote')}</p>
      </section>
      ${menuBarCard()}
      ${themeCard()}
    </main>`;
}

/** Which CLIs the menu bar title shows (developer, 2026-11-11); both until one is turned off. */
function menuBarCard(): string {
  const row = (cli: CliId) => `
        <div class="setting-row">
          <span class="setting-name" id="menu-bar-${cli}-name">${cliNames[cli]}</span>
          <label class="switch">
            <input type="checkbox" role="switch" data-key="menu-bar" data-cli="${cli}" aria-labelledby="menu-bar-${cli}-name"
                   ${state.window.menuBarHidden.includes(cli) ? '' : 'checked'} />
            <span class="switch-track" aria-hidden="true"><span class="switch-thumb"></span></span>
          </label>
        </div>`;
  return `<section class="card" data-area="menu-bar" aria-label="${t('settings.menuBar')}">
      <div class="card-head"><h2>${t('settings.menuBar')}</h2></div>
      ${row('claude')}${row('codex')}
      <p class="sub">${t('settings.menuBarNote')}</p>
    </section>`;
}

/**
 * 언어 (developer, 2026-11-12): one radio group, each language under its own name; the screen
 * changes at once. The title also says «Language» when the chosen language is not English, so a
 * person who cannot read it still finds the setting. First on 설정 for the same reason.
 */
function languageCard(): string {
  const current = state.window.language;
  const title = current === 'en' ? t('settings.language') : `${t('settings.language')} · Language`;
  const options = languages
    .map(
      (language) => `<label class="theme-option language-option">
          <input type="radio" name="language" value="${language}" data-key="language-${language}"
                 lang="${languageTags[language]}" ${current === language ? 'checked' : ''} />
          <span class="theme-name" lang="${languageTags[language]}">${languageNames[language]}</span>
        </label>`,
    )
    .join('');
  return `<section class="card" data-area="language" aria-label="${title}">
      <div class="card-head"><h2 id="language-name">${title}</h2></div>
      <div class="theme-grid language-grid" role="radiogroup" aria-labelledby="language-name">${options}</div>
    </section>`;
}

/**
 * 테마 (developer, 2026-11-05): one radio group; the look changes as soon as one is picked. The
 * options stand in three groups (developer, 2026-11-10): themes that follow the Mac's light or dark
 * setting, always-light ones, always-dark ones.
 */
function themeCard(): string {
  // Three columns of swatch and name; the short description is the tooltip.
  const option = (theme: Theme): string => {
    const [bg, panel, bar, accent] = theme.swatch;
    return `<label class="theme-option" title="${theme.note}">
          <input type="radio" name="theme" value="${theme.id}" data-key="theme-${theme.id}"
                 ${state.window.theme === theme.id ? 'checked' : ''} />
          <span class="theme-swatch" aria-hidden="true" style="--sw-bg:${bg};--sw-panel:${panel};--sw-bar:${bar};--sw-accent:${accent}"><i></i></span>
          <span class="theme-name">${theme.name}</span>
        </label>`;
  };
  const groups = themeGroups
    .map(
      ({
        scheme,
        name,
      }) => `<div class="theme-group" role="group" aria-label="${name}" data-scheme="${scheme}">
          <p class="theme-group-name" aria-hidden="true">${name}</p>
          <div class="theme-grid">${themes
            .filter((theme) => theme.scheme === scheme)
            .map(option)
            .join('')}</div>
        </div>`,
    )
    .join('');
  return `<section class="card" data-area="theme" aria-label="${t('settings.theme')}">
      <div class="card-head"><h2 id="theme-name">${t('settings.theme')}</h2></div>
      <div role="radiogroup" aria-labelledby="theme-name">${groups}</div>
    </section>`;
}

// ---------- shell ----------

const titleKeys: Record<View, MessageKey> = {
  usage: 'view.usage',
  'claude-setup': 'view.claudeSetup',
  resets: 'view.resets',
  settings: 'view.settings',
  help: 'view.help',
};

/** «창 항상 위에 표시»: one setting, the same switch right of every screen's title (FC-F019, PR-P025). */
function pinSwitch(): string {
  const on = state.window.alwaysOnTop;
  return `<label class="switch" title="${t('top.pinTitle')}">
      <span class="switch-label">${t('top.pin')}</span>
      <input type="checkbox" role="switch" data-key="pin" aria-label="${t('top.pinTitle')}" ${on ? 'checked' : ''} />
      <span class="switch-track" aria-hidden="true"><span class="switch-thumb"></span></span>
    </label>`;
}

const helpIcon =
  '<svg class="icon" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6.25" /><path d="M6.1 6.2a1.95 1.95 0 1 1 2.65 1.82c-.45.18-.75.6-.75 1.08v.4" /><path d="M8 11.6v.05" /></svg>';

/** Where «back» leads: the screen this one was opened from (도움말 for the setup guide opened there). */
const backTarget = (): View => state.backStack[state.backStack.length - 1] ?? 'usage';

function render(): void {
  setLanguage(state.window.language);
  document.documentElement.dataset.theme = state.window.theme;
  document.documentElement.lang = languageTags[state.window.language];
  document.title = t('app.name');
  const backLabel = t(backTarget() === 'help' ? 'back.help' : 'back.usage');
  const back =
    state.view === 'usage'
      ? ''
      : `<button class="icon-button back" data-action="back" data-key="back"
                 aria-label="${backLabel}" title="${backLabel}">${chevronLeft}</button>`;
  // «새로 고침» (developer, 2026-11-03): re-reads both local records and asks for the reset status
  // at once, the same as the screen's own 30-second timer and «다시 시도». While a read runs it shows
  // the spinner and cannot be pressed again.
  // aria-disabled rather than disabled, so a keyboard user's focus stays on it through the read.
  const refreshing =
    state.view !== 'usage'
      ? ''
      : `<button class="icon-button" data-action="refresh" data-key="refresh" title="${t('top.refresh')}"
                 aria-label="${t(state.refreshing ? 'top.refreshing' : 'top.refresh')}" aria-disabled="${state.refreshing}">
           ${state.refreshing ? '<span class="spinner"></span>' : refreshIcon}</button>`;
  // 도움말 (developer, 2026-11-12) and 설정 (developer, 2026-11-04): beside «새로 고침» on the usage screen.
  const help =
    state.view !== 'usage'
      ? ''
      : `<button class="icon-button" data-action="go" data-view="help" data-key="open-help"
                 aria-label="${t('view.help')}" title="${t('view.help')}">${helpIcon}</button>`;
  const settings =
    state.view !== 'usage'
      ? ''
      : `<button class="icon-button" data-action="go" data-view="settings" data-key="open-settings"
                 aria-label="${t('view.settings')}" title="${t('view.settings')}">${gearIcon}</button>`;
  const views: Record<View, () => string> = {
    usage: usageView,
    'claude-setup': claudeSetupView,
    resets: resetsView,
    settings: settingsView,
    help: helpView,
  };
  const body = views[state.view]();
  const focused = (document.activeElement as HTMLElement | null)?.dataset?.key;
  const scroll = window.scrollY;
  document.body.classList.toggle('pinned', state.window.alwaysOnTop);
  root.innerHTML = `<header class="topbar">${back}<h1>${t(titleKeys[state.view])}</h1>${refreshing}${help}${settings}${pinSwitch()}</header>${body}`;
  window.scrollTo(0, scroll);
  // innerHTML replaces every element; keep the keyboard where it was.
  if (focused) root.querySelector<HTMLElement>(`[data-key="${focused}"]`)?.focus();
  // The menu bar popover takes the page's height (the main process caps it at the screen).
  requestAnimationFrame(() => monitor.reportHeight(Math.ceil(root.getBoundingClientRect().height)));
}

/** `automatic`: the open screen's own timer, which also retries a failed area (자동 재시도 중). */
async function refreshUsage(automatic = false): Promise<void> {
  state.refreshing = true;
  render();
  try {
    state.usage = await monitor.refreshUsage(automatic);
  } finally {
    state.refreshing = false;
    render();
  }
}

/**
 * Opens a screen. Going forward remembers where from, so «back» returns there; the usage screen
 * forgets the way, and `back` is the step back itself (developer, 2026-11-12: 도움말 › 연동 안내).
 */
async function go(view: View, how: 'forward' | 'back' = 'forward'): Promise<void> {
  const changed = view !== state.view;
  if (view === 'usage') state.backStack = [];
  else if (how === 'forward' && changed) state.backStack.push(state.view);
  state.view = view;
  if (changed) window.scrollTo(0, 0);
  render();
  if (view === 'usage') {
    void monitor.freshenResets().then((snapshot) => {
      state.resets = snapshot;
      render();
    });
    await refreshUsage();
  }
  if (view === 'claude-setup') {
    state.integration = await monitor.getIntegration();
    render();
  }
  if (view === 'resets') {
    state.resets = await monitor.openResets();
    render();
  }
  if (view === 'settings') {
    state.loginItem = await monitor.getLoginItem();
    render();
  }
}

root.addEventListener('click', (event) => {
  const target = (event.target as HTMLElement).closest<HTMLElement>('[data-action]');
  if (!target) return;
  const { action } = target.dataset;
  if (action === 'go') void go(target.dataset.view as View);
  if (action === 'back') void go(state.backStack.pop() ?? 'usage', 'back');
  if (action === 'collapse' && target.dataset.card) {
    const card = target.dataset.card as UsageCard;
    void monitor.setCollapsed(card, !isCollapsed(card)).then((settings) => {
      state.window = settings;
      render();
    });
  }
  if (action === 'refresh' && !state.refreshing) {
    void monitor.retryResets('status').then((snapshot) => {
      state.resets = snapshot;
      render();
    });
    void refreshUsage();
  }
  if (action === 'retry')
    void monitor.retry(target.dataset.cli as CliId).then((snapshot) => {
      state.usage = snapshot;
      render();
    });
  if (action === 'apply') {
    state.applying = true;
    render();
    void monitor
      .applyIntegration()
      .then((status) => {
        state.integration = status;
      })
      .finally(() => {
        state.applying = false;
        render();
      });
  }
  if (action === 'retry-resets')
    void monitor.retryResets(target.dataset.area as 'status' | 'history').then((snapshot) => {
      state.resets = snapshot;
      render();
    });
  if (action === 'more')
    void monitor.loadMoreResets().then((snapshot) => {
      state.resets = snapshot;
      render();
    });
  if (action === 'open-login-items') void monitor.openLoginItemSettings();
  if (action === 'external' && target.dataset.url) void monitor.openExternal(target.dataset.url);
  if (action === 'dismiss-alert')
    void monitor.dismissAlertNotice().then((snapshot) => {
      state.usage = snapshot;
      render();
    });
  if (action === 'dismiss-reset')
    void monitor.dismissResetNotice().then((snapshot) => {
      state.usage = snapshot;
      render();
    });
});

root.addEventListener('change', (event) => {
  const input = event.target as HTMLInputElement;
  if (input.dataset.key === 'login-item') {
    state.savingLoginItem = true;
    render();
    void monitor
      .setOpenAtLogin(input.checked)
      .then((status) => {
        state.loginItem = status;
      })
      .finally(() => {
        state.savingLoginItem = false;
        render();
      });
    return;
  }
  if (input.name === 'theme') {
    if (!isThemeId(input.value)) return;
    void monitor.setTheme(input.value).then((settings) => {
      state.window = settings;
      render();
    });
    return;
  }
  if (input.name === 'language') {
    if (!isLanguage(input.value)) return;
    const language: Language = input.value;
    // The screen changes at once; the main process then words its own texts (menus, messages) anew.
    state.window = { ...state.window, language };
    render();
    void monitor.setLanguage(language).then(async (settings) => {
      state.window = settings;
      state.usage = await monitor.getUsage();
      render();
    });
    return;
  }
  if (input.dataset.key === 'menu-bar') {
    void monitor.setShownInMenuBar(input.dataset.cli as CliId, input.checked).then((settings) => {
      state.window = settings;
      render();
    });
    return;
  }
  if (input.dataset.key === 'workdays') {
    void monitor.setWorkdaysOnly(input.checked).then((settings) => {
      state.window = settings;
      render();
    });
    return;
  }
  if (input.dataset.key !== 'pin') return;
  void monitor.setAlwaysOnTop(input.checked).then((settings) => {
    state.window = settings;
    render();
  });
});

// ---------- drag ----------

/**
 * Pinned, pressing the top bar (not its buttons or switch) and moving the pointer moves the window;
 * main.ts ('popover:drag') places it. The top bar is redrawn with each render, so the listeners are
 * on the document, not on it.
 */
let dragStart: { x: number; y: number } | null = null;
document.addEventListener('pointerdown', (event) => {
  if (event.button !== 0 || !document.body.classList.contains('pinned')) return;
  const target = event.target as Element;
  if (!target.closest('.topbar') || target.closest('button, label, input, a')) return;
  event.preventDefault();
  dragStart = { x: event.screenX, y: event.screenY };
  document.body.classList.add('dragging');
  monitor.dragWindow('start', 0, 0);
});
window.addEventListener('pointermove', (event) => {
  if (dragStart) monitor.dragWindow('move', event.screenX - dragStart.x, event.screenY - dragStart.y);
});
function endDrag(): void {
  if (!dragStart) return;
  dragStart = null;
  document.body.classList.remove('dragging');
  monitor.dragWindow('end', 0, 0);
}
window.addEventListener('pointerup', endDrag);
window.addEventListener('pointercancel', endDrag);
window.addEventListener('blur', endDrag);

monitor.onUsage((snapshot) => {
  state.usage = snapshot;
  if (state.view === 'usage') render();
});
monitor.onResets((snapshot) => {
  state.resets = snapshot;
  if (state.view !== 'claude-setup') render();
});
// Opening the popover starts over at the screen asked for, with nothing focused: a button focused
// by an earlier click came back with a keyboard focus ring when the popover opened (developer,
// 2026-11-13, «why does it show yellow square on reload button after I clicked the icon on the menu
// bar?»).
monitor.onNavigate((view) => {
  state.backStack = [];
  (document.activeElement as HTMLElement | null)?.blur();
  inputMode('pointer');
  void go(view);
});

/**
 * Focus rings only after the keyboard is used (2026-11-13). Each render puts focus back on the button
 * that had it, and Chromium draws the ring for that restored focus once the window is activated, so
 * :focus-visible alone showed it after mouse clicks too. `data-input` on <html> says which was used
 * last; styles.css hides the rings while it is «pointer». Tab and the arrow keys bring them back.
 */
function inputMode(mode: 'pointer' | 'keyboard'): void {
  document.documentElement.dataset.input = mode;
}
document.addEventListener('pointerdown', () => inputMode('pointer'), true);
document.addEventListener(
  'keydown',
  (event) => {
    if (!['Meta', 'Control', 'Alt', 'Shift'].includes(event.key)) inputMode('keyboard');
  },
  true,
);
inputMode('pointer');

let refreshTimer: number | null = null;
function syncRefreshTimer(): void {
  if (document.visibilityState === 'visible' && refreshTimer === null)
    refreshTimer = window.setInterval(() => {
      if (state.view === 'usage') void refreshUsage(true);
    }, usageRefreshMs);
  if (document.visibilityState !== 'visible' && refreshTimer !== null) {
    window.clearInterval(refreshTimer);
    refreshTimer = null;
  }
}
document.addEventListener('visibilitychange', syncRefreshTimer);
syncRefreshTimer();

void Promise.all([monitor.getUsage(), monitor.getResets(), monitor.getWindowSettings()]).then(
  ([usage, resets, settings]) => {
    state.usage = usage;
    state.resets = resets;
    state.window = settings;
    render();
  },
);
render();
