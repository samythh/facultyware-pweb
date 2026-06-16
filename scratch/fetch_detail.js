async function run() {
  const res = await fetch('http://localhost:3000/purchase/1');
  const text = await res.text();
  console.log(text);
}
run();
