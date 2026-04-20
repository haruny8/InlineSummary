// SillyTavern - Inline Summary Extension - Summary Generation

// =========================
// Constants
// =========================

// =========================
// Includes/API/Globals
// =========================

import { getRegexedString, regex_placement } from "../../../extensions/regex/engine.js";

import
{
	GetILSInstance,
	GetContextSize,
	GetMessageByIndex,
} from './common.js';

// =========================
// Summary Generation Main
// =========================

export async function MakeSummaryPrompt(msgIndex, numMsgAfterSummary, originalMessages, stContext, ilsSettings)
{
	const ilsInstance = GetILSInstance();

	let [ctxOk, ctxSize, resSize] = GetContextSize(stContext);

	if (!ctxOk)
		return { promptOk: false, promptText: "", promptError: "Could not get context size." };

	if (ilsSettings.tokenLimit > 0)
		resSize = ilsSettings.tokenLimit;

	const maxPromptSize = ctxSize - resSize;
	let remainingSize = maxPromptSize;

	// Generate Summary Prompt

	// Add Main Prompt
	const startPrompt = ilsSettings.startPrompt;
	const startPromptTokenCount = await stContext.getTokenCountAsync(startPrompt);
	remainingSize -= startPromptTokenCount;

	// Setup Mid-Prompt
	const midPrompt = (ilsSettings.midPrompt !== "") ? "\n" + ilsSettings.midPrompt : "";
	const midPromptToekenCount = await stContext.getTokenCountAsync(midPrompt);
	remainingSize -= midPromptToekenCount;

	// Setup End-Prompt
	const endPrompt = (ilsSettings.endPrompt !== "") ? "\n" + ilsSettings.endPrompt : "";
	const endPromptTokenCount = await stContext.getTokenCountAsync(endPrompt);
	remainingSize -= endPromptTokenCount

	const instructionTokenTotal = startPromptTokenCount + midPromptToekenCount + endPromptTokenCount;

	// Check if Prompt fits
	if (remainingSize < 0)
		return {
			promptOk: false,
			promptText: "",
			promptError: "Prompt instructions too big for context:\nReserved for reply: " + resSize
				+ ";\nStart Prompt: " + startPromptTokenCount
				+ ";\nMid Prompt: " + midPromptToekenCount
				+ ";\nEnd Prompt: " + endPromptTokenCount
				+ ";\nTotal: " + (resSize + instructionTokenTotal) + " of " + ctxSize + " context."
		};

	// - Content to Summarise
	let messagesToSummarise = "";
	for (const [index, msg] of originalMessages.entries())
	{
		const localDepth = originalMessages.length - index - 1 + numMsgAfterSummary;
		if (!msg.is_system)
		{
			let msgText = msg.mes.trim();
			if (ilsInstance.regexEnabled && ilsSettings.regexPreGenerate)
			{
				msgText = getRegexedString(msgText,
					msg.is_user ? regex_placement.USER_INPUT : regex_placement.AI_OUTPUT,
					{ isPrompt: true, isEdit: false, depth: localDepth });
			}

			if (msgText.length > 0)
				messagesToSummarise += "\n" + msgText;
		}
	}
	if (messagesToSummarise.length == 0)
		return { promptOk: false, promptText: "", promptError: "No messages to summarise. Are all messages in the selected range hidden or blank?" };

	messagesToSummarise = "\n" + ilsSettings.summariseStartMarker + messagesToSummarise + "\n" + ilsSettings.summariseEndMarker;
	const messagesToSummariseTokenCount = await stContext.getTokenCountAsync(messagesToSummarise);
	remainingSize -= messagesToSummariseTokenCount;

	if (remainingSize < 0)
		return {
			promptOk: false,
			promptText: "",
			promptError: "Messages to summarise too big for context:\nReserved for reply: " + resSize
				+ ";\nStart Prompt: " + startPromptTokenCount
				+ ";\nMid Prompt: " + midPromptToekenCount
				+ ";\nEnd Prompt: " + endPromptTokenCount
				+ ";\nMessages to Summarise: " + messagesToSummariseTokenCount
				+ ";\nTotal: " + (resSize + instructionTokenTotal + messagesToSummariseTokenCount) + " of " + ctxSize + " context."
		};

	// Historic Context
	let historicContex = "";
	let histContextStart = 0;
	if (ilsSettings.historicalContexDepth >= 0)
	{
		histContextStart = msgIndex - ilsSettings.historicalContexDepth;
		if (histContextStart < 0)
			histContextStart = 0;
	}

	const histCtxLabels = "\n" + ilsSettings.historicalContextStartMarker + "\n" + ilsSettings.historicalContextEndMarker;

	let histContextTokenCount = 0;
	for (let i = msgIndex - 1; i >= histContextStart; --i)
	{
		const msg = GetMessageByIndex(i, stContext);

		if (!msg.is_system)
		{
			let msgText = msg.mes.trim();
			const localDepth = originalMessages.length + numMsgAfterSummary + (msgIndex - 1 - i);
			if (ilsInstance.regexEnabled && ilsSettings.regexPreGenerate)
			{
				msgText = getRegexedString(msgText,
					msg.is_user ? regex_placement.USER_INPUT : regex_placement.AI_OUTPUT,
					{ isPrompt: true, isEdit: false, depth: localDepth });
			}
			msgText += "\n";

			if (msgText.length > 0)
			{
				const tokenCost = await stContext.getTokenCountAsync(histCtxLabels + msgText);
				if ((remainingSize - tokenCost) > 0)
				{
					histContextTokenCount += tokenCost;
					remainingSize -= tokenCost;
					historicContex = msgText + historicContex;
				}
				// Context too full
				else
				{
					break;
				}
			}
		}
	}

	// Append Historic Context
	const summaryPrompt = startPrompt + "\n"
		+ ilsSettings.historicalContextStartMarker + "\n"
		+ historicContex + "\n"
		+ ilsSettings.historicalContextEndMarker
		+ midPrompt
		+ messagesToSummarise
		+ endPrompt;

	const finalSize = await stContext.getTokenCountAsync(summaryPrompt);
	if (finalSize > maxPromptSize)
		return {
			promptOk: false,
			promptText: "",
			promptError: "Final summary prompt exceeded context:\nReserved for reply: " + resSize
				+ ";\nStart Prompt: " + startPromptTokenCount
				+ ";\nMid Prompt: " + midPromptToekenCount
				+ ";\nEnd Prompt: " + endPromptTokenCount
				+ ";\nMessages to Summarise: " + messagesToSummariseTokenCount
				+ ";\nHistorical Context: " + histContextTokenCount
				+ ";\nTotal: " + (resSize + instructionTokenTotal + messagesToSummariseTokenCount + histContextTokenCount) + " of " + ctxSize + " context."
		};

	return { promptOk: true, promptText: summaryPrompt, promptError: "" };
}
