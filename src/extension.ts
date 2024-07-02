import * as vscode from 'vscode';
import { exec } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

export function activate(context: vscode.ExtensionContext) {
    console.log('Congratulations, your extension "dependency-check" is now active!');

    let isCommandCompleted = false;
    let consoleOutput = '';

    const disposableHello = vscode.commands.registerCommand('dependency-check.helloWorld', () => {
        const panel = vscode.window.createWebviewPanel(
            'dependencyCheckPanel',
            'Dependency Check Output',
            vscode.ViewColumn.One,
            { enableScripts: true }
        );

        vscode.window.showInformationMessage('Hello World from Dependency-Check!');

        panel.webview.html = getWebviewContent(consoleOutput, isCommandCompleted);

        panel.webview.onDidReceiveMessage(
            message => {
                console.log('Received message:', message);
                switch (message.command) {
                    case 'runDependencyCheck':
                        isCommandCompleted = false;
                        consoleOutput = ''; // Очистка консольного вывода при повторном выполнении
                        panel.webview.html = getWebviewContent(consoleOutput, isCommandCompleted);
                        runDependencyCheck(panel);
                        return;
                }
            },
            undefined,
            context.subscriptions
        );

        // Восстановление состояния при повторном открытии панели
        panel.webview.html = getWebviewContent(consoleOutput, isCommandCompleted);
    });

    context.subscriptions.push(disposableHello);

    function runDependencyCheck(panel: vscode.WebviewPanel) {
        const config = vscode.workspace.getConfiguration('dependencyCheck');
        const installDir = config.get<string>('installDir');

        let projectPath = '';
        if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
            projectPath = vscode.workspace.workspaceFolders[0].uri.fsPath;
        } else {
            vscode.window.showErrorMessage('No project folder is currently open');
            return;
        }

        vscode.window.showInformationMessage(`Configured install directory: ${installDir}`);
        vscode.window.showInformationMessage(`Current project: ${projectPath}`);

        const reportPath = path.join(projectPath, 'dependency-check-report.json');
        const dependencyCheckCmd = `"${installDir}\\dependency-check.bat" --project "Dependency Check" --scan "${projectPath}" --out "${projectPath}" --format "JSON" --noupdate --prettyPrint`;

        const process = exec(dependencyCheckCmd);

        process.stdout?.on('data', (data) => {
            consoleOutput += data;
            console.log('stdout data:', data);
            panel.webview.postMessage({ command: 'updateConsole', text: data });
        });

        process.stderr?.on('data', (data) => {
            consoleOutput += data;
            console.log('stderr data:', data);
            panel.webview.postMessage({ command: 'updateConsole', text: data });
        });

        process.on('close', (code) => {
            console.log('Process closed with code:', code);
            if (code !== 0) {
                vscode.window.showErrorMessage(`Dependency Check завершился с ошибкой. Код завершения: ${code}`);
                isCommandCompleted = true;
                panel.webview.html = getWebviewContent(consoleOutput, isCommandCompleted);
                return;
            }

            vscode.window.showInformationMessage(`Dependency Check выполнен успешно`);
            isCommandCompleted = true;
            panel.webview.html = getWebviewContent(consoleOutput, isCommandCompleted);
            setTimeout(() => openNewResultPanel(reportPath), 4000);
        });
    }

    function openNewResultPanel(reportPath: string) {
        const resultPanel = vscode.window.createWebviewPanel(
            'dependencyCheckResultPanel',
            'Dependency Check Result',
            vscode.ViewColumn.One,
            { enableScripts: true }
        );

        fs.readFile(reportPath, 'utf8', (err, data) => {
            if (err) {
                vscode.window.showErrorMessage(`Ошибка при чтении отчета: ${err.message}`);
                resultPanel.webview.html = getResultWebviewContent(`Ошибка при чтении отчета: ${err.message}`);
                return;
            }

            let reportJson;
            try {
                reportJson = JSON.parse(data);
            } catch (parseErr) {
                vscode.window.showErrorMessage(`Ошибка при парсинге отчета: ${parseErr}`);
                resultPanel.webview.html = getResultWebviewContent(`Ошибка при парсинге отчета: ${parseErr}`);
                return;
            }

            resultPanel.webview.html = getResultWebviewContent(JSON.stringify(reportJson, null, 2));
        });
    }

    function getWebviewContent(consoleOutput: string, isCompleted: boolean) {
        return `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Dependency Check Output</title>
        </head>
        <body>
            <button id="runDependencyCheck">Run Dependency Check</button>
            <div id="progress">${isCompleted ? 'Команда успешно выполнена.' : ''}</div>
            <div class="progress-bar">
                <div class="progress ${isCompleted ? 'completed' : ''}"></div>
            </div>
            <div id="consoleOutput">${consoleOutput}</div>
            <script>
                const vscode = acquireVsCodeApi();
                document.getElementById('runDependencyCheck').addEventListener('click', () => {
                    vscode.postMessage({ command: 'runDependencyCheck' });
                });
                window.addEventListener('message', event => {
                    const message = event.data;
                    if (message.command === 'updateConsole') {
                        updateConsoleOutput(message.text);
                    }
                });
                function updateConsoleOutput(text) {
                    const consoleOutput = document.getElementById('consoleOutput');
                    consoleOutput.textContent += text + '\\n';
                    consoleOutput.scrollDown = consoleOutput.scrollHeight;
                }
                function updateProgressBar(isCompleted) {
                    const progressBar = document.querySelector('.progress');
                    let width = 0;
                    const interval = setInterval(() => {
                        if (isCompleted) {
                            clearInterval(interval);
                            progressBar.style.width = '100%';
                        } else {
                            width = (width + 1) % 100;
                            progressBar.style.width = width + '%';
                        }
                    }, 100);
                }
                if (!${isCompleted}) {
                    updateProgressBar(false);
                }
            </script>
            <style>
                .progress-bar {
                    width: 100%;
                    background-color: #f3f3f3;
                    border: 1px solid #ccc;
                    border-radius: 4px;
                    overflow: hidden;
                    margin-top: 10px;
                }
                .progress {
                    width: 0;
                    height: 20px;
                    background-color: #4caf50;
                    text-align: center;
                    line-height: 20px;
                    color: white;
                    transition: width 0.1s;
                }
                .progress.completed {
                    width: 100%;
                }
                #consoleOutput {
                    white-space: pre-wrap;
                    background-color: #333;
                    color: #fff;
                    border: 1px solid #ccc;
                    padding: 10px;
                    margin-top: 10px;
                    height: 200px;
                    overflow-y: scroll;
                }
            </style>
        </body>
        </html>`;
    }

    function getResultWebviewContent(reportContent: string) {
        return `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Dependency Check Result</title>
        </head>
        <body>
            <h1>Dependency Check Result</h1>
            <pre>${reportContent}</pre>
        </body>
        </html>`;
    }
}
