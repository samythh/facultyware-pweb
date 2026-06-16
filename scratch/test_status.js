async function run() {
  const res = await fetch('http://localhost:3000/purchase/1/status', {
    method: 'POST'
  });
  console.log('Status:', res.status);
  console.log('Redirected:', res.redirected);
  console.log('URL:', res.url);
}
run();
