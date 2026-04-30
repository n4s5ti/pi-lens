/**
 * File Kind Detection for pi-lens
 *
 * Centralized file type detection to avoid duplication across clients.
 * Maps file extensions and paths to semantic file kinds.
 */

import { basename, extname } from "node:path";

// --- Types ---

export type FileKind =
	| "jsts" // JavaScript/TypeScript/frameworks (js, jsx, ts, tsx, mjs, cjs, vue, svelte)
	| "python" // Python (.py)
	| "go" // Go (.go)
	| "rust" // Rust (.rs)
	| "cxx" // C/C++ (.c, .cc, .cpp, .h, .hpp, .cxx, etc.)
	| "cmake" // CMake (.cmake, CMakeLists.txt)
	| "shell" // Shell (.sh, .bash)
	| "json" // JSON (.json)
	| "markdown" // Markdown (.md, .mdx)
	| "css" // CSS (.css, .scss, .less)
	| "yaml" // YAML (.yaml, .yml)
	| "sql" // SQL (.sql)
	| "ruby" // Ruby (.rb, .rake, .gemspec, .ru)
	| "html" // HTML (.html, .htm)
	| "docker" // Dockerfile
	| "php" // PHP (.php)
	| "powershell" // PowerShell (.ps1, .psm1, .psd1)
	| "prisma" // Prisma schema (.prisma)
	| "csharp" // C# (.cs)
	| "fsharp" // F# (.fs, .fsi, .fsx)
	| "java" // Java (.java)
	| "kotlin" // Kotlin (.kt, .kts)
	| "swift" // Swift (.swift)
	| "dart" // Dart (.dart)
	| "lua" // Lua (.lua)
	| "zig" // Zig (.zig, .zon)
	| "haskell" // Haskell (.hs, .lhs)
	| "elixir" // Elixir (.ex, .exs)
	| "gleam" // Gleam (.gleam)
	| "ocaml" // OCaml (.ml, .mli)
	| "clojure" // Clojure (.clj, .cljs, .cljc, .edn)
	| "terraform" // Terraform (.tf, .tfvars)
	| "nix" // Nix (.nix)
	| "toml"; // TOML (.toml)

// --- Extension Maps ---

const KIND_EXTENSIONS: Record<FileKind, readonly string[]> = {
	jsts: [".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs", ".svelte", ".vue"],
	python: [".py"],
	go: [".go"],
	rust: [".rs"],
	// From llvm-project/clang/lib/Driver/Types.cpp clang::driver::types::lookupTypeForExtension:
	cxx: [
		// C
		".c",
		".h",
		// C++
		".c++",
		".cc",
		".cp",
		".cpp",
		".cxx",
		".hh",
		".hpp",
		".hxx",
		// C++ include files
		".inl",
		".ipp",
		".tpp",
		".txx",
		// C++20 module interface files
		".c++m",
		".cppm",
		".cxxm",
		".ixx",
		// CUDA
		".cu",
		// HIP
		".hip",
		// Objective-C
		".m",
		".mm",
		// OpenCL
		".cl",
		".clcpp",
	],
	cmake: [".cmake"],
	shell: [".sh", ".bash", ".zsh", ".fish"],
	json: [".json", ".jsonc", ".json5"],
	markdown: [".md", ".mdx"],
	css: [".css", ".scss", ".sass", ".less"],
	yaml: [".yaml", ".yml"],
	sql: [".sql"],
	ruby: [".rb", ".rake", ".gemspec", ".ru"],
	html: [".html", ".htm"],
	docker: [".dockerfile"],
	php: [".php"],
	powershell: [".ps1", ".psm1", ".psd1"],
	prisma: [".prisma"],
	csharp: [".cs"],
	fsharp: [".fs", ".fsi", ".fsx"],
	java: [".java"],
	kotlin: [".kt", ".kts"],
	swift: [".swift"],
	dart: [".dart"],
	lua: [".lua"],
	zig: [".zig", ".zon"],
	haskell: [".hs", ".lhs"],
	elixir: [".ex", ".exs"],
	gleam: [".gleam"],
	ocaml: [".ml", ".mli"],
	clojure: [".clj", ".cljs", ".cljc", ".edn"],
	terraform: [".tf", ".tfvars"],
	nix: [".nix"],
	toml: [".toml"],
};

// Reverse map: extension → file kind (for fast lookup)
const EXT_TO_KIND = new Map<string, FileKind>();
for (const [kind, exts] of Object.entries(KIND_EXTENSIONS)) {
	for (const ext of exts) {
		EXT_TO_KIND.set(ext.toLowerCase(), kind as FileKind);
	}
	// Also register without leading dot
	for (const ext of exts) {
		if (ext.startsWith(".")) {
			EXT_TO_KIND.set(ext.slice(1).toLowerCase(), kind as FileKind);
		}
	}
}

// Special filenames that indicate a file kind
const SPECIAL_FILENAMES: Array<{ pattern: RegExp; kind: FileKind }> = [
	{ pattern: /^CMakeLists\.txt$/i, kind: "cmake" },
	{ pattern: /^Makefile$/i, kind: "shell" },
	{ pattern: /^Dockerfile(\.\w+)?$/i, kind: "docker" },
];

// --- Detection Functions ---

/**
 * Detect the file kind from a file path.
 * Returns the semantic file kind or undefined if unknown.
 */
export function detectFileKind(filePath: string): FileKind | undefined {
	if (!filePath || typeof filePath !== "string") {
		return undefined;
	}

	// Check special filenames first
	const base = basename(filePath);
	for (const { pattern, kind } of SPECIAL_FILENAMES) {
		if (pattern.test(base)) {
			return kind;
		}
	}

	// Check by extension
	const ext = extname(filePath).toLowerCase();
	return EXT_TO_KIND.get(ext);
}

/**
 * Check if a file kind is supported by a specific tool or capability.
 *
 * @example
 * // Check if TypeScript file
 * if (isFileKind(filePath, "jsts")) { ... }
 *
 * // Check for multiple kinds
 * if (isFileKind(filePath, ["jsts", "python"])) { ... }
 */
export function isFileKind(
	filePath: string,
	kind: FileKind | FileKind[],
): boolean {
	const detected = detectFileKind(filePath);
	if (!detected) return false;

	if (Array.isArray(kind)) {
		return kind.includes(detected);
	}

	return detected === kind;
}

/**
 * Get all file kinds that match a given file extension.
 * Useful for listing which tools might handle a file.
 */
export function getFileKindsForExtension(ext: string): FileKind[] {
	const normalizedExt = ext.startsWith(".") ? ext : `.${ext}`;
	const kind = EXT_TO_KIND.get(normalizedExt.toLowerCase());
	return kind ? [kind] : [];
}

/**
 * Check if a file kind represents a code file (not config/markdown).
 */
export function isCodeKind(kind: FileKind): boolean {
	return [
		"jsts",
		"python",
		"go",
		"rust",
		"cxx",
		"shell",
		"ruby",
		"html",
		"php",
		"powershell",
		"prisma",
		"csharp",
		"fsharp",
		"java",
		"kotlin",
		"swift",
		"dart",
		"lua",
		"zig",
		"haskell",
		"elixir",
		"gleam",
		"ocaml",
		"clojure",
		"terraform",
		"nix",
	].includes(kind);
}

/**
 * Check if a file kind represents a text/config file.
 */
export function isConfigKind(kind: FileKind): boolean {
	return ["json", "yaml", "markdown", "css", "sql", "docker", "cmake", "toml"].includes(
		kind,
	);
}

/**
 * Get human-readable description of a file kind.
 */
export function getFileKindLabel(kind: FileKind): string {
	const labels: Record<FileKind, string> = {
		jsts: "JavaScript/TypeScript",
		python: "Python",
		go: "Go",
		rust: "Rust",
		cxx: "C/C++",
		cmake: "CMake",
		shell: "Shell",
		json: "JSON",
		markdown: "Markdown",
		css: "CSS",
		yaml: "YAML",
		sql: "SQL",
		ruby: "Ruby",
		html: "HTML",
		docker: "Dockerfile",
		php: "PHP",
		powershell: "PowerShell",
		prisma: "Prisma",
		csharp: "C#",
		fsharp: "F#",
		java: "Java",
		kotlin: "Kotlin",
		swift: "Swift",
		dart: "Dart",
		lua: "Lua",
		zig: "Zig",
		haskell: "Haskell",
		elixir: "Elixir",
		gleam: "Gleam",
		ocaml: "OCaml",
		clojure: "Clojure",
		terraform: "Terraform",
		nix: "Nix",
		toml: "TOML",
	};
	return labels[kind] ?? kind;
}

/**
 * Get file extensions for a file kind.
 */
export function getExtensionsForKind(kind: FileKind): string[] {
	return [...(KIND_EXTENSIONS[kind] ?? [])];
}

/**
 * Check if a file should be scanned for linting/formatting.
 * Excludes test files, generated files, etc.
 */
export function isScannableFile(filePath: string): boolean {
	const kind = detectFileKind(filePath);
	if (!kind) return false;

	// Exclude test files for most kinds
	const base = basename(filePath);
	if (
		base.includes(".test.") ||
		base.includes(".spec.") ||
		base.startsWith("test-") ||
		base.startsWith("spec-")
	) {
		return false;
	}

	// Only scan code and config files
	return isCodeKind(kind) || isConfigKind(kind);
}

/**
 * Get the language identifier for LSP/tools that use language IDs.
 */
export function getLanguageId(kind: FileKind): string {
	const languageIds: Record<FileKind, string> = {
		jsts: "typescript",
		python: "python",
		go: "go",
		rust: "rust",
		cxx: "cpp",
		cmake: "cmake",
		shell: "shell",
		json: "json",
		markdown: "markdown",
		css: "css",
		yaml: "yaml",
		sql: "sql",
		ruby: "ruby",
		html: "html",
		docker: "dockerfile",
		php: "php",
		powershell: "powershell",
		prisma: "prisma",
		csharp: "csharp",
		fsharp: "fsharp",
		java: "java",
		kotlin: "kotlin",
		swift: "swift",
		dart: "dart",
		lua: "lua",
		zig: "zig",
		haskell: "haskell",
		elixir: "elixir",
		gleam: "gleam",
		ocaml: "ocaml",
		clojure: "clojure",
		terraform: "terraform",
		nix: "nix",
		toml: "toml",
	};
	return languageIds[kind] ?? "plaintext";
}
