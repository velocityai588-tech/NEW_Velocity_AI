import { spawn } from 'child_process';
import fetch from 'node-fetch';
import { createReadStream } from 'fs';

console.log('\n=== STARTING SERVER ===');
const server = spawn('npm', ['run', 'api'], { 
  cwd: process.cwd(),
  stdio: 'pipe'
});

const serverOutput = [];
server.stdout.on('data', (data) => {
  const line = data.toString();
  serverOutput.push(line);
  console.log('[SERVER]', line);
});

server.stderr.on('data', (data) => {
  const line = data.toString();
  serverOutput.push(line);
  console.log('[SERVER ERR]', line);
});

// Wait for server to start (2 seconds should be enough)
await new Promise(r => setTimeout(r, 2000));

console.log('\n=== TESTING /health ===');
try {
  const r1 = await fetch('http://localhost:4000/health');
  console.log('GET /health status:', r1.status);
  console.log('GET /health response:', await r1.text());
} catch (e) {
  console.log('GET /health error:', e.message);
}

console.log('\n=== TESTING POST /api/v1/analyze/capacity ===');
try {
  const body = {"candidates":[{"id":"u1","name":"Alex","current_load":10,"efficiency_score":1,"base_productive_hours":40,"pto_hours_this_week":0,"holiday_hours_this_week":0}]};
  const r2 = await fetch('http://localhost:4000/api/v1/analyze/capacity', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify(body)
  });
  console.log('POST /api/v1/analyze/capacity status:', r2.status);
  console.log('POST /api/v1/analyze/capacity response:', await r2.text());
} catch (e) {
  console.log('POST /api/v1/analyze/capacity error:', e.message);
}

console.log('\n=== SERVER STDOUT ===');
console.log(serverOutput.slice(-20).join(''));

server.kill();
process.exit(0);