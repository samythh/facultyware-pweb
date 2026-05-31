-- =====================================================================
-- Seed permission untuk Modul Penerimaan Barang (Receiving)
-- Oleh: Mikail (2411523016) - Kelompok B09
--
-- Catatan:
-- - Tidak membuat tabel baru. Memakai tabel ACL yang sudah ada:
--   permissions(id, name, guard_name), roles(id, name),
--   role_has_permissions(role_id, permission_id).
-- - Idempotent: aman dijalankan berulang (pakai INSERT IGNORE / WHERE NOT EXISTS).
--
-- Cara jalan:
--   mysql -u <user> -p facultyware < scripts/seed_receiving_permission.sql
-- =====================================================================

-- 1) Tambah permission 'manage_receiving'
INSERT INTO permissions (name, guard_name)
SELECT 'manage_receiving', 'web'
WHERE NOT EXISTS (
  SELECT 1 FROM permissions WHERE name = 'manage_receiving'
);

-- 2) Hubungkan permission ke role 'admin' via role_has_permissions
INSERT INTO role_has_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name = 'admin'
  AND p.name = 'manage_receiving'
  AND NOT EXISTS (
    SELECT 1 FROM role_has_permissions rhp
    WHERE rhp.role_id = r.id AND rhp.permission_id = p.id
  );
