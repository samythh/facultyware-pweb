# Facultyware — Sistem Informasi Pengadaan Barang Fakultas (B09)

Aplikasi web (Express + EJS + MySQL) untuk transaksi pengadaan barang:
permintaan pengadaan → persetujuan Wakil Dekan → Purchase Order → **Penerimaan Barang**.

Dokumen ini adalah **panduan menjalankan proyek dari nol** — ditujukan untuk
orang yang baru pertama kali meng-clone repo dan belum punya database apa pun.
Setelah mengikuti langkah di bawah, database Anda akan **persis sama** dengan
milik tim. Untuk catatan perubahan per-branch lihat [CATATAN-TIM.md](CATATAN-TIM.md).

---

## 1. Prasyarat

- **Node.js** v18 atau lebih baru (beserta `npm`).
- **MySQL/MariaDB** berjalan di lokal. Paling mudah lewat **XAMPP** — nyalakan
  modul **MySQL** dari XAMPP Control Panel.
- Secara default proyek menyambung ke `localhost:3306`, user `root`, **tanpa
  password** (lihat `.env` di langkah 4). Itu konfigurasi bawaan XAMPP.

> **Khusus pengguna yang juga memasang Dolibarr/DoliWamp:** MariaDB Dolibarr
> sering merebut port 3306 sehingga MySQL XAMPP tidak bisa jalan dan aplikasi
> gagal konek. Pastikan MySQL XAMPP yang memegang port 3306.

---

## 2. Ambil kode

```bash
git clone https://github.com/samythh/facultyware-pweb.git
cd facultyware-pweb
git checkout dev
```

Jika sudah pernah clone, cukup perbarui:

```bash
git checkout dev
git pull
```

---

## 3. Install dependency

```bash
npm install
```

---

## 4. Buat file `.env`

`.env` **tidak ikut di Git** (sengaja). Buat berkas `.env` di root proyek
dengan isi berikut:

```env
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=
DB_NAME=facultyware

PORT=3000
SESSION_SECRET=facultyware-dev-secret

# Dev only: lewati SEMUA pengecekan auth (login + permission) untuk preview cepat.
# Pakai 0 untuk menguji hak akses sungguhan (lihat bagian 6).
DEV_NO_AUTH=0
```

> Jika MySQL Anda memakai password atau port lain, sesuaikan `DB_PASSWORD`
> dan tambahkan `DB_PORT=...` bila perlu.

---

## 5. Siapkan database (agar persis dengan tim)

Database lengkap (struktur **dan** data, termasuk seluruh skema dosen + migrasi
dan seed yang sudah dijalankan tim) sudah tersedia sebagai satu berkas dump di
[`database/facultyware.sql`](database/facultyware.sql). Cukup impor berkas itu.

> ⚠️ Impor ini akan **menghapus lalu membuat ulang** database `facultyware`
> (perintah `DROP DATABASE`/`CREATE DATABASE` ada di dalam dump). Pastikan tidak
> ada data lokal `facultyware` yang ingin Anda pertahankan.

**Cara A — lewat command line** (paling cepat dan pasti):

```bash
# Jika `mysql` sudah ada di PATH:
mysql -u root facultyware < database/facultyware.sql

# Atau panggil mysql bawaan XAMPP langsung (sesuaikan path instalasi Anda):
"E:\xampp\mysql\bin\mysql.exe" -u root < database/facultyware.sql
```

Dump sudah memuat `CREATE DATABASE IF NOT EXISTS facultyware`, jadi Anda **tidak
perlu** membuat database-nya dulu secara manual.

**Cara B — lewat phpMyAdmin** (kalau lebih nyaman dengan GUI):

1. Buka `http://localhost/phpmyadmin`.
2. Menu **Import** → pilih berkas `database/facultyware.sql` → **Go**.

Selesai. Database Anda kini identik dengan milik tim, lengkap dengan akun login
di bagian 6.

---

## 6. Jalankan aplikasi

```bash
npm run dev     # mode dev (auto-reload via nodemon)
# atau
npm start       # mode biasa
```

Buka **http://localhost:3000**.

### Akun tes (sudah ada di dalam dump)

| Peran        | Email                | Password  |
|--------------|----------------------|-----------|
| Admin        | admin@unand.ac.id    | admin123  |
| Wakil Dekan  | wadir@unand.ac.id    | wadir123  |

> Login memakai **email**, bukan username.

### `DEV_NO_AUTH` — kapan 1, kapan 0?

`DEV_NO_AUTH=1` mem-bypass **semua** pengecekan (login + permission). Itu hanya
alat bantu preview cepat, **bukan** pengganti akun.

| Nilai | Kapan dipakai |
|-------|---------------|
| `DEV_NO_AUTH=0` | **Default.** Menguji/demo hak akses sungguhnya: admin bisa Pengadaan/PO/Penerimaan, wadir hanya Approval, dan modul yang bukan haknya akan ditolak (403). Pakai ini sebelum demo. |
| `DEV_NO_AUTH=1` | Sekadar melihat tampilan modul tanpa login. **Tidak menguji hak akses.** |

Pembuktian hak akses cepat:

- Login **admin** → buka `/purchase` → **bisa** (admin punya `manage_po`).
- Login **wadir** → buka `/purchase` → **403** (wadir hanya `manage_approval`).

---

## 7. Struktur singkat

| Folder / berkas             | Isi                                                  |
|-----------------------------|------------------------------------------------------|
| `routes/`                   | Route Express per modul (purchase, approval, …)      |
| `controllers/`              | Logika controller                                    |
| `views/`                    | Template EJS (tampilan)                              |
| `middlewares/acl.js`        | Pengecekan permission (RBAC)                         |
| `lib/db.js`                 | Koneksi MySQL (pool `mysql2`)                        |
| `scripts/`                  | Skrip migrasi & seed database (lihat bagian 9)       |
| `database/facultyware.sql`  | **Dump database lengkap** untuk reproduksi           |
| `public/`                   | Aset statis & folder upload bukti penerimaan         |

---

## 8. (Lanjutan) Membangun ulang DB dari skrip — opsional

Jalur normal cukup impor dump (bagian 5). Bagian ini hanya untuk yang ingin
membangun ulang dari skema mentah dosen, mis. saat menambah perubahan skema baru.

Urutan skrip (idempoten, jalankan dari root proyek):

```bash
node scripts/migrate_sessions_table.js    # tabel sesi login: express_sessions
node scripts/migrate_receiving_schema.js  # skema modul Penerimaan (lampiran + verifikasi)
node scripts/seed_rbac.js                 # roles, permissions, dan akun login
node scripts/seed_employees.js            # data employees (FK modul Pengadaan/Approval)
```

> ⛔ **JANGAN jalankan `scripts/init_db.js`.** Skrip lama ini men-`DROP TABLE`
> lalu membuat skema gaya lama (`users.username`) yang **bentrok** dengan skema
> sekarang (`email`) dan dapat menghapus data.

Skrip-skrip di atas mengandaikan skema dasar (tabel-tabel gaya Laravel dari dosen)
sudah ada. Skema dasar itu hanya tersedia lewat dump dosen / [`database/facultyware.sql`](database/facultyware.sql).

---

## 9. Catatan penting

- **Jangan commit `.env`.**
- Berkas hasil upload di `public/assets/uploads/` adalah **data runtime** —
  tidak perlu di-commit (yang di-track hanya `.gitkeep`).
- Setelah menambah perubahan skema/seed yang ingin dibagikan ke tim, **perbarui
  dump** agar tetap sinkron:

  ```bash
  "E:\xampp\mysql\bin\mysqldump.exe" -u root --databases facultyware \
    --default-character-set=utf8mb4 --add-drop-database \
    --result-file=database/facultyware.sql
  ```
