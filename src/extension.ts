import * as vscode from 'vscode';
import * as fs from 'fs';
import * as pathModule from 'path';
import { Logger } from './logger';

const PINNED_ITEMS_KEY = 'pinnedItems';
const PINNED_TOP_ITEMS_KEY = 'pinnedTopItems';
const STATUS_MESSAGE_DURATION = 1000;
const CONTEXT_UPDATE_DEBOUNCE_DELAY = 150;
const FILE_DELETION_DELAY = 100;

// Utility function to show status bar message with consistent duration
const showStatusMessage = (message: string, withIcon: boolean = false): void => {
    const icon = withIcon ? '✅ ' : '';
    vscode.window.setStatusBarMessage(`${icon}${message}`, STATUS_MESSAGE_DURATION);
};

// Utility function to get file name from path
const getFileName = (filePath: string): string => pathModule.basename(filePath);

export function activate(context: vscode.ExtensionContext) {
    Logger.initialize(context);
    const extensionId = context.extension.id;
    const extensionVersion = vscode.extensions.getExtension(extensionId)?.packageJSON.version;
    Logger.log(`PinInExplorer version ${extensionVersion} is now active!`);

    const pinnedItemsProvider = new PinnedItemsProvider(context);
    vscode.window.registerTreeDataProvider('pinnedItems', pinnedItemsProvider);

    // Create a function to check if a specific URI is pinned
    const isUriPinned = (uri: vscode.Uri): boolean => {
        const pinnedItems = context.workspaceState.get<string[]>('pinnedItems', []);
        return pinnedItems.includes(uri.fsPath);
    };

    // Add debounce mechanism to avoid frequent context updates
    let updateContextTimeout: NodeJS.Timeout | undefined;
    const updatePinContext = (uri?: vscode.Uri) => {
        // Clear previous timer
        if (updateContextTimeout) {
            clearTimeout(updateContextTimeout);
        }
        
        // Set new timer with delay
        updateContextTimeout = setTimeout(() => {
            let resourceUri = uri;
            // If no URI is passed, try to get it from the active editor
            if (!resourceUri) {
                resourceUri = vscode.window.activeTextEditor?.document.uri;
            }

            if (resourceUri) {
                const isPinned = isUriPinned(resourceUri);
                vscode.commands.executeCommand('setContext', 'resourceIsPinned', isPinned);
                Logger.log(`Context updated for ${resourceUri.fsPath}: isPinned=${isPinned}`);
            } else {
                // If there's no active editor or URI, we can't determine the pin status, so set to false
                vscode.commands.executeCommand('setContext', 'resourceIsPinned', false);
                Logger.log('No active URI, context set to not pinned.');
            }
        }, CONTEXT_UPDATE_DEBOUNCE_DELAY);
    };

    // Register a command to check pin status for context menu
    context.subscriptions.push(
        vscode.commands.registerCommand('pinInExplorer.checkPinStatus', (uri: vscode.Uri) => {
            Logger.log('Checking pin status for:', uri?.fsPath || 'no URI');
            const isPinned = isUriPinned(uri);
            Logger.log('Pin status result:', isPinned);
            return isPinned;
        })
    );

    // Initial context update
    updatePinContext();

    // Add file system watcher to monitor file changes within workspace
    const fileWatcher = vscode.workspace.createFileSystemWatcher('**/*', false, true, false);
    fileWatcher.onDidDelete((uri) => {
        // Handle file deletion asynchronously to avoid blocking main thread
        setTimeout(() => {
            pinnedItemsProvider.removeDeletedFile(uri.fsPath);
        }, FILE_DELETION_DELAY);
    });
    context.subscriptions.push(fileWatcher);

    // Listen for editor changes to update context
    // Listen to various events to update context
    context.subscriptions.push(
        vscode.window.onDidChangeActiveTextEditor(() => updatePinContext()),
        vscode.window.onDidChangeTextEditorSelection((e) => {
            if (e.textEditor === vscode.window.activeTextEditor) {
                updatePinContext(e.textEditor.document.uri);
            }
        }),
        // Listen to workspace state changes to update context when pins change
        vscode.workspace.onDidChangeConfiguration(() => updatePinContext())
    );

    // Remove the periodic update as it's not effective for context menu
    // The issue is that VS Code's resourceIsPinned context is global and doesn't
    // automatically update based on the file being right-clicked in explorer

    context.subscriptions.push(
        vscode.commands.registerCommand('pinInExplorer.pin', (uri: vscode.Uri) => {
            if (uri) {
                const isPinned = isUriPinned(uri);
                if (!isPinned) {
                    Logger.log('Pinning from explorer:', uri.fsPath);
                    pinnedItemsProvider.pinItem(uri.fsPath);
                    showStatusMessage(`Pinned: ${getFileName(uri.fsPath)}`, true);
                    updatePinContext(uri);
                } else {
                    vscode.window.showInformationMessage(`File is already pinned: ${pathModule.basename(uri.fsPath)}`);
                }
            }
        }),
        vscode.commands.registerCommand('pinInExplorer.unpinFromExplorer', (uri: vscode.Uri) => {
            if (uri) {
                const isPinned = isUriPinned(uri);
                if (isPinned) {
                    Logger.log('Unpinning from explorer:', uri.fsPath);
                    pinnedItemsProvider.unpinItem(uri.fsPath);
                    showStatusMessage(`Unpinned: ${getFileName(uri.fsPath)}`);
                    updatePinContext(uri);
                } else {
                    vscode.window.showInformationMessage(`File is not pinned: ${pathModule.basename(uri.fsPath)}`);
                }
            }
        }),
        vscode.commands.registerCommand('pinInExplorer.togglePin', (uri: vscode.Uri) => {
            if (!uri) {
                return;
            }
            
            const isPinned = isUriPinned(uri);
            const fileName = getFileName(uri.fsPath);
            
            if (isPinned) {
                Logger.log('Unpinning via toggle:', uri.fsPath);
                pinnedItemsProvider.unpinItem(uri.fsPath);
                showStatusMessage(`Unpinned: ${fileName}`);
            } else {
                Logger.log('Pinning via toggle:', uri.fsPath);
                pinnedItemsProvider.pinItem(uri.fsPath);
                showStatusMessage(`Pinned: ${fileName}`, true);
            }
            updatePinContext(uri);
        }),
        vscode.commands.registerCommand('pinInExplorer.unpin', (item: PinnedItem) => {
            Logger.log('Unpinning from pins view:', item.path);
            pinnedItemsProvider.unpinItem(item.path);
            showStatusMessage(`Unpinned: ${getFileName(item.path)}`);
        }),
        vscode.commands.registerCommand('pinInExplorer.moveUp', (item: PinnedItem) => {
            pinnedItemsProvider.moveItem(item.path, 'up');
        }),
        vscode.commands.registerCommand('pinInExplorer.moveDown', (item: PinnedItem) => {
            pinnedItemsProvider.moveItem(item.path, 'down');
        }),
        vscode.commands.registerCommand('pinInExplorer.moveToTop', (item: PinnedItem) => {
            pinnedItemsProvider.moveItem(item.path, 'top');
        }),
        vscode.commands.registerCommand('pinInExplorer.openItem', async (item: PinnedItem) => {
            try {
                // Open the folder containing the file in system file explorer
                const stats = await fs.promises.stat(item.path);
                const folderPath = stats.isDirectory() ? item.path : pathModule.dirname(item.path);
                vscode.env.openExternal(vscode.Uri.file(folderPath));
            } catch (error) {
                Logger.log(`Error opening item ${item.path}: ${error}`);
                vscode.window.setStatusBarMessage(`❗ Cannot open file: ${getFileName(item.path)}`, STATUS_MESSAGE_DURATION);
            }
        }),
        vscode.commands.registerCommand('pinInExplorer.openAndReveal', async (item: PinnedItem) => {
            try {
                // Reveal file in file tree
                await vscode.commands.executeCommand('revealInExplorer', item.uri);
                // Open file and switch to that tab
                const stats = await fs.promises.stat(item.path);
                if (!stats.isDirectory()) {
                    await vscode.window.showTextDocument(item.uri);
                }
            } catch (error) {
                Logger.log(`Error revealing item ${item.path}: ${error}`);
                vscode.window.setStatusBarMessage(`❗ Cannot open file: ${getFileName(item.path)}`, STATUS_MESSAGE_DURATION);
            }
        }),
        vscode.commands.registerCommand('pinInExplorer.alreadyAtTop', (item: PinnedItem) => {
            // Already at top, no action needed
        }),
        vscode.commands.registerCommand('pinInExplorer.removeFromTop', (item: PinnedItem) => {
            pinnedItemsProvider.removeFromTop(item.path);
        })
    );

    context.subscriptions.push({ 
        dispose: () => {
            // Clean up timer
            if (updateContextTimeout) {
                clearTimeout(updateContextTimeout);
            }
            Logger.dispose();
        }
    });
}

class PinnedItemsProvider implements vscode.TreeDataProvider<PinnedItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<PinnedItem | undefined | null | void> = new vscode.EventEmitter<PinnedItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<PinnedItem | undefined | null | void> = this._onDidChangeTreeData.event;

    constructor(private context: vscode.ExtensionContext) {}

    // Helper method to update workspace state and refresh tree
    private updateWorkspaceState(pinnedItems: string[], pinnedTopItems: string[]): void {
        this.context.workspaceState.update(PINNED_ITEMS_KEY, pinnedItems);
        this.context.workspaceState.update(PINNED_TOP_ITEMS_KEY, pinnedTopItems);
        this._onDidChangeTreeData.fire();
    }

    // Helper method to get current pinned items from workspace state
    private getPinnedItemsFromState(): { pinnedItems: string[], pinnedTopItems: string[] } {
        const pinnedItems = this.context.workspaceState.get<string[]>(PINNED_ITEMS_KEY, []);
        const pinnedTopItems = this.context.workspaceState.get<string[]>(PINNED_TOP_ITEMS_KEY, []);
        return { pinnedItems, pinnedTopItems };
    }

    getTreeItem(element: PinnedItem): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: PinnedItem): Promise<PinnedItem[]> {
        if (element) {
            return Promise.resolve([]);
        }

        let { pinnedItems, pinnedTopItems } = this.getPinnedItemsFromState();
        
        // Validate file existence and automatically clean up non-existent files
        const validItems: string[] = [];
        for (const itemPath of pinnedItems) {
            try {
                await fs.promises.access(itemPath);
                validItems.push(itemPath);
            } catch {
                // File doesn't exist, don't add to validItems
                Logger.log(`Removing non-existent file from pins: ${itemPath}`);
            }
        }
        
        const validTopItems = pinnedTopItems.filter(itemPath => validItems.includes(itemPath));
        
        // Update storage if files were cleaned up
        if (validItems.length !== pinnedItems.length || validTopItems.length !== pinnedTopItems.length) {
            this.updateWorkspaceState(validItems, validTopItems);
            pinnedItems = validItems;
            pinnedTopItems = validTopItems;
        }
        
        // Separate pinned-to-top and normal items
        const topItems = pinnedItems.filter(item => pinnedTopItems.includes(item));
        const normalItems = pinnedItems.filter(item => !pinnedTopItems.includes(item));
        
        // Merge lists with pinned-to-top items first
        const sortedItems = [...topItems, ...normalItems];
        
        const items = await Promise.all(sortedItems.map(async (itemPath, index) => {
            const uri = vscode.Uri.file(itemPath);
            const isTopPinned = pinnedTopItems.includes(itemPath);
            return await PinnedItem.create(itemPath, vscode.TreeItemCollapsibleState.None, uri, index, sortedItems.length, isTopPinned);
        }));
        return items;
    }

    pinItem(itemPath: string) {
        const { pinnedItems, pinnedTopItems } = this.getPinnedItemsFromState();
        if (!pinnedItems.includes(itemPath)) {
            pinnedItems.push(itemPath);
            this.updateWorkspaceState(pinnedItems, pinnedTopItems);
        }
    }

    unpinItem(itemPath: string) {
        const { pinnedItems, pinnedTopItems } = this.getPinnedItemsFromState();
        
        const index = pinnedItems.indexOf(itemPath);
        if (index > -1) {
            pinnedItems.splice(index, 1);
        }
        
        const topIndex = pinnedTopItems.indexOf(itemPath);
        if (topIndex > -1) {
            pinnedTopItems.splice(topIndex, 1);
        }
        
        this.updateWorkspaceState(pinnedItems, pinnedTopItems);
    }

    removeDeletedFile(itemPath: string) {
        const { pinnedItems, pinnedTopItems } = this.getPinnedItemsFromState();
        
        const updatedItems = pinnedItems.filter(item => item !== itemPath);
        const updatedTopItems = pinnedTopItems.filter(item => item !== itemPath);
        
        if (updatedItems.length !== pinnedItems.length || updatedTopItems.length !== pinnedTopItems.length) {
            this.updateWorkspaceState(updatedItems, updatedTopItems);
        }
    }

    moveItem(itemPath: string, direction: 'up' | 'down' | 'top') {
        let { pinnedItems, pinnedTopItems } = this.getPinnedItemsFromState();
        
        if (direction === 'top') {
            // Add item to pinned-to-top list
            if (!pinnedTopItems.includes(itemPath)) {
                pinnedTopItems.push(itemPath);
                this.updateWorkspaceState(pinnedItems, pinnedTopItems);
            }
        } else {
            // For move up and down, operate on sorted list
            const topItems = pinnedItems.filter(item => pinnedTopItems.includes(item));
            const normalItems = pinnedItems.filter(item => !pinnedTopItems.includes(item));
            const sortedItems = [...topItems, ...normalItems];
            const index = sortedItems.indexOf(itemPath);
            
            if (index === -1) {
                return;
            }
            
            if (direction === 'up' && index > 0) {
                [sortedItems[index], sortedItems[index - 1]] = [sortedItems[index - 1], sortedItems[index]];
            } else if (direction === 'down' && index < sortedItems.length - 1) {
                [sortedItems[index], sortedItems[index + 1]] = [sortedItems[index + 1], sortedItems[index]];
            }
            
            // Rebuild pinnedItems array, maintaining original order but applying new arrangement
            pinnedItems = sortedItems;
            this.updateWorkspaceState(pinnedItems, pinnedTopItems);
        }
    }

    removeFromTop(itemPath: string) {
        const { pinnedItems, pinnedTopItems } = this.getPinnedItemsFromState();
        const index = pinnedTopItems.indexOf(itemPath);
        if (index > -1) {
            pinnedTopItems.splice(index, 1);
            this.updateWorkspaceState(pinnedItems, pinnedTopItems);
        }
    }
}

class PinnedItem extends vscode.TreeItem {
    constructor(
        public readonly path: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly uri: vscode.Uri,
        public readonly index: number,
        public readonly totalCount: number,
        public readonly isTopPinned: boolean = false
    ) {
        const fileName = pathModule.basename(path);
        
        // Use filename directly without special markers
        super(fileName, collapsibleState);
        
        this.tooltip = isTopPinned ? `📌 ${path} (Pinned to Top)` : path;
        this.command = {
            command: 'pinInExplorer.openAndReveal',
            title: 'Open and Reveal',
            arguments: [this]
        };
    }

    static async create(
        path: string,
        collapsibleState: vscode.TreeItemCollapsibleState,
        uri: vscode.Uri,
        index: number,
        totalCount: number,
        isTopPinned: boolean = false
    ): Promise<PinnedItem> {
        const item = new PinnedItem(path, collapsibleState, uri, index, totalCount, isTopPinned);
        
        try {
            const stats = await fs.promises.stat(path);
            if (stats.isDirectory()) {
                item.iconPath = isTopPinned ? new vscode.ThemeIcon('pinned') : new vscode.ThemeIcon('folder');
                item.contextValue = isTopPinned ? 'pinnedFolderAtTop' : 'pinnedFolder';
            } else {
                item.iconPath = isTopPinned ? new vscode.ThemeIcon('pinned') : new vscode.ThemeIcon('file');
                item.contextValue = isTopPinned ? 'pinnedFileAtTop' : 'pinnedFile';
            }
        } catch (error) {
            item.iconPath = new vscode.ThemeIcon('error');
            item.description = 'Path not found';
            Logger.log(`Error accessing file stats for ${path}: ${error}`);
        }
        
        return item;
    }
}

export function deactivate() {}