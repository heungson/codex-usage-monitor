// The limit alert threshold (LHS-9: 80%), shared by the alerts and the screen so a window that is
// alerted is also the one drawn in the warning colour (owner, 2026-10-30).

export const limitAlertPercent = 80;

/** At or above the alert threshold, comparing the raw percentage as the alerts do. */
export const nearLimit = (usedPercent: number): boolean => usedPercent >= limitAlertPercent;
