import * as vscode from 'vscode';
import { exec } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

export function activate(context: vscode.ExtensionContext) {
    console.log('Congratulations, your extension "dependency-check" is now active!');

    let consoleOutput = '';
    let progressBarState = 0; // 0 - initial, 1 - in progress, 2 - completed

    const disposableHello = vscode.commands.registerCommand('dependency-check.helloWorld', () => {
        const panel = vscode.window.createWebviewPanel(
            'dependencyCheckPanel',
            'Dependency Check Output',
            vscode.ViewColumn.One,
            { enableScripts: true }
        );

        vscode.window.showInformationMessage('Hello World from Dependency-Check!');

        panel.webview.html = getWebviewContent(consoleOutput, progressBarState);

        panel.webview.onDidReceiveMessage(
            message => {
                console.log('Received message:', message);
                switch (message.command) {
                    case 'runDependencyCheck':
                        progressBarState = 1;
                        consoleOutput = '';
                        panel.webview.html = getWebviewContent(consoleOutput, progressBarState);
                        runDependencyCheck(panel);
                        return;
                }
            },
            undefined,
            context.subscriptions
        );

        panel.webview.html = getWebviewContent(consoleOutput, progressBarState);
    });

    context.subscriptions.push(disposableHello);

    const disposableSettings = vscode.commands.registerCommand('dependency-check.showSettings', () => {
        const panel = vscode.window.createWebviewPanel(
            'dependencyCheckSettingsPanel',
            'Dependency Check Settings',
            vscode.ViewColumn.One,
            { enableScripts: true }
        );

        const config = vscode.workspace.getConfiguration('dependencyCheck');

        panel.webview.html = `
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Dependency Check Settings</title>
            </head>
            <body>
                <h1>Dependency Check Settings</h1>
                <form id="settingsForm">
                    <label for="installDir">Install Directory:</label>
                    <input type="text" id="installDir" name="installDir" value="${config.get('installDir')}">
                    <br><br>
                    <button type="submit">Save</button>
                </form>
                <br>
                <button id="runIpconfig">Run ipconfig</button>
                <div id="ipconfigOutput"></div>
                <script>
                    const vscode = acquireVsCodeApi();
                    document.getElementById('settingsForm').addEventListener('submit', (event) => {
                        event.preventDefault();
                        const installDir = document.getElementById('installDir').value;
                        vscode.postMessage({ command: 'saveSettings', installDir });
                    });
                    document.getElementById('runIpconfig').addEventListener('click', () => {
                        vscode.postMessage({ command: 'runIpconfig' });
                    });
                    window.addEventListener('message', event => {
                        const message = event.data;
                        if (message.command === 'ipconfigOutput') {
                            document.getElementById('ipconfigOutput').textContent += message.text + '\\n';
                        }
                    });
                </script>
            </body>
            </html>
        `;

        panel.webview.onDidReceiveMessage(
            message => {
                switch (message.command) {
                    case 'saveSettings':
                        vscode.workspace.getConfiguration().update('dependencyCheck.installDir', message.installDir, vscode.ConfigurationTarget.Global);
                        break;
                    case 'runIpconfig':
                        exec('ipconfig', (error, stdout, stderr) => {
                            if (error) {
                                vscode.window.showErrorMessage(`Failed to run ipconfig: ${error.message}`);
                                return;
                            }
                            if (stderr) {
                                vscode.window.showErrorMessage(`ipconfig error: ${stderr}`);
                                return;
                            }
                            vscode.window.showInformationMessage('ipconfig executed successfully.');
                            panel.webview.postMessage({ command: 'ipconfigOutput', text: stdout });
                        });
                        break;
                }
            },
            undefined,
            context.subscriptions
        );
    });

    context.subscriptions.push(disposableSettings);

    // Включаем наблюдение за изменениями зависимостей
    watchForDependencyChanges(context);

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
                progressBarState = 2;
                panel.webview.html = getWebviewContent(consoleOutput, progressBarState);
                return;
            }

            vscode.window.showInformationMessage(`Dependency Check выполнен успешно`);
            progressBarState = 2;
            panel.webview.html = getWebviewContent(consoleOutput, progressBarState);
            setTimeout(() => openNewResultPanel(reportPath), 2000);
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

    function getWebviewContent(consoleOutput: string, progressBarState: number) {
        return `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Dependency Check Output</title>
        </head>
        <body>
            <button id="runDependencyCheck">Run Dependency Check</button>
            <div id="progress">${progressBarState === 2 ? 'Команда успешно выполнена.' : ''}</div>
            <div class="progress-bar">
                <div class="progress ${progressBarState === 2 ? 'completed' : ''}" style="width: ${progressBarState === 1 ? '0' : '100%'};"></div>
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
                        updateProgressBar(1);
                    }
                });
                function updateConsoleOutput(text) {
                    const consoleOutput = document.getElementById('consoleOutput');
                    consoleOutput.textContent += text + '\\n';
                    consoleOutput.scrollTop = consoleOutput.scrollHeight;
                }
                function updateProgressBar(state) {
                    const progressBar = document.querySelector('.progress');
                    if (state === 1) {
                        let currentWidth = parseFloat(progressBar.style.width) || 0;

                        function animate() {
                            if (currentWidth < 100) {
                                currentWidth += 1; // Увеличиваем ширину на 1% (можно настроить скорость изменения)
                                progressBar.style.width = currentWidth + '%';
                                requestAnimationFrame(animate);
                            } else {
                                progressBar.classList.add('completed');
                            }
                        }

                        animate();
                    } else {
                        progressBar.style.width = '100%';
                        progressBar.classList.add('completed');
                    }
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
                    height: 20px;
                    background-color: #4caf50;
                    width: 0;
                    transition: width 0.3s;
                }
                .progress.completed {
                    background-color: #4caf50;
                }
                #consoleOutput {
                    margin-top: 10px;
                    padding: 10px;
                    background: #333;
                    color: #fff;
                    height: 300px;
                    overflow-y: auto;
                    font-family: monospace;
                }
            </style>
        </body>
        </html>`;
    }

    function getResultWebviewContent(reportJson: string) {
        return `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Dependency Check Result</title>
        </head>
        <body>
            <pre>${reportJson}</pre>
        </body>
        </html>`;
    }

    function watchForDependencyChanges(context: vscode.ExtensionContext) {
        const packageJsonWatcher = vscode.workspace.createFileSystemWatcher('**/package.json');
        
        packageJsonWatcher.onDidChange(async (uri) => {
            const answer = await vscode.window.showInformationMessage(
                'Файл package.json был изменен. Вы хотите запустить Dependency Check?', 
                'Да', 
                'Нет'
            );
            
            if (answer === 'Да') {
                runDependencyCheckAndUpdateView(context);
            }
        });

        context.subscriptions.push(packageJsonWatcher);
    }

    async function runDependencyCheckAndUpdateView(context: vscode.ExtensionContext) {
        const panel = vscode.window.createWebviewPanel(
            'dependencyCheckPanel',
            'Dependency Check Output',
            vscode.ViewColumn.One,
            { enableScripts: true }
        );

        let consoleOutput = '';
        let progressBarState = 1; // устанавливаем прогресс в состоянии выполнения

        panel.webview.html = getWebviewContent(consoleOutput, progressBarState);

        const config = vscode.workspace.getConfiguration('dependencyCheck');
        const installDir = config.get<string>('installDir');

        let projectPath = '';
        if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
            projectPath = vscode.workspace.workspaceFolders[0].uri.fsPath;
        } else {
            vscode.window.showErrorMessage('No project folder is currently open');
            return;
        }

        const reportPath = path.join(projectPath, 'dependency-check-report.json');
        const dependencyCheckCmd = `"${installDir}\\dependency-check.bat" --project "Dependency Check" --scan "${projectPath}" --out "${projectPath}" --format "JSON" --noupdate --prettyPrint`;

        const process = exec(dependencyCheckCmd);

        process.stdout?.on('data', (data) => {
            consoleOutput += data;
            panel.webview.postMessage({ command: 'updateConsole', text: data });
        });

        process.stderr?.on('data', (data) => {
            consoleOutput += data;
            panel.webview.postMessage({ command: 'updateConsole', text: data });
        });

        process.on('close', (code) => {
            if (code !== 0) {
                vscode.window.showErrorMessage(`Dependency Check завершился с ошибкой. Код завершения: ${code}`);
                progressBarState = 2;
                panel.webview.html = getWebviewContent(consoleOutput, progressBarState);
                return;
            }

            vscode.window.showInformationMessage(`Dependency Check выполнен успешно`);
            progressBarState = 2;
            panel.webview.html = getWebviewContent(consoleOutput, progressBarState);
            setTimeout(() => openNewResultPanel(reportPath), 2000);
        });
    }
}

// this method is called when your extension is deactivated
export function deactivate() {}
