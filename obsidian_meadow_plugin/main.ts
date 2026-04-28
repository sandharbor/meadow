/*
Copyright 2026 Sand Harbor Software, LLC

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

import { Editor, MarkdownView, Menu, Notice, Plugin, TFile } from 'obsidian';
import { spawn } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';

interface MeadowPluginSettings {
	// Add any settings here if needed in the future
	[key: string]: unknown;
}

const DEFAULT_SETTINGS: MeadowPluginSettings = {
}

export default class MeadowPlugin extends Plugin {
	settings: MeadowPluginSettings;

	async onload() {
		await this.loadSettings();

		// This adds a command to open Meadow with current file info
		this.addCommand({
			id: 'open-in-meadow',
			name: 'Open in meadow',
			editorCallback: (editor: Editor, view: MarkdownView) => {
				this.openInMeadow(view.file);
			}
		});

		// Add "Open in Meadow" to file context menu (hamburger menu)
		this.registerEvent(
			this.app.workspace.on('file-menu', (menu: Menu, file: TFile) => {
				if (file instanceof TFile && file.extension === 'md') {
					menu.addItem((item) => {
						item
							.setTitle('Open in Meadow')
							.setIcon('external-link')
							.onClick(() => {
								this.openInMeadow(file);
							});
					});
				}
			})
		);

	}

	onunload() {
		// Cleanup when plugin is unloaded
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	private openInMeadow(file: TFile) {
		console.log('=== Meadow Plugin: openInMeadow called ===');
		
		if (!file) {
			console.log('Meadow Plugin: No file selected, returning early');
			new Notice('No file selected');
			return;
		}

		console.log('Meadow Plugin: File info:', {
			name: file.name,
			path: file.path,
			basename: file.basename,
			extension: file.extension
		});

		// Get the vault path (absolute path to the vault)
		const vaultPath = (this.app.vault.adapter as unknown as { basePath: string }).basePath;
		console.log('Meadow Plugin: Vault path:', vaultPath);
		
		// Get the folder path within the vault (relative to vault root)
		const folderPath = file.parent?.path || '';
		console.log('Meadow Plugin: Folder path within vault:', folderPath);
		
		// Get the page name (without .md extension)
		const pageName = file.basename;
		console.log('Meadow Plugin: Page name:', pageName);

		// Construct the arguments to pass to Meadow
		const args = [
			'--vault-path', vaultPath,
			'--folder-path', folderPath,
			'--page-name', pageName
		];
		console.log('Meadow Plugin: Arguments to pass:', args);
		console.log('Meadow Plugin: Full command will be: open -a Meadow --args', args.join(' '));

		try {
		// Try to find Meadow.app in common locations
		const possiblePaths = [
			'/Applications/Meadow.app',
			`${os.homedir()}/Applications/Meadow.app`,
			'Meadow.app'
		];
			
			let appPath = 'Meadow'; // fallback to just app name
			for (const path of possiblePaths) {
				console.log('Meadow Plugin: Checking if app exists at:', path);
				if (fs.existsSync(path)) {
					appPath = path;
					console.log('Meadow Plugin: Found Meadow.app at:', appPath);
					break;
				}
			}
			
			console.log(`Meadow Plugin: Final command will be: open -a ${appPath} --args ${args.join(' ')}`);
			
			// Execute the open command
			const process = spawn('open', ['-a', appPath, '--args', ...args], {
				stdio: 'inherit',
				detached: true
			} as const);
			
			console.log('Meadow Plugin: Spawn process created with PID:', process.pid);
			console.log('Meadow Plugin: Process spawn options:', {
				stdio: 'inherit',
				detached: true
			});
			
			// Wait a moment and then try to bring the app to front
			setTimeout(() => {
				console.log('Meadow Plugin: Attempting to bring Meadow to front...');
				spawn('osascript', ['-e', 'tell application "Meadow" to activate'], {
					stdio: 'inherit',
					detached: true
				} as const).unref();
			}, 1000);
			
			process.on('error', (error) => {
				console.error('Meadow Plugin: Process error event:', error);
			});
			
			process.on('exit', (code, signal) => {
				console.log('Meadow Plugin: Process exit event - code:', code, 'signal:', signal);
			});
			
			process.unref();
			console.log('Meadow Plugin: Process unref() called, detaching from parent');

			new Notice(`Opening ${pageName} in Meadow...`);
			console.log('Meadow Plugin: Notice displayed to user');
		} catch (error) {
			console.error('Meadow Plugin: Error spawning process:', error);
			new Notice(`Failed to open Meadow: ${error}`);
		}
		
		console.log('=== Meadow Plugin: openInMeadow completed ===');
	}
}
