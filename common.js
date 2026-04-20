// SillyTavern - Inline Summary Extension - Common

// =========================
// Constants
// =========================

export const kExtensionName = "InlineSummary";
export const kExtensionFolderPath = `scripts/extensions/third-party/${kExtensionName}`;
export const kSettingsFile = `${kExtensionFolderPath}/settings.html`;
export const kDefaultsFile = `${kExtensionFolderPath}/defaults.json`;
export const kExtraDataKey = "ILS_Data";
export const kOriginalMessagesKey = "OriginalMessages";
export const kMessageEstimatedTokenCountKey = "EstimatedTokens";

const kILSGlobalKey = Symbol.for("InlineSummary.ILS");

// =========================
// Includes/API/Globals
// =========================

import { amount_gen } from "../../../../script.js";

// =========================
// Globals
// =========================

export function GetILSInstance()
{
	const g = globalThis;

	if (!g[kILSGlobalKey])
		g[kILSGlobalKey] = {};

	return g[kILSGlobalKey];
}

export function IsOperationLockEngaged()
{
	const ilsInstance = GetILSInstance()
	if (ilsInstance.operationLock)
		return true;

	return false;
}

// =========================
// Util
// =========================

export function ShowError(text, exception)
{
	let errText = "[ILS] " + text;
	if (exception)
		errText += "\nError Info:\n" + exception;
	console.error(errText);
	toastr.error(errText);
}

export function ShowWarning(text, exception)
{
	let errText = "[ILS] " + text;
	if (exception)
		errText += "\nWarning Info:\n" + exception;
	console.warn(errText);
	toastr.warning(errText);
}

export function SafeJsonStringify(obj)
{
	try
	{
		return JSON.stringify(obj);
	}
	catch
	{
		return String(obj);
	}
}

export function Sleep(ms)
{
	return new Promise(resolve => setTimeout(resolve, ms));
}

export function Debounce(fn, delay)
{
	let timeout;
	return function (...args)
	{
		clearTimeout(timeout);
		timeout = setTimeout(() => fn.apply(this, args), delay);
	};
}

// =========================
// ST Helpers
// =========================

export function GetMessageByIndex(msgIndex, stContext)
{
	return stContext.chat[msgIndex];
}

export function GetContextSize(stContext)
{
	const apiMode = stContext.mainApi?.toLowerCase();

	let ctxOk = false; // Success
	let ctxSize = 0; // Total context size
	let reservedSize = 0; // Reserved for reply

	switch (apiMode)
	{
		case "textgenerationwebui":
		case "novel":
		case "koboldhorde":
		case "kobold":
			ctxOk = true;
			ctxSize = stContext.maxContext;
			reservedSize = amount_gen;
			break;

		case "openai":
			ctxOk = true;
			ctxSize = stContext.chatCompletionSettings.openai_max_context;
			reservedSize = stContext.chatCompletionSettings.openai_max_tokens;
			break;

		default:
			ShowError("Unsupported Mode: '" + stContext.mainApi + "'.");
			break;
	}

	return [ctxOk, ctxSize, reservedSize];
}
