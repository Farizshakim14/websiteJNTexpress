# 📘 BUKU PANDUAN PENGGUNAAN & OPERASIONAL (USER MANUAL GUIDE)
**J&T Express — Transportation Monitoring System (TMS) v5**  
*Gateway JKT999 & Head Office Jakarta*

---

## 📑 DAFTAR ISI
1. [Gambaran Umum Sistem](#1-gambaran-umum-sistem)
2. [Daftar 9 Role Jabatan & Matriks Hak Akses (RBAC)](#2-daftar-9-role-jabatan--matriks-hak-akses-rbac)
3. [Panduan Login & Proteksi Single-Session Lock](#3-panduan-login--proteksi-single-session-lock)
4. [Panduan Operasional Per Menu](#4-panduan-operasional-per-menu)
   - [4.1. Dashboard Utama (`dashboard.html`)](#41-dashboard-utama-dashboardhtml)
   - [4.2. Monitoring 4 Jam (`monitoring.html`)](#42-monitoring-4-jam-monitoringhtml)
   - [4.3. SLA Vendor (`sla-vendor.html`)](#43-sla-vendor-sla-vendorhtml)
   - [4.4. Trouble & Laka (`trouble.html`)](#44-trouble--laka-troublehtml)
   - [4.5. Shift Management (`shift-management.html`)](#45-shift-management-shift-managementhtml)
   - [4.6. Report & Export (`report.html`)](#46-report--export-reporthtml)
   - [4.7. User Management (`users.html`)](#47-user-management-usershtml)
   - [4.8. Profil Saya (`profile.html`) & Pengaturan (`settings.html`)](#48-profil-saya-profilehtml--pengaturan-settingshtml)
5. [Panduan Pusat Notifikasi Real-Time (🔔)](#5-panduan-pusat-notifikasi-real-time-)
6. [Standar Operasional Prosedur (SOP) Harian Tim Dispatch](#6-standar-operasional-prosedur-sop-harian-tim-dispatch)
7. [Panduan Teknis Admin & Struktur Hosting cPanel](#7-panduan-teknis-admin--struktur-hosting-cpanel)

---

## 1. Gambaran Umum Sistem

**J&T Express Transportation Monitoring System (TMS)** adalah platform pemantauan pergerakan armada linehaul (FUSO, CDD, Wingbox, Kontainer) secara *real-time* dari dan menuju **Gateway JKT999**.

Sistem ini menggunakan **Arsitektur Hybrid Cloud (Firebase Firestore + Hosting cPanel PHP)**:
- **Data Operasional Aktif (*Real-Time*):** Pergerakan armada yang sedang di jalan (`ON PROGRESS`), check-in posisi per 4 jam, tiket kendala/laka yang masih `OPEN`, dan status shift aktif disinkronkan secara instan menggunakan **Firebase Firestore**.
- **Data Arsip, Foto & Log Massal (*cPanel Hosting*):** Foto bukti kedatangan/kendala (`upload.php`), log aktivitas operator (`log_audit.php`), ribuan riwayat trip yang sudah selesai (`trip_archive.php`), riwayat serah terima shift (`shift_history.php`), dan sesi online (`session_lock.php`) disimpan di server **Hosting cPanel** lalu digabungkan otomatis (*Auto-Merge*) ke tampilan layar.

---

## 2. Daftar 9 Role Jabatan & Matriks Hak Akses (RBAC)

Sistem membagi pengguna ke dalam **9 Role Jabatan** dengan pembatasan akses halaman dan aksi secara otomatis:

| No | Role Jabatan | Hak Akses Menu & Wewenang Utama |
| :-: | :--- | :--- |
| **1** | **Developer** | **Akses Penuh (Super Admin):** Seluruh menu operasional, konfigurasi sistem, backup/restore database, manajemen seluruh level akun pengguna. |
| **2** | **Owner** | **Akses Eksekutif Penuh:** Memantau seluruh dashboard KPI, performa SLA vendor, laporan finansial/operasional, serta manajemen akun. |
| **3** | **Admin** | **Akses Administrator Operasional:** Mengelola seluruh data ritase, koreksi SLA, manajemen shift, manajemen akun user, dan pengaturan sistem. |
| **4** | **Manager** | **Akses Manajerial:** Memantau seluruh modul operasional, evaluasi vendor, laporan ekspor, manajemen shift, dan pembuatan akun staf/SPV. |
| **5** | **Asisten Manager** | **Akses Pengawasan Operasional:** Mengawasi jalannya Monitoring 4 Jam, SLA Vendor, Trouble & Laka, Shift Handover, Report, dan User Management. |
| **6** | **Supervisor (SPV)** | **Akses Koordinator Shift:** Mengontrol pergantian Shift 1 & Shift 2, memverifikasi penyelesaian Trouble & Laka, koreksi data trip, dan kelola staf. |
| **7** | **Staff Vehicle Dispatch** | **Akses Operator Harian:** Input keberangkatan armada, update posisi Check-in 4 Jam, konfirmasi tiba + upload foto bukti, lapor Trouble & Laka, dan serah terima shift. *(Tidak bisa mengakses User Management & Pengaturan Sistem)*. |
| **8** | **Finance** | **Akses Rekonsiliasi & Laporan:** Fokus pada **Dashboard**, **SLA Vendor**, **Report & Export**, dan **Profil Saya** untuk kebutuhan verifikasi tagihan/penalti SLA vendor 3PL. |
| **9** | **Vendor** | **Akses Portal Khusus Vendor 3PL (*Data Isolation*):** Hanya dapat melihat **Dashboard, Monitoring 4 Jam, SLA Vendor, Trouble & Laka, serta Report & Export milik perusahaannya sendiri**. Data vendor pesaing otomatis disembunyikan dan akun Vendor tidak dapat menghapus data trip. |

---

## 3. Panduan Login & Proteksi Single-Session Lock

1. Buka halaman utama website (`index.html`).
2. Masukkan **Username atau Email Perusahaan** (contoh: `farizs` atau `farizs.hakim@jtexpress.co.id`) beserta **Password**.
3. Centang **"Ingat Username Saya"** jika Anda menggunakan komputer kerja pribadi agar tidak perlu mengetik ulang username.
4. Klik tombol **"Masuk ke Sistem"**.

> **🔒 Aturan Keamanan *Single-Session Lock* (1 Akun = 1 Perangkat):**
> - Satu akun **tidak boleh dipakai login bersamaan di dua komputer/browser berbeda**.
> - Jika akun sedang aktif di Perangkat A, maka percobaan login di Perangkat B akan ditolak sampai Perangkat A melakukan **Logout** (atau sesi lama tidak aktif selama > 10 menit).
> - Jika Anda lupa password, klik **"Lupa Password / Bantuan Login?"** di bawah tombol login untuk mengirim tautan reset password resmi ke email Anda.

---

## 4. Panduan Operasional Per Menu

### 4.1. Dashboard Utama (`dashboard.html`)
Halaman ringkasan eksekutif untuk melihat kesehatan operasional secara sekilas:
- **5 Kartu KPI Utama:**
  - **Total Ritase:** Jumlah seluruh perjalanan armada sesuai filter periode.
  - **On-Time:** Jumlah & persentase armada yang tiba tepat waktu ($\le$ Target SLA Rute).
  - **Late:** Jumlah & persentase armada yang terlambat ($>$ Target SLA Rute) atau mengalami kendala kritis.
  - **Target SLA:** Standar pencapaian SLA Head Office (**90%**).
  - **Jumlah Vendor:** Total perusahaan vendor 3PL yang aktif beroperasi.
- **Tabel Performa Vendor:** Peringkat pencapaian SLA masing-masing vendor (*Sangat Baik $\ge 90\%$*, *Cukup $80-89\%$*, *Kurang $60-79\%$*, *Buruk $< 60\%$*).
- **Grafik Donat On-Time vs Late:** Visualisasi perbandingan ketepatan waktu.
- **Top 10 & Bottom 10 SLA Perjalanan:** Daftar rute dengan performa terbaik dan rute yang memerlukan evaluasi.

---

### 4.2. Monitoring 4 Jam (`monitoring.html`)
Menu kerja utama bagi **Staff Vehicle Dispatch** untuk memantau posisi armada selama perjalanan:

#### A. Cara Input Keberangkatan Armada Baru
1. Klik tombol **`+ Tambah Monitoring`** (atau input melalui menu SLA Vendor / Import Excel).
2. Isi **Kode Tugas** (unik), **Plat Nomor**, **Rute / TLC**, **Nama Vendor**, **Nama Driver & No. HP**, serta **Jam Berangkat (`OUT JKT999`)**.
3. Sistem otomatis menempatkan status **`OUT JKT999`** pada slot 4 jam keberangkatan.

#### B. Cara Input Update Posisi Check-in 4 Jam
Setiap armada yang berstatus **`ON PROGRESS`** wajib diperbarui posisinya pada slot jam:
**`00:00` • `04:00` • `08:00` • `12:00` • `16:00` • `20:00` WIB** (hingga Hari ke-7 untuk rute jarak jauh seperti Medan/Aceh).
1. Pada tabel **Monitoring 4 Jam**, cari baris armada berdasarkan **Kode Tugas** atau **Plat Nomor**.
2. Klik sel slot jam yang sedang berjalan (berwarna kuning/kosong setelah slot `OUT JKT999`).
3. Masukkan **Lokasi Saat Ini** (contoh: `TOL CIPALI KM 102` atau `PELABUHAN MERAK`), pilih **Jenis Update** (*Lokasi Normal / Istirahat / Antrean / Trouble*), lalu klik **Simpan**.

#### C. Cara Konfirmasi Armada Tiba (`IN GATEWAY`)
1. Ketika armada sudah sampai di tujuan, klik tombol **`✅ Konfirmasi Sampai`** atau pilih jenis update **`Sampai (IN)`** pada slot jam tiba.
2. Masukkan **Tanggal & Jam Sampai Aktual**.
3. **Upload Foto Bukti Sampai** (foto armada di lokasi/dokumen surat jalan). Foto akan otomatis dikompres dan disimpan ke server cPanel (`upload.php`).
4. Klik **Simpan**. Status perjalanan otomatis berubah menjadi **`COMPLETED` (Sudah Selesai)** dan durasi SLA langsung dihitung otomatis.

#### D. Cara Import Data dari Excel
1. Klik tombol **`📥 Import Excel`**.
2. Pilih file Excel (`.xlsx` / `.xls`) laporan Monitoring 4 Jam atau SLA.
3. Sistem otomatis mengekstrak Kode Tugas, Plat Nomor, Vendor, Driver + No. HP, Jam Berangkat, Slot Check-in H1–H7, dan Jam Sampai.
4. Trip yang sudah selesai di dalam Excel akan langsung disimpan ke arsip hosting (`trip_archive.php`) sehingga proses import cepat dan tidak memboroskan kuota Firebase.

---

### 4.3. SLA Vendor (`sla-vendor.html`)
Menu untuk mengevaluasi ketepatan waktu tempuh armada berdasarkan **44+ Standar Jam SLA Rute Resmi J&T Express** (misal: *Bandung 5.5 Jam, Semarang CDD 12.5 Jam / FUSO 14 Jam, Surabaya CDD 19 Jam / FUSO 23 Jam, Palembang 19.67 Jam, Pekanbaru 54 Jam, Medan 71 Jam*):
- **Tab 1 — Keberangkatan (Outbound):** Memantau waktu tempuh dari `JKT999` menuju Gateway tujuan.
- **Tab 2 — Armada Balikan (Return):** Memantau perjalanan arus balik dari Gateway daerah kembali menuju `JKT999` (klik **`+ Input Armada Balikan`** untuk mencatat keberangkatan balik).
- **Tab 3 — Analisa & Ringkasan Eksekutif:** Menampilkan **Vendor Terbaik**, **Vendor Terburuk**, **Rute Bermasalah**, **Progress Bar SLA per Rute**, serta **Rekomendasi Tindak Lanjut** otomatis.

---

### 4.4. Trouble & Laka (`trouble.html`)
Menu pelaporan dan penanganan insiden armada di jalan (Ban Pecah, Mesin Overheat, Kecelakaan/Laka, Kemacetan Parah, dll.):

#### A. Cara Melaporkan Kejadian Baru
1. Klik tombol merah **`🚨 Laporkan Kejadian`** di kanan atas.
2. Pada kolom **"Pilih / Cari Armada Terlibat Incident"**:
   - **Ketik langsung Kode Tugas atau Plat Nomor** (contoh: ketik `B9066` atau `DBGX...`), **ATAU**
   - Klik tombol panah `▾` untuk memilih dari **daftar dropdown** armada yang tersinkronisasi.
3. Begitu armada dipilih, kolom *Plat Nomor, Vendor, Driver, No. HP Driver, dan Rute* akan **terisi otomatis**.
4. Pilih **Tingkat Keparahan (*Severity*)**: `LOW`, `MEDIUM`, `HIGH`, atau `CRITICAL`.
5. Pilih **Jenis Kejadian** (*Trouble Kendaraan / Laka Lantas / Kendala Eksternal*) dan **Kategori Kendala**.
6. Isi **Lokasi Kejadian**, **Kronologi**, dan **Upload Foto Kejadian**, lalu klik **Simpan Laporan**.
   - *Otomatis:* Status armada di Monitoring 4 Jam & SLA Vendor akan berubah menjadi **`KENDALA`**, dan **Lonceng Notifikasi** akan memberi peringatan.

#### B. Cara Update Status & Menutup Tiket Kendala (`SUDAH SELESAI`)
1. Klik salah satu baris insiden pada tabel **Trouble & Laka** untuk melihat panel detail di sebelah kanan.
2. Klik tombol **`🔄 Update Status`** atau **`✅ Tutup Kejadian`**.
3. Untuk mengubah status menjadi **`SUDAH SELESAI`**, operator **wajib mengunggah Foto Bukti Selesai Penanganan** dan mengisi catatan penyelesaian.
4. Setelah ditutup, status armada otomatis dipulihkan dan riwayat insiden diarsipkan ke `trouble_archive.php`.

---

### 4.5. Shift Management (`shift-management.html`)
Menu kontrol pergantian shift operasional 24 jam yang terbagi menjadi 2 shift otomatis:
- **Shift 1 (Pagi):** Otomatis **`08:30 - 20:30 WIB`** (Durasi 12 Jam).
- **Shift 2 (Malam):** Otomatis **`20:30 - 08:30 WIB`** (Durasi 12 Jam).

#### Cara Melakukan Pergantian Shift (Handover)
1. Saat jam shift berakhir (pukul `08:30` atau `20:30` WIB), buka menu **Shift Management**.
2. Klik tombol **`+ Mulai Shift Baru`** atau **`🔄 Handover / Ganti Shift`**.
3. Pilih **Shift Operasional** (*Shift 1* atau *Shift 2*) — jam mulai dan jam selesai sudah disetel otomatis oleh sistem.
4. Pilih nama **Operator 1 ( Penanggung Jawab Monitoring 4 Jam)** dan **Operator 2 (Penanggung Jawab SLA)** dari daftar pengguna aktif. *(Operator 1 dan Operator 2 tidak boleh orang yang sama)*.
5. Isi **Catatan Handover** (misal: jumlah armada yang masih *On-Progress* atau kendala yang perlu dipantau shift berikutnya), lalu klik **Mulai Shift**.

---

### 4.6. Report & Export (`report.html`)
Menu pusat pelaporan dan pengunduhan data operasional:
1. Gunakan filter di bagian atas untuk memilih **Rentang Tanggal**, **Shift**, **Vendor**, **Rute**, atau **Status SLA**.
2. Pilih tab laporan yang ingin dilihat:
   - **Laporan SLA & Perjalanan**
   - **Laporan Monitoring 4 Jam**
   - **Laporan Trouble & Laka**
   - **Log Audit Trail Sistem** (mencatat siapa menginput/mengubah data apa dan jam berapa dari `log_audit.php`).
3. Klik **`📥 Export Excel (.xlsx)`** atau **`🖨️ Export PDF / Cetak`** untuk mengunduh laporan resmi.

---

### 4.7. User Management (`users.html`)
*(Khusus Role: Developer, Owner, Admin, Manager, Asisten Manager, dan Supervisor)*

1. **Tambah Akun Baru (`+ Tambah User`):**
   - Isi *Username*, *Nama Lengkap*, *Email Perusahaan*, *No. WA*, pilih **Role / Akses Jabatan** (1 dari 9 Role), *Gateway Penugasan*, dan *Password* (minimal 6 karakter).
   - **Khusus jika memilih Role = `Vendor`:** Akan muncul pilihan **`🏢 Perusahaan Vendor 3PL Terkait`**. Pilih perusahaan vendornya (misal `SERYU` atau `APL`) agar akun tersebut otomatis terkunci hanya pada data vendor tersebut.
   - Akun baru akan langsung dibuat tanpa mengeluarkan (*logout*) sesi Admin Anda.
2. **Edit Data User (`✏️`):** Mengubah nama, nomor telepon, role, vendor terkait, atau menonaktifkan akun (`🔴 Nonaktif`).
3. **Hapus Akun Permanen (`🗑️`):** Menghapus akun pengguna dari database dan mencabut akses loginnya secara permanen. *(Anda tidak dapat menghapus akun Anda sendiri yang sedang dipakai login)*.

---

### 4.8. Profil Saya (`profile.html`) & Pengaturan (`settings.html`)
- **Di Menu `Profil Saya` (`profile.html`):**
  - **Ganti Foto Profil:** Klik tombol **`📷 Ganti Foto`** di banner atas atau **`📷 Edit / Upload Foto Profil`** di dalam form untuk mengunggah foto profil Anda ke server cPanel.
  - **Edit Data Diri:** Perbarui Nama Lengkap, Email, No. WA, Departemen, dan Catatan Gateway, lalu klik **`💾 Simpan Perubahan Profil`**.
  - **Hak Akses Modul & Pintasan Cepat:** Melihat daftar modul yang diizinkan untuk role Anda dan membukanya dengan 1 klik.
  - **Ubah Password:** Masukkan *Password Saat Ini* dan *Password Baru* (dilengkapi indikator kekuatan password) untuk memperbarui password login Firebase Auth Anda, atau klik **`📧 Kirim Link Reset Password ke Email`**.
  - **Sesi Perangkat & Aktivitas Saya:** Melihat browser/OS yang sedang terhubung (`session_lock.php`), mengunci ulang sesi (**`🔒 Kunci Sesi`**), dan memfilter riwayat aktivitas pribadi Anda.
- **Di Menu `Pengaturan` (`settings.html`):**
  - Mengatur **Mode Tampilan** (*☀️ Terang* atau *🌙 Gelap*), **Ukuran Font** (*Kecil / Sedang / Besar*), dan **Kepadatan Tabel** (*Kompak / Normal / Lega*).

---

## 5. Panduan Pusat Notifikasi Real-Time (`🔔`)

Ikon **Lonceng Notifikasi (`🔔`)** di pojok kanan atas setiap halaman bekerja sebagai asisten pengingat otomatis dengan **3 jenis peringatan**:
1. **`⏱️ Check-in 4H`:** Memberitahu daftar armada yang sedang berjalan (`ON PROGRESS`) namun **belum diinput posisi check-in-nya pada slot 4 jam saat ini**.
2. **`🚨 Trouble`:** Memberitahu adanya tiket Trouble atau Laka Lantas yang masih berstatus aktif (`DALAM PENANGANAN` / `OPEN`).
3. **`⏰ SLA`:** Memberitahu armada yang waktu tempuhnya **sudah melewati batas Target SLA (*Overdue*)** atau **sisa waktu SLA-nya tinggal $< 2\text{ Jam}$**.

> **Tips:** Klik salah satu item di dalam panel notifikasi (`Tindak Lanjuti →`) untuk langsung melompat ke halaman dan armada yang bersangkutan.

---

## 6. Standar Operasional Prosedur (SOP) Harian Tim Dispatch

1. **Awal Shift (`08:30 WIB` untuk Shift 1 / `20:30 WIB` untuk Shift 2):**
   - Login ke sistem, buka menu **Shift Management**, dan lakukan **Mulai Shift Baru / Handover** bersama rekan shift.
   - Cek **Lonceng Notifikasi (`🔔`)** untuk melihat apakah ada armada *carry-over* dari shift sebelumnya yang memiliki kendala (`Trouble`) atau belum check-in.
2. **Setiap Pergantian Slot 4 Jam (`00:00`, `04:00`, `08:00`, `12:00`, `16:00`, `20:00` WIB):**
   - Buka menu **Monitoring 4 Jam** (atau lihat tab `⏱️ Check-in 4H` di Lonceng Notifikasi).
   - Hubungi driver armada yang sedang `ON PROGRESS` (klik nomor telepon biru `📞` di kolom Driver) dan input posisi terbarunya.
3. **Saat Ada Kendala di Jalan:**
   - Buka menu **Trouble & Laka**, klik **`🚨 Laporkan Kejadian`**, ketik Kode Tugas / Plat Nomor armada, dan unggah foto bukti kendala.
4. **Saat Armada Tiba di Tujuan:**
   - Input **Jam Sampai Aktual** beserta **Foto Bukti Sampai** di menu **Monitoring 4 Jam** atau **SLA Vendor**.
5. **Akhir Shift:**
   - Pastikan seluruh check-in slot terakhir sudah terisi, lalu lakukan **Serah Terima Shift (Handover)** kepada operator shift berikutnya.

---

## 7. Panduan Teknis Admin & Struktur Hosting cPanel

Seluruh file website di-upload ke folder `public_html` di **Hosting cPanel (Skema A)**. Berikut adalah fungsi dari **8 File PHP** yang wajib ada di folder utama hosting:

| Nama File PHP | Fungsi Utama | File Data yang Dihasilkan di Server |
| :--- | :--- | :--- |
| `_auth_helper.php` | Validasi keamanan CORS, token Firebase Auth, & Cache Token 30 menit | `logs/auth_token_cache.json` |
| `upload.php` | Menyimpan foto bukti tiba armada, foto trouble/laka, & foto profil user | `uploads/*.jpg` / `.png` / `.webp` |
| `log_audit.php` | Menyimpan & menyajikan riwayat Audit Trail aktivitas operator | `logs/audit_logs.json` |
| `trip_archive.php` | Menyimpan arsip ribuan trip `COMPLETED` & hasil Import Excel massal | `logs/trip_archive.json` |
| `session_lock.php` | Mengelola *Single-Session Lock* & indikator Online/Offline user | `logs/active_sessions.json` |
| `shift_history.php` | Menyimpan arsip riwayat serah terima Shift 1 & Shift 2 yang sudah selesai | `logs/shift_history.json` |
| `trouble_archive.php` | Menyimpan arsip tiket Trouble & Laka yang sudah berstatus `SUDAH SELESAI` | `logs/trouble_archive.json` |
| `master_data.php` | Menyimpan & meng-cache 5 koleksi Master Data (Rute SLA, Vendor, Armada, Driver, Alasan) | `logs/master_data.json` |

> **🔒 Keamanan Folder Server:** Folder `logs/` otomatis diproteksi dengan `.htaccess` (`Deny from all`) sehingga file `.json` di dalamnya tidak dapat diunduh dari luar, dan folder `uploads/` otomatis mematikan eksekusi script (`php_flag engine off`).
