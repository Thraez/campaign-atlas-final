# PreToolUse hook: refuse Edit/Write/MultiEdit on build outputs.
# Exit 2 blocks the tool call; stderr is shown to Claude.

$ErrorActionPreference = 'Stop'

function Block-ToolCall([string]$Message) {
    [Console]::Error.WriteLine($Message)
    exit 2
}

try {
    $raw = [Console]::In.ReadToEnd()
    if ([string]::IsNullOrWhiteSpace($raw)) {
        Block-ToolCall 'block-generated-paths: missing hook input; refusing the write.'
    }
    $data = $raw | ConvertFrom-Json
} catch {
    [Console]::Error.WriteLine("block-generated-paths: invalid JSON on stdin: $_")
    exit 2
}

$path = $null
if ($data.tool_input) { $path = $data.tool_input.file_path }
if ([string]::IsNullOrWhiteSpace($path)) {
    Block-ToolCall 'block-generated-paths: write tool supplied no file path; refusing the write.'
}

try {
    $projectRoot = if ($env:CLAUDE_PROJECT_DIR) {
        [IO.Path]::GetFullPath($env:CLAUDE_PROJECT_DIR)
    } else {
        [IO.Path]::GetFullPath((Get-Location).Path)
    }
    $fullPath = if ([IO.Path]::IsPathRooted($path)) {
        [IO.Path]::GetFullPath($path)
    } else {
        [IO.Path]::GetFullPath((Join-Path $projectRoot $path))
    }
} catch {
    Block-ToolCall "block-generated-paths: could not resolve '$path'; refusing the write."
}

$forbiddenRoots = @(
    (Join-Path $projectRoot 'public/atlas'),
    (Join-Path $projectRoot '.local-atlas'),
    (Join-Path $projectRoot 'dist'),
    (Join-Path $projectRoot 'dist-ssr')
)

foreach ($candidate in $forbiddenRoots) {
    $forbiddenRoot = [IO.Path]::TrimEndingDirectorySeparator([IO.Path]::GetFullPath($candidate))
    $insideRoot = $fullPath.StartsWith(
        $forbiddenRoot + [IO.Path]::DirectorySeparatorChar,
        [StringComparison]::OrdinalIgnoreCase
    )
    if ([string]::Equals($fullPath, $forbiddenRoot, [StringComparison]::OrdinalIgnoreCase) -or $insideRoot) {
        [Console]::Error.WriteLine("Refusing to edit generated artifact at '$path'. These paths are build outputs of the atlas pipeline. Edit the source (YAML frontmatter, world.yaml, scripts/, or src/) and rebuild with 'npm run atlas:build:player' or 'npm run atlas:publish'.")
        exit 2
    }
}

exit 0
