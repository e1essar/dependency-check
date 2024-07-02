import * as vscode from 'vscode';
import { exec } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import axios from 'axios';
import unzipper from 'unzipper';

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

    let disposableSettings = vscode.commands.registerCommand('dependency-check.showSettings', () => {
        const panel = vscode.window.createWebviewPanel(
            'dependencyCheckSettingsPanel',
            'Dependency Check Settings',
            vscode.ViewColumn.One,
            { enableScripts: true }
        );
    
        function updateSettingsForm() {
            const config = vscode.workspace.getConfiguration('dependencyCheck');
            const htmlContent = `
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
                        <label for="noupdate">Skip update (--noupdate):</label>
                        <input type="checkbox" id="noupdate" name="noupdate" ${config.get('noupdate') ? 'checked' : ''}>
                        <br><br>
                        <label for="format">Output format (--format):</label>
                        <input type="text" id="format" name="format" value="${config.get('format')}">
                        <br><br>
                        <label for="nvdApiKey">NVD API Key (--nvdApiKey):</label>
                        <input type="text" id="nvdApiKey" name="nvdApiKey" value="${config.get('nvdApiKey')}">
                        <br><br>
                        <button type="submit">Save</button>
                    </form>
                    <br>
                    <button id="updateDependencyCheck">Update Dependency Check</button>
                    <div id="updateOutput"></div>
                    <script>
                        const vscode = acquireVsCodeApi();
                        document.getElementById('settingsForm').addEventListener('submit', (event) => {
                            event.preventDefault();
                            const installDir = document.getElementById('installDir').value;
                            const noupdate = document.getElementById('noupdate').checked;
                            const format = document.getElementById('format').value;
                            const nvdApiKey = document.getElementById('nvdApiKey').value;
                            vscode.postMessage({
                                command: 'saveSettings',
                                installDir,
                                noupdate,
                                format,
                                nvdApiKey
                            });
                        });
                        document.getElementById('updateDependencyCheck').addEventListener('click', () => {
                            vscode.postMessage({ command: 'updateDependencyCheck' });
                        });
                        window.addEventListener('message', event => {
                            const message = event.data;
                            if (message.command === 'updateOutput') {
                                document.getElementById('updateOutput').textContent += message.text + '\\n';
                            }
                        });
                    </script>
                </body>
                </html>
            `;
            panel.webview.html = htmlContent;
        }
    
        // Обновляем форму при создании вебвью
        
    
        panel.webview.onDidReceiveMessage(
            async message => {
                switch (message.command) {
                    case 'saveSettings':
                        vscode.workspace.getConfiguration().update('dependencyCheck.installDir', message.installDir, vscode.ConfigurationTarget.Global);
                        vscode.workspace.getConfiguration().update('dependencyCheck.noupdate', message.noupdate, vscode.ConfigurationTarget.Global);
                        vscode.workspace.getConfiguration().update('dependencyCheck.format', message.format, vscode.ConfigurationTarget.Global);
                        vscode.workspace.getConfiguration().update('dependencyCheck.nvdApiKey', message.nvdApiKey, vscode.ConfigurationTarget.Global);
                        break;
                    case 'updateDependencyCheck':
                        await updateDependencyCheck(panel);
                        break;
                }
            },
            undefined,
            context.subscriptions
        );
        
    });
    

    context.subscriptions.push(disposableSettings);

    async function runDependencyCheck(panel: vscode.WebviewPanel) {
        const config = vscode.workspace.getConfiguration('dependencyCheck');
        const installDir = config.get<string>('installDir');
        const noupdate = config.get<boolean>('noupdate');
        const format = config.get<string>('format');
        const nvdApiKey = config.get<string>('nvdApiKey');

        if (!installDir) {
            vscode.window.showErrorMessage("Install directory is not set. Please configure it in the settings.");
            return;
        }

        let projectPath = '';
        if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
            projectPath = vscode.workspace.workspaceFolders[0].uri.fsPath;
        } else {
            vscode.window.showErrorMessage('No project folder is currently open');
            return;
        }

        const binPath = path.join(installDir, 'dependency-check', 'bin');
        const batFilePath = path.join(binPath, 'dependency-check.bat');
        
        // if (!fs.existsSync(binPath) || !fs.existsSync(batFilePath)) {
        //     await updateDependencyCheck(panel);
        // }

        if (!fs.existsSync(batFilePath)) {
            vscode.window.showErrorMessage("Dependency Check executable not found after update. Please check the install directory.");
            return;
        }

        const reportPath = path.join(projectPath, 'dependency-check-report.json');
        let dependencyCheckCmd = `"${batFilePath}" --project "Dependency Check" --scan "${projectPath}" --out "${projectPath}" --format "${format}" --prettyPrint `;

        if (noupdate) {
            dependencyCheckCmd += ' --noupdate';
        }
    
        if (nvdApiKey) {
            dependencyCheckCmd += ` --nvdApiKey "${nvdApiKey}"`;
        }
        
        vscode.window.showInformationMessage(dependencyCheckCmd);
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

    async function updateDependencyCheck(panel: vscode.WebviewPanel) {
        const config = vscode.workspace.getConfiguration('dependencyCheck');
        const installDir = config.get<string>('installDir');
        if (!installDir) {
            vscode.window.showErrorMessage("Set extension options first, path to DC 'bin' folder is empty");
            return;
        }

        const dcFolderPath = installDir;
        vscode.window.showInformationMessage(dcFolderPath);
        try {
            const isWindows = os.platform() === 'win32';

            // Getting the latest version
            const versionCommand = `curl https://jeremylong.github.io/DependencyCheck/current.txt`;
            exec(versionCommand, async (error, stdout, stderr) => {
                if (error) {
                    panel.webview.postMessage({ command: 'updateOutput', text: `Error fetching current version: ${error.message}` });
                    return;
                }

                const version = stdout.trim();
                panel.webview.postMessage({ command: 'updateOutput', text: `Latest version: ${version}` });

                // Clearing the DC folder
                vscode.window.showInformationMessage(dcFolderPath);
                let deleteCommand = isWindows ? `powershell -Command "Remove-Item -Path \\"${path.join(dcFolderPath, '*')}\\" -Recurse -Force"` : `rm -rf "${path.join(dcFolderPath, '*')}"`;
                if (!fs.existsSync(dcFolderPath)) {
                    vscode.window.showInformationMessage("1");
                    deleteCommand = `ipconfig`;
                }

                exec(deleteCommand, async (delError, delStdout, delStderr) => {
                    if (delError) {
                        panel.webview.postMessage({ command: 'updateOutput', text: `Error deleting old version: ${delError.message}` });
                        return;
                    }

                    panel.webview.postMessage({ command: 'updateOutput', text: `Old version deleted` });

                    // Downloading the new zip
                    const zipPath = path.join(dcFolderPath, 'dependency-check.zip');
                    panel.webview.postMessage({ command: 'updateOutput', text: `Zip path: ${zipPath}` });

                    try {
                        const response = await axios({
                            method: 'GET',
                            url: `https://github.com/jeremylong/DependencyCheck/releases/download/v${version}/dependency-check-${version}-release.zip`,
                            responseType: 'stream'
                        });

                        const writer = fs.createWriteStream(zipPath);
                        response.data.pipe(writer);

                        await new Promise((resolve, reject) => {
                            writer.on('finish', resolve);
                            writer.on('error', reject);
                        });

                        panel.webview.postMessage({ command: 'updateOutput', text: `Downloaded new version` });

                        // Unzipping the file
                        fs.createReadStream(zipPath)
                            .pipe(unzipper.Extract({ path: dcFolderPath }))
                            .on('close', () => {
                                panel.webview.postMessage({ command: 'updateOutput', text: `Unzipped new version` });

                                // Deleting the zip file
                                fs.unlink(zipPath, (unlinkErr) => {
                                    if (unlinkErr) {
                                        panel.webview.postMessage({ command: 'updateOutput', text: `Error deleting zip file: ${unlinkErr.message}` });
                                        return;
                                    }

                                    panel.webview.postMessage({ command: 'updateOutput', text: `Dependency Check updated to version ${version}` });
                                });
                            });
                    } catch (downloadError) {
                        panel.webview.postMessage({ command: 'updateOutput', text: `Error downloading new version: ${downloadError}` });
                    }
                });
            });
        } catch (error) {
            vscode.window.showErrorMessage(`Error updating Dependency Check: ${(error as Error).message}`);
        }
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
                //return;
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
                                currentWidth = 0; // Сбрасываем до 0, чтобы зациклить анимацию
                                animate(); // Запускаем анимацию заново
                            }
                        }

                        animate();
                    } else {
                        progressBar.style.width = '0%'; // Если state не равен 1, обнуляем прогресс бар
                    }
                }
                if (${progressBarState} === 1) {
                    updateProgressBar(1);
                } else if (${progressBarState} === 0) {
                    document.querySelector('.progress').style.width = '0%';
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
