const mysql = require('mysql2');
require('dotenv').config();

// Konfigurasi koneksi: dukung TCP (host/port) dan Unix socket (Cloud SQL).
// Di Cloud Run, set DB_SOCKET_PATH=/cloudsql/PROJECT:REGION:INSTANCE
// untuk menghubungkan lewat Unix socket (lebih aman, tanpa password proxy).
const connConfig = {
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
};

if (process.env.DB_SOCKET_PATH) {
  connConfig.socketPath = process.env.DB_SOCKET_PATH;
} else {
  connConfig.host = process.env.DB_HOST;
  if (process.env.DB_PORT) connConfig.port = Number(process.env.DB_PORT);
}

const pool = mysql.createPool(connConfig);

module.exports = pool.promise();
