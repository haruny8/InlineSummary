// SillyTavern - Inline Summary Extension - Summary Generation

// =========================
// Constants
// =========================

// =========================
// Includes/API/Globals
// =========================

import { getRegexedString, regex_placement } from "../../../extensions/regex/engine.js";
import { extractReasoningFromData } from '../../../../scripts/reasoning.js';
import { sendOpenAIRequest } from '../../../../scripts/openai.js';
import { amount_gen, createRawPrompt } from "../../../../script.js";
import { generateTextGenWithStreaming, getTextGenGenerationData } from '../../../../scripts/textgen-settings.js';

/*
import
{
	generateKoboldWithStreaming,
	kai_settings,
	loadKoboldSettings,
	getKoboldGenerationData,
	kai_flags,
	koboldai_settings,
	koboldai_setting_names,
	initKoboldSettings,
} from '../../../../scripts/kai-settings.js';

import
{
	generateNovelWithStreaming,
	getNovelGenerationData,
	getKayraMaxContextTokens,
	loadNovelSettings,
	nai_settings,
	adjustNovelInstructionPrompt,
	parseNovelAILogprobs,
	novelai_settings,
	novelai_setting_names,
	initNovelAISettings,
} from './scripts/nai-settings.js';
 */

import
{
	GetILSInstance,
	GetContextSize,
	GetMessageByIndex,
	SafeJsonStringify,
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
	let pickedMessageCount = 0;
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
			{
				// Real position of this message in the full chat array.
				const chatIndex = msgIndex + index;
				const msgRole = msg.is_user ? "user" : "assistant";
				const msgName = msg.name || (msg.is_user ? stContext.name1 : stContext.name2);

				messagesToSummarise += "\n<msg index=\"" + chatIndex + "\" role=\"" + msgRole + "\">"
					+ "\n[" + msgName + "]:"
					+ "\n" + msgText
					+ "\n</msg>";

				++pickedMessageCount;
			}
		}
	}
	if (messagesToSummarise.length == 0)
		return { promptOk: false, promptText: "", promptError: "No messages to summarise. Are all messages in the selected range hidden or blank?" };

	// Substitute the {{ils_picked_count}} placeholder (if present) in the Content Start Marker
	// setting with the actual number of messages that ended up in this summary.
	const summariseStartMarker = ilsSettings.summariseStartMarker.replaceAll("{{ils_picked_count}}", String(pickedMessageCount));

	messagesToSummarise = "\n" + summariseStartMarker + messagesToSummarise + "\n" + ilsSettings.summariseEndMarker;
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

export async function StartGenerate(stContext, promptText, responseTokenLimit = 0)
{
	const ilsInstance = GetILSInstance();
	let queryFuture = null;
	let isOk = true;
	let errText = "";
	let oldMaxTokens = 0;
	let abortCtrl = new AbortController();

	try
	{
		if (stContext.mainApi == "openai" && stContext.chatCompletionSettings.stream_openai)
		{
			// Save and overwrite token limit
			if (responseTokenLimit > 0)
			{
				oldMaxTokens = stContext.chatCompletionSettings.openai_max_tokens;
				stContext.chatCompletionSettings.openai_max_tokens = responseTokenLimit;
			}

			// Type 'normal' because... no idea, I couldn't find documentation and 'quiet' disables streaming.
			queryFuture = sendOpenAIRequest("normal", [{ content: promptText, role: "user" }], null, {});
		}
		else if (stContext.mainApi == "textgenerationwebui" && stContext.textCompletionSettings.streaming)
		{
			const rawPrompt = createRawPrompt(promptText, stContext.mainApi, false, false, null, null);

			let promptParams = await getTextGenGenerationData(rawPrompt, (responseTokenLimit > 0) ? responseTokenLimit : amount_gen, false, false, null, "normal");
			queryFuture = generateTextGenWithStreaming(promptParams, abortCtrl.signal);
		}
		// For other APIs, code taken from various ST scripts, incomplete and untested.
		// Not sure how generateData maps to what generateKoboldWithStreaming/generateNovelWithStreaming expect
		/*else if ((stContext.mainApi == "kobold" || stContext.mainApi == "koboldhorde") && kai_settings.streaming_kobold)
		{
			/*
			if (kai_settings.preset_settings === 'gui')
			{
				generateData = { prompt: prompt, gui_settings: true, max_length: amount_gen, max_context_length: max_context, api_server: kai_settings.api_server };
			}
			else
			{
				const isHorde = api === 'koboldhorde';
				const koboldSettings = koboldai_settings[koboldai_setting_names[kai_settings.preset_settings]];
				generateData = getKoboldGenerationData(prompt.toString(), koboldSettings, amount_gen, max_context, isHorde, 'quiet');
			}
			* /

			let promptParams = null;
			queryFuture = generateKoboldWithStreaming(promptParams, abortCtrl.signal);
		}
		else if (stContext.mainApi == "novel" && novelai_settings.streaming_novel)
		{
			/*
			const novelSettings = novelai_settings[novelai_setting_names[nai_settings.preset_settings_novel]];
			generateData = getNovelGenerationData(prompt, novelSettings, amount_gen, false, false, null, 'quiet');
			* /

			let promptParams = null;
			queryFuture = generateNovelWithStreaming(promptParams, streamingProcessor.abortController.signal);
		}*/
		else
		{
			let promptParams = { prompt: promptText };
			if (responseTokenLimit > 0)
				promptParams.responseLength = responseTokenLimit;

			const useNewGenerate = (typeof stContext.generateRawData === "function");
			queryFuture = useNewGenerate ? stContext.generateRawData(promptParams) : stContext.generateRaw(promptParams);
		}
	}
	catch (e)
	{
		console.error("[ILS] Failed to get response from LLM.\n" + e);
		isOk = false;
	}

	return { generateQuery: queryFuture, isOk: isOk, errorText: errText, maxResponseTokens: oldMaxTokens, ac: abortCtrl };
}

export async function FinishGenerate(stContext, genStart)
{
	const useNewGenerate = (typeof stContext.generateRawData === "function");

	let responseText = "";
	let reasoningText = null;
	let response = null;
	let isOk = genStart.isOk;

	try
	{
		response = await genStart.generateQuery;
		if (typeof response === 'function') // Streaming Request
		{
			let latestData = {};
			// Copied from another ST script, no idea how this actually is suppoed to work, but just updating till the loop exits seems to work.
			for await (const chunk of response())
			{
				latestData = chunk;
			}
			responseText = latestData?.text ?? "";
			reasoningText = latestData?.state?.reasoning ?? null;
		}
		else
		{
			responseText = useNewGenerate ? stContext.extractMessageFromData(response) : response;
			reasoningText = useNewGenerate ? extractReasoningFromData(response) : null;
		}
	}
	catch (e)
	{
		console.error("[ILS] Failed to get response from LLM");
		responseText = "[Failed to get a response]\nThis can happen if Token limit is too low and reasoning uses up all of it.\nCheck console output for full error message.\nException:\n" + e;
		if (useNewGenerate)
			responseText += "\nRaw Response:\n" + SafeJsonStringify(response);
		isOk = false;
	}

	// Restore token limit
	if (stContext.mainApi == "openai" && genStart.maxResponseTokens > 0)
	{
		stContext.chatCompletionSettings.openai_max_tokens = genStart.maxResponseTokens;
	}

	return { mainMsg: responseText, reasoning: reasoningText, isOk: isOk };
}
