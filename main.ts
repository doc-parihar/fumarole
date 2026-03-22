import { App, Plugin, WorkspaceLeaf, addIcon } from 'obsidian';
import { TerminalView, VIEW_TYPE_TERMINAL } from './TerminalView';
import { FumaroleSettings, DEFAULT_SETTINGS, FumaroleSettingTab } from './settings';

const fumaroleSVG = `
<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <path d="M3 21 L10 10 H14 L21 21 Z" />
  
  <path d="M11 10 C9.5 8, 9.5 6.5, 11 5" /> <path d="M13 10 C14.5 8, 14.5 6.5, 13 5" /> <path d="M11 5 C10 4, 11 3, 12 3 C13 3, 14 4, 13 5" /> </svg>
`;

export default class FumarolePlugin extends Plugin {
	settings: FumaroleSettings;

	async onload() {
		await this.loadSettings();

		addIcon('fumarole-safe-icon', fumaroleSVG);

		this.registerView(
			VIEW_TYPE_TERMINAL,
			(leaf) => new TerminalView(leaf, this)
		);

		this.addRibbonIcon('fumarole-safe-icon', 'Open Fumarole Shell', () => {
			this.activateView();
		});

		this.addCommand({
			id: 'open-fumarole',
			name: 'Open Fumarole Shell',
			callback: () => {
				this.activateView();
			}
		});

		this.addSettingTab(new FumaroleSettingTab(this.app, this));
	}

	onunload() {
		this.app.workspace.detachLeavesOfType(VIEW_TYPE_TERMINAL);
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	async activateView() {
		const { workspace } = this.app;

		let leaf: WorkspaceLeaf | null = null;
		const leaves = workspace.getLeavesOfType(VIEW_TYPE_TERMINAL);

		if (leaves.length > 0) {
			leaf = leaves[0];
		} else {
			if (this.settings.splitDirection === 'right') {
				leaf = workspace.getRightLeaf(false);
			} else if (this.settings.splitDirection === 'horizontal') {
				leaf = workspace.getLeaf('split', 'horizontal');
			} else {
				leaf = workspace.getLeaf('split', 'vertical');
			}

			if (leaf) {
				await leaf.setViewState({ type: VIEW_TYPE_TERMINAL, active: true });
			}
		}

		if (leaf) {
			workspace.revealLeaf(leaf);
		}
	}
}
