const vscode = require('vscode');

let history = "";

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
	/** @type {import('vscode').ChatRequestHandler} */
	const handler = async(request, _, stream, token) => {
		try {
			console.log('[OpenPrompt] Request received:', request.prompt);
			
			// log the user's prompt
			history += `\n**User:** ${request.prompt}\n`;

			console.log('[OpenPrompt] Selecting Copilot models...');
			// select copilot model
			const models = await vscode.lm.selectChatModels({vendor: 'copilot'});
			console.log('[OpenPrompt] Models found:', models.length);
			
			if (models.length === 0) {
				stream.markdown("copilot model not found.");
				return;
			}

			console.log('[OpenPrompt] Sending request to LM...');
			const messages = [vscode.LanguageModelChatMessage.User(request.prompt)];
			const chatResponse = await models[0].sendRequest(messages, {}, token);
			console.log('[OpenPrompt] Got response, starting to stream...');
			
			let response = "";
			history += `\n**OpenPrompt:** `;

			for await(const fragment of chatResponse.text) {
				console.log('[OpenPrompt] Fragment received, length:', fragment.length);
				stream.markdown(fragment);
				response += fragment;
			}

			console.log('[OpenPrompt] Streaming complete');
			history += `${response}\n---\n`;
		} catch (error) {
			console.error('[OpenPrompt] Error:', error);
			stream.markdown(`**Error:** ${error instanceof Error ? error.message : String(error) || JSON.stringify(error)}`);
		}
	};

	context.subscriptions.push(vscode.chat.createChatParticipant("open-prompt", handler));

	console.log('OpenPrompt is now active.');

	// defined in package.json
	// provides implementation
	// commandId parameter must match command field in package.json
	const disposable = vscode.commands.registerCommand('open-prompt.helloWorld', function () {
		// The code you place here will be executed every time your command is executed

		// Display a message box to the user
		vscode.window.showInformationMessage('Hello World from open-prompt!');
	});

	context.subscriptions.push(disposable);
}

// when deactivated
function deactivate() {}

module.exports = {
	activate,
	deactivate
}
