/**
 * pi-lens dashboard event bus.
 *
 * Emits a small, redacted JSONL stream that can be consumed by the upcoming
 * terminal dashboard (and later Glimpse/browser UIs). Disabled by default.
 */

import { spawn } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export interface DashboardBusOptions {
	enabled: boolean;
	projectRoot: string;
	sessionId: string;
	logPath?: string;
}

export type DashboardEvent = {
	type: string;
	ts?: string;
	sessionId?: string;
	projectRoot?: string;
	[key: string]: unknown;
};

let enabled = false;
let projectRoot = "";
let sessionId = "";
let stream: fs.WriteStream | undefined;
let currentLogPath: string | undefined;
let terminalStarted = false;

const MAX_PREVIEW_CHARS = 240;
const SECRET_KEY_RE =
	/(?:content|text|oldText|newText|replacement|password|token|secret|key|apiKey|authorization|cookie)/i;
const PATHISH_KEY_RE =
	/(?:path|file|cwd|root|command|tool|url|query|pattern|lang|language)/i;

export function configureDashboardBus(options: DashboardBusOptions): void {
	shutdownDashboardBus();
	enabled = options.enabled;
	projectRoot = options.projectRoot;
	sessionId = options.sessionId;
	if (!enabled) return;

	currentLogPath =
		options.logPath ??
		path.join(os.homedir(), ".pi-lens", "dashboard-events.jsonl");
	try {
		fs.mkdirSync(path.dirname(currentLogPath), { recursive: true });
		stream = fs.createWriteStream(currentLogPath, { flags: "a" });
		emitDashboardEvent({
			type: "lens.dashboard.start",
			logPath: currentLogPath,
		});
		if (process.env.PI_LENS_DASHBOARD_LOG_ONLY !== "1") {
			startTerminalDashboard(currentLogPath);
		}
	} catch {
		enabled = false;
		stream = undefined;
	}
}

export function shutdownDashboardBus(): void {
	if (stream) {
		try {
			stream.end();
		} catch {}
	}
	stream = undefined;
	currentLogPath = undefined;
	enabled = false;
	projectRoot = "";
	sessionId = "";
}

export function isDashboardBusEnabled(): boolean {
	return enabled;
}

export function getDashboardLogPath(): string | undefined {
	return currentLogPath;
}

export function emitDashboardEvent(event: DashboardEvent): void {
	if (!enabled || !stream) return;
	const payload: DashboardEvent = {
		ts: new Date().toISOString(),
		sessionId,
		projectRoot,
		...event,
	};
	try {
		stream.write(`${JSON.stringify(payload)}\n`);
	} catch {
		// Never let observability affect agent execution.
	}
}

export function emitDashboardToolStart(event: {
	toolCallId?: string;
	toolName: string;
	args?: unknown;
}): void {
	emitDashboardEvent({
		type: "pi.tool.start",
		toolCallId: event.toolCallId,
		toolName: event.toolName,
		argsPreview: summarizeValue(event.args),
	});
}

export function emitDashboardToolUpdate(event: {
	toolCallId?: string;
	toolName: string;
	partialResult?: unknown;
}): void {
	emitDashboardEvent({
		type: "pi.tool.update",
		toolCallId: event.toolCallId,
		toolName: event.toolName,
		partialPreview: summarizeValue(event.partialResult),
	});
}

export function emitDashboardToolEnd(event: {
	toolCallId?: string;
	toolName: string;
	isError?: boolean;
	result?: unknown;
}): void {
	emitDashboardEvent({
		type: "pi.tool.end",
		toolCallId: event.toolCallId,
		toolName: event.toolName,
		isError: !!event.isError,
		resultPreview: summarizeValue(event.result),
	});
}

export function emitDashboardFormatterRun(event: {
	filePath: string;
	formatter: string;
	success: boolean;
	changed: boolean;
	error?: string;
}): void {
	emitDashboardEvent({
		type: "lens.formatter.run",
		filePath: event.filePath,
		fileUri: fileUri(event.filePath),
		formatter: event.formatter,
		success: event.success,
		changed: event.changed,
		error: truncate(event.error),
	});
}

export function emitDashboardRunnerRun(event: {
	filePath: string;
	runnerId: string;
	status: string;
	diagnosticCount: number;
	durationMs: number;
	semantic?: string;
}): void {
	emitDashboardEvent({
		type: "lens.runner.run",
		filePath: event.filePath,
		fileUri: fileUri(event.filePath),
		runnerId: event.runnerId,
		status: event.status,
		diagnosticCount: event.diagnosticCount,
		durationMs: event.durationMs,
		semantic: event.semantic,
	});
}

export function emitDashboardLspEvent(event: {
	serverId: string;
	root: string;
	status: "spawn_start" | "spawn_success" | "spawn_failed" | "unavailable";
	filePath?: string;
	durationMs?: number;
	error?: string;
	source?: string;
}): void {
	emitDashboardEvent({
		type: "lens.lsp",
		serverId: event.serverId,
		root: event.root,
		rootUri: fileUri(event.root),
		status: event.status,
		filePath: event.filePath,
		fileUri: event.filePath ? fileUri(event.filePath) : undefined,
		durationMs: event.durationMs,
		error: truncate(event.error),
		source: event.source,
	});
}

export function emitDashboardFormatterSelected(event: {
	filePath: string;
	cwd: string;
	formatter?: string | null;
	reason: string;
}): void {
	emitDashboardEvent({
		type: "lens.config.formatter_selected",
		filePath: event.filePath,
		fileUri: fileUri(event.filePath),
		cwd: event.cwd,
		formatter: event.formatter ?? null,
		reason: event.reason,
	});
}

export function emitDashboardDiagnostics(event: {
	filePath: string;
	diagnostics: Array<{
		tool?: string;
		rule?: string;
		id?: string;
		message?: string;
		line?: number;
		column?: number;
		severity?: string;
		semantic?: string;
	}>;
}): void {
	emitDashboardEvent({
		type: "lens.diagnostics",
		filePath: event.filePath,
		fileUri: fileUri(event.filePath),
		diagnosticCount: event.diagnostics.length,
		diagnostics: event.diagnostics.slice(0, 100).map((d) => ({
			tool: d.tool,
			rule: d.rule ?? d.id,
			message: truncate(d.message),
			line: d.line,
			column: d.column,
			severity: d.severity,
			semantic: d.semantic,
			uri: fileUri(event.filePath, d.line, d.column),
		})),
	});
}

function summarizeValue(value: unknown): unknown {
	if (value === null || value === undefined) return value;
	if (typeof value === "string") return truncate(value);
	if (typeof value === "number" || typeof value === "boolean") return value;
	if (Array.isArray(value)) return value.slice(0, 8).map(summarizeValue);
	if (typeof value !== "object") return String(value);

	const out: Record<string, unknown> = {};
	for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
		if (SECRET_KEY_RE.test(key)) {
			out[key] = "<redacted>";
		} else if (PATHISH_KEY_RE.test(key)) {
			out[key] = summarizeValue(raw);
		} else if (typeof raw === "number" || typeof raw === "boolean") {
			out[key] = raw;
		}
	}
	return out;
}

function truncate(
	value: string | undefined,
	max = MAX_PREVIEW_CHARS,
): string | undefined {
	if (!value) return value;
	const normalized = value.replace(/\s+/g, " ").trim();
	return normalized.length > max ? `${normalized.slice(0, max)}…` : normalized;
}

function fileUri(filePath: string, line?: number, column?: number): string {
	const base = pathToFileURL(filePath).href;
	if (!line) return base;
	return `${base}#L${line}${column ? `:${column}` : ""}`;
}

function startTerminalDashboard(logPath: string): void {
	if (terminalStarted) return;
	terminalStarted = true;

	const scriptPath = path.resolve(
		path.dirname(fileURLToPath(import.meta.url)),
		"..",
		"tools",
		"dashboard-terminal.mjs",
	);
	const node = process.execPath;

	try {
		if (process.platform === "win32") {
			spawn(
				"cmd.exe",
				["/c", "start", "pi-lens dashboard", node, scriptPath, logPath],
				{ detached: true, stdio: "ignore", windowsHide: true },
			).unref();
			return;
		}

		if (process.platform === "darwin") {
			const command = `${shellQuote(node)} ${shellQuote(scriptPath)} ${shellQuote(logPath)}`;
			spawn(
				"osascript",
				[
					"-e",
					`tell application "Terminal" to do script ${JSON.stringify(command)}`,
				],
				{ detached: true, stdio: "ignore" },
			).unref();
			return;
		}

		const args = [node, scriptPath, logPath];
		for (const terminal of [
			"x-terminal-emulator",
			"gnome-terminal",
			"konsole",
			"xfce4-terminal",
			"xterm",
		]) {
			const childArgs =
				terminal === "gnome-terminal" || terminal === "xfce4-terminal"
					? ["--", ...args]
					: ["-e", ...args];
			try {
				spawn(terminal, childArgs, { detached: true, stdio: "ignore" }).unref();
				return;
			} catch {
				// try next terminal
			}
		}
	} catch {
		// Dashboard log still exists; terminal launch is best-effort.
	}
}

function shellQuote(value: string): string {
	return `'${value.replace(/'/g, "'\\''")}'`;
}
