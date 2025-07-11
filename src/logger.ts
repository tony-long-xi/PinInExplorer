import * as vscode from 'vscode';

export class Logger {
    private static outputChannel?: vscode.OutputChannel;

    private static get isLoggingEnabled(): boolean {
        return vscode.workspace.getConfiguration('pinInExplorer.logging').get('enabled', false);
    }

    public static initialize(context: vscode.ExtensionContext) {
        context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('pinInExplorer.logging.enabled')) {
                this.updateChannelVisibility();
            }
        }));
        this.updateChannelVisibility();
    }

    private static updateChannelVisibility() {
        if (this.isLoggingEnabled) {
            if (!this.outputChannel) {
                this.outputChannel = vscode.window.createOutputChannel('PinInExplorer');
            }
        } else {
            if (this.outputChannel) {
                this.outputChannel.hide();
                this.outputChannel.dispose();
                this.outputChannel = undefined;
            }
        }
    }

    public static log(message: string, ...args: any[]) {
        if (!this.isLoggingEnabled) {
            return;
        }
        
        if (!this.outputChannel) {
            // Should not happen if initialize is called, but as a fallback
            console.log(`(PinInExplorer fallback log) ${message}`, ...args);
            return;
        }

        const formattedMessage = `${new Date().toISOString()} - ${message}`;
        this.outputChannel.appendLine(formattedMessage);

        if (args.length > 0) {
            const formattedArgs = args.map(arg => {
                try {
                    if (arg instanceof vscode.Uri) {
                        return arg.toString();
                    }
                    return JSON.stringify(arg, null, 2);
                } catch (e) {
                    return `(Unserializable object)`;
                }
            }).join(' ');
            this.outputChannel.appendLine(`> ${formattedArgs}`);
        }
    }

    public static dispose() {
        if (this.outputChannel) {
            this.outputChannel.dispose();
        }
    }
}