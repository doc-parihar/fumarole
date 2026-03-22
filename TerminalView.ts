import { ItemView, WorkspaceLeaf } from 'obsidian';
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import * as cp from 'child_process';
import * as path from 'path';
import * as os from 'os';
import FumarolePlugin from './main';

export const VIEW_TYPE_TERMINAL = "fumarole-view";

const MAX_RECONNECT_ATTEMPTS = 5;
const RECONNECT_INTERVAL_MS = 500;

export class TerminalView extends ItemView {
	terminal: Terminal;
	fitAddon: FitAddon;
	ptyProcess: cp.ChildProcess;
	ws: WebSocket | null = null;
	plugin: FumarolePlugin;

	constructor(leaf: WorkspaceLeaf, plugin: FumarolePlugin) {
		super(leaf);
		this.plugin = plugin;
	}

	getViewType() {
		return VIEW_TYPE_TERMINAL;
	}

	getDisplayText() {
		return "Fumarole";
	}

	getIcon(): string {
		return "fumarole-safe-icon";
	}

	async onOpen() {
		const container = this.contentEl;
		container.empty();
		
		const terminalDiv = container.createDiv({ cls: 'fumarole-container' });

		// Initialize xterm.js
		this.terminal = new Terminal({
			cursorBlink: true,
			fontFamily: 'Consolas, "Courier New", monospace',
			fontSize: this.plugin.settings.fontSize,
			theme: {
				background: '#1e1e1e'
			}
		});
		
		this.fitAddon = new FitAddon();
		this.terminal.loadAddon(this.fitAddon);

		this.terminal.open(terminalDiv);
		this.fitAddon.fit();

		this.terminal.write("Starting Terminal...\r\n");

		// Find a random free port for WebSocket
		const port = Math.floor(Math.random() * 10000) + 10000;
		
		// Get the path to pty-server.js
		const basePath = (this.app.vault.adapter as any).basePath;
		const pluginDirName = this.plugin.manifest.dir ? path.basename(this.plugin.manifest.dir) : 'fumarole';
		const pluginDir = path.join(basePath, '.obsidian', 'plugins', pluginDirName);
		const serverScript = path.join(pluginDir, 'pty-server.js');
		
		let defaultShell = this.plugin.settings.defaultShell;
		
		if (defaultShell === 'custom') {
			defaultShell = this.plugin.settings.customShell;
			if (!defaultShell || defaultShell.trim() === '') {
				defaultShell = os.platform() === 'win32' ? 'powershell.exe' : 'bash';
			}
		}
		
		// Spawn node process to run our PTY server
		this.ptyProcess = cp.spawn('node', [serverScript, port.toString(), basePath, defaultShell], {
			cwd: pluginDir,
			windowsHide: true,
			stdio: ['pipe', 'pipe', 'pipe']
		});

		// Handle PTY server crashes
		this.ptyProcess.on('error', (err) => {
			this.terminal.write(`\r\n\x1b[31mFailed to start terminal server: ${err.message}\x1b[0m\r\n`);
		});

		this.ptyProcess.on('exit', (code) => {
			if (code !== 0 && code !== null) {
				const msg = code === 2
					? `Port ${port} is already in use. Please reopen the terminal.`
					: `Terminal server exited with code ${code}.`;
				this.terminal.write(`\r\n\x1b[31m${msg}\x1b[0m\r\n`);
			}
		});

		this.ptyProcess.stderr?.on('data', (data) => {
			console.error('[pty-server stderr]', data.toString());
		});

		// Connect to WebSocket with retry logic
		this.connectWithRetry(port, 0);

		// Handle visual resize
		this.registerEvent(
			this.app.workspace.on('resize', () => {
				if (this.fitAddon && this.terminal.element) {
					this.fitAddon.fit();
				}
			})
		);
	}

	private connectWithRetry(port: number, attempt: number) {
		if (attempt >= MAX_RECONNECT_ATTEMPTS) {
			this.terminal.write(`\r\n\x1b[31mFailed to connect to terminal server after ${MAX_RECONNECT_ATTEMPTS} attempts.\x1b[0m\r\n`);
			this.terminal.write('\x1b[33mCheck that Node.js is installed and accessible.\x1b[0m\r\n');
			return;
		}

		const delay = attempt === 0 ? 800 : RECONNECT_INTERVAL_MS;

		setTimeout(() => {
			try {
				this.ws = new WebSocket(`ws://127.0.0.1:${port}`);
			} catch (e) {
				this.connectWithRetry(port, attempt + 1);
				return;
			}
			
			this.ws.onopen = () => {
				this.terminal.clear();
				if (this.fitAddon) {
					this.fitAddon.fit();
					this.ws?.send(JSON.stringify({ type: 'resize', cols: this.terminal.cols, rows: this.terminal.rows }));
				}
			};

			this.ws.onmessage = (event) => {
				try {
					const msg = JSON.parse(event.data as string);
					if (msg.type === 'output') {
						this.terminal.write(msg.data);
					} else if (msg.type === 'error') {
						this.terminal.write(`\r\n\x1b[31m${msg.data}\x1b[0m`);
					} else if (msg.type === 'exit') {
						this.terminal.write(`\r\n\x1b[90m[Process exited with code ${msg.code}]\x1b[0m\r\n`);
					}
				} catch (e) {
					// ignore malformed messages
				}
			};

			this.ws.onerror = () => {
				// Retry on error (server may not be ready yet)
				this.connectWithRetry(port, attempt + 1);
			};

			this.terminal.onData((data) => {
				if (this.ws && this.ws.readyState === WebSocket.OPEN) {
					this.ws.send(JSON.stringify({ type: 'input', data }));
				}
			});
			
			this.terminal.onResize((event) => {
				if (this.ws && this.ws.readyState === WebSocket.OPEN) {
					this.ws.send(JSON.stringify({ type: 'resize', cols: event.cols, rows: event.rows }));
				}
			});

		}, delay);
	}

	async onClose() {
		if (this.ws) {
			try { this.ws.close(); } catch (e) { /* ignore */ }
		}
		if (this.ptyProcess) {
			try { this.ptyProcess.kill(); } catch (e) { /* ignore */ }
		}
		if (this.terminal) {
			this.terminal.dispose();
		}
	}
}
