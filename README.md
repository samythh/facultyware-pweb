# Facultyware — Sistem Informasi Pengadaan Barang Fakultas (B09)

Aplikasi web (Express + EJS + MySQL) untuk transaksi pengadaan barang: permintaan
pengadaan → persetujuan Wakil Dekan → Purchase Order → **Penerimaan Barang**.

Dokumen ini menjelaskan **cara menjalankan proyek di komputer kamu** setelah
`git pull`. Untuk catatan perubahan per-branch lihat [CATATAN-TIM.md](CATATAN-TIM.md).

---

## 1. Prasyarat

- **Node.js** (v18+ disarankan) & npm
- **MySQL / MariaDB** berjalan di lokal (mis. lewat XAMPP/Laragon)
- Database bernama **`facultyware`** sudah dibuat dan terisi (dari dump skema dosen)

---

## 2. Langkah menjalankan (pertama kali)

```bash
# 1. Ambil kode terbaru
git checkout dev
git pull

# 2. Install dependency
npm install

# 3. Buat file .env di root (lihat bagian 3 di bawah) — WAJIB, tidak ikut di-push

# 4. Migrasi & seed (sekali saja, urut dari atas)
node scripts/migrate_sessions_table.js    # tabel sesi: express_sessions
node scripts/migrate_receiving_schema.js  # skema modul Penerimaan
node scripts/seed_rbac.js                 # bikin AKUN LOGIN + roles + permissions
node scripts/seed_employees.js            # bikin employees (FK modul Pengadaan/Approval)

# 5. Jalankan aplikasi
npm run dev        # mode dev (auto-reload), buka http://localhost:3000
# atau
npm start          # mode biasa
```

> Kalau lupa migrasi sesi, **login akan error** "tabel tidak ada".
>
> Akun di bagian 4 (tabel di bawah) **dibuat oleh `seed_rbac.js`** — kalau skrip
> itu belum dijalankan, akunnya belum ada dan login pasti gagal.
>
> ⛔ **JANGAN jalankan `scripts/init_db.js`** — skrip lama yang men-`DROP TABLE`
> lalu membuat ulang skema gaya lama (`users.username`) yang **bentrok** dengan
> skema sekarang (`email`) dan bisa menghapus data.

---

## 3. File `.env` (buat manual)

`.env` **tidak ikut di Git** (sengaja, lihat `.gitignore`). Buat file `.env` di
root proyek dengan isi berikut, sesuaikan dengan MySQL lokal kamu:

```env
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=
DB_NAME=facultyware

PORT=3000
SESSION_SECRET=facultyware-dev-secret

# Dev only: lewati SEMUA pengecekan (login + permission) untuk preview cepat.
# Set 1 hanya saat ngetes lokal. JANGAN commit dengan nilai 1.
# Lihat bagian 4 untuk kapan pakai 1 vs 0.
DEV_NO_AUTH=1
```

---

## 4. Akun tes (lokal)

| Peran        | Email                | Password  |
|--------------|----------------------|-----------|
| Admin        | admin@unand.ac.id    | admin123  |
| Wakil Dekan  | wadir@unand.ac.id    | wadir123  |

> Login pakai **email**, bukan username.

### `DEV_NO_AUTH` — kapan 1, kapan 0?

`DEV_NO_AUTH=1` **mem-bypass semua auth** (login + permission). Itu cuma alat bantu
dev, **bukan** pengganti akun. Begitu `seed_rbac.js` dijalankan, RBAC sudah jalan
sendiri tanpa flag ini.

| Nilai | Kapan dipakai |
|-------|---------------|
| `DEV_NO_AUTH=1` | Preview tampilan modul cepat tanpa login; atau seed RBAC belum dijalankan. **Tidak menguji hak akses.** |
| `DEV_NO_AUTH=0` | Menguji/demo RBAC sungguhan: login pakai akun di atas, buktikan admin → Pengadaan+Penerimaan, wadir → Approval, dan saling-tolak modul yang bukan haknya. **Pakai ini sebelum kumpul/demo.** |

> Catatan: route **PO (purchase.js)** `checkPermission`-nya masih di-comment
> ("removed for testing"), jadi modul PO belum terproteksi — perlu diaktifkan
> sebelum final.

---

## 5. Struktur singkat

| Folder         | Isi                                              |
|----------------|--------------------------------------------------|
| `routes/`      | Route Express per modul (receiving, approval, …) |
| `controllers/` | Logika controller                                |
| `views/`       | Template EJS (tampilan)                           |
| `lib/db.js`    | Koneksi MySQL (pakai `mysql2`)                    |
| `scripts/`     | Skrip migrasi & seed database                    |
| `public/`      | Aset statis & folder upload bukti penerimaan     |

---

## 6. Catatan penting

- **Jangan commit `.env`** (apalagi dengan `DEV_NO_AUTH=1`).
- File hasil upload di `public/assets/uploads/` adalah **data runtime** —
  tidak perlu di-commit/push (yang di-track hanya `.gitkeep`).
- RBAC sudah jalan setelah `seed_rbac.js`; `DEV_NO_AUTH=1` hanya alat bantu dev
  yang mem-bypass auth (otomatis nonaktif bila `NODE_ENV=production`). Lihat bagian 4.

---

## 7. Troubleshooting cepat

| Masalah                          | Solusi                                              |
|----------------------------------|-----------------------------------------------------|
| `ECONNREFUSED` / DB tak konek    | Pastikan MySQL jalan & `.env` benar                 |
| Login error "tabel tidak ada"    | Jalankan `node scripts/migrate_sessions_table.js`   |
| Port 3000 dipakai                | Ubah `PORT` di `.env`                               |
| Halaman modul kosong/forbidden   | Pastikan `DEV_NO_AUTH=1` di `.env`                  |
