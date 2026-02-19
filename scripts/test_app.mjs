import express from 'express';

const app = express();
app.use(express.json());

// Test GET
app.get('/test-get', (req, res) => {
  console.log('[TEST] GET /test-get');
  res.json({ method: 'GET', path: '/test-get' });
});

// Test POST
app.post('/test-post', (req, res) => {
  console.log('[TEST] POST /test-post');
  res.json({ method: 'POST', path: '/test-post', body: req.body });
});

// Test POST with /api prefix
app.post('/api/test-post', (req, res) => {
  console.log('[TEST] POST /api/test-post');
  res.json({ method: 'POST', path: '/api/test-post', body: req.body });
});

// Fallback
app.use((req, res) => {
  console.log('[FALLBACK]', req.method, req.path);
  res.status(404).json({ error: 'Not found', method: req.method, path: req.path });
});

app.listen(5555, () => {
  console.log('[TEST APP] Listening on port 5555');
  
  // Debug: print registered routes
  try {
    const routes = [];
    // @ts-ignore
    app._router && app._router.stack.forEach((r) => {
      if (r.route && r.route.path) {
        const methods = Object.keys(r.route.methods).join(',').toUpperCase();
        routes.push(`${methods} ${r.route.path}`);
      }
    });
    console.log('[TEST APP] Registered routes:', routes);
  } catch (e) {
    console.warn('[TEST APP] Could not list routes', e);
  }
});