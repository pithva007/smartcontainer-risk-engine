const http = require('http');

const data = JSON.stringify({ username: 'admin', password: 'password' });
const req = http.request({
  hostname: 'localhost',
  port: 3000,
  path: '/api/auth/login',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': data.length
  }
}, res => {
  let body = '';
  res.on('data', chunk => body += chunk);
  res.on('end', () => {
    const token = JSON.parse(body).token;
    console.log('Got token:', token ? 'yes' : 'no');
    
    const assignData = JSON.stringify({ assigned_to: 'admin', notes: 'hello world test!' });
    const assignReq = http.request({
      hostname: 'localhost',
      port: 3000,
      path: '/api/containers/CONT-6874/assign',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'Content-Length': Buffer.byteLength(assignData)
      }
    }, assignRes => {
       console.log('Status:', assignRes.statusCode);
       let ans = '';
       assignRes.on('data', c => ans += c);
       assignRes.on('end', () => console.log('Response:', ans));
    });
    assignReq.write(assignData);
    assignReq.end();
  });
});
req.write(data);
req.end();
