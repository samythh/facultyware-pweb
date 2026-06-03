const mysql = require('mysql2');
const ejs = require('ejs');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

async function run() {
  const connection = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT || 3306
  }).promise();

  try {
    const id = 2; // procurement id in the screenshot
    const [procurementRows] = await connection.query('SELECT * FROM permintaan_pengadaan WHERE id = ?', [id]);
    if (procurementRows.length === 0) {
      console.log('No procurement record found with ID = 2');
      return;
    }

    const procurement = procurementRows[0];
    const [items] = await connection.query('SELECT * FROM permintaan_items WHERE permintaan_pengadaan_id = ?', [id]);

    const mockData = {
      title: 'Detail ' + procurement.request_number,
      user: 'nadila',
      procurement,
      items
    };

    const templatePath = path.join(__dirname, '../views/inventory-procurement/detail.ejs');
    
    ejs.renderFile(templatePath, mockData, { views: path.join(__dirname, '../views') }, (err, html) => {
      if (err) {
        console.error('EJS Render Error:', err);
      } else {
        console.log('EJS Rendered successfully!');
        const scriptRegex = /<script>([\s\S]*?)<\/script>/gi;
        let match;
        console.log('--- Rendered JS blocks in detail.ejs ---');
        while ((match = scriptRegex.exec(html)) !== null) {
          console.log(match[1].trim());
          console.log('-----------------------------------------');
        }
      }
    });

  } catch (error) {
    console.error('Error running test:', error);
  } finally {
    await connection.end();
  }
}

run();
