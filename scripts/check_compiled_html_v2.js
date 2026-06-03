const ejs = require('ejs');
const path = require('path');
const fs = require('fs');

const templatePath = path.join(__dirname, '../views/inventory-procurement/detail.ejs');

const mockData = {
  title: 'Detail PRQ-20260603-0002',
  user: 'nadila',
  procurement: {
    id: 3,
    request_number: 'PRQ-20260603-0002',
    title: 's1',
    status: 'draft',
    created_at: new Date()
  },
  items: [
    { item_name: 'A1', quantity: 1 }
  ]
};

ejs.renderFile(templatePath, mockData, { views: path.join(__dirname, '../views') }, (err, html) => {
  if (err) {
    console.error('EJS Render Error:', err);
  } else {
    console.log('EJS Rendered Successfully!');
    // Output the script block
    const scriptRegex = /<script>([\s\S]*?)<\/script>/gi;
    let match;
    console.log('--- Rendered Script Blocks ---');
    while ((match = scriptRegex.exec(html)) !== null) {
      console.log(match[1]);
      console.log('------------------------------');
    }
  }
});
