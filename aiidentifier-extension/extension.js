// @ts-nocheck
const vscode = require('vscode');					// Include the vscode module
const { execSync } = require('child_process');		// 
const fs = require('fs');							// 
const path = require('path');						// 

// === FLAGGED REGION CLASS =========================================
class FlaggedRegion {
    constructor(file, startLine, endLine, charCount, reasonFlagged, timestamp) {
        this.file = file;						// File of the flagged region
        this.startLine = startLine;				// Line number of the first line of the flagged region
        this.endLine = endLine;					// Line number of the end line of the flagged region
        this.charCount = charCount;				// Number of characters in the flagged region
        this.reasonFlagged = reasonFlagged;		// Description as to why this region was flagged
        this.timeStamp = timestamp;				// When was this region flagged
    }
}

// === SESSION STATE ================================================
let flaggedRegions = [];
let lastCommitSha = null;

// === ACTIVATE =====================================================
// Entry point — called once when the extension first loads in VSCode
function activate(context) {
    
	// Visual notification that the extension is active (FOR DEBUGGING ONLY!)
    vscode.window.showInformationMessage('aiidentifier-extension is now active!');
    console.log('aiidentifier-extension is now active!');

    // Fetch VSCode's built-in Git extension API
    const gitExtension = vscode.extensions.getExtension('vscode.git')?.exports;
    const git = gitExtension?.getAPI(1);

	// Verify successful fetch of git extension API
    if (!git) {
        vscode.window.showErrorMessage('aiidentifier-extension: Could not access VSCode Git API.');
        return;
    }

    // === Call installGitHooks on the repo already opened ==========
    git.repositories.forEach(repo => {
        const workspacePath = repo.rootUri.fsPath;
        installGitHooks(workspacePath);
    });

    // === Also call it on any repo opened after activation =========
    const repoListener = git.onDidOpenRepository(repo => {
        const workspacePath = repo.rootUri.fsPath;
        installGitHooks(workspacePath);
    });

    // Push the repoListener to the context subscriptions
    context.subscriptions.push(repoListener);

    // === COMMAND: Add dummy flag for testing ======================
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
			// Push the test object to the array
            flaggedRegions.push(dummy);
			// Notify user (FOR DEBUG ONLY!)
            vscode.window.showInformationMessage(
                `aiidentifier-extension: Dummy flag added. Total flags queued: ${flaggedRegions.length}`
            );
        }
    );

	// === COMMAND: Show current queued flags =======================
    // Lets the user see what will be attached to the next commit
    const showFlags = vscode.commands.registerCommand(
        'aiidentifier-extension.showFlags',
        function () {
            if (flaggedRegions.length === 0) {
                vscode.window.showInformationMessage('aislop: No flags queued for next commit.');
                return;
            }
            const summary = flaggedRegions.map((r, i) =>
                `${i + 1}. ${r.file} L${r.startLine}-${r.endLine} — ${r.reasonFlagged}`
            ).join('\n');
            vscode.window.showInformationMessage(`aislop: ${flaggedRegions.length} flag(s) queued:\n${summary}`);
        }
    );

    context.subscriptions.push(addDummy, showFlags);
}


// === Install the git hooks needed ==========================================
// Creates a .githooks/pre-push script in the repo that automatically
function installGitHooks(workspacePath) {
    try {
        // Write directly to .git/hooks/. This is the default git hooks
        // directory and does not require changing any git config settings
        const hooksDir = path.join(workspacePath, '.git', 'hooks');
        const hookFile = path.join(hooksDir, 'pre-push');

        // The line we want to place in the hook (unless it already exists)
        const ourLine = 'git push origin refs/notes/* 2>/dev/null || true';
        const ourBlock = [
            '',
            '# aiidentifier — push flagged region notes to remote',
            ourLine,
        ].join('\n');

        if (fs.existsSync(hookFile)) {
            // Hook already exists, we must read it and check if we are already in it
            const existing = fs.readFileSync(hookFile, 'utf8');

            if (existing.includes(ourLine)) {
                // Our line is already in the hook, nothing else to do
                vscode.window.showInformationMessage(
                    'aiidentifier-extension: pre-push hook already configured, skipping.'
                );
                return;
            }

            // Append our logic to the end of the existing hook
            fs.appendFileSync(hookFile, ourBlock);
            vscode.window.showInformationMessage(
                'aiidentifier-extension: Appended notes-push to existing pre-push hook.'
            );

        } else {
            // Create a fresh hook if no others exist yet
            const freshHook = [
                '#!/bin/sh',
                '# pre-push hook',
                '# aiidentifier — push flagged region notes to remote',
                ourLine,
            ].join('\n');

            fs.writeFileSync(hookFile, freshHook);

            // Make executable on Mac/Linux, this will be silently ignored on Windows
            try { execSync(`chmod +x ${hookFile}`); } catch (_) {}

            vscode.window.showInformationMessage(
                'aiidentifier-extension: Created pre-push hook in .git/hooks/'
            );
        }

    } catch (err) {
        // Non-fatal — warn that the hook could not be installed -- just warn, do not crash
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