# J&T Express TMS v5 — Phase 1: Global UI Interactivity Remediation Report

**Tanggal Audit & Perbaikan**: 12 Oktober 2026  
**Peran**: Senior Frontend Engineer & QA Engineer  
**Fase Pekerjaan**: **Fase 1 — Global UI Interactivity Remediation (Header, Sidebar, User Dropdown, Clock & Navigation)**  
**Status Eksekusi Pengujian Fase 1**: ✅ **100% PASS (27/27 Test Cases Lulus Uji Aktual)**  
**Status Regresi Fungsional**: ✅ **0 Regression (22/22 Core Integration Tests Tetap Lulus)**  

---

## 1. File yang Diperiksa dan Diubah

### A. File yang Diperiksa (Audited Files)
1. **[app.js](file:///c:/Users/FARIZS/websiteJNTexpress/app.js)**: Controller utama aplikasi dan event bus UI.
2. **[styles.css](file:///c:/Users/FARIZS/websiteJNTexpress/styles.css)**: Lembar gaya global, layout desktop/mobile, dan token tema.
3. **Seluruh File Tampilan (10 Halaman)**:
   - [dashboard.html](file:///c:/Users/FARIZS/websiteJNTexpress/dashboard.html)
   - [monitoring.html](file:///c:/Users/FARIZS/websiteJNTexpress/monitoring.html)
   - [sla-vendor.html](file:///c:/Users/FARIZS/websiteJNTexpress/sla-vendor.html)
   - [trouble.html](file:///c:/Users/FARIZS/websiteJNTexpress/trouble.html)
   - [shift-management.html](file:///c:/Users/FARIZS/websiteJNTexpress/shift-management.html)
   - [master.html](file:///c:/Users/FARIZS/websiteJNTexpress/master.html)
   - [report.html](file:///c:/Users/FARIZS/websiteJNTexpress/report.html)
   - [users.html](file:///c:/Users/FARIZS/websiteJNTexpress/users.html)
   - [settings.html](file:///c:/Users/FARIZS/websiteJNTexpress/settings.html)
   - [profile.html](file:///c:/Users/FARIZS/websiteJNTexpress/profile.html)

### B. File yang Diubah (Modified Files)
1. **[styles.css](file:///c:/Users/FARIZS/websiteJNTexpress/styles.css)**:
   - Penambahan styling drawer mobile `.sidebar-panel.mobile-open` dengan transisi halus (`cubic-bezier(0.4, 0, 0.2, 1)`).
   - Penambahan styling overlay `.sidebar-backdrop` dengan backdrop blur.
   - Penambahan styling `.topbar-user-wrapper`, `.topbar-user-dropdown`, `.dropdown-user-header`, `.dropdown-nav-item`, dan `.dropdown-nav-item.logout-item` (kompatibel penuh dengan `light-body-theme` dan `dark-body-theme`).
   - Isolasi aturan desktop (`@media (min-width: 993px)`) agar tata letak desktop tetap stabil dan tidak terpengaruh.
2. **[app.js](file:///c:/Users/FARIZS/websiteJNTexpress/app.js)**:
   - Implementasi modul drawer hamburger mobile dengan aksesibilitas ARIA (`aria-expanded`, `aria-label`).
   - Implementasi auto-close drawer saat backdrop diklik, link navigasi dipilih, atau tombol `Escape` ditekan.
   - Implementasi dropdown user profile chip yang membungkus `.inc-user-chip` dan `#topbar-user-chip-btn` secara non-destruktif.
   - Navigasi valid ke `profile.html`, `settings.html`, dan logout otentik via `performLogout()`.
   - Implementasi mesin tanggal dan jam real-time `updateGlobalHeaderDateTime()` berbasis zona waktu `Asia/Jakarta` dengan proteksi timer tunggal (`window.__jntDateInterval`).

---

## 2. Masalah yang Ditemukan & Akar Penyebabnya

| Komponen Global | Masalah Faktual Sebelum Perbaikan | Akar Penyebab (Root Cause) |
| :--- | :--- | :--- |
| **Hamburger Menu Mobile** (`.hamburger-btn`) | Tombol hamburger terdapat di header seluruh halaman (10 file HTML) tetapi tidak merespons klik pada layar ponsel/tablet. | Tidak ada event listener di `app.js` dan tidak ada definisi CSS drawer mobile untuk `.sidebar-panel` pada breakpoint `< 992px`. |
| **Overlay Mobile Backdrop** | Tidak ada backdrop saat menu dibuka; layar di belakang sidebar tetap aktif. | Elemen `.sidebar-backdrop` belum didefinisikan di HTML maupun CSS. |
| **User Profile Chip** (`.inc-user-chip`) | Avatar dan nama operator di header kanan atas tidak memiliki dropdown menu. | Elemen hanya berupa markup `<div>` pembungkus tanpa popup menu yang terhubung. |
| **Aksi Logout di Dropdown** | Tidak ada akses logout cepat dari avatar. | Tombol logout hanya tersedia di beberapa halaman tertentu atau tertanam statis. |
| **Tanggal & Jam Header** (`.inc-date-chip`) | Menampilkan tanggal statis `"22 Juli 2026"` atau `"Selasa, 10:30 WIB"` di seluruh halaman. | Markup HTML menggunakan teks tanggal hardcoded dan tidak memiliki script pembaruan jam real-time. |
| **Navigasi `audit.html`** | Terdaftar pada matriks izin `SUPERVISOR` di `app.js` baris 175, namun file tidak ada di proyek. | Rute `audit.html` dideklarasikan sebelum modulnya dibuat. Halaman audit sesungguhnya tertanam di `shift-management.html#section-audit-trail`. |

---

## 3. Rincian Perubahan Implementasi

### A. Mobile Hamburger Drawer & Backdrop Overlay
```javascript
// Cuplikan app.js (Inisialisasi Drawer Mobile)
const sidebarPanel = document.querySelector('.sidebar-panel');
let sidebarBackdrop = document.querySelector('.sidebar-backdrop');
if (!sidebarBackdrop) {
    sidebarBackdrop = document.createElement('div');
    sidebarBackdrop.className = 'sidebar-backdrop';
    document.body.appendChild(sidebarBackdrop);
}

const hamburgerBtns = document.querySelectorAll('.hamburger-btn');
hamburgerBtns.forEach(btn => {
    btn.setAttribute('aria-label', 'Buka / Tutup Menu Navigasi');
    btn.setAttribute('aria-expanded', 'false');
    btn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (!sidebarPanel) return;
        const isOpen = sidebarPanel.classList.toggle('mobile-open');
        sidebarBackdrop.classList.toggle('active', isOpen);
        btn.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    });
});
```
- Menutup otomatis saat backdrop diklik.
- Menutup otomatis saat tombol `Escape` ditekan.
- Menutup otomatis saat link navigasi di dalam sidebar diklik pada mode mobile (`window.innerWidth <= 992`).

### B. User Profile Chip Dropdown Menu
```javascript
// Cuplikan app.js (Inisialisasi Dropdown Profil)
const userChipEls = document.querySelectorAll('.inc-user-chip, #topbar-user-chip-btn');
userChipEls.forEach(chip => {
    if (chip.parentElement && !chip.parentElement.classList.contains('topbar-user-wrapper')) {
        const wrapper = document.createElement('div');
        wrapper.className = 'topbar-user-wrapper';
        chip.parentNode.insertBefore(wrapper, chip);
        wrapper.appendChild(chip);

        const dropdown = document.createElement('div');
        dropdown.className = 'topbar-user-dropdown';
        dropdown.innerHTML = `
            <div class="dropdown-user-header">
                <strong>${activeUsername}</strong>
                <span>Peran: ${activeRole}</span>
            </div>
            <a href="profile.html" class="dropdown-nav-item"><span>👤</span> Profil Saya</a>
            <a href="settings.html" class="dropdown-nav-item"><span>⚙️</span> Pengaturan Sistem</a>
            <button type="button" class="dropdown-nav-item logout-item btn-dropdown-logout">
                <span>🚪</span> Keluar Akun
            </button>
        `;
        wrapper.appendChild(dropdown);
        ...
```
- Menampilkan nama aktif dan peran pengguna saat ini.
- Link langsung ke `profile.html` dan `settings.html`.
- Tombol logout terintegrasi dengan pembersihan sesi `sessionStorage.clear()` dan pengalihan ke `index.html`.
- Menutup dropdown otomatis jika pengguna mengklik area luar atau menekan tombol `Escape`.

### C. Real-Time Header Date & Clock (`Asia/Jakarta`)
```javascript
// Cuplikan app.js (Mesin Jam & Tanggal Terpusat)
function updateGlobalHeaderDateTime() {
    const now = new Date();
    const dateStr = now.toLocaleDateString('id-ID', {
        timeZone: 'Asia/Jakarta',
        day: 'numeric',
        month: 'long',
        year: 'numeric'
    });
    const dayStr = now.toLocaleDateString('id-ID', {
        timeZone: 'Asia/Jakarta',
        weekday: 'long'
    });
    const timeStr = now.toLocaleTimeString('id-ID', {
        timeZone: 'Asia/Jakarta',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
        hour12: false
    }).replace(/\./g, ':');

    const dateChips = document.querySelectorAll('.inc-date-chip');
    dateChips.forEach(chip => {
        const spans = chip.querySelectorAll('span');
        if (chip.id === 'sh-top-date-chip') {
            const dateEl = chip.querySelector('span:first-child');
            const clockEl = document.getElementById('sh-top-clock-text');
            if (dateEl) dateEl.textContent = `📅 ${dateStr}`;
            if (clockEl) clockEl.textContent = `${timeStr} WIB`;
        } else if (spans.length >= 2) {
            spans[0].textContent = `${dateStr}`;
            spans[1].textContent = `${dayStr}, ${timeStr} WIB`;
        } else if (spans.length === 1) {
            spans[0].textContent = `📅 ${dayStr}, ${dateStr} • ${timeStr} WIB`;
        }
    });
}
```
- Menghapus timer lama (`clearInterval(window.__jntDateInterval)`) sebelum inisialisasi untuk mencegah *memory leak* atau timer duplikat.
- Mendukung seluruh varian markup `.inc-date-chip` (1 span, 2 span, dan custom ID Shift Management).

---

## 4. Hasil Pengujian Fase 1

Pengujian otomatis dijalankan menggunakan suite uji [test_phase1_global_ui.js](file:///c:/Users/FARIZS/websiteJNTexpress/test_phase1_global_ui.js):

```
==========================================================================
   PHASE 1: GLOBAL UI INTERACTIVITY REMEDIATION TEST SUITE               
==========================================================================

▶ [TEST 1] Inisialisasi app.js & Verifikasi Komponen Global

▶ [TEST 2] Hamburger Menu Mobile & Backdrop Overlay
  ✅ PASS: Sidebar backdrop overlay dynamically created and attached to body
  ✅ PASS: Hamburger button initialized with aria-expanded: false
  ✅ PASS: Clicking hamburger adds .mobile-open to sidebar-panel
  ✅ PASS: Clicking hamburger adds .active to backdrop
  ✅ PASS: Hamburger aria-expanded toggled to true
  ✅ PASS: Clicking backdrop removes .mobile-open
  ✅ PASS: Clicking backdrop removes .active
  ✅ PASS: Hamburger aria-expanded restored to false
  ✅ PASS: Sidebar re-opened for nav-link test
  ✅ PASS: Clicking sidebar nav-link on mobile closes sidebar
  ✅ PASS: Sidebar re-opened for Escape test
  ✅ PASS: Pressing Escape closes mobile sidebar

▶ [TEST 3] User Profile Chip Dropdown & Navigasi
  ✅ PASS: User chip wrapped inside .topbar-user-wrapper
  ✅ PASS: User profile dropdown menu created with profile, settings, and logout options
  ✅ PASS: Clicking user chip displays dropdown (.show class added)
  ✅ PASS: Pressing Escape closes user profile dropdown
  ✅ PASS: Dropdown reopened
  ✅ PASS: Clicking outside closes user profile dropdown
  ✅ PASS: Dropdown contains Keluar Akun (Logout) button
  ✅ PASS: Logout cleared session storage
  ✅ PASS: Logout redirected to index.html

▶ [TEST 4] Real-time Asia/Jakarta Date and Time Updater
  ✅ PASS: Header date span contains current year
  ✅ PASS: Header time span formatted with WIB timezone
  ✅ PASS: Static placeholder date successfully replaced
  ✅ PASS: Global update timer initialized cleanly without duplicates

▶ [TEST 5] Audit Log File Existence & RBAC Verification
  ✅ PASS: audit.html verified as non-existent (dead route prevented from dangling)
  ✅ PASS: Shift Management contains operational Audit Trail logs

==========================================================================
   TOTAL PHASE 1 TESTS: 27 | PASSED: 27 | FAILED: 0
==========================================================================
🎉 ALL PHASE 1 GLOBAL UI INTERACTIVITY TESTS PASSED!
```

### Uji Regresi Fungsional [test_tms_core.js](file:///c:/Users/FARIZS/websiteJNTexpress/test_tms_core.js)
```
=================================================================
   TOTAL TESTS: 22 | PASSED: 22 | FAILED: 0
=================================================================
🎉 ALL SYSTEM & INTEGRATION TESTS COMPLETED SUCCESSFULLY!
```
- **Login / Logout**: Berfungsi normal tanpa regresi.
- **Trouble & Incident Engine**: Kaskade status dan pemulihan tetap utuh.
- **Shift Management & Audit Trail**: Event logging tetap bekerja normal.
- **Backup & Restore**: Validasi skema v5.0.0 tetap lulus.

---

## 5. Fitur yang Belum Selesai & Batasan Fase 1

Berdasarkan batasan Fase 1 (hanya komponen global UI):
1. **Halaman `audit.html`**:
   - Status: **BELUM DIIMPLEMENTASIKAN (UNIMPLEMENTED FEATURE)**.
   - Alasan: File `audit.html` mandiri memang belum ada di proyek. Sesuai instruksi, kami **tidak membuat file audit palsu atau dummy**. Log audit yang aktif saat ini dapat diakses secara sah melalui [shift-management.html#section-audit-trail](file:///c:/Users/FARIZS/websiteJNTexpress/shift-management.html) dan diekspor via [report.html](file:///c:/Users/FARIZS/websiteJNTexpress/report.html).
2. **Interaktivitas Khusus Halaman Tertentu (Akan Dikerjakan pada Fase Berikutnya)**:
   - **Dashboard**: Tombol *Export Report* header, filter wilayah dropdown, dan donut chart statis masih menunggu Fase 2 (Dashboard Remediation).
   - **Settings**: 9 tab navigasi dan tombol simpan per section masih menunggu Fase Settings.
   - **Profile**: Tombol edit profil dan revoke session Android masih menunggu Fase Profile.

---

## 6. Daftar Pengujian Manual yang Disarankan (Manual QA Checklist)

Untuk memvalidasi pengalaman visual di browser nyata:
1. **Uji Responsif Mobile (Chrome DevTools F12 -> Device Mode 375px/768px)**:
   - Buka sembarang halaman (misal `dashboard.html` atau `monitoring.html`).
   - Klik ikon hamburger di pojok kiri atas -> Pastikan sidebar muncul dari kiri dan latar belakang menjadi gelap.
   - Klik latar belakang gelap -> Pastikan sidebar menutup kembali.
   - Buka sidebar lagi, klik salah satu menu navigasi (misal "SLA Vendor") -> Pastikan sidebar menutup dan halaman berpindah.
2. **Uji Dropdown Profil Pengguna**:
   - Klik avatar / nama pengguna di kanan atas header -> Pastikan dropdown menu muncul dengan opsi "Profil Saya", "Pengaturan Sistem", dan "Keluar Akun".
   - Tekan tombol `Escape` di keyboard -> Pastikan dropdown langsung tertutup.
   - Klik opsi "Keluar Akun" -> Pastikan muncul dialog konfirmasi dan sesi diarahkan ke halaman login (`index.html`).
3. **Uji Jam Real-Time WIB**:
   - Perhatikan kotak tanggal di header kanan atas -> Pastikan detik pada jam WIB terus berjalan setiap detik dan tanggal mencerminkan hari ini.
