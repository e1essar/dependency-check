import * as vscode from 'vscode';
import { exec, ChildProcess } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import axios from 'axios';
import unzipper from 'unzipper';

let consoleOutput = '';
let progressBarState = 0; // 0 - initial, 1 - in progress, 2 - completed
let currentProcess: ChildProcess | null = null;

export function activate(context: vscode.ExtensionContext) {
    console.log('Congratulations, your extension "dependency-check" is now active!');

    context.subscriptions.push(
        vscode.commands.registerCommand('dependency-check.runDC', showOutputPanel),
        vscode.commands.registerCommand('dependency-check.showSettings', showSettingsPanel)
    );

    watchForDependencyChanges(context);
}

export function deactivate() {}

function showOutputPanel() {
    const panel = createWebviewPanel('dependencyCheckPanel', 'Dependency Check Output');
    panel.webview.html = getWebviewContent();
    setupWebviewMessageListener(panel);
}

function showSettingsPanel() {
    const panel = createWebviewPanel('dependencyCheckSettingsPanel', 'Dependency Check Settings');
    updateSettingsForm(panel);
    setupSettingsWebviewMessageListener(panel);
}

function createWebviewPanel(viewType: string, title: string): vscode.WebviewPanel {
    return vscode.window.createWebviewPanel(
        viewType,
        title,
        vscode.ViewColumn.One,
        { enableScripts: true }
    );
}

function setupWebviewMessageListener(panel: vscode.WebviewPanel) {
    panel.webview.onDidReceiveMessage(message => {
        switch (message.command) {
            case 'runDependencyCheck':
                runDependencyCheck(panel);
                break;
            case 'cancelDependencyCheck':
                cancelDependencyCheck(panel);
                break;
        }
    });
}

function setupSettingsWebviewMessageListener(panel: vscode.WebviewPanel) {
    panel.webview.onDidReceiveMessage(async message => {
        if (message.command === 'saveSettings') {
            await saveSettings(message.settings);
            vscode.window.showInformationMessage('Settings saved successfully.');
            updateSettingsForm(panel);
            //panel.dispose();
        }
        // ????
        if (message.command === 'updateDependencyCheck') {
            await updateDependencyCheck(panel);
            vscode.window.showInformationMessage('Dependency Check is up to date');
            panel.dispose();
        }
    });
}

async function saveSettings(settings: any) {
    const config = vscode.workspace.getConfiguration('dependencyCheck');
    await config.update('installDir', settings.installDir, vscode.ConfigurationTarget.Global);
    await config.update('noupdate', settings.noupdate, vscode.ConfigurationTarget.Global);
    await config.update('format', settings.format, vscode.ConfigurationTarget.Global);
    await config.update('nvdApiKey', settings.nvdApiKey, vscode.ConfigurationTarget.Global);
}

function getWebviewContent(): string {
    return `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Dependency Check Output</title>
            <style>
                body {
                    font-family: Arial, sans-serif;
                    margin: 20px;
                    background-color: #333;
                }
                button {
                    margin-top: 10px;
                    padding: 8px 16px;
                    background-color: #007acc;
                    color: white;
                    border: none;
                    border-radius: 4px;
                    cursor: pointer;
                }
                button:hover {
                    background-color: #005f80;
                }
                .progress-bar {
                    width: 100%;
                    background-color: #f3f3f3;
                    border: 1px solid #ccc;
                    border-radius: 4px;
                    overflow: hidden;
                    margin-top: 10px;
                }
                .progress {
                    width: ${progressBarState === 1 ? '0%' : '100%'};
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
        </head>
        <body>
            <button id="runDependencyCheck">Run Dependency Check</button>
            <div id="progress">${progressBarState === 2 ? 'Command executed successfully.' : ''}</div>
            <button id="cancelDependencyCheck">Cancel Dependency Check</button>
            <div class="progress-bar">
                <div class="progress ${progressBarState === 2 ? 'completed' : ''}"></div>
            </div>
            <div id="consoleOutput">${consoleOutput}</div>
            <script>
                const vscode = acquireVsCodeApi();
                document.getElementById('runDependencyCheck').addEventListener('click', () => vscode.postMessage({ command: 'runDependencyCheck' }));
                document.getElementById('cancelDependencyCheck').addEventListener('click', () => vscode.postMessage({ command: 'cancelDependencyCheck' }));
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
                                currentWidth += 1;
                                progressBar.style.width = currentWidth + '%';
                                requestAnimationFrame(animate);
                            } else {
                                currentWidth = 0;
                                animate();
                            }
                        }
                        animate();
                    } else {
                        progressBar.style.width = '0%';
                    }
                }
                if (${progressBarState} === 1) {
                    updateProgressBar(1);
                } else if (${progressBarState} === 0) {
                    document.querySelector('.progress').style.width = '0%';
                }
            </script>
        </body>
        </html>`;
}

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

    const batFilePath = path.join(installDir, 'dependency-check', 'bin', 'dependency-check.bat');
    if (!fs.existsSync(batFilePath)) {
        vscode.window.showErrorMessage("Dependency Check executable not found. Please check the install directory.");
        return;
    }

    const reportPath = path.join(projectPath, 'dependency-check-report.json');
    let dependencyCheckCmd = `"${batFilePath}" --project "Dependency Check" --scan "${projectPath}" --out "${projectPath}" --format "${format}" --format "JSON" --prettyPrint`;
    if (noupdate) { dependencyCheckCmd += ' --noupdate'; };
    if (nvdApiKey) { dependencyCheckCmd += ` --nvdApiKey "${nvdApiKey}"`; };

    currentProcess = exec(dependencyCheckCmd);
    progressBarState = 1;

    currentProcess.stdout?.on('data', (data) => {
        consoleOutput += data;
        panel.webview.postMessage({ command: 'updateConsole', text: data });
    });

    currentProcess.stderr?.on('data', (data) => {
        consoleOutput += data;
        panel.webview.postMessage({ command: 'updateConsole', text: data });
    });

    currentProcess.on('close', (code) => {
        progressBarState = 2;
        if (code !== 0) {
            vscode.window.showErrorMessage(`Dependency Check completed with error. Exit code: ${code}`);
        } else {
            vscode.window.showInformationMessage(`Dependency Check completed successfully`);
            setTimeout(() => openNewResultPanel(reportPath), 2000);
        }
        panel.webview.html = getWebviewContent();
    });
}

function cancelDependencyCheck(panel: vscode.WebviewPanel) {
    if (currentProcess) {
        currentProcess.kill();
        currentProcess = null;
        progressBarState = 0;
        consoleOutput += '\nProcess cancelled by user.\n';
        panel.webview.postMessage({ command: 'updateConsole', text: 'Process cancelled by user.' });
        panel.webview.html = getWebviewContent();
    }
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
                deleteCommand = `echo "hello"`;
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
    if (fs.existsSync(reportPath)) {
        const reportContent = fs.readFileSync(reportPath, 'utf8');
        const resultPanel = vscode.window.createWebviewPanel(
            'dependencyCheckResultPanel',
            'Dependency Check Result',
            vscode.ViewColumn.One,
            { enableScripts: true }
        );
        resultPanel.webview.html = getResultWebviewContent(reportContent);
    } else {
        vscode.window.showErrorMessage('Dependency Check report not found.');
    }
}

function getResultWebviewContent(reportContent: string): string {
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

function updateSettingsForm(panel: vscode.WebviewPanel) {
    const config = vscode.workspace.getConfiguration('dependencyCheck');
    const installDir = config.get<string>('installDir') || '';
    const noupdate = config.get<boolean>('noupdate') || false;
    const format = config.get<string>('format') || 'JSON';
    const nvdApiKey = config.get<string>('nvdApiKey') || '';

    panel.webview.html = `<!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Dependency Check Settings</title>
        <style>
            body {
                font-family: Arial, sans-serif;
                margin: 20px;
            }
            h1 {
                color: #333;
            }
            form {
                max-width: 400px;
                margin-top: 20px;
            }
            label {
                display: block;
                margin-top: 10px;
            }
            input[type="text"], select {
                width: calc(100% - 12px);
                padding: 6px;
                margin-top: 3px;
                font-size: 14px;
                border: 1px solid #ccc;
                border-radius: 4px;
            }
            input[type="checkbox"] {
                margin-top: 5px;
            }
            button {
                margin-top: 10px;
                padding: 8px 16px;
                background-color: #007acc;
                color: white;
                border: none;
                border-radius: 4px;
                cursor: pointer;
            }
            button:hover {
                background-color: #005f80;
            }
        </style>
    </head>
    <body>
        <h1>Dependency Check Settings</h1>
        <form id="settingsForm">
            <label for="installDir">Install Directory:</label>
            <input type="text" id="installDir" name="installDir" value="${installDir}">
            <br>
            <label for="noupdate">No Update:</label>
            <input type="checkbox" id="noupdate" name="noupdate" ${noupdate ? 'checked' : ''}>
            <br>
            <label for="format">Report Format:</label>
            <select id="format" name="format">
                <option value="JSON" ${format === 'JSON' ? 'selected' : ''}>JSON</option>
                <option value="XML" ${format === 'XML' ? 'selected' : ''}>XML</option>
                <option value="HTML" ${format === 'HTML' ? 'selected' : ''}>HTML</option>
            </select>
            <br>
            <label for="nvdApiKey">NVD API Key:</label>
            <input type="text" id="nvdApiKey" name="nvdApiKey" value="${nvdApiKey}">
            <br>
            <button type="button" onclick="saveSettings()">Save Settings</button>
            <button type="button" onclick="updateDependencyCheck()">Update Dependency Check</button>
        </form>
        <script>
            const vscode = acquireVsCodeApi();
            function saveSettings() {
                const settings = {
                    installDir: document.getElementById('installDir').value,
                    noupdate: document.getElementById('noupdate').checked,
                    format: document.getElementById('format').value,
                    nvdApiKey: document.getElementById('nvdApiKey').value
                };
                vscode.postMessage({ command: 'saveSettings', settings: settings });

            }
            function updateDependencyCheck() {
                vscode.postMessage({ command: 'updateDependencyCheck' });
            }
        </script>
    </body>
    </html>`;
}

function watchForDependencyChanges(context: vscode.ExtensionContext) {
    if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
        const projectPath = vscode.workspace.workspaceFolders[0].uri.fsPath;
        const dependencyFiles = ['package.json', 'pom.xml', 'build.gradle', 'build.gradle.kts'];

        dependencyFiles.forEach(file => {
            const filePath = path.join(projectPath, file);
            if (fs.existsSync(filePath)) {
                const watcher = vscode.workspace.createFileSystemWatcher(
                    new vscode.RelativePattern(projectPath, file)
                );
                watcher.onDidChange(() => showAutoRunPrompt());
                watcher.onDidCreate(() => showAutoRunPrompt());
                watcher.onDidDelete(() => showAutoRunPrompt());
                context.subscriptions.push(watcher);
            }
        });
    }
}

function showAutoRunPrompt() {
    vscode.window.showInformationMessage('Dependency files changed. Do you want to run Dependency Check?', 'Yes', 'No')
        .then(selection => {
            if (selection === 'Yes') {
                showOutputPanel();
            }
        });
}
