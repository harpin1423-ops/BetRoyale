import dotenv from "dotenv";

async function testLogin() {
  const res = await fetch('http://localhost:3000/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'vip@betroyale.club', password: 'vip123' })
  });
  const data = await res.json();
  console.log(res.status, data);
}

testLogin();
