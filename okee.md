# Laporan Output Pengerjaan Modul Permintaan Pengadaan

Semua list output pengerjaan di bawah ini telah berhasil diimplementasikan di dalam file project dan database:

## 🗄️ Database & Tabel
- [x] **Tabel `permintaan_pengadaan`**: Berhasil dibuat di database (dibuat sebagai view yang memetakan data dari tabel `inventory_procurements`).
- [x] **Tabel `permintaan_items`**: Berhasil dibuat di database (dibuat sebagai view yang memetakan data dari tabel `inventory_procurement_items`).
- [x] **Kolom status**: `draft` | `submitted` | `approved` | `rejected` lengkap.

---

## 💻 Halaman & Tampilan (Views)
- [x] **Halaman Daftar Permintaan (`index.ejs`)**: Menampilkan tabel data, badge status dengan warna dinamis (draft=abu, submitted=kuning, approved=hijau, rejected=merah), input search (berdasarkan judul), serta navigasi pagination.
- [x] **Halaman Form Buat Permintaan (`create.ejs`)**: Form pembuatan data baru dengan tabel input barang multi-item dinamis (bisa tambah/hapus baris menggunakan JavaScript).
- [x] **Halaman Detail Permintaan (`detail.ejs`)**: Menampilkan detail informasi dan komponen visual tracking status (Draft ➔ Submitted ➔ Approved/Rejected).
- [x] **Modal Form Edit Draf**: Modal interaktif di halaman detail untuk mengubah judul dan list barang permintaan pengadaan (hanya aktif untuk status `draft`).
- [x] **Modal Konfirmasi Hapus**: Modal konfirmasi untuk menghapus berkas draf pengadaan (hanya aktif untuk status `draft`).
- [x] **File PDF Formulir**: Ekspor dokumen formulir pengadaan resmi secara dinamis menggunakan library `pdfkit`.

---

## ⚙️ Integrasi VS Code
- [x] File `.vscode/launch.json` telah dikonfigurasi untuk memudahkan kamu menjalankan server Node.js dengan menekan tombol **F5** (Run & Debug).
- [x] File workspace `facultyware-pweb.code-workspace` telah disediakan di root directory.
