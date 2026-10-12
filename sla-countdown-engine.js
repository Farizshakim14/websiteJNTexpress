/**
 * J&T Express - Transportation Monitoring System
 * Single Source of Truth: LIVE SLA COUNTDOWN ENGINE
 */

const SLA_THRESHOLDS = {
    ON_TRACK_RATIO: 0.25,   // remaining > 25% of total SLA -> ON TRACK (🟢)
    NEAR_LATE_RATIO: 0.25,  // remaining <= 25% of total SLA -> NEAR LATE (🟡)
    CRITICAL_RATIO: 0.10,   // remaining <= 10% of total SLA -> CRITICAL (🟠)
    LATE_RATIO: 0           // remaining <= 0 -> LATE (🔴 OVERDUE)
};

const SLACountdownEngine = {
    thresholds: SLA_THRESHOLDS,
    timerId: null,
    registeredNodes: new Map(),

    /**
     * Parses custom date string or timestamp into JavaScript Date object (UTC+7 / Asia/Jakarta standard).
     * Supports formats:
     * - "DD/MM/YYYY HH:mm" (e.g., "22/07/2026 08:00")
     * - "DD/MM HH:mm" (e.g., "02/07 05:15")
     * - "YYYY-MM-DDTHH:mm" / "YYYY-MM-DD HH:mm"
     * - Timestamp numbers or Date instances
     */
    parseTimestamp(str) {
        if (!str) return null;
        if (str instanceof Date) return isNaN(str.getTime()) ? null : str;
        if (typeof str === 'number') return new Date(str);

        const s = String(str).trim();
        if (!s) return null;

        // Try standard ISO / Date.parse first if format looks like YYYY-MM-DD
        if (s.match(/^\d{4}-\d{2}-\d{2}/)) {
            const d = new Date(s);
            if (!isNaN(d.getTime())) return d;
        }

        // Handle "DD/MM/YYYY HH:mm" or "DD/MM HH:mm"
        const parts = s.split(' ');
        if (parts.length >= 1 && parts[0].includes('/')) {
            const dateParts = parts[0].split('/');
            const timeParts = parts.length > 1 && parts[1].includes(':') ? parts[1].split(':') : [0, 0];

            let day = parseInt(dateParts[0], 10);
            let month = parseInt(dateParts[1], 10) - 1;
            let year = dateParts[2] ? parseInt(dateParts[2], 10) : new Date().getFullYear();
            let hours = parseInt(timeParts[0], 10);
            let minutes = parseInt(timeParts[1], 10);
            let seconds = timeParts[2] ? parseInt(timeParts[2], 10) : 0;

            if (isNaN(day) || isNaN(month)) return null;
            if (isNaN(hours)) hours = 0;
            if (isNaN(minutes)) minutes = 0;
            if (isNaN(seconds)) seconds = 0;

            const parsed = new Date(year, month, day, hours, minutes, seconds);
            return isNaN(parsed.getTime()) ? null : parsed;
        }

        const d = new Date(s);
        return isNaN(d.getTime()) ? null : d;
    },

    /**
     * Calculates target arrival Date object from departure date + SLA hours.
     */
    calculateTargetTimestamp(departureTimeStr, slaHours) {
        const departureDate = this.parseTimestamp(departureTimeStr);
        if (!departureDate) return null;

        const hours = parseFloat(slaHours);
        if (isNaN(hours) || hours <= 0) return null;

        const targetMs = departureDate.getTime() + (hours * 3600 * 1000);
        return new Date(targetMs);
    },

    /**
     * Calculates SLA status and countdown values for a given trip.
     * Absolute timestamp calculation using Date.now() for 0 drift.
     */
    calculateSLAState(departureTimeStr, slaHours, actualArrivalStr = null) {
        const departureDate = this.parseTimestamp(departureTimeStr);
        const hours = parseFloat(slaHours);

        if (!departureDate || isNaN(hours) || hours <= 0) {
            return {
                status: 'DATA_ERROR',
                statusCode: 'DATA_ERROR',
                badgeText: 'DATA ERROR',
                badgeClass: 'gray',
                badgeSymbol: '⚪',
                remainingMs: 0,
                remainingFormatted: 'N/A',
                isOverdue: false,
                isCompleted: false,
                targetDate: null,
                departureDate: departureDate
            };
        }

        const totalSlaMs = hours * 3600 * 1000;
        const targetDate = new Date(departureDate.getTime() + totalSlaMs);
        const actualArrivalDate = this.parseTimestamp(actualArrivalStr);

        // If completed (actual arrival available)
        if (actualArrivalDate) {
            const delayMs = actualArrivalDate.getTime() - targetDate.getTime();
            const isLate = delayMs > 0;

            return {
                status: 'COMPLETED',
                statusCode: isLate ? 'COMPLETED_LATE' : 'COMPLETED_ON_TIME',
                badgeText: isLate ? 'LATE' : 'ON TIME',
                badgeClass: isLate ? 'red' : 'green',
                badgeSymbol: isLate ? '🔴' : '🟢',
                remainingMs: 0,
                remainingFormatted: 'COMPLETED',
                actualArrivalFormatted: this.formatTimeOnly(actualArrivalDate),
                targetFormatted: this.formatTimeOnly(targetDate),
                delayFormatted: delayMs > 0 ? this.formatMsDuration(delayMs) : '00:00:00',
                isOverdue: isLate,
                isCompleted: true,
                targetDate,
                departureDate
            };
        }

        // Live Active Countdown calculation using Date.now()
        const nowMs = Date.now();
        const remainingMs = targetDate.getTime() - nowMs;
        const remainingRatio = remainingMs / totalSlaMs;

        let statusCode = 'ON_TRACK';
        let badgeText = 'ON TRACK';
        let badgeClass = 'green';
        let badgeSymbol = '🟢';
        let isOverdue = false;

        if (remainingMs <= 0) {
            statusCode = 'LATE';
            badgeText = 'LATE';
            badgeClass = 'red';
            badgeSymbol = '🔴';
            isOverdue = true;
        } else if (remainingRatio <= SLA_THRESHOLDS.CRITICAL_RATIO) {
            statusCode = 'CRITICAL';
            badgeText = 'CRITICAL';
            badgeClass = 'orange';
            badgeSymbol = '🟠';
        } else if (remainingRatio <= SLA_THRESHOLDS.NEAR_LATE_RATIO) {
            statusCode = 'NEAR_LATE';
            badgeText = 'NEAR LATE';
            badgeClass = 'yellow';
            badgeSymbol = '🟡';
        }

        const remainingFormatted = isOverdue 
            ? `OVERDUE ${this.formatMsDuration(Math.abs(remainingMs))}`
            : this.formatMsDuration(remainingMs);

        return {
            status: statusCode,
            statusCode,
            badgeText,
            badgeClass,
            badgeSymbol,
            remainingMs,
            remainingRatio,
            remainingFormatted,
            isOverdue,
            isCompleted: false,
            targetDate,
            departureDate
        };
    },

    /**
     * Formats milliseconds duration into HH:MM:SS format.
     */
    formatMsDuration(ms) {
        if (isNaN(ms) || ms < 0) ms = 0;
        const totalSec = Math.floor(ms / 1000);
        const hours = Math.floor(totalSec / 3600);
        const minutes = Math.floor((totalSec % 3600) / 60);
        const seconds = totalSec % 60;

        const pad = (num) => String(num).padStart(2, '0');
        return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
    },

    formatTimeOnly(date) {
        if (!date) return '-';
        const pad = (num) => String(num).padStart(2, '0');
        const dd = pad(date.getDate());
        const mm = pad(date.getMonth() + 1);
        return `${dd}/${mm} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
    },

    /**
     * Single Centralized Global Timer Controller
     */
    startGlobalTimer() {
        if (this.timerId) return; // Already running
        console.log('[SLA COUNTDOWN ENGINE] Starting Centralized Global 1000ms Clock Timer...');
        this.timerId = setInterval(() => {
            this.tick();
        }, 1000);
    },

    stopGlobalTimer() {
        if (this.timerId) {
            console.log('[SLA COUNTDOWN ENGINE] Stopping Centralized Global Clock Timer...');
            clearInterval(this.timerId);
            this.timerId = null;
        }
    },

    /**
     * Executed every 1000ms tick. Iterates through all registered UI nodes or dynamic SLA elements.
     */
    tick() {
        // 1. Registered DOM Elements
        if (this.registeredNodes.size > 0) {
            this.registeredNodes.forEach((config, elementId) => {
                const el = document.getElementById(elementId);
                if (!el || !document.body.contains(el)) {
                    // Clean up unmounted elements
                    this.registeredNodes.delete(elementId);
                    return;
                }

                const state = this.calculateSLAState(config.departure, config.slaHours, config.actualArrival);
                this.updateElementUI(el, state, config);
            });
        }

        // 2. Dynamic Declarative Elements with data-sla-departure
        const declarativeEls = document.querySelectorAll('[data-sla-departure]');
        declarativeEls.forEach(el => {
            const departure = el.getAttribute('data-sla-departure');
            const slaHours = el.getAttribute('data-sla-hours');
            const actualArrival = el.getAttribute('data-sla-arrival');

            const state = this.calculateSLAState(departure, slaHours, actualArrival);
            this.updateDeclarativeElementUI(el, state);
        });
    },

    /**
     * Registers a DOM element ID for live SLA countdown updates.
     */
    registerElement(elementOrId, config) {
        const id = typeof elementOrId === 'string' ? elementOrId : elementOrId.id;
        if (!id) return;

        this.registeredNodes.set(id, config);
        
        // Immediate first render
        const el = typeof elementOrId === 'string' ? document.getElementById(elementOrId) : elementOrId;
        if (el) {
            const state = this.calculateSLAState(config.departure, config.slaHours, config.actualArrival);
            this.updateElementUI(el, state, config);
        }

        this.startGlobalTimer();
    },

    unregisterElement(elementOrId) {
        const id = typeof elementOrId === 'string' ? elementOrId : elementOrId.id;
        if (id) this.registeredNodes.delete(id);
    },

    clearRegisteredElements() {
        this.registeredNodes.clear();
    },

    /**
     * Updates programmatic registered element UI.
     */
    updateElementUI(el, state, config = {}) {
        if (!el) return;

        const remainingEl = config.remainingSelector ? el.querySelector(config.remainingSelector) : el;
        const statusEl = config.statusSelector ? el.querySelector(config.statusSelector) : null;

        if (remainingEl) {
            if (state.status === 'DATA_ERROR') {
                remainingEl.textContent = 'N/A';
                remainingEl.className = 'sla-remaining-cell text-dim';
            } else if (state.isCompleted) {
                remainingEl.textContent = 'COMPLETED';
                remainingEl.className = 'sla-remaining-cell completed';
            } else if (state.isOverdue) {
                remainingEl.textContent = state.remainingFormatted;
                remainingEl.className = 'sla-remaining-cell overdue font-bold';
            } else {
                remainingEl.textContent = state.remainingFormatted;
                remainingEl.className = `sla-remaining-cell ${state.badgeClass} font-bold`;
            }
        }

        if (statusEl) {
            statusEl.className = `badge-status sla-badge-${state.badgeClass}`;
            statusEl.innerHTML = `<span class="dot">●</span> ${state.badgeSymbol} ${state.badgeText}`;
        }
    },

    /**
     * Updates declarative element UI ([data-sla-departure]).
     */
    updateDeclarativeElementUI(el, state) {
        if (!el) return;

        const remainingContainer = el.querySelector('.sla-live-countdown') || el;
        const statusContainer = el.querySelector('.sla-live-status');

        if (remainingContainer) {
            if (remainingContainer.textContent !== state.remainingFormatted) {
                remainingContainer.textContent = state.remainingFormatted;
            }
            remainingContainer.className = `sla-live-countdown sla-rem-${state.badgeClass}`;
        }

        if (statusContainer) {
            const html = `<span class="sla-status-pill ${state.badgeClass}"><span class="dot">●</span> ${state.badgeSymbol} ${state.badgeText}</span>`;
            if (statusContainer.innerHTML !== html) {
                statusContainer.innerHTML = html;
            }
        }
    }
};

// Auto-start timer on load & export for CJS environments
if (typeof window !== 'undefined') {
    window.SLACountdownEngine = SLACountdownEngine;
    window.SLA_THRESHOLDS = SLA_THRESHOLDS;
    document.addEventListener('DOMContentLoaded', () => {
        SLACountdownEngine.startGlobalTimer();
    });
}
if (typeof module !== 'undefined' && module.exports) {
    module.exports = SLACountdownEngine;
}
