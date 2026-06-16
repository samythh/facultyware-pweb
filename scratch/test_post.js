async function run() {
  try {
    const res = await fetch('http://localhost:3000/purchase/create', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        purchase_date: '2026-06-03',
        supplier: 'PT ATK Makmur',
        inventory_procurement_id: '1',
        'prices[]': ['12000', '15000']
      }).toString()
    });

    console.log('Status:', res.status);
    console.log('Redirected:', res.redirected);
    console.log('URL:', res.url);
    const text = await res.text();
    console.log('Body length:', text.length);
  } catch (e) {
    console.error(e);
  }
}
run();
