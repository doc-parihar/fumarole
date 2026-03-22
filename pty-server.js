const os = require('os');
const pty = require('node-pty');
const WebSocket = require('ws');

const port = parseInt(process.argv[2], 10) || 8080;
const cwd = process.argv[3] || process.env.USERPROFILE || process.env.HOME || process.cwd();
const shell = process.argv[4] || getDefaultShell();

function getDefaultShell() {
    if (os.platform() === 'win32') {
        return process.env.COMSPEC || 'powershell.exe';
    }
    return process.env.SHELL || '/bin/bash';
}

const wss = new WebSocket.Server({ port, host: '127.0.0.1' });

console.log(`PTY Server listening on 127.0.0.1:${port}`);

wss.on('connection', (ws) => {
    let ptyProcess;
    try {
        ptyProcess = pty.spawn(shell, [], {
            name: 'xterm-256color',
            cols: 80,
            rows: 24,
            cwd: cwd,
            env: process.env
        });
    } catch (err) {
        ws.send(JSON.stringify({ type: 'error', data: `Failed to spawn shell "${shell}": ${err.message}\r\n` }));
        ws.close();
        return;
    }

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            if (data.type === 'input') {
                ptyProcess.write(data.data);
            } else if (data.type === 'resize') {
                ptyProcess.resize(
                    Math.max(1, Math.floor(data.cols)),
                    Math.max(1, Math.floor(data.rows))
                );
            }
        } catch (e) {
            // Assume raw string if not JSON
            ptyProcess.write(message.toString());
        }
    });

    ptyProcess.onData((data) => {
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'output', data }));
        }
    });

    ptyProcess.onExit(({ exitCode }) => {
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'exit', code: exitCode }));
            ws.close();
        }
        process.exit(0);
    });

    ws.on('close', () => {
        try { ptyProcess.kill(); } catch (e) { /* already dead */ }
        process.exit(0);
    });

    ws.on('error', (err) => {
        console.error('WebSocket error:', err.message);
        try { ptyProcess.kill(); } catch (e) { /* already dead */ }
        process.exit(1);
    });
});

wss.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
        console.error(`Port ${port} is already in use.`);
        process.exit(2);
    }
    console.error('Server error:', err.message);
    process.exit(1);
});

// Auto-exit if no connection after 10 seconds to prevent orphaned processes
setTimeout(() => {
    if (wss.clients.size === 0) {
        console.log('No connections received, shutting down.');
        process.exit(0);
    }
}, 10000);
