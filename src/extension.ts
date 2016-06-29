'use strict';

// for typescript, hacky solution for auto importing on demand.

import * as vscode from 'vscode';
import * as path from 'path';

var nodeLibs =
    ['path', 'events', 'child_process', 'fs', 'os', 'net', 'crypto',
        'util', 'stream', 'readline', 'tty', 'repl', 'punycode', 'querystring',
        'string_decoder', 'http', 'https', 'cluster', 'assert', 'dgram', 'url', 'vm', 'zlib', 'dns'];


export function activate(context: vscode.ExtensionContext) {

    console.log('Activated');
    let disposable = vscode.commands.registerCommand('extension.resolveMissingImportsForHighlighted', () => {
        var selection = vscode.window.activeTextEditor.selection;
        var activeFile = vscode.window.activeTextEditor.document.fileName;
        var activeDir = path.parse(activeFile).dir;
        var documentText = vscode.window.activeTextEditor.document.getText().replace(/\r\n/gm, '\n');
        var importLines = documentText.split(/\n/gm).filter(l => /^import/.test(l.trim()));
        var imports = importLines.map(i => i.split('from').pop().replace(/[\';\"]*/gm, '').trim());

        var addToImports = (symbol, filePath) => {
            let performEdit = () => {
                return vscode.window.activeTextEditor.edit((editbuilder) => {
                    var resolvedPosixPath = path.normalize(filePath).replace(/\\/gm,'/');
                    var cleanPath = resolvedPosixPath.replace(/(\.js)|(\.d.ts)|(\.ts)$/gm, '');
                    if (cleanPath != filePath && filePath[0] != '.') {
                        cleanPath = './' + cleanPath;
                    }
                    editbuilder.insert(new vscode.Position(0, 0), `import {${symbol}} from '${cleanPath}';\n`);
                });
            }
            if (vscode.window.activeTextEditor.document.isDirty) {
                return vscode.window.showQuickPick(['Yes', 'No'], { placeHolder: 'You have pending changes, save? (No will cancel operation).' }).then(res => {
                    if (res === 'Yes') {
                        return performEdit();
                    } else {
                        vscode.window.showInformationMessage(`Cancelled import.`);
                        return;
                    }
                });
            } else {
                return performEdit();
            }
        }

        console.log('imports', imports);
        if (selection.isEmpty) {
            var range = new vscode.Range(new vscode.Position(0, 0), selection.start);
            var selectionText = vscode.window.activeTextEditor.document.getText(range);
            var symbols = selectionText.split(/\s/gm)
            // TODO: super finicky with wierd symbols, but gets the job done for me.
            var nextSymbol = () => symbols.pop().replace(/[\{\}\(\)\`\'\"\[\]\;\.\*\-\%\@\~\/]*/gm, '');
            var lastSymbol = nextSymbol();
            // TODO: maybe iterate and reject symbols till we get one that could work?
            var selectionText = lastSymbol;
        } else {
            var selectionText = vscode.window.activeTextEditor.document.getText(selection);
        }
        console.log('cur symbol text', selectionText)
        Promise.resolve(vscode.commands.executeCommand('vscode.executeWorkspaceSymbolProvider', selectionText).then(
            (result: vscode.SymbolInformation[]) => {
                result = result.filter(r => r.location.uri.fsPath !== activeFile && r.name === selectionText);
                if (result.length === 0) {
                    vscode.window.showInformationMessage(`Unable to locate symbol ${selectionText}`);
                } else if (result.length > 1) {
                    console.log('possibilities', result)
                    var paths = {};
                    result.map(r => r.location.uri.fsPath).forEach(p => paths[p] = true);
                    var options = Object.keys(paths);
                    return vscode.window.showQuickPick(options).then(pick => {
                        console.log('picked', pick)
                        var pickedChoices = result.filter(r => r.location.uri.fsPath === pick);
                        var choicesMatchingNodeLibs = pickedChoices.filter(r => !!nodeLibs.find(l => l === r.containerName));
                        console.log('cur path', vscode.window.activeTextEditor.document.fileName)
                        if (choicesMatchingNodeLibs.length > 0) {
                            console.log('picking node lib', choicesMatchingNodeLibs[0].containerName);
                            return addToImports(selectionText, choicesMatchingNodeLibs[0].containerName);
                        } else {
                            // whatever, pick the first one
                            console.log('picking the first one');
                            return addToImports(selectionText, path.relative(activeDir, pickedChoices[0].location.uri.fsPath));
                        }
                    });
                } else {
                    // console.log('result', result[0]);
                    // console.log('resolved path', path.relative(activeDir, result[0].location.uri.fsPath));
                    // console.log('cur path', vscode.window.activeTextEditor.document.fileName)
                    return addToImports(selectionText, path.relative(activeDir, result[0].location.uri.fsPath));
                }
            })).catch(e => {
                vscode.window.showErrorMessage(`Encountered an error, sorry. Message: ${e.message}.`);
            })
    });

    context.subscriptions.push(disposable);
}

// this method is called when your extension is deactivated
export function deactivate() {
}