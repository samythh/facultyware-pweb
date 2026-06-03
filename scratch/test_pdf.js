async function run() {
  const res = await fetch('http://localhost:3000/purchase/1/export');
  console.log('Status:', res.status);
  console.log('Content-Type:', res.headers.get('content-type'));
}
run();
