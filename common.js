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
// Globals
// =========================

export function GetILSInstance()
{
	const g = globalThis;

	if (!g[kILSGlobalKey])
		g[kILSGlobalKey] = {};

	return g[kILSGlobalKey];
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
