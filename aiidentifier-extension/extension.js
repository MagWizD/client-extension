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


    context.subscriptions.push(addDummy);
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