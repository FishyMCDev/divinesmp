const http = require('http');

/**
 * Starts a tiny HTTP server so Render keeps the process alive
 * and UptimeRobot can ping it every 5 minutes to prevent sleep.
 */
function startKeepAlive() {
  const PORT = process.env.PORT || 3000;

  const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('DivinePartners bot is alive ✅');
  });

  server.listen(PORT, () => {
    console.log(`🌐 Keep-alive server running on port ${PORT}`);
  });
}

module.exports = { startKeepAlive };
