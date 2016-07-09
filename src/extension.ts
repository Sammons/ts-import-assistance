'use strict';

// for typescript, simple solution for auto importing on demand.
import * as vscode from 'vscode';
import * as path from 'path';

const nodeLibs =
    ['path', 'events', 'child_process', 'fs', 'os', 'net', 'crypto',
        'util', 'stream', 'readline', 'tty', 'repl', 'punycode', 'querystring',
        'string_decoder', 'http', 'https', 'cluster', 'assert', 'dgram', 'url', 'vm', 'zlib', 'dns'];
const newLine = '\n';//TODO: would it actually be better to be platform specific? I'm not convinced.
const tsImportAssistanceCommandName = 'extension.resolveMissingImportsForHighlighted';

type ImportDetails = { symbolToImport: string; path: string; symbolInfo: vscode.SymbolInformation };

class TSImportAssistance {
    activeFile = vscode.window.activeTextEditor.document.fileName;
    activeDir = path.parse(this.activeFile).dir;
    insertPosition = new vscode.Position(0, 0);
    _textBeforeOrInCursor: string = null;
    _textFragmentsInSelectionOrBeforeCursor: string[] = null;

    moveImportInsertsToSecondLineIfUseStrictEnabled(): void {
        let selection = vscode.window.activeTextEditor.selection;

        if (selection.isEmpty) {
            let range = new vscode.Range(new vscode.Position(0, 0), selection.start);
            this._textBeforeOrInCursor = vscode.window.activeTextEditor.document.getText(range);
        } else {
            this._textBeforeOrInCursor = vscode.window.activeTextEditor.document.getText(selection);
        }
        // TODO: super finicky with wierd symbols, but gets the job done for me.
        this._textFragmentsInSelectionOrBeforeCursor =
            this._textBeforeOrInCursor.split(/[\s\{\}\(\)\`\'\"\[\]\;\*\-\%\@\~\/\<\>\.]/gm)
                .filter(s => s.trim() !== '');

        let startOfFile =
            vscode.window.activeTextEditor.document.getText(new vscode.Range(
                new vscode.Position(0, 0),
                new vscode.Position(0, "'use strict'".length)
            ));
        if (startOfFile.replace(/\"/g, '\'') === "'use strict'") {
            this.insertPosition = new vscode.Position(1, 0);
        }
    }

    constructor() {
        this.moveImportInsertsToSecondLineIfUseStrictEnabled();
    }

    cleanPathToImportFrom(pathStr: string): string {
        let cleanPath = pathStr;
        if (!nodeLibs.find(s => s === pathStr)) {
            let resolvedPosixPath = path.normalize(pathStr).replace(/\\/gm, '/');
            // apparently this can re-introduce backslashes
            resolvedPosixPath = path.relative(this.activeDir, resolvedPosixPath);
            cleanPath = resolvedPosixPath.replace(/(\.js)|(\.d.ts)|(\.ts)|(\.tsx)$/gm, '');
        }
        if (cleanPath != pathStr && pathStr[0] != '.') {
            cleanPath = './' + cleanPath;
        }
        if (cleanPath.substr(0, './../'.length) === './../') {
            cleanPath = cleanPath.substr('./'.length);
        }
        if (cleanPath.includes('node_modules')) {
            cleanPath = cleanPath.split('node_modules/').pop();
        }
        if (cleanPath.includes('typings')) {
            // typings is usually structured like this:
            // typings/browser/definitions/whatever/index.d.ts
            // typings/main/definitions/whatever/index.d.ts
            cleanPath = cleanPath.split('definitions/').pop().split('/')[0];
        }
        // make sure no backslashes make it through
        cleanPath = cleanPath.replace(/\\/gm, '/');
        return cleanPath;
    }

    constructImportStatement(details: ImportDetails): string {
        let cleanPath = this.cleanPathToImportFrom(details.path);
        if (nodeLibs.find(s => s === cleanPath) || cleanPath === details.symbolToImport) {
            return `import * as ${details.symbolToImport} from '${cleanPath}';${newLine}`;
        } else {
            return `import {${details.symbolToImport}} from '${cleanPath}';${newLine}`;
        }
    }

    addToImports(details: ImportDetails): PromiseLike<boolean> {
        return vscode.window.activeTextEditor.edit((editbuilder) => {
            let importStatement = this.constructImportStatement(details);
            editbuilder.insert(this.insertPosition, importStatement);
        });
    };

    getCurrentImports() {
        let documentText = vscode.window.activeTextEditor.document.getText().replace(/\r\n/gm, '\n');
        let importLines = documentText.split(/\n/gm).filter(l => /^import/.test(l.trim()));
        let imports = importLines.map(i => i.split('from').pop().replace(/[\';\"]*/gm, '').trim());
        return imports;
    }

    getCoreModuleUsage(str: string) {
        let pieces = str.split('.');
        let coreModule = nodeLibs.find(n => n === pieces[0]);
        return coreModule;
    };

    guessSymbolToImport(): string {
        // TODO: maybe iterate and reject symbols till we get one that could work? usually doesn't matter
        let selectionText = this._textFragmentsInSelectionOrBeforeCursor[
            this._textFragmentsInSelectionOrBeforeCursor.length - 1
        ];
        console.log('cur symbol text', selectionText);
        let modul = this.getCoreModuleUsage(selectionText);
        if (modul) {
            return modul;
        }
        return selectionText;
    }

    runBuiltinSymbolSearch(symbolToTryToImport: string): PromiseLike<vscode.SymbolInformation[]> {
        return vscode.commands.executeCommand('vscode.executeWorkspaceSymbolProvider', symbolToTryToImport);
    }

    filterSymbolInformationToRelevant(symbolInfo: vscode.SymbolInformation[], desiredSymbolStr: string) {
        return symbolInfo.filter(
            r => r.location.uri.fsPath !== this.activeFile // importing from current file isn't useful
                && r.name === desiredSymbolStr // must match
        );
    }


    getSetOfCleanFsPathsFromSymbolInfos(symbolInfos: vscode.SymbolInformation[]): Array<string> {
        let paths = {};
        symbolInfos.map(r => r.location.uri.fsPath).forEach(p => paths[this.cleanPathToImportFrom(p)] = true);
        return Object.keys(paths);
    }

    pickSymbolToUseInImport(symbolInfos: vscode.SymbolInformation[], desiredSymbolStr: string): PromiseLike<ImportDetails> {
        console.log('possibilities', symbolInfos);
        let paths = this.getSetOfCleanFsPathsFromSymbolInfos(symbolInfos);
        return vscode.window.showQuickPick(paths, {
            placeHolder: 'Choose which location you intended to import from.'
        }).then(userPick => {
            console.log('picked', userPick);
            if (!userPick) {
                return null;
            }
            let symbolInfosMatchingUserChoice = symbolInfos.filter(
                r => this.cleanPathToImportFrom(r.location.uri.fsPath) === userPick);

            let choicesMatchingNodeLibs = symbolInfosMatchingUserChoice.filter(
                r => !!nodeLibs.find(l => l === r.containerName));

            if (choicesMatchingNodeLibs.length > 0) {
                let choice = choicesMatchingNodeLibs[0];
                console.log('picking node lib', choice.containerName);
                return { symbolToImport: desiredSymbolStr, path: choice.containerName, symbolInfo: choice };
            } else {
                // TODO: consider, what if symbolInfosMatchingUserChoice.length > 1 ?
                let choice = symbolInfosMatchingUserChoice[0];
                console.log('picking the first selection');
                return { symbolToImport: desiredSymbolStr, path: choice.location.uri.fsPath, symbolInfo: choice };
            }
        });
    }

    // can return null
    searchForSymbolInWorkspace(symbolToTryToImport: string): PromiseLike<ImportDetails> | ImportDetails {
        if (nodeLibs.find(s => s === symbolToTryToImport)) {
            return { // just short cut to return node module such as 'fs'
                symbolInfo: null,
                path: symbolToTryToImport,
                symbolToImport: symbolToTryToImport
            };
        }
        return Promise.resolve(this.runBuiltinSymbolSearch(
            symbolToTryToImport).then((allFoundSymbolInfos): PromiseLike<ImportDetails> | ImportDetails => {
                let symbolInfos = this.filterSymbolInformationToRelevant(allFoundSymbolInfos, symbolToTryToImport);
                if (symbolInfos.length === 0) {
                    return null;
                }
                if (symbolInfos.length > 1) {
                    return this.pickSymbolToUseInImport(symbolInfos, symbolToTryToImport);
                }
                // or there is only one choice to try
                return { symbolToImport: symbolToTryToImport, path: symbolInfos[0].location.uri.fsPath, symbolInfo: symbolInfos[0] };
            })).catch(e => {
                vscode.window.showErrorMessage(`Encountered an error, sorry. Message: ${e.message}.`);
            });
    }

    activate(context: vscode.ExtensionContext) {
        let symbolToImport = this.guessSymbolToImport();
        return Promise.resolve(this.searchForSymbolInWorkspace(symbolToImport)).then(importDetails => {
            if (!importDetails) {
                vscode.window.showInformationMessage(`Unable to locate symbol ${symbolToImport}`);
            } else {
                return this.addToImports(importDetails);
            }
        });
    }
}

// this method is called when your extension is deactivated
export function deactivate() {
}

export function activate(context: vscode.ExtensionContext) {
    console.log('activated');
    context.subscriptions.push(
        vscode.commands.registerCommand(tsImportAssistanceCommandName, () => {
            new TSImportAssistance().activate(context);
        }));
}