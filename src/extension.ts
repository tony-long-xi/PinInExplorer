import * as vscode from 'vscode';
import * as fs from 'fs';
import * as pathModule from 'path';
import { Logger } from './logger';

const PINNED_ITEMS_KEY = 'pinnedItems';
const PINNED_TOP_ITEMS_KEY = 'pinnedTopItems';
const BOOKMARKS_KEY = 'bookmarks';
const BOOKMARKS_TOP_KEY = 'bookmarksTop';
const STATUS_MESSAGE_DURATION = 1000;
const CONTEXT_UPDATE_DEBOUNCE_DELAY = 150;
const FILE_DELETION_DELAY = 100;
const FOLDER_FOCUS_ENABLED_KEY = 'folderFocusEnabled';

// Bookmark decoration types for editor
let bookmarkDecorationType: vscode.TextEditorDecorationType;
let activeBookmarkDecorationType: vscode.TextEditorDecorationType;

// Utility function to show status bar message with consistent duration
const showStatusMessage = (message: string, withIcon: boolean = false): void => {
    const icon = withIcon ? '✅ ' : '';
    vscode.window.setStatusBarMessage(`${icon}${message}`, STATUS_MESSAGE_DURATION);
};

// Utility function to get file name from path
const getFileName = (filePath: string): string => pathModule.basename(filePath);

// Interface for bookmark data
interface BookmarkData {
    filePath: string;
    line: number;
    character: number;
    label?: string;
    timestamp: number;
}

// Helper function to jump to a bookmark
const jumpToBookmark = async (bookmark: BookmarkData): Promise<void> => {
    try {
        const document = await vscode.workspace.openTextDocument(vscode.Uri.file(bookmark.filePath));
        const editor = await vscode.window.showTextDocument(document);
        
        // Jump to the bookmarked line and character
        const position = new vscode.Position(bookmark.line, bookmark.character);
        editor.selection = new vscode.Selection(position, position);
        editor.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.InCenter);
        
        showStatusMessage(`Jumped to bookmark: ${getFileName(bookmark.filePath)}:${bookmark.line + 1}`, true);
        Logger.log(`Jumped to bookmark: ${bookmark.filePath}:${bookmark.line + 1}`);
    } catch (error) {
        Logger.log(`Error jumping to bookmark ${bookmark.filePath}: ${error}`);
        vscode.window.setStatusBarMessage(`❗ Cannot open bookmark: ${getFileName(bookmark.filePath)}`, STATUS_MESSAGE_DURATION);
    }
};

// Global context reference for decoration updates
let globalContext: vscode.ExtensionContext;

// Function to update bookmark decorations in active editor
const updateBookmarkDecorations = () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor || !globalContext) {
        return;
    }
    
    const bookmarks = globalContext.workspaceState.get<BookmarkData[]>(BOOKMARKS_KEY, []);
    const currentFileBookmarks = bookmarks.filter(b => b.filePath === editor.document.uri.fsPath);
    const currentLine = editor.selection.active.line;
    
    // Separate active and normal bookmarks
    const activeBookmarks: vscode.DecorationOptions[] = [];
    const normalBookmarks: vscode.DecorationOptions[] = [];
    
    currentFileBookmarks.forEach(bookmark => {
        const decoration = {
            range: new vscode.Range(bookmark.line, 0, bookmark.line, 0),
            hoverMessage: `Bookmark: ${bookmark.label}`
        };
        
        if (bookmark.line === currentLine) {
            activeBookmarks.push(decoration);
        } else {
            normalBookmarks.push(decoration);
        }
    });
    
    // Apply decorations
    editor.setDecorations(bookmarkDecorationType, normalBookmarks);
    editor.setDecorations(activeBookmarkDecorationType, activeBookmarks);
};

export function activate(context: vscode.ExtensionContext) {
    globalContext = context;
    Logger.initialize(context);
    const extensionId = context.extension.id;
    const extensionVersion = vscode.extensions.getExtension(extensionId)?.packageJSON.version;
    Logger.log(`PinInExplorer version ${extensionVersion} is now active!`);

    // Initialize bookmark decoration types
    bookmarkDecorationType = vscode.window.createTextEditorDecorationType({
        gutterIconPath: vscode.Uri.file(pathModule.join(context.extensionPath, 'images', 'bookmark-gutter.svg')),
        gutterIconSize: 'contain',
        overviewRulerColor: '#007ACC',
        overviewRulerLane: vscode.OverviewRulerLane.Right
    });
    
    activeBookmarkDecorationType = vscode.window.createTextEditorDecorationType({
        gutterIconPath: vscode.Uri.file(pathModule.join(context.extensionPath, 'images', 'bookmark-gutter-active.svg')),
        gutterIconSize: 'contain',
        overviewRulerColor: '#FF6B35',
        overviewRulerLane: vscode.OverviewRulerLane.Right
    });

    const pinnedItemsProvider = new PinnedItemsProvider(context);
    vscode.window.registerTreeDataProvider('pinnedItems', pinnedItemsProvider);
    
    // Ensure all existing items are included in unifiedOrder at startup
    pinnedItemsProvider.ensureAllItemsInUnifiedOrder().then(() => {
        Logger.log('Initial unifiedOrder synchronization completed');
    }).catch(error => {
        Logger.log(`Error during initial unifiedOrder synchronization: ${error}`);
    });

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
        updateContextTimeout = setTimeout(async () => {
            try {
                let resourceUri = uri;
                // If no URI is passed, try to get it from the active editor
                if (!resourceUri) {
                    resourceUri = vscode.window.activeTextEditor?.document.uri;
                }

                if (resourceUri) {
                    const isPinned = isUriPinned(resourceUri);
                    try {
                        await vscode.commands.executeCommand('setContext', 'resourceIsPinned', isPinned);
                        Logger.log(`Context updated for ${resourceUri.fsPath}: isPinned=${isPinned}`);
                    } catch (error: any) {
                        Logger.log(`Error updating context for ${resourceUri.fsPath}: ${error}`);
                    }
                } else {
                    // If there's no active editor or URI, we can't determine the pin status, so set to false
                    try {
                        await vscode.commands.executeCommand('setContext', 'resourceIsPinned', false);
                        Logger.log('No active URI, context set to not pinned.');
                    } catch (error: any) {
                        Logger.log(`Error setting context to not pinned: ${error}`);
                    }
                }
            } catch (error: any) {
                Logger.log(`Unexpected error in updatePinContext: ${error}`);
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
            // Handle folder focus functionality if enabled
            handleFileDeletionForFolderFocus(uri.fsPath);
        }, FILE_DELETION_DELAY);
    });
    context.subscriptions.push(fileWatcher);

    // Folder focus functionality
    const isFolderFocusEnabled = (): boolean => {
        return context.workspaceState.get<boolean>(FOLDER_FOCUS_ENABLED_KEY, false);
    };

    const updateFolderFocusContext = async (): Promise<void> => {
        try {
            const enabled = isFolderFocusEnabled();
            await vscode.commands.executeCommand('setContext', 'pinInExplorer.folderFocusEnabled', enabled);
        } catch (error) {
            Logger.log(`Error updating folder focus context: ${error}`);
        }
    };

    // Handle file deletion for folder focus feature
    const handleFileDeletionForFolderFocus = async (deletedFilePath: string): Promise<void> => {
        if (!isFolderFocusEnabled()) {
            return;
        }

        try {
            const parentDir = pathModule.dirname(deletedFilePath);
            
            // Check if parent directory exists and is empty
            const stats = await fs.promises.stat(parentDir).catch(() => null);
            if (!stats || !stats.isDirectory()) {
                return;
            }

            const files = await fs.promises.readdir(parentDir).catch(() => []);
            
            // If directory is empty or only contains hidden files/directories
            const visibleFiles = files.filter(file => !file.startsWith('.'));
            if (visibleFiles.length === 0) {
                // Focus on the parent folder in explorer
                setTimeout(async () => {
                    try {
                        await vscode.commands.executeCommand('revealInExplorer', vscode.Uri.file(parentDir));
                        Logger.log(`Focused on empty folder: ${parentDir}`);
                    } catch (error) {
                        Logger.log(`Error focusing on folder ${parentDir}: ${error}`);
                    }
                }, 50); // Small delay to ensure file deletion is processed
            }
        } catch (error) {
            Logger.log(`Error in handleFileDeletionForFolderFocus: ${error}`);
        }
    };

    // Initialize folder focus context
    updateFolderFocusContext();

    // Listen to various events to update context and decorations
    context.subscriptions.push(
        vscode.window.onDidChangeActiveTextEditor(() => {
            updatePinContext();
            updateBookmarkDecorations();
        }),
        vscode.window.onDidChangeTextEditorSelection((e) => {
            if (e.textEditor === vscode.window.activeTextEditor) {
                updatePinContext(e.textEditor.document.uri);
                updateBookmarkDecorations();
            }
        }),
        // Listen to workspace state changes to update context when pins change
        vscode.workspace.onDidChangeConfiguration(() => updatePinContext())
    );
    
    // Initial decoration update
    updateBookmarkDecorations();

    // Note: VS Code's resourceIsPinned context is global and doesn't
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
            pinnedItemsProvider.moveItemInUnifiedList('up', item);
        }),
        vscode.commands.registerCommand('pinInExplorer.moveDown', (item: PinnedItem) => {
            pinnedItemsProvider.moveItemInUnifiedList('down', item);
        }),
        vscode.commands.registerCommand('pinInExplorer.moveToTop', (item: PinnedItem) => {
            if (item.bookmarkData) {
                pinnedItemsProvider.moveBookmarkToTop(item.bookmarkData);
            } else {
                pinnedItemsProvider.moveItem(item.path, 'top');
            }
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
            if (item.bookmarkData) {
                pinnedItemsProvider.removeBookmarkFromTop(item.bookmarkData);
            } else {
                pinnedItemsProvider.removeFromTop(item.path);
            }
        }),
        vscode.commands.registerCommand('pinInExplorer.toggleBookmark', () => {
            const editor = vscode.window.activeTextEditor;
            if (!editor) {
                vscode.window.showWarningMessage('No active editor found');
                return;
            }
            
            const document = editor.document;
            const position = editor.selection.active;
            const line = position.line;
            const character = position.character;
            const filePath = document.uri.fsPath;
            
            const bookmarks = context.workspaceState.get<BookmarkData[]>(BOOKMARKS_KEY, []);
            const existingIndex = bookmarks.findIndex(b => 
                b.filePath === filePath && b.line === line
            );
            
            if (existingIndex >= 0) {
                // Remove existing bookmark
                bookmarks.splice(existingIndex, 1);
                try {
                    context.workspaceState.update(BOOKMARKS_KEY, bookmarks);
                    pinnedItemsProvider.refresh();
                    updateBookmarkDecorations();
                    showStatusMessage(`Bookmark removed at line ${line + 1}`);
                    Logger.log(`Bookmark removed: ${filePath}:${line + 1}`);
                } catch (error: any) {
                    Logger.log(`Error updating workspace state when removing bookmark: ${error}`);
                }
            } else {
                // Add new bookmark
                const lineText = document.lineAt(line).text.trim();
                const label = lineText.length > 50 ? lineText.substring(0, 47) + '...' : lineText;
                
                const bookmark: BookmarkData = {
                    filePath,
                    line,
                    character,
                    label: label || `Line ${line + 1}`,
                    timestamp: Date.now()
                };
                
                bookmarks.push(bookmark);
                try {
                    context.workspaceState.update(BOOKMARKS_KEY, bookmarks);
                    pinnedItemsProvider.refresh();
                    updateBookmarkDecorations();
                    showStatusMessage(`Bookmark added at line ${line + 1}`, true);
                    Logger.log(`Bookmark added: ${filePath}:${line + 1}`);
                } catch (error: any) {
                    Logger.log(`Error updating workspace state when adding bookmark: ${error}`);
                }
            }
        }),
        vscode.commands.registerCommand('pinInExplorer.removeBookmark', (item: PinnedItem) => {
            if (item.bookmarkData) {
                const bookmarks = context.workspaceState.get<BookmarkData[]>(BOOKMARKS_KEY, []);
                const filteredBookmarks = bookmarks.filter(b => 
                    !(b.filePath === item.bookmarkData!.filePath && b.line === item.bookmarkData!.line)
                );
                try {
                    context.workspaceState.update(BOOKMARKS_KEY, filteredBookmarks);
                    
                    // Also remove from top bookmarks if present
                    const topBookmarks = context.workspaceState.get<string[]>(BOOKMARKS_TOP_KEY, []);
                    const bookmarkId = `${item.bookmarkData.filePath}:${item.bookmarkData.line}`;
                    const filteredTopBookmarks = topBookmarks.filter(id => id !== bookmarkId);
                    context.workspaceState.update(BOOKMARKS_TOP_KEY, filteredTopBookmarks);
                    
                    pinnedItemsProvider.refresh();
                    // Update bookmark decorations to remove the gutter icon
                    updateBookmarkDecorations();
                    showStatusMessage(`Bookmark removed: ${item.bookmarkData.label}`);
                    Logger.log(`Bookmark removed: ${item.bookmarkData.filePath}:${item.bookmarkData.line + 1}`);
                } catch (error: any) {
                    Logger.log(`Error updating workspace state when removing bookmark: ${error}`);
                }
             }
         }),
         vscode.commands.registerCommand('pinInExplorer.openBookmark', async (item: PinnedItem) => {
             if (item.bookmarkData) {
                 try {
                     const document = await vscode.workspace.openTextDocument(item.uri);
                     const editor = await vscode.window.showTextDocument(document);
                     
                     // Jump to the bookmarked line and character
                     const position = new vscode.Position(item.bookmarkData.line, item.bookmarkData.character);
                     editor.selection = new vscode.Selection(position, position);
                     editor.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.InCenter);
                     
                     Logger.log(`Jumped to bookmark: ${item.bookmarkData.filePath}:${item.bookmarkData.line + 1}`);
                 } catch (error) {
                     Logger.log(`Error opening bookmark ${item.bookmarkData.filePath}: ${error}`);
                     vscode.window.setStatusBarMessage(`❗ Cannot open bookmark: ${getFileName(item.bookmarkData.filePath)}`, STATUS_MESSAGE_DURATION);
                 }
             }
         }),
         vscode.commands.registerCommand('pinInExplorer.nextBookmark', () => {
             const bookmarks = context.workspaceState.get<BookmarkData[]>(BOOKMARKS_KEY, []);
             if (bookmarks.length === 0) {
                 vscode.window.showInformationMessage('No bookmarks found');
                 return;
             }
             
             const editor = vscode.window.activeTextEditor;
             if (!editor) {
                 // No active editor, jump to first bookmark
                 jumpToBookmark(bookmarks[0]);
                 return;
             }
             
             const currentFile = editor.document.uri.fsPath;
             const currentLine = editor.selection.active.line;
             
             // Find next bookmark after current position
             let nextBookmark: BookmarkData | undefined;
             
             // Sort bookmarks by file path and line number
             const sortedBookmarks = [...bookmarks].sort((a, b) => {
                 if (a.filePath !== b.filePath) {
                     return a.filePath.localeCompare(b.filePath);
                 }
                 return a.line - b.line;
             });
             
             // Find current position in sorted list
             for (let i = 0; i < sortedBookmarks.length; i++) {
                 const bookmark = sortedBookmarks[i];
                 if (bookmark.filePath > currentFile || 
                     (bookmark.filePath === currentFile && bookmark.line > currentLine)) {
                     nextBookmark = bookmark;
                     break;
                 }
             }
             
             // If no next bookmark found, wrap to first
             if (!nextBookmark) {
                 nextBookmark = sortedBookmarks[0];
             }
             
             jumpToBookmark(nextBookmark);
         }),
         vscode.commands.registerCommand('pinInExplorer.previousBookmark', () => {
             const bookmarks = context.workspaceState.get<BookmarkData[]>(BOOKMARKS_KEY, []);
             if (bookmarks.length === 0) {
                 vscode.window.showInformationMessage('No bookmarks found');
                 return;
             }
             
             const editor = vscode.window.activeTextEditor;
             if (!editor) {
                 // No active editor, jump to last bookmark
                 jumpToBookmark(bookmarks[bookmarks.length - 1]);
                 return;
             }
             
             const currentFile = editor.document.uri.fsPath;
             const currentLine = editor.selection.active.line;
             
             // Find previous bookmark before current position
             let previousBookmark: BookmarkData | undefined;
             
             // Sort bookmarks by file path and line number (reverse)
             const sortedBookmarks = [...bookmarks].sort((a, b) => {
                 if (a.filePath !== b.filePath) {
                     return b.filePath.localeCompare(a.filePath);
                 }
                 return b.line - a.line;
             });
             
             // Find current position in sorted list
             for (let i = 0; i < sortedBookmarks.length; i++) {
                 const bookmark = sortedBookmarks[i];
                 if (bookmark.filePath < currentFile || 
                     (bookmark.filePath === currentFile && bookmark.line < currentLine)) {
                     previousBookmark = bookmark;
                     break;
                 }
             }
             
             // If no previous bookmark found, wrap to last
             if (!previousBookmark) {
                 previousBookmark = sortedBookmarks[0];
             }
             
             jumpToBookmark(previousBookmark);
         }),
         // Title bar navigation: jump to next bookmark within current file
        vscode.commands.registerCommand('pinInExplorer.nextBookmarkInFile', () => {
            const editor = vscode.window.activeTextEditor;
            if (!editor) {
                vscode.window.showWarningMessage('No active editor found');
                return;
            }
            
            const currentFile = editor.document.uri.fsPath;
            const currentLine = editor.selection.active.line;
            const bookmarks = context.workspaceState.get<BookmarkData[]>(BOOKMARKS_KEY, []);
            
            // Filter bookmarks for current file
            const fileBookmarks = bookmarks.filter(b => b.filePath === currentFile)
                .sort((a, b) => a.line - b.line);
            
            if (fileBookmarks.length === 0) {
                vscode.window.showInformationMessage('No bookmarks in current file');
                return;
            }
            
            // Find next bookmark in current file
            let nextBookmark = fileBookmarks.find(b => b.line > currentLine);
            
            // If no next bookmark found, wrap to first
            if (!nextBookmark) {
                nextBookmark = fileBookmarks[0];
            }
            
            jumpToBookmark(nextBookmark);
        }),
         // Title bar navigation: jump to previous bookmark within current file
        vscode.commands.registerCommand('pinInExplorer.previousBookmarkInFile', () => {
            const editor = vscode.window.activeTextEditor;
            if (!editor) {
                vscode.window.showWarningMessage('No active editor found');
                return;
            }
            
            const currentFile = editor.document.uri.fsPath;
            const currentLine = editor.selection.active.line;
            const bookmarks = context.workspaceState.get<BookmarkData[]>(BOOKMARKS_KEY, []);
            
            // Filter bookmarks for current file
            const fileBookmarks = bookmarks.filter(b => b.filePath === currentFile)
                .sort((a, b) => b.line - a.line); // Reverse sort
            
            if (fileBookmarks.length === 0) {
                vscode.window.showInformationMessage('No bookmarks in current file');
                return;
            }
            
            // Find previous bookmark in current file
            let previousBookmark = fileBookmarks.find(b => b.line < currentLine);
            
            // If no previous bookmark found, wrap to last
            if (!previousBookmark) {
                previousBookmark = fileBookmarks[0];
            }
            
            jumpToBookmark(previousBookmark);
        }),
         // Title bar navigation: jump to next file containing bookmarks
        vscode.commands.registerCommand('pinInExplorer.nextBookmarkFile', () => {
            const bookmarks = context.workspaceState.get<BookmarkData[]>(BOOKMARKS_KEY, []);
            if (bookmarks.length === 0) {
                vscode.window.showInformationMessage('No bookmarks found');
                return;
            }
            
            const editor = vscode.window.activeTextEditor;
            const currentFile = editor ? editor.document.uri.fsPath : '';
            
            // Group bookmarks by file and get first bookmark of each file
            const fileBookmarksMap = new Map<string, BookmarkData>();
            bookmarks.forEach(bookmark => {
                if (!fileBookmarksMap.has(bookmark.filePath)) {
                    fileBookmarksMap.set(bookmark.filePath, bookmark);
                } else {
                    const existing = fileBookmarksMap.get(bookmark.filePath)!;
                    if (bookmark.line < existing.line) {
                        fileBookmarksMap.set(bookmark.filePath, bookmark);
                    }
                }
            });
            
            // Sort files by path
            const sortedFiles = Array.from(fileBookmarksMap.keys()).sort();
            
            if (sortedFiles.length === 0) {
                vscode.window.showInformationMessage('No bookmarks found');
                return;
            }
            
            // Find next file after current
            let nextFile: string | undefined;
            if (currentFile) {
                const currentIndex = sortedFiles.indexOf(currentFile);
                if (currentIndex >= 0 && currentIndex < sortedFiles.length - 1) {
                    nextFile = sortedFiles[currentIndex + 1];
                }
            }
            
            // If no next file found or no current file, wrap to first
            if (!nextFile) {
                nextFile = sortedFiles[0];
            }
            
            const targetBookmark = fileBookmarksMap.get(nextFile)!;
            jumpToBookmark(targetBookmark);
        }),
         // Title bar navigation: jump to previous file containing bookmarks
        vscode.commands.registerCommand('pinInExplorer.previousBookmarkFile', () => {
            const bookmarks = context.workspaceState.get<BookmarkData[]>(BOOKMARKS_KEY, []);
            if (bookmarks.length === 0) {
                vscode.window.showInformationMessage('No bookmarks found');
                return;
            }
            
            const editor = vscode.window.activeTextEditor;
            const currentFile = editor ? editor.document.uri.fsPath : '';
            
            // Group bookmarks by file and get first bookmark of each file
            const fileBookmarksMap = new Map<string, BookmarkData>();
            bookmarks.forEach(bookmark => {
                if (!fileBookmarksMap.has(bookmark.filePath)) {
                    fileBookmarksMap.set(bookmark.filePath, bookmark);
                } else {
                    const existing = fileBookmarksMap.get(bookmark.filePath)!;
                    if (bookmark.line < existing.line) {
                        fileBookmarksMap.set(bookmark.filePath, bookmark);
                    }
                }
            });
            
            // Sort files by path
            const sortedFiles = Array.from(fileBookmarksMap.keys()).sort();
            
            if (sortedFiles.length === 0) {
                vscode.window.showInformationMessage('No bookmarks found');
                return;
            }
            
            // Find previous file before current
            let previousFile: string | undefined;
            if (currentFile) {
                const currentIndex = sortedFiles.indexOf(currentFile);
                if (currentIndex > 0) {
                    previousFile = sortedFiles[currentIndex - 1];
                }
            }
            
            // If no previous file found or no current file, wrap to last
            if (!previousFile) {
                previousFile = sortedFiles[sortedFiles.length - 1];
            }
            
            const targetBookmark = fileBookmarksMap.get(previousFile)!;
            jumpToBookmark(targetBookmark);
        }),
        // Toggle folder focus feature (enable)
        vscode.commands.registerCommand('pinInExplorer.toggleFolderFocus', async () => {
            const currentState = isFolderFocusEnabled();
            const newState = !currentState;
            
            try {
                await context.workspaceState.update(FOLDER_FOCUS_ENABLED_KEY, newState);
                await updateFolderFocusContext();
                
                const statusMessage = newState 
                    ? 'Keep Folder focus on last file deletion: Enabled' 
                    : 'Keep Folder focus on last file deletion: Disabled';
                showStatusMessage(statusMessage, newState);
                
                Logger.log(`Folder focus feature ${newState ? 'enabled' : 'disabled'}`);
            } catch (error) {
                Logger.log(`Error toggling folder focus: ${error}`);
                vscode.window.showErrorMessage('Failed to toggle folder focus feature');
            }
        }),
        // Toggle folder focus feature (disable)
        vscode.commands.registerCommand('pinInExplorer.toggleFolderFocusDisable', async () => {
            const currentState = isFolderFocusEnabled();
            const newState = !currentState;
            
            try {
                await context.workspaceState.update(FOLDER_FOCUS_ENABLED_KEY, newState);
                await updateFolderFocusContext();
                
                const statusMessage = newState 
                    ? 'Folder focus on file deletion: Enabled' 
                    : 'Folder focus on file deletion: Disabled';
                showStatusMessage(statusMessage, newState);
                
                Logger.log(`Folder focus feature ${newState ? 'enabled' : 'disabled'}`);
            } catch (error) {
                Logger.log(`Error toggling folder focus: ${error}`);
                vscode.window.showErrorMessage('Failed to toggle folder focus feature');
            }
        })
    );

    context.subscriptions.push({ 
        dispose: () => {
            // Clean up timer
            if (updateContextTimeout) {
                clearTimeout(updateContextTimeout);
            }
            
            // Dispose file watcher
            if (fileWatcher) {
                fileWatcher.dispose();
                Logger.log('File watcher disposed');
            }
            
            // Dispose bookmark decoration types
            if (bookmarkDecorationType) {
                bookmarkDecorationType.dispose();
                Logger.log('Bookmark decoration type disposed');
            }
            if (activeBookmarkDecorationType) {
                activeBookmarkDecorationType.dispose();
                Logger.log('Active bookmark decoration type disposed');
            }
            
            // Clear global context reference
            globalContext = undefined as any;
            
            Logger.log('Extension resources cleaned up successfully');
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
        try {
            this.context.workspaceState.update(PINNED_ITEMS_KEY, pinnedItems);
            this.context.workspaceState.update(PINNED_TOP_ITEMS_KEY, pinnedTopItems);
            this._onDidChangeTreeData.fire();
        } catch (error: any) {
            Logger.log(`Error updating workspace state: ${error}`);
        }
    }

    // Public method to refresh the tree
    refresh(): void {
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
            return [];
        }

        const { pinnedItems, pinnedTopItems } = this.getPinnedItemsFromState();
        const bookmarks = this.context.workspaceState.get<BookmarkData[]>(BOOKMARKS_KEY, []);
        const topBookmarks = this.context.workspaceState.get<string[]>(BOOKMARKS_TOP_KEY, []);
        let unifiedOrder = this.context.workspaceState.get<Array<{type: 'file' | 'folder' | 'bookmark', id: string}>>('unifiedOrder', []);

        const fileMap = new Map(pinnedItems.map(p => [p, p]));
        const bookmarkMap = new Map(bookmarks.map(b => [`${b.filePath}:${b.line}`, b]));

        const currentFileIds = new Set(pinnedItems);
        const currentBookmarkIds = new Set(bookmarks.map(b => `${b.filePath}:${b.line}`));

        // Filter out items from unifiedOrder that no longer exist
        unifiedOrder = unifiedOrder.filter(orderItem => {
            return (orderItem.type === 'file' && currentFileIds.has(orderItem.id)) ||
                   (orderItem.type === 'bookmark' && currentBookmarkIds.has(orderItem.id));
        });

        const orderedIds = new Set(unifiedOrder.map(item => item.id));

        // Add new items that are not in the order yet
        const newFiles = pinnedItems.filter(p => !orderedIds.has(p));
        const newBookmarks = bookmarks.filter(b => !orderedIds.has(`${b.filePath}:${b.line}`));

        if (newFiles.length > 0 || newBookmarks.length > 0) {
            newFiles.forEach(p => unifiedOrder.push({ type: 'file', id: p }));
            newBookmarks.forEach(b => unifiedOrder.push({ type: 'bookmark', id: `${b.filePath}:${b.line}` }));
            await this.context.workspaceState.update('unifiedOrder', unifiedOrder);
        }

        const topItems: PinnedItem[] = [];
        const regularItems: PinnedItem[] = [];
        
        for (const orderItem of unifiedOrder) {
            if (orderItem.type === 'file') {
                const itemPath = fileMap.get(orderItem.id);
                if (itemPath) {
                    const isTop = pinnedTopItems.includes(itemPath);
                    const item = await PinnedItem.create(itemPath, vscode.TreeItemCollapsibleState.None, vscode.Uri.file(itemPath), 0, 0, isTop);
                    if (isTop) {
                        topItems.push(item);
                    } else {
                        regularItems.push(item);
                    }
                }
            } else {
                const bookmark = bookmarkMap.get(orderItem.id);
                if (bookmark) {
                    const isTop = topBookmarks.includes(orderItem.id);
                    const item = await PinnedItem.createBookmark(bookmark, vscode.TreeItemCollapsibleState.None, vscode.Uri.file(bookmark.filePath), 0, 0, isTop);
                    if (isTop) {
                        topItems.push(item);
                    } else {
                        regularItems.push(item);
                    }
                }
            }
        }

        // Return top items first, then regular items
        return [...topItems, ...regularItems];
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
        if (direction === 'top') {
            // Add item to pinned-to-top list
            let { pinnedItems, pinnedTopItems } = this.getPinnedItemsFromState();
            if (!pinnedTopItems.includes(itemPath)) {
                pinnedTopItems.push(itemPath);
                this.updateWorkspaceState(pinnedItems, pinnedTopItems);
            }
        }
        // Note: 'up' and 'down' movements are now handled by moveItemInUnifiedList method
    }

    removeFromTop(itemPath: string) {
        const { pinnedItems, pinnedTopItems } = this.getPinnedItemsFromState();
        const index = pinnedTopItems.indexOf(itemPath);
        if (index > -1) {
            pinnedTopItems.splice(index, 1);
            this.updateWorkspaceState(pinnedItems, pinnedTopItems);
        }
    }

    moveBookmarkToTop(bookmarkData: BookmarkData) {
        const topBookmarks = this.context.workspaceState.get<string[]>(BOOKMARKS_TOP_KEY, []);
        const bookmarkId = `${bookmarkData.filePath}:${bookmarkData.line}`;
        
        if (!topBookmarks.includes(bookmarkId)) {
            topBookmarks.push(bookmarkId);
            try {
                this.context.workspaceState.update(BOOKMARKS_TOP_KEY, topBookmarks);
                this._onDidChangeTreeData.fire();
            } catch (error: any) {
                Logger.log(`Error updating workspace state when moving bookmark to top: ${error}`);
            }
        }
    }

    removeBookmarkFromTop(bookmarkData: BookmarkData) {
        const topBookmarks = this.context.workspaceState.get<string[]>(BOOKMARKS_TOP_KEY, []);
        const bookmarkId = `${bookmarkData.filePath}:${bookmarkData.line}`;
        const index = topBookmarks.indexOf(bookmarkId);
        
        if (index > -1) {
            topBookmarks.splice(index, 1);
            try {
                this.context.workspaceState.update(BOOKMARKS_TOP_KEY, topBookmarks);
                this._onDidChangeTreeData.fire();
            } catch (error: any) {
                Logger.log(`Error updating workspace state when removing bookmark from top: ${error}`);
            }
        }
    }

    // Note: Bookmark movement is now handled by moveItemInUnifiedList method

    // Ensure all current files, folders and bookmarks are included in unifiedOrder
    public async ensureAllItemsInUnifiedOrder(): Promise<void> {
        const { pinnedItems } = this.getPinnedItemsFromState();
        const bookmarks = this.context.workspaceState.get<BookmarkData[]>(BOOKMARKS_KEY, []);
        let unifiedOrder = this.context.workspaceState.get<Array<{type: 'file' | 'folder' | 'bookmark', id: string}>>('unifiedOrder', []);

        const currentFileIds = new Set(pinnedItems);
        const currentBookmarkIds = new Set(bookmarks.map(b => `${b.filePath}:${b.line}`));

        // Filter out items that no longer exist
        unifiedOrder = unifiedOrder.filter(orderItem => {
            return (orderItem.type === 'file' && currentFileIds.has(orderItem.id)) ||
                   (orderItem.type === 'folder' && currentFileIds.has(orderItem.id)) ||
                   (orderItem.type === 'bookmark' && currentBookmarkIds.has(orderItem.id));
        });

        const orderedIds = new Set(unifiedOrder.map(item => item.id));

        // Add missing items, need to distinguish between files and folders
        const newItems = pinnedItems.filter(p => !orderedIds.has(p));
        const newBookmarks = bookmarks.filter(b => !orderedIds.has(`${b.filePath}:${b.line}`));

        let hasChanges = false;
        if (newItems.length > 0) {
            // Asynchronously check whether each new item is a file or folder
            for (const itemPath of newItems) {
                try {
                    const stats = await fs.promises.stat(itemPath);
                    const itemType = stats.isDirectory() ? 'folder' : 'file';
                    unifiedOrder.push({ type: itemType, id: itemPath });
                    Logger.log(`Added missing ${itemType} to unifiedOrder: ${itemPath}`);
                    hasChanges = true;
                } catch (error) {
                    // If file cannot be accessed, default to treating as file
                    unifiedOrder.push({ type: 'file', id: itemPath });
                    Logger.log(`Added missing item (default as file) to unifiedOrder: ${itemPath}`);
                    hasChanges = true;
                }
            }
        }
        
        if (newBookmarks.length > 0) {
            newBookmarks.forEach(b => {
                const id = `${b.filePath}:${b.line}`;
                unifiedOrder.push({ type: 'bookmark', id });
                Logger.log(`Added missing bookmark to unifiedOrder: ${id}`);
            });
            hasChanges = true;
        }

        if (hasChanges) {
            await this.context.workspaceState.update('unifiedOrder', unifiedOrder);
            Logger.log(`Updated unifiedOrder with ${newItems.length} items and ${newBookmarks.length} bookmarks`);
        }
    }

    // Item movement within Pins view: adjust display order of bookmark/file/folder within their respective areas
    // Items in pinned and regular areas can only move within their own area, not across areas
    // This functionality is completely independent of the title bar bookmark navigation
    public async moveItemInUnifiedList(direction: 'up' | 'down', itemToMove: PinnedItem) {
        let unifiedOrder = this.context.workspaceState.get<Array<{type: 'file' | 'folder' | 'bookmark', id: string}>>('unifiedOrder', []);
        const idToMove = itemToMove.bookmarkData ? `${itemToMove.bookmarkData.filePath}:${itemToMove.bookmarkData.line}` : itemToMove.path;

        // Get current item index in unified list
        let currentIndex = unifiedOrder.findIndex(item => item.id === idToMove);
        if (currentIndex === -1) {
            // If item not in unifiedOrder, it might be auto-loaded at startup
            // Need to ensure all items are in unifiedOrder first
            Logger.log(`Item not found in unifiedOrder: ${idToMove}, triggering refresh`);
            await this.ensureAllItemsInUnifiedOrder();
            // Re-fetch updated unifiedOrder
            unifiedOrder = this.context.workspaceState.get<Array<{type: 'file' | 'folder' | 'bookmark', id: string}>>('unifiedOrder', []);
            currentIndex = unifiedOrder.findIndex(item => item.id === idToMove);
            if (currentIndex === -1) {
                Logger.log(`Item still not found after refresh: ${idToMove}`);
                return;
            }
        }

        // Get all item IDs in pinned area
        const { pinnedTopItems } = this.getPinnedItemsFromState();
        const topBookmarks = this.context.workspaceState.get<string[]>(BOOKMARKS_TOP_KEY, []);
        const topItemIds = new Set([...pinnedTopItems, ...topBookmarks]);

        // Determine if current item is in pinned area
        const isCurrentItemInTopArea = topItemIds.has(idToMove);

        // Find all item indices within the same area
        const sameAreaIndices: number[] = [];
        unifiedOrder.forEach((item, index) => {
            const isItemInTopArea = topItemIds.has(item.id);
            if (isItemInTopArea === isCurrentItemInTopArea) {
                sameAreaIndices.push(index);
            }
        });

        // Find current item's relative position within the same area
        const currentRelativeIndex = sameAreaIndices.indexOf(currentIndex);
        if (currentRelativeIndex === -1) {
            Logger.log(`Current item not found in same area indices`);
            return;
        }

        // Calculate target relative position
        let targetRelativeIndex: number;
        if (direction === 'up') {
            targetRelativeIndex = currentRelativeIndex - 1;
        } else {
            targetRelativeIndex = currentRelativeIndex + 1;
        }

        // Check if exceeding same area boundaries
        if (targetRelativeIndex < 0 || targetRelativeIndex >= sameAreaIndices.length) {
            return; // Cannot move out of current area
        }

        // Get actual index of target position
        const targetIndex = sameAreaIndices[targetRelativeIndex];

        // Execute position swap
        [unifiedOrder[currentIndex], unifiedOrder[targetIndex]] = [unifiedOrder[targetIndex], unifiedOrder[currentIndex]];

        // Update state and refresh view
        await this.context.workspaceState.update('unifiedOrder', unifiedOrder);
        this._onDidChangeTreeData.fire();
    }
}

class PinnedItem extends vscode.TreeItem {
    constructor(
        public readonly path: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly uri: vscode.Uri,
        public readonly index: number,
        public readonly totalCount: number,
        public readonly isTopPinned: boolean = false,
        public readonly bookmarkData?: BookmarkData
    ) {
        let displayName: string;
        let tooltip: string;
        
        if (bookmarkData) {
            // This is a bookmark item
            const fileName = pathModule.basename(bookmarkData.filePath);
            displayName = `${fileName}:${bookmarkData.line + 1} - ${bookmarkData.label}`;
            tooltip = isTopPinned 
                ? `📌 Bookmark: ${bookmarkData.filePath}:${bookmarkData.line + 1} (Pinned to Top)\n${bookmarkData.label}` 
                : `Bookmark: ${bookmarkData.filePath}:${bookmarkData.line + 1}\n${bookmarkData.label}`;
        } else {
            // This is a file/folder item
            const fileName = pathModule.basename(path);
            displayName = fileName;
            tooltip = isTopPinned ? `📌 ${path} (Pinned to Top)` : path;
        }
        
        super(displayName, collapsibleState);
        
        this.tooltip = tooltip;
        this.command = {
            command: bookmarkData ? 'pinInExplorer.openBookmark' : 'pinInExplorer.openAndReveal',
            title: bookmarkData ? 'Jump to Bookmark' : 'Open and Reveal',
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

    static async createBookmark(
        bookmarkData: BookmarkData,
        collapsibleState: vscode.TreeItemCollapsibleState,
        uri: vscode.Uri,
        index: number,
        totalCount: number,
        isTopPinned: boolean = false
    ): Promise<PinnedItem> {
        const item = new PinnedItem(bookmarkData.filePath, collapsibleState, uri, index, totalCount, isTopPinned, bookmarkData);
        
        try {
            await fs.promises.access(bookmarkData.filePath);
            // Use bookmark icon for bookmarks
            item.iconPath = isTopPinned ? new vscode.ThemeIcon('pinned') : new vscode.ThemeIcon('bookmark');
            item.contextValue = isTopPinned ? 'pinnedBookmarkAtTop' : 'pinnedBookmark';
        } catch (error) {
            item.iconPath = new vscode.ThemeIcon('error');
            item.description = 'File not found';
            Logger.log(`Error accessing bookmark file ${bookmarkData.filePath}: ${error}`);
        }
        
        return item;
    }
}

export function deactivate() {
    if (bookmarkDecorationType) {
        bookmarkDecorationType.dispose();
    }
    if (activeBookmarkDecorationType) {
        activeBookmarkDecorationType.dispose();
    }
}