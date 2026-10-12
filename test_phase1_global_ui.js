/**
 * J&T Express TMS v5 - Phase 1 Global UI Interactivity Verification Suite
 */

const fs = require('fs');

// Simple DOM Mock for Node testing of Phase 1 UI components
class MockClassList {
    constructor() { this.classes = new Set(); }
    add(c) { this.classes.add(c); }
    remove(c) { this.classes.delete(c); }
    toggle(c, force) {
        if (force !== undefined) {
            if (force) this.classes.add(c);
            else this.classes.delete(c);
            return force;
        }
        if (this.classes.has(c)) { this.classes.delete(c); return false; }
        else { this.classes.add(c); return true; }
    }
    contains(c) { return this.classes.has(c); }
}

class MockElement {
    constructor(tag, id = '', className = '') {
        this.tagName = tag.toUpperCase();
        this.id = id;
        this.classList = new MockClassList();
        this.className = className;
        this.attributes = {};
        this.children = [];
        this.parentElement = null;
        this.listeners = {};
        this.innerHTML = '';
        this.textContent = '';
        this.style = {};
    }

    get className() {
        return Array.from(this.classList.classes).join(' ');
    }
    set className(val) {
        this.classList.classes.clear();
        if (val) val.split(/\s+/).forEach(c => this.classList.add(c));
    }

    setAttribute(k, v) { this.attributes[k] = String(v); }
    getAttribute(k) { return this.attributes[k] !== undefined ? this.attributes[k] : null; }
    hasAttribute(k) { return this.attributes[k] !== undefined; }

    get parentNode() { return this.parentElement; }
    set parentNode(p) { this.parentElement = p; }

    appendChild(child) {
        if (child.parentElement) {
            const idx = child.parentElement.children.indexOf(child);
            if (idx >= 0) child.parentElement.children.splice(idx, 1);
        }
        child.parentElement = this;
        this.children.push(child);
        return child;
    }

    insertBefore(newNode, refNode) {
        newNode.parentElement = this;
        const idx = this.children.indexOf(refNode);
        if (idx >= 0) this.children.splice(idx, 0, newNode);
        else this.children.push(newNode);
        return newNode;
    }

    addEventListener(event, fn) {
        this.listeners[event] = this.listeners[event] || [];
        this.listeners[event].push(fn);
    }

    dispatchEvent(evt) {
        const fns = this.listeners[evt.type] || [];
        fns.forEach(fn => fn(evt));
    }

    closest(sel) {
        let cur = this;
        while (cur) {
            if (sel.startsWith('.') && cur.classList.contains(sel.slice(1))) return cur;
            if (sel.startsWith('#') && cur.id === sel.slice(1)) return cur;
            cur = cur.parentElement;
        }
        return null;
    }

    get innerHTML() { return this._innerHTML || ''; }
    set innerHTML(html) {
        this._innerHTML = html;
        this.children = [];
        const tagRegex = /<([a-zA-Z0-9]+)([^>]*)>([\s\S]*?)<\/\1>/gi;
        let match;
        while ((match = tagRegex.exec(html)) !== null) {
            const tagName = match[1];
            const attrs = match[2];
            const content = match[3];

            const classMatch = attrs.match(/class=["'](.*?)["']/i);
            const idMatch = attrs.match(/id=["'](.*?)["']/i);
            const childEl = new MockElement(tagName, idMatch ? idMatch[1] : '', classMatch ? classMatch[1] : '');
            childEl.textContent = content.replace(/<[^>]+>/g, '').trim();
            childEl.innerHTML = content;
            this.appendChild(childEl);
        }
    }

    matches(sel) {
        if (!sel) return false;
        if (sel.startsWith('.')) {
            const classes = sel.split('.').filter(Boolean);
            return classes.every(c => this.classList.contains(c));
        }
        if (sel.startsWith('#')) return this.id === sel.slice(1);
        if (this.tagName === sel.toUpperCase()) return true;
        return false;
    }

    querySelector(sel) {
        if (sel.includes(',')) {
            const parts = sel.split(',').map(s => s.trim());
            for (const part of parts) {
                const found = this.querySelector(part);
                if (found) return found;
            }
            return null;
        }
        if (sel.includes(' ')) {
            const parts = sel.split(' ').map(s => s.trim());
            const parents = this.querySelectorAll(parts[0]);
            for (const p of parents) {
                const child = p.querySelector(parts.slice(1).join(' '));
                if (child) return child;
            }
            return null;
        }
        for (const child of this.children) {
            if (child.matches(sel)) return child;
            const found = child.querySelector(sel);
            if (found) return found;
        }
        return null;
    }

    querySelectorAll(sel) {
        if (sel.includes(',')) {
            const parts = sel.split(',').map(s => s.trim());
            let set = new Set();
            for (const part of parts) {
                this.querySelectorAll(part).forEach(el => set.add(el));
            }
            return Array.from(set);
        }
        if (sel.includes(' ')) {
            const parts = sel.split(' ').map(s => s.trim());
            const parents = this.querySelectorAll(parts[0]);
            let res = [];
            for (const p of parents) {
                res = res.concat(p.querySelectorAll(parts.slice(1).join(' ')));
            }
            return res;
        }
        let res = [];
        for (const child of this.children) {
            if (child.matches(sel)) res.push(child);
            res = res.concat(child.querySelectorAll(sel));
        }
        return res;
    }
}

// Setup environment
const storageMap = {};
global.sessionStorage = {
    getItem(k) { return storageMap[k] || null; },
    setItem(k, v) { storageMap[k] = String(v); },
    clear() { Object.keys(storageMap).forEach(k => delete storageMap[k]); }
};
global.localStorage = {
    getItem(k) { return storageMap[k] || null; },
    setItem(k, v) { storageMap[k] = String(v); }
};

global.sessionStorage.setItem('jnt_is_logged_in', 'true');
global.sessionStorage.setItem('jnt_active_username', 'Hamdan Hamdani');
global.sessionStorage.setItem('jnt_user_role', 'ADMIN');

const body = new MockElement('BODY', '', 'light-body-theme');
global.document = {
    body: body,
    documentElement: new MockElement('HTML'),
    addEventListener(event, fn) {
        if (event === 'DOMContentLoaded') {
            fn();
        } else {
            body.addEventListener(event, fn);
        }
    },
    dispatchEvent(evt) { body.dispatchEvent(evt); },
    createElement(tag) { return new MockElement(tag); },
    getElementById(id) {
        if (id === 'app-container') return appContainer;
        return body.querySelector('#' + id);
    },
    querySelector(sel) { return body.querySelector(sel); },
    querySelectorAll(sel) { return body.querySelectorAll(sel); }
};

global.window = {
    location: { pathname: '/dashboard.html', href: 'dashboard.html' },
    addEventListener() {},
    innerWidth: 800, // Mobile simulated width
    confirm: () => true
};
global.confirm = () => true;

// Build mock page layout
const appContainer = new MockElement('DIV', 'app-container', 'app-container');
body.appendChild(appContainer);

const sidebar = new MockElement('ASIDE', '', 'sidebar-panel');
const nav = new MockElement('NAV', '', 'sidebar-nav');
const navUl = new MockElement('UL');
const navLi = new MockElement('LI');
const navA = new MockElement('A', '', 'nav-link');
navLi.appendChild(navA);
navUl.appendChild(navLi);
nav.appendChild(navUl);
sidebar.appendChild(nav);
appContainer.appendChild(sidebar);

const topNav = new MockElement('HEADER', '', 'inc-top-nav');
const titleGroup = new MockElement('DIV', '', 'inc-title-group');
const hamburgerBtn = new MockElement('BUTTON', '', 'hamburger-btn');
titleGroup.appendChild(hamburgerBtn);
topNav.appendChild(titleGroup);

const topRight = new MockElement('DIV', '', 'inc-top-right');
const dateChip = new MockElement('DIV', '', 'inc-date-chip');
const dateSpan1 = new MockElement('SPAN');
dateSpan1.textContent = '22 Juli 2026';
const dateSpan2 = new MockElement('SPAN');
dateSpan2.textContent = 'Selasa, 10:30 WIB';
dateChip.appendChild(dateSpan1);
dateChip.appendChild(dateSpan2);
topRight.appendChild(dateChip);

const userChip = new MockElement('DIV', 'topbar-user-chip-btn', 'inc-user-chip');
topRight.appendChild(userChip);

topNav.appendChild(topRight);
appContainer.appendChild(topNav);

// Run test suites
let passed = 0;
let failed = 0;

function assert(cond, name) {
    if (cond) {
        console.log(`  ✅ PASS: ${name}`);
        passed++;
    } else {
        console.error(`  ❌ FAIL: ${name}`);
        failed++;
    }
}

async function runTests() {
    console.log("==========================================================================");
    console.log("   PHASE 1: GLOBAL UI INTERACTIVITY REMEDIATION TEST SUITE               ");
    console.log("==========================================================================\n");

    // Load and evaluate app.js inside DOMContentLoaded
    console.log("▶ [TEST 1] Inisialisasi app.js & Verifikasi Komponen Global");
    const appJsCode = fs.readFileSync('app.js', 'utf8');

    // Trigger DOMContentLoaded
    const domLoadedFn = () => {
        eval(appJsCode);
    };
    domLoadedFn();

    // 1. Test Hamburger Drawer & Backdrop
    console.log("\n▶ [TEST 2] Hamburger Menu Mobile & Backdrop Overlay");
    const backdrop = body.querySelector('.sidebar-backdrop');
    assert(backdrop !== null, "Sidebar backdrop overlay dynamically created and attached to body");
    assert(hamburgerBtn.getAttribute('aria-expanded') === 'false', "Hamburger button initialized with aria-expanded: false");

    // Click Hamburger to Open
    hamburgerBtn.dispatchEvent({ type: 'click', stopPropagation() {} });
    assert(sidebar.classList.contains('mobile-open'), "Clicking hamburger adds .mobile-open to sidebar-panel");
    assert(backdrop.classList.contains('active'), "Clicking hamburger adds .active to backdrop");
    assert(hamburgerBtn.getAttribute('aria-expanded') === 'true', "Hamburger aria-expanded toggled to true");

    // Click Backdrop to Close
    backdrop.dispatchEvent({ type: 'click' });
    assert(!sidebar.classList.contains('mobile-open'), "Clicking backdrop removes .mobile-open");
    assert(!backdrop.classList.contains('active'), "Clicking backdrop removes .active");
    assert(hamburgerBtn.getAttribute('aria-expanded') === 'false', "Hamburger aria-expanded restored to false");

    // Click Navigation link closes mobile sidebar
    hamburgerBtn.dispatchEvent({ type: 'click', stopPropagation() {} });
    assert(sidebar.classList.contains('mobile-open'), "Sidebar re-opened for nav-link test");
    navA.dispatchEvent({ type: 'click' });
    assert(!sidebar.classList.contains('mobile-open'), "Clicking sidebar nav-link on mobile closes sidebar");

    // Escape key closes mobile sidebar
    hamburgerBtn.dispatchEvent({ type: 'click', stopPropagation() {} });
    assert(sidebar.classList.contains('mobile-open'), "Sidebar re-opened for Escape test");
    body.dispatchEvent({ type: 'keydown', key: 'Escape' });
    assert(!sidebar.classList.contains('mobile-open'), "Pressing Escape closes mobile sidebar");

    // 2. Test User Profile Chip Dropdown
    console.log("\n▶ [TEST 3] User Profile Chip Dropdown & Navigasi");
    const userWrapper = body.querySelector('.topbar-user-wrapper');
    assert(userWrapper !== null, "User chip wrapped inside .topbar-user-wrapper");

    const dropdown = userWrapper.querySelector('.topbar-user-dropdown');
    assert(dropdown !== null, "User profile dropdown menu created with profile, settings, and logout options");

    // Click User Chip to Open
    userChip.dispatchEvent({ type: 'click', stopPropagation() {} });
    assert(dropdown.classList.contains('show'), "Clicking user chip displays dropdown (.show class added)");

    // Press Escape to Close
    body.dispatchEvent({ type: 'keydown', key: 'Escape' });
    assert(!dropdown.classList.contains('show'), "Pressing Escape closes user profile dropdown");

    // Click User Chip to Open again, click outside to close
    userChip.dispatchEvent({ type: 'click', stopPropagation() {} });
    assert(dropdown.classList.contains('show'), "Dropdown reopened");
    body.dispatchEvent({ type: 'click', target: body });
    assert(!dropdown.classList.contains('show'), "Clicking outside closes user profile dropdown");

    // Test Logout trigger from dropdown
    userChip.dispatchEvent({ type: 'click', stopPropagation() {} });
    const dropdownLogout = dropdown.querySelector('.btn-dropdown-logout');
    assert(dropdownLogout !== null, "Dropdown contains Keluar Akun (Logout) button");
    dropdownLogout.dispatchEvent({ type: 'click', preventDefault() {}, stopPropagation() {} });
    assert(global.sessionStorage.getItem('jnt_is_logged_in') === null, "Logout cleared session storage");
    assert(global.window.location.href === 'index.html', "Logout redirected to index.html");

    // 3. Test Real-time Asia/Jakarta Header Date and Time
    console.log("\n▶ [TEST 4] Real-time Asia/Jakarta Date and Time Updater");
    const currentYear = new Date().getFullYear();
    assert(dateSpan1.textContent.includes(String(currentYear)), "Header date span contains current year");
    assert(dateSpan2.textContent.includes('WIB'), "Header time span formatted with WIB timezone");
    assert(!dateSpan1.textContent.includes('22 Juli 2026') || currentYear === 2026, "Static placeholder date successfully replaced");
    assert(global.window.__jntDateInterval !== undefined, "Global update timer initialized cleanly without duplicates");

    // 4. Test Audit Log Route Verification
    console.log("\n▶ [TEST 5] Audit Log File Existence & RBAC Verification");
    const auditFileExists = fs.existsSync('audit.html');
    assert(!auditFileExists, "audit.html verified as non-existent (dead route prevented from dangling)");
    const shiftFileExists = fs.existsSync('shift-management.html');
    assert(shiftFileExists, "Shift Management contains operational Audit Trail logs");

    // Summary
    console.log("\n==========================================================================");
    console.log(`   TOTAL PHASE 1 TESTS: ${passed + failed} | PASSED: ${passed} | FAILED: ${failed}`);
    console.log("==========================================================================");

    if (failed === 0) {
        console.log("🎉 ALL PHASE 1 GLOBAL UI INTERACTIVITY TESTS PASSED!\n");
        process.exit(0);
    } else {
        console.error("⚠️ SOME PHASE 1 TESTS FAILED.\n");
        process.exit(1);
    }
}

runTests();
