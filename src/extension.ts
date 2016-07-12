'use strict';
import * as os from 'os';

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
    get splitByTokens() { return /[\s\{\}\(\)\`\'\"\[\]\;\*\-\%\@\~\/\<\>\.\=]/gm; }
    nextPossiblyValidLine(line: number): { nextPossibleLine: number, valid: boolean } {
        let lineContent100 = this.getTextFromDocument(line, 0, 100);
        let lineIncludesTripleSlashRef = () => lineContent100.includes('///') && lineContent100.includes('reference');
        let lineIncludesUseStrict = () => lineContent100.includes('use strict');
        let wholeDocumentLines = vscode.window.activeTextEditor.document.getText().split(os.EOL);
        let lineCount = wholeDocumentLines.length;
        let documentContent = wholeDocumentLines.slice(line).join(os.EOL);
        if (/reference\ path\s*?\=/gm.test(documentContent)) {
            let currentLine = lineCount - 1;
            while (!/reference\ path\s*?\=/gm.test(this.getTextFromDocument(currentLine, 0, 100))) {
                currentLine--;
            }
            if (currentLine + 1 === lineCount) {
                vscode.window.activeTextEditor.edit((eb) => eb.insert(new vscode.Position(currentLine + 1, 0), os.EOL));
            }
            return { nextPossibleLine: currentLine + 1, valid: false };
        }
        if (lineIncludesTripleSlashRef()) {
            return { nextPossibleLine: line + 1, valid: false };
        }
        if (lineIncludesUseStrict()) {
            return { nextPossibleLine: line + 1, valid: false };
        }
        return { nextPossibleLine: line, valid: true };
    }

    setImportInsertLine() {
        let prospectiveInsertLine = 0;

        let lineIsValidResult = this.nextPossiblyValidLine(prospectiveInsertLine);
        while (!lineIsValidResult.valid) {
            prospectiveInsertLine = lineIsValidResult.nextPossibleLine;
            lineIsValidResult = this.nextPossiblyValidLine(prospectiveInsertLine);
        }
        this.insertPosition = new vscode.Position(prospectiveInsertLine, 0);
    }

    constructor() {
        this.setImportInsertLine();
    }

    cleanPathToImportFrom(pathStr: string): string {
        let cleanPath = pathStr;
        if (!nodeLibs.find(s => s === pathStr)) {
            let resolvedPosixPath = path.normalize(pathStr).replace(/\\/gm, '/');
            // apparently this can re-introduce backslashes
            resolvedPosixPath = path.relative(this.activeDir, resolvedPosixPath);
            cleanPath = resolvedPosixPath.replace(/(\.js)|(\.d.ts)|(\.ts)|(\.tsx)$/gm, '');
        }
        // make sure no backslashes make it through
        cleanPath = cleanPath.replace(/\\/gm, '/');

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

    getCoreModuleUsage(str: string) {
        let pieces = str.split('.');
        let coreModule = nodeLibs.find(n => n === pieces[0]);
        return coreModule;
    };

    getSymbolsFromNonEmptySelections(): string[] {
        if (vscode.window.activeTextEditor.selections.length > 0) {
            
            // get all selections
            return vscode.window.activeTextEditor.selections.filter(s => !s.isEmpty).map(s => {
                // get their text
                return vscode.window.activeTextEditor.document.getText(new vscode.Range(s.start, s.end));
                // split them and take their last token
            }).map(s => s.split(this.splitByTokens).shift());
        }
    }

    // shortcut to get text in range, 0,0,0 would give 0 length str
    // validates range and returns, should support negative ranges    
    getTextFromDocument(l: number, c: number, forward: number): string {
        let doc = vscode.window.activeTextEditor.document;
        if (forward < 0) {
            let range = doc.validateRange(
                new vscode.Range(new vscode.Position(l, c + forward > 0 ? c + forward : 0), new vscode.Position(l, c)));
            return doc.getText(range);
        } else {
            let range = doc.validateRange(
                new vscode.Range(new vscode.Position(l, c), new vscode.Position(l, c + forward)));
            return doc.getText(range);
        }
    }

    discoverSymbolsWhereSelectionIsEmpty(): string[] {
        // only works if selection is empty
        let getNextChar = (l: number, c: number): string => this.getTextFromDocument(l, c, 1);
        let getPrevChar = (l: number, c: number): string => this.getTextFromDocument(l, c, -1);

        let findCurrentToken = (s: vscode.Selection) => {
            let line = s.start.line;
            let startCharPos = s.start.character;
            let endCharPos = s.start.character;
            let currentNextChar = getNextChar(line, endCharPos);
            let currentPrevChar = getPrevChar(line, startCharPos);
            // stumble backwards into a word
            while (currentNextChar.length > 0
                && currentPrevChar.length > 0
                && currentNextChar.trim() === ''
                && currentPrevChar.trim() === '') {
                endCharPos--;
                startCharPos--;
                currentNextChar = getNextChar(line, endCharPos);
                currentPrevChar = getPrevChar(line, startCharPos);
            }
            // stumble forwards into end of current word
            while (currentNextChar.length > 0 && !/\s/.test(currentNextChar)) {
                endCharPos++;
                currentNextChar = getNextChar(line, endCharPos);
            }
            // stumble backwards into start of current word
            while (currentPrevChar.length > 0 && !/\s/.test(currentPrevChar)) {
                startCharPos--;
                currentPrevChar = getPrevChar(line, startCharPos);
            }
            // console.log('terminating search at', startCharPos, endCharPos, this.getTextFromDocument(line, startCharPos, endCharPos));
            return this.getTextFromDocument(line, startCharPos, endCharPos).trim();
        };
        // guess each symbol, then take the first simple symbol from that selection
        let results = vscode.window.activeTextEditor.selections
            .filter(s => s.isEmpty === true)
            .map(s => findCurrentToken(s))
            .map(s => s.trim().split(this.splitByTokens).shift());
        return results;
    }

    guessSymbolsToImport(): string[] {
        let keysObj = {};
        this.discoverSymbolsWhereSelectionIsEmpty()
            .concat(this.getSymbolsFromNonEmptySelections())
            .forEach(s => {
                let modul = this.getCoreModuleUsage(s);
                if (modul) {
                    keysObj[modul] = true;
                } else {
                    keysObj[s] = true;
                }
            });
        return Object.keys(keysObj).filter(s => s.trim().length > 0);
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
        // console.log('possibilities', symbolInfos);
        let paths = this.getSetOfCleanFsPathsFromSymbolInfos(symbolInfos);
        return vscode.window.showQuickPick(paths, {
            placeHolder: 'Choose which location you intended to import from.'
        }).then(userPick => {
            // console.log('picked', userPick);
            if (!userPick) {
                return null;
            }
            let symbolInfosMatchingUserChoice = symbolInfos.filter(
                r => this.cleanPathToImportFrom(r.location.uri.fsPath) === userPick);

            let choicesMatchingNodeLibs = symbolInfosMatchingUserChoice.filter(
                r => !!nodeLibs.find(l => l === r.containerName));

            if (choicesMatchingNodeLibs.length > 0) {
                let choice = choicesMatchingNodeLibs[0];
                // console.log('picking node lib', choice.containerName);
                return { symbolToImport: desiredSymbolStr, path: choice.containerName, symbolInfo: choice };
            } else {
                // TODO: consider, what if symbolInfosMatchingUserChoice.length > 1 ?
                let choice = symbolInfosMatchingUserChoice[0];
                // console.log('picking the first selection');
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
                vscode.window.showErrorMessage(`Encountered an error looking for symbol${symbolToTryToImport}, sorry. Message: ${e.message}.`);
            });
    }

    activate(context: vscode.ExtensionContext) {
        try {
            let symbolsToImport = this.guessSymbolsToImport();
            return Promise.all(symbolsToImport.map(s => Promise.resolve(this.searchForSymbolInWorkspace(s)).then(importDetails => {
                if (!importDetails) {
                    vscode.window.showInformationMessage(`Unable to locate symbol ${symbolsToImport[0]}`);
                } else {
                    return this.addToImports(importDetails);
                }
            })));
        } catch (e) {
            console.log(e);
            return;
        }    
    }
}

// this method is called when your extension is deactivated
export function deactivate() {
}

export function activate(context: vscode.ExtensionContext) {
    // console.log('activated');
    context.subscriptions.push(
        vscode.commands.registerCommand(tsImportAssistanceCommandName, () => {
            new TSImportAssistance().activate(context);
        }));
}