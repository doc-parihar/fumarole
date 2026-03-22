import { App, PluginSettingTab, Setting } from 'obsidian';
import * as os from 'os';
import FumarolePlugin from './main';

export interface FumaroleSettings {
    defaultShell: string;
    customShell: string;
    splitDirection: string; // 'right', 'horizontal', 'vertical'
    fontSize: number;
}

function getPlatformDefaultShell(): string {
    if (os.platform() === 'win32') {
        return 'powershell.exe';
    } else if (os.platform() === 'darwin') {
        return 'zsh';
    }
    return 'bash';
}

export const DEFAULT_SETTINGS: FumaroleSettings = {
    defaultShell: getPlatformDefaultShell(),
    customShell: '',
    splitDirection: 'horizontal',
    fontSize: 14
}

export class FumaroleSettingTab extends PluginSettingTab {
    plugin: FumarolePlugin;

    constructor(app: App, plugin: FumarolePlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const {containerEl} = this;

        containerEl.empty();
        containerEl.createEl('h2', {text: 'Fumarole Settings'});

        // --- Shell Selection ---
        const shellDesc = document.createDocumentFragment();
        shellDesc.append(
            'Choose your shell. Select "Custom" to specify a path manually.'
        );

        new Setting(containerEl)
            .setName('Default Shell')
            .setDesc(shellDesc)
            .addDropdown(dropdown => {
                const options: Record<string, string> = {};
                if (os.platform() === 'win32') {
                    options['cmd.exe'] = 'Command Prompt (cmd.exe)';
                    options['powershell.exe'] = 'Windows PowerShell';
                    options['pwsh.exe'] = 'PowerShell Core (pwsh)';
                    options['bash'] = 'Bash (Git Bash / WSL)';
                } else if (os.platform() === 'darwin') {
                    options['zsh'] = 'Zsh (default macOS)';
                    options['bash'] = 'Bash';
                    options['/bin/sh'] = 'sh';
                } else {
                    options['bash'] = 'Bash';
                    options['zsh'] = 'Zsh';
                    options['/bin/sh'] = 'sh';
                    options['fish'] = 'Fish';
                }
                options['custom'] = '⚙ Custom...';

                dropdown
                    .addOptions(options)
                    .setValue(this.plugin.settings.defaultShell)
                    .onChange(async (value) => {
                        this.plugin.settings.defaultShell = value;
                        await this.plugin.saveSettings();
                        this.display(); // re-render to show/hide custom input
                    });
            });

        // Show custom shell input if "custom" is selected
        if (this.plugin.settings.defaultShell === 'custom') {
            new Setting(containerEl)
                .setName('Custom Shell Path')
                .setDesc('Full path or command name for your shell (e.g., C:\\tools\\my-shell.exe)')
                .addText(text => text
                    .setPlaceholder(os.platform() === 'win32' ? 'C:\\path\\to\\shell.exe' : '/usr/bin/fish')
                    .setValue(this.plugin.settings.customShell)
                    .onChange(async (value) => {
                        this.plugin.settings.customShell = value.trim();
                        await this.plugin.saveSettings();
                    }));
        }

        // --- Split Direction ---
        new Setting(containerEl)
            .setName('Pane Split Direction')
            .setDesc('How to split the workspace when opening a new terminal')
            .addDropdown(dropdown => dropdown
                .addOption('right', 'Right Sidebar')
                .addOption('horizontal', 'Horizontal Split (Bottom)')
                .addOption('vertical', 'Vertical Split (Side)')
                .setValue(this.plugin.settings.splitDirection)
                .onChange(async (value) => {
                    this.plugin.settings.splitDirection = value;
                    await this.plugin.saveSettings();
                }));

        // --- Font Size ---
        new Setting(containerEl)
            .setName('Font Size')
            .setDesc('Terminal font size in pixels')
            .addSlider(slider => slider
                .setLimits(10, 24, 1)
                .setValue(this.plugin.settings.fontSize)
                .setDynamicTooltip()
                .onChange(async (value) => {
                    this.plugin.settings.fontSize = value;
                    await this.plugin.saveSettings();
                }));
    }
}
