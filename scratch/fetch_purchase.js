async function run() {
  const res = await fetch('http://localhost:3000/purchase');
  const text = await res.text();
  console.log(text);
}
run();
