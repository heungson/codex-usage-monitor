// The popover page: 사용량 현황 (WF-S001), Claude Code 연동 안내 (WF-S002), Codex 전체 리셋 (WF-S003).
// Built from plan v3: the layout and elements follow the wireframe; the look is the app's own CSS.

import {
  describePast,
  describeReset,
  formatClock,
  formatDateTime,
  formatDuration,
  windowLabel,
} from '../shared/format';
import type {
  AreaState,
  CliId,
  CliUsage,
  IntegrationStatus,
  MonitorApi,
  ResetEntry,
  ResetHistory,
  ResetStatus,
  ResetsSnapshot,
  SourceState,
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

/** While the popover is open the usage screen re-reads every 60 seconds (owner decision 2026-10-28). */
const usageRefreshMs = 60_000;
const resetsSite = 'https://codex-resets.com';

const state: {
  view: View;
  usage: UsageSnapshot | null;
  refreshing: boolean;
  integration: IntegrationStatus | null;
  applying: boolean;
  resets: ResetsSnapshot | null;
  window: WindowSettings;
} = {
  view: 'usage',
  usage: null,
  refreshing: false,
  integration: null,
  applying: false,
  resets: null,
  window: { alwaysOnTop: false },
};

const escapeHtml = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );

const cliNames: Record<CliId, string> = { claude: 'Claude Code', codex: 'Codex' };

const chevronRight =
  '<svg class="icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M6 3.5 10.5 8 6 12.5" /></svg>';
const chevronLeft =
  '<svg class="icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M10 3.5 5.5 8 10 12.5" /></svg>';

const chip = (text: string, tone = '') => `<span class="chip${tone ? ` ${tone}` : ''}">${text}</span>`;
const skeleton = '<div class="skeleton"></div><div class="skeleton short"></div>';

// ---------- 사용량 현황 ----------

function windowsHtml(usage: CliUsage): string {
  if (usage.windows.length === 0) return '<p class="empty">기록에 한도 값이 없어요.</p>';
  return usage.windows
    .map((w) => {
      const percent = Math.max(0, Math.min(100, w.usedPercent));
      const tone = percent >= 100 ? 'full' : percent >= 80 ? 'high' : '';
      return `
        <div class="window">
          <div class="window-top">
            <span class="window-name">${windowLabel(w.windowMinutes)} 한도</span>
            <span class="window-percent ${tone}"><span class="num">${Math.round(w.usedPercent)}%</span> 사용</span>
          </div>
          <div class="track" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(percent)}"
               aria-label="${windowLabel(w.windowMinutes)} 한도 사용 비율">
            <div class="fill ${tone}" style="width:${percent}%"></div>
          </div>
          <div class="sub">${w.resetsAt === null ? '리셋 시각이 기록에 없어요' : `리셋 ${describeReset(w.resetsAt)}`}</div>
        </div>`;
    })
    .join('');
}

function metaHtml(cli: CliId, usage: CliUsage): string {
  if (cli === 'claude') {
    return `<div class="meta">마지막 갱신 <strong>${usage.updatedAt ? describePast(usage.updatedAt) : '알 수 없음'}</strong>
      <span class="meta-note">Claude Code가 실행 중일 때만 갱신돼요.</span></div>`;
  }
  return `<div class="meta">가장 최근 Codex 기록 <strong>${usage.updatedAt ? describePast(usage.updatedAt) : '알 수 없음'}</strong></div>`;
}

function waitingHtml(cli: CliId): string {
  return cli === 'claude'
    ? `<div class="empty"><p>아직 Claude Code 기록이 없어요.</p>
         <p>상태 표시줄 연동을 적용하고 Claude Code를 쓰면 기록이 쌓여요.
         <button class="link" data-action="go" data-view="claude-setup">연동 안내 열기</button></p></div>`
    : `<div class="empty"><p>아직 Codex 기록이 없어요.</p>
         <p>최근 8일 안에 Codex CLI를 쓴 기록이 생기면 자동으로 보여요.</p></div>`;
}

function retryLine(cli: CliId, nextRetryAt: number | null): string {
  const when = nextRetryAt ? ` · 다음 시도 ${formatClock(nextRetryAt)}` : '';
  return `<div class="row-actions">
      <button class="small" data-action="retry" data-cli="${cli}" data-key="retry-${cli}">다시 시도</button>
      <span>자동으로 다시 시도해요${when}</span>
    </div>`;
}

function sourceCard(cli: CliId, source: SourceState): string {
  let badge = '';
  let body = '';
  let stale = false;
  switch (source.kind) {
    case 'loading':
      badge = chip('불러오는 중');
      body = skeleton;
      break;
    case 'waiting':
      badge = chip('수집 대기');
      body = waitingHtml(cli);
      break;
    case 'ok':
      badge = chip('정상', 'ok');
      body = windowsHtml(source.usage) + metaHtml(cli, source.usage);
      break;
    case 'error':
      if (source.lastGood) {
        badge = chip('최신 정보 아님', 'warn');
        stale = true;
        body = `
          <div class="notice warn" role="alert">
            <p>${escapeHtml(source.message)}. 아래는 마지막으로 읽은 값이에요.</p>
            ${retryLine(cli, source.nextRetryAt)}
          </div>
          <div class="stale">${windowsHtml(source.lastGood)}${metaHtml(cli, source.lastGood)}</div>`;
      } else {
        badge = chip('확인 불가', 'error');
        body = `
          <div class="notice error" role="alert">
            <p>${escapeHtml(source.message)}. 읽은 적이 없어 보여 줄 값이 없어요.</p>
            ${retryLine(cli, source.nextRetryAt)}
          </div>`;
      }
      break;
  }
  const shown = source.kind === 'ok' ? source.usage : source.kind === 'error' ? source.lastGood : null;
  const plan = shown?.planType ? `<span class="head-note">요금제 ${escapeHtml(shown.planType)}</span>` : '';
  return `
    <section class="card${stale ? ' is-stale' : ''}" data-cli="${cli}" aria-label="${cliNames[cli]}">
      <div class="card-head"><h2>${cliNames[cli]}${plan}</h2>${badge}</div>
      ${body}
    </section>`;
}

const resetTypeNames: Record<string, string> = { regular: '전체 리셋', banked: '적립형 리셋' };
const typeName = (type: string) => resetTypeNames[type] ?? type;
const firstLine = (text: string) => text.split('\n')[0] ?? '';

/** The scheduled reset only; the rest of the status is on the reset screen (PR-P015, FC-F008). */
function upcomingBody(value: ResetStatus): string {
  const next = value.scheduled;
  if (!next)
    return `<p class="upcoming-main">예정 리셋 없음</p>
      <p class="sub">새 리셋이 공지되면 알림으로 알려 드려요.</p>`;
  return `<p class="upcoming-main">${escapeHtml(typeName(next.type))} 예정</p>
    <p class="sub">${formatDateTime(next.announcedAt)} 공지${next.text ? ` · ${escapeHtml(firstLine(next.text))}` : ''}</p>`;
}

/**
 * Codex 예정 리셋, right under the Codex card (WF-S001). Anywhere in it opens the reset screen,
 * also when there is no scheduled reset or it could not be loaded (PR-P015); there is no separate
 * button for the reset screen (FC-F008).
 */
function upcomingCard(): string {
  const s = state.resets?.status;
  const refreshing = state.resets?.refreshing.status ?? false;
  let badge: string;
  let content: string;
  if (!s || s.kind === 'idle' || s.kind === 'loading') {
    badge = chip('불러오는 중');
    content = '<div class="skeleton short"></div>';
  } else if (s.kind === 'ok') {
    badge = refreshing ? chip('새로 고치는 중') : '';
    content = upcomingBody(s.value);
  } else if (s.kind === 'empty') {
    badge = refreshing ? chip('새로 고치는 중') : chip('결과 없음');
    content = '<p class="upcoming-main muted">예정 리셋 정보 없음</p>';
  } else {
    badge = errorChip(s);
    content =
      areaError('status', s, '예정 리셋') +
      (s.lastGood ? `<div class="stale">${upcomingBody(s.lastGood)}</div>` : '');
  }
  return `
    <section class="card upcoming" data-area="upcoming" data-action="go" data-view="resets" aria-label="Codex 예정 리셋">
      <div class="card-head">
        <h2>Codex 예정 리셋</h2>
        <span class="head-end">${badge}
          <button class="icon-button" data-action="go" data-view="resets" data-key="open-resets"
                  aria-label="Codex 전체 리셋 자세히 보기" title="Codex 전체 리셋 자세히 보기">${chevronRight}</button>
        </span>
      </div>
      ${content}
      <p class="source">출처 <button class="link" data-action="external" data-url="${resetsSite}">codex-resets.com</button></p>
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
               <div class="row-actions"><button class="small" data-action="dismiss-alert">닫기</button></div></div>`
          : ''
      }
      ${
        usage.resetNotice
          ? `<div class="notice warn" role="alert"><p>${escapeHtml(usage.resetNotice)}</p>
               <div class="row-actions"><button class="small" data-action="dismiss-reset">닫기</button></div></div>`
          : ''
      }
      ${bothFailed ? '<div class="notice error" role="alert"><p>두 CLI의 기록을 모두 읽지 못했어요.</p></div>' : ''}
      ${sourceCard('claude', usage.claude)}
      ${sourceCard('codex', usage.codex)}
      ${upcomingCard()}
      <footer class="foot">
        <button class="text-button" data-action="go" data-view="claude-setup" data-key="open-setup">Claude Code 연동 안내${chevronRight}</button>
        <p class="footnote">이 컴퓨터의 CLI 기록만 읽고, 로그인 정보나 토큰은 어디에도 보내지 않아요.</p>
      </footer>
    </main>`;
}

// ---------- Claude Code 연동 안내 ----------

function claudeSetupView(): string {
  const status = state.integration;
  if (!status) return `<main><section class="card">${skeleton}</section></main>`;
  const result = status.lastApply;
  const existing = status.previousCommand
    ? `<p>지금 쓰는 상태 표시줄 명령 <code>${escapeHtml(status.previousCommand)}</code>은(는) 지우지 않아요. 이 앱이 한도를 기록한 뒤 그 명령을 같은 입력으로 이어서 실행하므로 상태 표시줄 모양은 그대로예요.</p>`
    : '<p>지금 설정된 상태 표시줄 명령은 없어요. 연동 후에도 Claude Code 상태 표시줄에는 아무것도 표시되지 않아요.</p>';
  return `
    <main>
      <section class="card">
        <div class="card-head"><h2>상태 표시줄 연동</h2>
          ${status.applied ? chip('연동됨', 'ok') : chip('연동 안 됨')}
        </div>
        <div class="prose">
          <p>Claude Code는 상태 표시줄 명령에 5시간·7일 한도의 사용 비율과 리셋 시각을 넘겨 줘요. 연동하면 그 값을 이 컴퓨터의 파일에 남기고, 사용량 현황에서 읽어요.</p>
          ${existing}
          <p class="sub">바뀌는 파일: <code>${escapeHtml(status.settingsPath)}</code>의 <code>statusLine</code> 항목 하나예요. 적용에 실패하면 적용 전 상태로 되돌려요.</p>
        </div>
        <div class="card-actions">
          <button class="primary" data-action="apply" data-key="apply" ${status.applied || state.applying ? 'disabled' : ''}>
            ${state.applying ? '적용하는 중…' : status.applied ? '연동됨' : '연동 적용'}
          </button>
        </div>
      </section>

      ${
        result
          ? `<div class="notice ${result.ok ? 'ok' : 'error'}" role="${result.ok ? 'status' : 'alert'}"><p>${escapeHtml(result.message)}</p></div>`
          : ''
      }
      ${
        status.hookError
          ? `<div class="notice error" role="alert"><p>${formatDateTime(status.hookError.at)}에 한도 기록을 남기지 못했어요: ${escapeHtml(status.hookError.message)}.</p><p>그 파일의 쓰기 권한을 확인해 주세요. 그동안 사용량 현황에는 마지막으로 남긴 기록이 보여요.</p></div>`
          : ''
      }

      <section class="card">
        <div class="card-head"><h2>읽는 것과 보내지 않는 것</h2></div>
        <ul class="list">
          <li><span class="list-label">읽는 것</span><span>Claude Code가 상태 표시줄 명령에 넘기는 입력, <code>~/.codex/sessions</code>의 Codex 기록, codex-resets.com 공개 API</span></li>
          <li><span class="list-label">쓰지 않는 것</span><span>토큰이나 로그인 정보. 아무것도 앱 밖으로 보내지 않아요.</span></li>
          <li><span class="list-label">최신성</span><span>값은 Claude Code가 실행 중일 때만 갱신돼요. 사용량 현황의 «마지막 갱신»으로 확인하세요.</span></li>
        </ul>
      </section>
    </main>`;
}

// ---------- Codex 전체 리셋 ----------

function errorChip<T>(s: Extract<AreaState<T>, { kind: 'error' }>): string {
  if (s.lastGood) return chip('최신 정보 아님', 'warn');
  return chip(s.retry?.running ? '자동 재시도 중' : '불러오기 실패', 'error');
}

function areaError<T>(
  area: 'status' | 'history',
  s: Extract<AreaState<T>, { kind: 'error' }>,
  label: string,
): string {
  const retry = s.retry
    ? s.retry.running
      ? `자동 재시도 중 (${s.retry.of}번 중 ${s.retry.attempt}번째)`
      : `${formatClock(s.retry.at)}에 자동으로 다시 시도해요 (${s.retry.of}번 중 ${s.retry.attempt}번째)`
    : '자동 재시도 횟수를 다 써서 멈췄어요. 다시 시도를 눌러 주세요.';
  const lead = s.lastGood
    ? `${escapeHtml(s.message)}. 아래는 ${s.lastGoodAt ? formatDateTime(s.lastGoodAt) : '이전'}에 불러온 ${label}이라 최신 정보가 아닐 수 있어요.`
    : `${label}을 불러오지 못했어요: ${escapeHtml(s.message)}.`;
  return `<div class="notice ${s.lastGood ? 'warn' : 'error'}" role="alert">
      <p>${lead}</p>
      <div class="row-actions"><button class="small" data-action="retry-resets" data-area="${area}" data-key="retry-${area}">다시 시도</button><span>${retry}</span></div>
    </div>`;
}

function statusBody(value: ResetStatus): string {
  const latest = value.latest
    ? `${formatDateTime(value.latest.announcedAt)}<span class="type">${typeName(value.latest.type)}</span>`
    : '기록 없음';
  const scheduled = value.scheduled
    ? `${formatDateTime(value.scheduled.announcedAt)} 공지<span class="type">${typeName(value.scheduled.type)}</span>`
    : '<span class="muted">예정된 리셋 없음</span>';
  const average = value.avgIntervalDays === null ? '알 수 없음' : `약 ${value.avgIntervalDays.toFixed(1)}일`;
  const since =
    value.daysSinceLast === null
      ? ''
      : `<p class="sub facts-note">마지막 리셋 후 ${formatDuration(value.daysSinceLast * 86_400_000)} 지났어요 · 지금까지 ${value.total}번</p>`;
  return `<dl class="facts">
      <div><dt>최근 전체 리셋</dt><dd>${latest}</dd></div>
      <div><dt>예정된 전체 리셋</dt><dd>${scheduled}</dd></div>
      <div><dt>리셋 간 평균 간격</dt><dd>${average}</dd></div>
    </dl>${since}`;
}

function historyRow(entry: ResetEntry): string {
  const original = entry.sourceUrl
    ? `<button class="link small-link" data-action="external" data-url="${escapeHtml(entry.sourceUrl)}">원문 공지</button>`
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
         <button class="small" data-action="more" data-key="more" ${value.loadingMore || refreshing ? 'disabled' : ''}>${value.loadingMore ? '불러오는 중…' : '이력 더 보기'}</button>
       </div>`
    : '<p class="sub end-note">이력을 끝까지 불러왔어요.</p>';
  const moreError = value.moreError
    ? `<div class="notice error" role="alert"><p>이력을 더 불러오지 못했어요: ${escapeHtml(value.moreError)}.</p></div>`
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
  let badge = refreshing ? chip('새로 고치는 중') : '';
  let content: string;
  if (!s || s.kind === 'idle' || s.kind === 'loading') {
    badge = chip('불러오는 중');
    content = skeleton;
  } else if (s.kind === 'ok') {
    content = body(s.value);
  } else if (s.kind === 'empty') {
    badge ||= chip('결과 없음');
    content = `<p class="empty">${emptyText}</p>`;
  } else {
    badge = errorChip(s);
    content = areaError(area, s, label) + (s.lastGood ? `<div class="stale">${body(s.lastGood)}</div>` : '');
  }
  return `<section class="card" data-area="${area}" aria-label="${title}">
      <div class="card-head"><h2>${title}</h2>${badge}</div>${content}</section>`;
}

function resetsView(): string {
  const snapshot = state.resets;
  return `
    <main>
      ${areaCard('status', '전체 리셋 현황', '현황', snapshot?.status, statusBody, 'codex-resets.com에 아직 리셋 정보가 없어요.')}
      ${areaCard('history', '전체 리셋 이력', '이력', snapshot?.history, historyBody, '표시할 리셋 이력이 없어요.')}
      <p class="footnote">데이터 출처 <button class="link" data-action="external" data-url="${resetsSite}">codex-resets.com</button> · OpenAI 공지를 모아 보여 주는 비공식 사이트예요.</p>
    </main>`;
}

// ---------- shell ----------

const titles: Record<View, string> = {
  usage: '사용량 현황',
  'claude-setup': 'Claude Code 연동 안내',
  resets: 'Codex 전체 리셋',
};

/** «창 항상 위에 표시»: one setting, the same switch right of every screen's title (FC-F019, PR-P025). */
function pinSwitch(): string {
  const on = state.window.alwaysOnTop;
  return `<label class="switch" title="창 항상 위에 표시">
      <span class="switch-label">항상 위</span>
      <input type="checkbox" role="switch" data-key="pin" aria-label="창 항상 위에 표시" ${on ? 'checked' : ''} />
      <span class="switch-track" aria-hidden="true"><span class="switch-thumb"></span></span>
    </label>`;
}

function render(): void {
  const back =
    state.view === 'usage'
      ? ''
      : `<button class="icon-button back" data-action="go" data-view="usage" data-key="back"
                 aria-label="사용량 현황으로 돌아가기" title="사용량 현황으로 돌아가기">${chevronLeft}</button>`;
  const refreshing =
    state.view === 'usage' && state.refreshing
      ? '<span class="spinner" role="status" aria-label="새로 고치는 중"></span>'
      : '';
  const body =
    state.view === 'usage' ? usageView() : state.view === 'claude-setup' ? claudeSetupView() : resetsView();
  const focused = (document.activeElement as HTMLElement | null)?.dataset?.key;
  const scroll = window.scrollY;
  document.body.classList.toggle('pinned', state.window.alwaysOnTop);
  root.innerHTML = `<header class="topbar">${back}<h1>${titles[state.view]}</h1>${refreshing}${pinSwitch()}</header>${body}`;
  window.scrollTo(0, scroll);
  // innerHTML replaces every element; keep the keyboard where it was.
  if (focused) root.querySelector<HTMLElement>(`[data-key="${focused}"]`)?.focus();
  // The menu bar popover takes the page's height (the main process caps it at the screen).
  requestAnimationFrame(() => monitor.reportHeight(Math.ceil(root.getBoundingClientRect().height)));
}

async function refreshUsage(): Promise<void> {
  state.refreshing = true;
  render();
  try {
    state.usage = await monitor.refreshUsage();
  } finally {
    state.refreshing = false;
    render();
  }
}

async function go(view: View): Promise<void> {
  const changed = view !== state.view;
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
}

root.addEventListener('click', (event) => {
  const target = (event.target as HTMLElement).closest<HTMLElement>('[data-action]');
  if (!target) return;
  const { action } = target.dataset;
  if (action === 'go') void go(target.dataset.view as View);
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
  if (input.dataset.key !== 'pin') return;
  void monitor.setAlwaysOnTop(input.checked).then((settings) => {
    state.window = settings;
    render();
  });
});

monitor.onUsage((snapshot) => {
  state.usage = snapshot;
  if (state.view === 'usage') render();
});
monitor.onResets((snapshot) => {
  state.resets = snapshot;
  if (state.view !== 'claude-setup') render();
});
monitor.onNavigate((view) => void go(view));

let refreshTimer: number | null = null;
function syncRefreshTimer(): void {
  if (document.visibilityState === 'visible' && refreshTimer === null)
    refreshTimer = window.setInterval(() => {
      if (state.view === 'usage') void refreshUsage();
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
