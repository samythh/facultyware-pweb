# Pembagian Tugas — Pipeline Pengadaan (B9)

Dokumen ini membagi pekerjaan melengkapi alur pengadaan agar **semua tabel dosen
terpakai** (tidak ada tabel nganggur) dan sesuai desain skema di
[`database/facultyware.sql`](database/facultyware.sql).

> **Tujuan:** memunculkan kembali tahap **Pengadaan** (`inventory_procurements`)
> sebagai langkah resmi di antara Permintaan dan Purchase Order.

---

## 1. Alur resmi (BPMN)

```
Permintaan Barang        Pengadaan              Purchase Order        Penerimaan
inventory_requests   →   inventory_procurements →  inventory_purchases →  (terima barang)
   (pegawai)             (dari permintaan          (dari pengadaan          → set permintaan
                          yang disetujui)           yang disetujui)            'fulfilled'
```

Tiap tahap **membaca dari tahap sebelumnya yang berstatus `approved`**.

---

## 2. KONTRAK ANTAR-MODUL (wajib dipatuhi semua orang)

Bug integrasi kemarin (FK PO nyasar ke tabel salah) terjadi karena modul dibangun
atas asumsi tabel berbeda. Agar bisa kerja paralel tanpa tabrakan, **patuhi 4
poin ini**:

1. **Sumber data tiap tahap**
   - Pengadaan dibuat dari `inventory_requests` yang `status = 'approved'`.
   - PO dibuat dari `inventory_procurements` yang `status = 'approved'`.

2. **Kunci penghubung = `request_number` (TANPA kolom baru)**
   - Saat membuat pengadaan, salin `request_number` dari permintaan ke
     `inventory_procurements.request_number`.
   - Telusuri asal permintaan dengan:
     ```sql
     ... FROM inventory_procurements p
     JOIN inventory_requests r ON p.request_number = r.request_number
     ```
   - **JANGAN menambah kolom apa pun ke tabel dosen** (butuh izin dosen lagi).

3. **Status tiap tahap (sesuai enum dosen)**
   - `inventory_requests`: `pending → approved / rejected → fulfilled`
   - `inventory_procurements`: `draft / submitted → approved / rejected`
   - `inventory_purchases`: `draft → completed`

4. **Notes hanya di tahap Permintaan**
   - Catatan persetujuan/penolakan disimpan di `inventory_request_approvals.notes`
     (kolom bawaan dosen). Tahap Pengadaan & PO tidak punya tabel notes — jangan
     mengarang yang baru.

---

## 3. Pembagian tugas (sesuai pembagian awal B9)

### 🟦 Nadila — Modul Permintaan & Pengadaan
**Tabel:** `inventory_requests`, `inventory_request_details`,
`inventory_procurements`, `inventory_procurement_items`

- **Permintaan** (sudah ada di `/procurement`): pastikan label "Permintaan Barang"
  dan status `pending → approved/rejected`.
- **Pengadaan (BARU)** — buat modul `/pengadaan`:
  - `index`: daftar `inventory_procurements` + info permintaan asal (join via `request_number`).
  - `create`: tampilkan permintaan ber-`status='approved'` yang **belum** punya pengadaan
    (LEFT JOIN `inventory_procurements` ON `request_number`, ambil yang null).
  - `store`: insert `inventory_procurements` (`request_number` = nomor permintaan,
    `title`, `created_by`, `employee_id`, `status='submitted'`) + salin item dari
    `inventory_request_details` → `inventory_procurement_items`.
  - aksi `approve` / `reject`: ubah status pengadaan.
- **File baru:** `routes/pengadaan.js`, `controllers/pengadaanController.js`,
  `views/pengadaan/*.ejs`, link di `views/partials/sidebar.ejs`.

### 🟩 Ghezy — Modul Approval (Wadir)
**Tabel:** `inventory_request_approvals`

- Approval permintaan **sudah jalan** ([`routes/approval.js`](routes/approval.js)),
  notes sudah tersimpan benar. Pastikan tetap menulis `notes` saat menolak.
- (Opsional) jika tahap Pengadaan perlu persetujuan Wadir juga, koordinasikan
  dengan Nadila siapa yang set `inventory_procurements.status='approved'`.

### 🟨 Mutiara — Modul PO + Dashboard + Migrasi FK
**Tabel:** `inventory_purchases`, `inventory_purchase_items`, `suppliers`

- **Migrasi FK (fondasi, kerjakan duluan):** kembalikan FK
  `inventory_purchases.inventory_procurement_id` agar menunjuk ke
  **`inventory_procurements`** (sesuai desain dosen). FK ini sempat diarahkan ke
  `inventory_requests` — perlu dikembalikan. Buat skrip idempotent.
- **PO:** ubah `purchaseController.create/store` agar sumbernya
  **`inventory_procurements` yang `approved`** (bukan `inventory_requests` lagi),
  item dari `inventory_procurement_items`. Pertahankan logika `supplier_id`.
- **Dashboard:** sesuaikan hitungan ke `inventory_procurements` untuk metrik pengadaan.

### 🟥 Mikail — Modul Penerimaan (tutup loop)
**Tabel:** `inventory_requests` (status), `inventory_transactions`

- Saat PO selesai diterima, **set permintaan asal jadi `fulfilled`**:
  telusuri PO → pengadaan (`inventory_procurement_id`) → permintaan
  (`request_number`) → `UPDATE inventory_requests SET status='fulfilled'`.
- Tetap sesuai keputusan decouple-stok: catat hanya di `inventory_transactions`,
  **jangan** menulis `inventories.quantity` (itu milik B11).

---

## 4. Urutan pengerjaan yang disarankan

1. **Mutiara** — migrasi FK (fondasi) lebih dulu, supaya semua punya pijakan benar.
2. **Nadila** — modul Pengadaan (paling besar & mandiri).
3. **Mutiara** — ubah sumber PO ke pengadaan.
4. **Mikail** — tutup loop `fulfilled`.
5. **Ghezy** — verifikasi approval tetap konsisten.

Setelah semua selesai, uji alur penuh: permintaan → setujui → pengadaan → setujui
→ PO → terima → `fulfilled`. Pastikan **8 tabel terpakai** tanpa ada yang nganggur.
