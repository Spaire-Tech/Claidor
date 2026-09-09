const { spawn } = require('child_process');
const { createServer } = require('vite');
const electron = require('electron');

async function startApp() {
  // Start the Vite dev server
  const server = await createServer();
  await server.listen();

  console.log('Vite server started');

  // Compile the Electron main-process code
  require('child_process').execSync('tsc --project electron-tsconfig.json', {
    stdio: 'inherit',
  });

  console.log('Electron main process code compiled');

  // Launch Electron
  const proc = spawn(electron, ['.'], {
    stdio: 'inherit',
    env: {
      ...process.env,
      NODE_ENV: 'development',
    },
  });

  proc.on('close', () => {
    server.close();
    process.exit();
  });

  // Handle process termination
  process.on('SIGTERM', () => {
    proc.kill();
    server.close();
    process.exit();
  });
}

startApp().catch((err) => {
  console.error('Error starting app:', err);
  process.exit(1);
}); 