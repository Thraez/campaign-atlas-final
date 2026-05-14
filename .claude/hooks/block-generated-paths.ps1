# PreToolUse hook: refuse Edit/Write/MultiEdit on build outputs.
# Receives JSON via stdin per https://docs.claude.com/en/docs/claude-code/hooks
# Exit 2 blocks the tool call; stderr is shown to Claude.

$ErrorActionPreference = 'Stop'

try {
    $raw = [Console]::In.ReadToEnd()
    if (-not $raw) { exit 0 }
    $data = $raw | ConvertFrom-Json
} catch {
    [Console]::Error.WriteLine("block-generated-paths: invalid JSON on stdin: $_")
    exit 1
}

$path = $null
if ($data.tool_input) { $path = $data.tool_input.file_path }
if (-not $path) { exit 0 }

# Normalize separators so the same patterns match on Windows and POSIX.
$normalized = ($path -replace '\\', '/').ToLower()

$forbidden = @(
    '/public/atlas/',
    '/.local-atlas/',
    '/dist/',
    '/dist-ssr/'
)

foreach ($pattern in $forbidden) {
    if ($normalized.Contains($pattern)) {
        [Console]::Error.WriteLine("Refusing to edit generated artifact at '$path'. These paths are build outputs of the atlas pipeline. Edit the source (YAML frontmatter, world.yaml, scripts/, or src/) and rebuild with 'npm run atlas:build:player' or 'npm run atlas:publish'.")
        exit 2
    }
}

exit 0
