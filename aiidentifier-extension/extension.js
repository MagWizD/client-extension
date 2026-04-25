// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
// @ts-nocheck
const vscode = require('vscode');

// Save the last time this code was edited
let lastEditTime = Date.now()

// Flagged region class
/**
 * @param {string} file					// Name of the file
 * @param {int} startLine				// line number of the flagged regions starting line
 * @param {int} endLine					// Line number of the flagged regions ending line
 * @param {int} charCount				// Number of characters in the flagged region
 * @param {string} reasonFlagged		// Reason the region was flagged
 * @param {} timestamp					// Time the resgion was flagged						
 * 
 */
class FlaggedRegion {
	constructor(file, startLine, endLine, charCount, reasonFlagged, timestamp) {
		this.file = file,
		this.startLine = startLine,
		this.endLine = endLine,
		this.charCount = charCount,
		this.reasonFlagged = reasonFlagged,
		this.timeStamp = timestamp
	}
}

// Array of FlaggedRegion objects
let flaggedRegions = []


/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
	vscode.window.showInformationMessage('Congratulations, your extension "aiidentifier-extension" is now active!');

	const myFunction = vscode.commands.registerCommand('aiidentifier-extension.myfunction', function(event) {
		if (event && event.document) {
			vscode.window.showInformationMessage(`File ${event.document.fileName} was changed!`);
		} else {
			vscode.window.showInformationMessage('Change detected (no document info).');
		}
	});

	const changeListener = vscode.workspace.onDidChangeTextDocument(eventIn => {
		// pass the event to the command
		vscode.commands.executeCommand('aiidentifier-extension.myfunction', eventIn);
	});

	context.subscriptions.push(myFunction, changeListener);



	// // Use the console to output diagnostic information (console.log) and errors (console.error)
	// // This line of code will only be executed once when your extension is activated
	// console.log('Congratulations, your extension "aiidentifier-extension" is now active!');

	// // The command has been defined in the package.json file
	// // Now provide the implementation of the command with  registerCommand
	// // The commandId parameter must match the command field in package.json
	// const disposable = vscode.commands.registerCommand('aiidentifier-extension.helloWorld', function () {
	// 	// The code you place here will be executed every time your command is executed

	// 	// Display a message box to the user
	// 	vscode.window.showInformationMessage('Hello World from aiidentifier-extension!');
	// });

	// context.subscriptions.push(disposable);


}



// This method is called when your extension is deactivated
function deactivate() {}

module.exports = {
	activate,
	deactivate
}
