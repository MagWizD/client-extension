// === IMPORTS =====================================================
//@ts-nocheck
const vscode = require('vscode');               // VSCode extensibility API: Gives us access to VSCode features
const { execSync } = require('child_process');  // Lets us run shell commands (git) synchronously
const fs = require('fs');                       // File system: Read, write, check existence of files
const path = require('path');                   // Path utilities: Safely join file paths (OS safe!)
const cryptojs = require('crypto-js');
const os = require('os');

// === FLAGGED REGION CLASS =========================================
class FlaggedRegion {
    constructor(file, startLine, endLine, charCount, reasonFlagged, timestamp, chatPrompts, responses) {
        this.file = file;						// File of the flagged region
        this.startLine = startLine;				// Line number of the first line of the flagged region
        this.endLine = endLine;					// Line number of the end line of the flagged region
        this.charCount = charCount;				// Number of characters in the flagged region
        this.reasonFlagged = reasonFlagged;		// Description as to why this region was flagged
        this.timeStamp = timestamp;				// When was this region flagged
        this.chatPrompts = chatPrompts;
        this.responses = responses;
    }
}



// === SESSION STATE ================================================
// flaggedRegions accumulates FlaggedRegion objects during the session.
let flaggedRegions = [];
// lastCommitSha tracks the SHA of the most recent commit we processed.
let lastCommitSha = null;
// storagePath is set in activate(): Points to VSCode's managed storage
// folder for this extension. Persists between sessions.
let storagePath = null;


let chatSessionDir;


// === LOAD FLAGS FROM DISK ========================================
// Reads flaggedRegions.json from extension's storage folder and
// loads it to flaggedRegions array. Flags from a previous 
// session are restored.
function loadFlagsFromDisk() {
    try {
        const filePath = path.join(storagePath, 'flaggedRegions.json');
        if (fs.existsSync(filePath)) {
            const raw = fs.readFileSync(filePath, 'utf8');
            const data = JSON.parse(raw);
            // Support both old format (plain array) and new format (object with sha)
            if (Array.isArray(data)) {
                flaggedRegions = data;
                lastCommitSha = null;
            } else {
                flaggedRegions = data.flaggedRegions || [];
                lastCommitSha = data.lastCommitSha || null;
            }
            console.log(`aiidentifier: loaded ${flaggedRegions.length} flag(s), lastCommitSha: ${lastCommitSha?.slice(0, 7)}`);
        } else {
            console.log('aiidentifier: no saved flags found, starting fresh');
        }
    } catch (err) {
        console.warn('aiidentifier: could not load flags from disk —', err.message);
        flaggedRegions = [];
        lastCommitSha = null;
    }
}

// === SAVE FLAGS TO DISK ==========================================
// Writes current flaggedRegions array to flaggedRegions.json in
// extension's storage folder. Called every time flags are added
// or the array is cleared so disk is synced to memory.
function saveFlagsToDisk() {
    try {
        fs.mkdirSync(storagePath, { recursive: true });
        const filePath = path.join(storagePath, 'flaggedRegions.json');
        // Save both flags and lastCommitSha together so both survive restarts
        fs.writeFileSync(filePath, JSON.stringify({
            lastCommitSha: lastCommitSha,
            flaggedRegions: flaggedRegions
        }, null, 2));
        console.log(`aiidentifier: saved ${flaggedRegions.length} flag(s) and sha ${lastCommitSha?.slice(0, 7)} to disk`);
    } catch (err) {
        console.warn('aiidentifier: could not save flags to disk —', err.message);
    }
}

function parseJSONL(file) {

}

function parseJSON(file) {
    
}

function findJSONFiles() {
    if (storagePath !== null) {
        let workspaceDirectory = path.resolve(storagePath, '../../workspaceStorage/');
        console.log(`Workspace Directory = ${workspaceDirectory}`);

        let workspaceID = vscode.workspace.workspaceFolders[0].uri.fsPath;
        console.log(`Workspace ID = ${workspaceID}`);

        let workspaceUri = `file://${workspaceID}`;
        let hashedWorkspaceDir;

        fs.readdirSync(workspaceDirectory, (err, workspaceFolders) => {
            if (err) {
                console.error('Error scanning in workspaceStorage directory.');
            }
            let found = false;
            for (let workspaceFolder in workspaceFolders) {
                
                let workspaceJson = require(`./${workspaceFolder}/workspace.json`);
                fs.readFile(workspaceJson, (err, data) => {
                    if (err) {
                        console.error('Error reading workspace.json');
                    }

                    const folder = JSON.parse(data);
                    console.log(folder);

                    if (folder === workspaceUri) {
                        hashedWorkspaceDir = workspaceFolder;
                        found = true;
                    }
                });
                if (found === true) {
                    break;
                }
            }
        });

        const chatSessionsDir = path.join(workspaceStoragePath, hashedWorkspaceDir, 'chatSessions');
        fs.readdirSync(chatSessionsDir, (err, files) => {
            let curJSONFile;
            for (let file in files) {
                if (file.extname === '.jsonl'){

                } else {
                    curJSONFile = file;
                }


            }
        });
    }
}


// === ACTIVATE =====================================================
// Entry point: Called once when the extension first loads in VSCode
function activate(context) {
    // Visual notification that the extension is active (XXX - DEBUG ONLY!)
    vscode.window.showInformationMessage('aiidentifier-extension is now active!');
    console.log('aiidentifier-extension is now active!');

    storagePath = context.globalStorageUri.fsPath;

    findJSONFiles();

    // Restore flags saved from a previous session
    loadFlagsFromDisk();
    vscode.window.showInformationMessage(
        `aiidentifier: ${flaggedRegions.length} flag(s) restored from previous session`
    );

    // Fetch VSCode's built-in Git extension API
    const gitExtension = vscode.extensions.getExtension('vscode.git')?.exports;
    const git = gitExtension?.getAPI(1);

	// Verify successful fetch of git extension API
    if (!git) {
        vscode.window.showErrorMessage('aiidentifier-extension: Could not access VSCode Git API.');
        return;
    }

    // Initialize lastCommitSha BEFORE setting up any listeners. This will 
    // prevent restored flags from being attached to already-exisiting
    // HEAD commit on activation.
    git.repositories.forEach(repo => {
        if (!lastCommitSha && repo.state.HEAD?.commit) {
            lastCommitSha = repo.state.HEAD.commit;
            console.log(`aiidentifier: initialized lastCommitSha to ${lastCommitSha.slice(0, 7)}`);
            // Persist right away so restarts remember which commit was current
            saveFlagsToDisk();
        }
    });

    // === Call installGitHooks on already open repos ==========
    git.repositories.forEach(repo => {
        const workspacePath = repo.rootUri.fsPath;
        installGitHooks(workspacePath);
        setupRepo(repo, context);
    });

    // === Also handle repos opened after activation ================
    const repoListener = git.onDidOpenRepository(repo => {
        const workspacePath = repo.rootUri.fsPath;
        installGitHooks(workspacePath);
        setupRepo(repo, context);
    });

    // Register the repoListener with VSCode
    context.subscriptions.push(repoListener);


    // === COMMAND: Add dummy flag for testing (XXX - DEBUG ONLY!) ==
    // Simulates what will eventually happen automatically when the
    // extension flags suspicious and AI-generated code.
    const addDummy = vscode.commands.registerCommand(
        'aiidentifier-extension.addDummyFlag',
        function () {
            const dummy = new FlaggedRegion(
                'src/index.js',
                10,
                25,
                312,
                'Large instant insertion — 312 chars in <100ms',
                new Date().toISOString()
            );
			// Add test object to the array
            flaggedRegions.push(dummy);
            // Persist to disk so closing VSCode doesn't lose the flag
            saveFlagsToDisk();
            // Notify user (XXX - DEBUG ONLY!)
            vscode.window.showInformationMessage(
                `aiidentifier-extension: Dummy flag added. Total flags queued: ${flaggedRegions.length}`
            );
        }
    );

	// === COMMAND: Show current queued flags (XXX - DEBUG ONLY!) ===
    // Lets developer see what is currently queued to be added
    // to next commit's git note.
    const showFlags = vscode.commands.registerCommand(
        'aiidentifier-extension.showFlags',
        function () {

            // Nothing queued: Tell the user and exit early
            if (flaggedRegions.length === 0) {
                vscode.window.showInformationMessage('aislop: No flags queued for next commit.');
                return;
            }
            // Build summary of all queued flags
            const summary = flaggedRegions.map((r, i) =>
                `${i + 1}. ${r.file} L${r.startLine}-${r.endLine} — ${r.reasonFlagged}`
            ).join('\n');
            
            // Show summary in a VSCode notification
            vscode.window.showInformationMessage(`aislop: ${flaggedRegions.length} flag(s) queued:\n${summary}`);
        }
    );

    // Register commands so VSCode knows about them
    context.subscriptions.push(addDummy, showFlags);
}

// === ON COMMIT ===================================================
// Called by setupRepo's stateListener when new commit detected
function onCommit(workspacePath, sha) {
    // No flags queued
    if (flaggedRegions.length === 0) {
        vscode.window.showInformationMessage(
            `aiidentifier-extension: Commit ${sha.slice(0, 7)} detected: no flags to attach.`
        );
        return;
    }

    try {
        // Serialize the flagged regions array into a structured JSON object
        const noteContent = JSON.stringify({
            aiidentifierVersion: '0.0.1',
            commit: sha,
            generatedAt: new Date().toISOString(),
            flagCount: flaggedRegions.length,
            flaggedRegions: flaggedRegions
        }, null, 2);

        // Write the JSON as a git note attached to this commit SHA.
        // We write to a temp file first because passing large JSON directly
        // as a command line argument breaks on Windows due to quote handling
        const tempFile = path.join(storagePath, 'temp_note.json');
        fs.writeFileSync(tempFile, noteContent);

        // Handle the cross-OS issues, read a file instead of running a command
        execSync(
            `git notes add -f -F "${tempFile}" ${sha}`,
            { cwd: workspacePath }
        );

        // Clean up temp file
        fs.unlinkSync(tempFile);

        // Save count before clearing so we can show it in the message
        const count = flaggedRegions.length;
        // Clear array, next commit starts with no flags
        flaggedRegions = [];
        // Persist cleared state to disk
        saveFlagsToDisk();

        // Confirm to user (XXX - DEBUG ONLY!)
        vscode.window.showInformationMessage(
            `aiidentifier-extension: ${count} flag(s) attached to commit ${sha.slice(0, 7)} and cleared.`
        );

    } catch (err) {
        // Fatal: Show as an error
        vscode.window.showErrorMessage(
            `aiidentifier-extension: Failed to write git note: ${err.message}`
        );
    }
}

// === ON PUSH =====================================================
// Called by setupRepo's stateListener when push detected.
function onPush(workspacePath) {
    try {
        // Push all refs/notes/* to origin so GitHub bot can read them
        execSync('git push origin refs/notes/*', { cwd: workspacePath });

        vscode.window.showInformationMessage(
            'aiidentifier-extension: Notes pushed to remote successfully.'
        );
    } catch (err) {
        vscode.window.showWarningMessage(
            `aiidentifier-extension: Could not push notes — ${err.message}`
        );
    }
}

// === SETUP REPO ===================================================
// Called once per repository: Sets up state-change-listener
// to detect commits and pushes. 
// THis is isolated from activate() so that it will be called for each repo
function setupRepo(repo, context) {
    // Path to the workspace
    const workspacePath = repo.rootUri.fsPath;
    console.log('XXX - setupRepo called for:', workspacePath);

    // Track previous ahead count to detect when push occurs (0 == PUSH)
    let previousAhead = repo.state.HEAD?.ahead ?? 0;

    // Listen for any change in repo state: fires on commit, push,
    // branch switch, pull, etc.
    const stateListener = repo.state.onDidChange(() => {
        const head = repo.state.HEAD;
        console.log('XXX - state change: HEAD SHA:', repo.state.HEAD?.commit);

        // HEAD can be null during certain git operations: skip if true
        if (!head) return;

        const currentSha = head.commit;
        const currentAhead = head.ahead ?? 0;

        // == Detect a new commit ==================================
        // SHA changed and it is different from the last one we processed
        if (currentSha && currentSha !== lastCommitSha) {
            lastCommitSha = currentSha;
            onCommit(workspacePath, currentSha);
        }

        // === Detect a push ========================================
        // ahead count was positive and has now decreased
        if (previousAhead > 0 && currentAhead < previousAhead) {
            onPush(workspacePath);
        }

        // Update previousAhead for the next state change comparison
        previousAhead = currentAhead;
    });

    // Register the listener to VSCode
    context.subscriptions.push(stateListener);
}


// === Install the git hooks needed ==========================================
// Create a .git/hooks/pre-push script in the repo that automatically
function installGitHooks(workspacePath) {
    try {
        // Write directly to .git/hooks/
        const hooksDir = path.join(workspacePath, '.git', 'hooks');
        const hookFile = path.join(hooksDir, 'pre-push');

        // The line we want to place in the hook (unless it already exists)
        const ourLine = 'git push origin refs/notes/* --timeout=5 2>/dev/null || true';
        const ourBlock = [
            '',
            '# aiidentifier — push flagged region notes to remote',
            ourLine,
        ].join('\n');

        if (fs.existsSync(hookFile)) {
            // Hook already exists, we must read it and check if we are already in it
            const existing = fs.readFileSync(hookFile, 'utf8');

            if (existing.includes(ourLine)) {
                // Our line is already in the hook, skip this part
                vscode.window.showInformationMessage(
                    'aiidentifier-extension: pre-push hook already configured, skipping injection.'
                );
                return;
            }

            // Append the logic to the end of the existing hook
            fs.appendFileSync(hookFile, ourBlock);
            vscode.window.showInformationMessage(
                'aiidentifier-extension: Appended notes-push logic to existing pre-push hook.'
            );

        } else {
            // Create a new hook if no others exist yet
            const freshHook = [
                '#!/bin/sh',
                '# pre-push hook',
                '# aiidentifier — push flagged region notes to remote',
                '# timeout after 5 seconds to prevent stalling',
                ourLine,
                'exit 0',  // always exit cleanly
            ].join('\n');

            fs.writeFileSync(hookFile, freshHook);

            // Make executable on Mac/Linux (should be silently ignored for Windows clients)
            try { execSync(`chmod +x ${hookFile}`); } catch (_) {}

            vscode.window.showInformationMessage(
                'aiidentifier-extension: Created pre-push hook in .git/hooks/'
            );
        }

    } catch (err) {
        // Non-fatal: warn that the hook could not be installed
        vscode.window.showWarningMessage(
            `aiidentifier-extension: Could not install git hooks — ${err.message}`
        );
    }
}


// === DEACTIVATE ===================================================
function deactivate() {
    // If there are unflushed flags when VSCode closes, log them
    if (flaggedRegions.length > 0) {
        console.warn(
            `aislop: ${flaggedRegions.length} unflushed flagged regions on deactivate`
        );
    }
}

module.exports = { activate, deactivate };