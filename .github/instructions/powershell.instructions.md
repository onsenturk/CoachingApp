---
description: 'PowerShell scripting best practices for .ps1, .psm1, and .psd1 files'
applyTo: '**/*.{ps1,psm1,psd1}'
---

# PowerShell Guidelines

Best practices for writing clean, safe, maintainable PowerShell scripts and modules.

## General Principles

- Target **PowerShell 7+** (cross-platform `pwsh`) unless a Windows PowerShell 5.1 constraint is documented.
- Use **full cmdlet names**, not aliases (`Get-ChildItem`, not `ls` or `gci`) — aliases harm readability and may differ across hosts.
- Use **approved verbs** (`Get-Verb`) for function names. Pair with a singular noun: `Get-UserProfile`, not `GetUsers`.
- Prefer the **PowerShell object pipeline** over text parsing. Avoid piping to `Out-String` just to grep it.
- Use `[CmdletBinding()]` on every advanced function to get common parameters (`-Verbose`, `-ErrorAction`, etc.) for free.

## Error Handling & Safety

- Set strict mode at the top of scripts:
  ```powershell
  Set-StrictMode -Version Latest
  $ErrorActionPreference = 'Stop'
  ```
- Use `try/catch/finally` for recoverable failures. Let unrecoverable failures terminate.
- Avoid `$?` and `$LASTEXITCODE` checks scattered through code — wrap native commands in functions that translate exit codes to exceptions.
- Use `throw` (not `Write-Error`) when you want to stop execution; use `Write-Error` for non-terminating errors the caller may continue past.
- Clean up with `try/finally` — not `trap` — for resource disposal.

## Parameters

- Declare parameters with `[Parameter()]` attributes. Mark required inputs `Mandatory = $true`.
- Use typed parameters (`[string]`, `[int]`, `[pscustomobject]`) — never leave parameters untyped.
- Validate inputs with `[ValidateSet()]`, `[ValidateNotNullOrEmpty()]`, `[ValidateRange()]`, `[ValidatePattern()]` before the function body runs.
- Support `-WhatIf` and `-Confirm` for destructive operations via `[CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'High')]` + `$PSCmdlet.ShouldProcess()`.

## Security

- **Never** store secrets in plain text. Use `Get-Secret` (SecretManagement module), environment variables, Azure Key Vault, or `SecureString` — not hardcoded strings.
- **Never** use `Invoke-Expression` on untrusted input. It is PowerShell's equivalent of `eval` and the top injection vector.
- When calling external commands, pass arguments as an array: `& git @args` — not a single interpolated string.
- Avoid `ConvertTo-SecureString -AsPlainText` for production credentials.
- Quote variables inside strings that will be passed to external processes to prevent argument injection.

## Output & Logging

- Return objects from functions. Let the caller format.
- Use `Write-Verbose`, `Write-Debug`, `Write-Warning` for diagnostics — not `Write-Host`.
- Reserve `Write-Host` for user-facing interactive output (colored prompts, progress banners).
- Use `Write-Information` with `-InformationAction Continue` when you need structured, suppressible user output.

## Style

- **Indentation:** 4 spaces, no tabs.
- **Braces:** open on the same line, close on their own line (OTBS / K&R).
- **Variable naming:** `$camelCase` for locals, `$PascalCase` for parameters and script-scope variables.
- **Line length:** 120 characters soft limit. Use backticks for continuation sparingly — prefer splatting.
- **Splatting:** use hashtables for cmdlets with many parameters:
  ```powershell
  $params = @{
      Path        = $sourcePath
      Destination = $targetPath
      Recurse     = $true
      Force       = $true
  }
  Copy-Item @params
  ```

## Modules

- Use a `.psd1` manifest for every module. Specify `RootModule`, `ModuleVersion`, `PowerShellVersion`, `FunctionsToExport`.
- **Never** export `*` — always list explicit functions in `FunctionsToExport`, `CmdletsToExport`, `VariablesToExport`, `AliasesToExport`.
- Structure modules with `Public/` and `Private/` folders; dot-source all `.ps1` files from the root module.

## Testing

- Write tests with **Pester 5+**. Place them alongside code as `*.Tests.ps1`.
- Use `Describe`/`Context`/`It` blocks. Mock external commands with `Mock`.
- Run `Invoke-ScriptAnalyzer` (PSScriptAnalyzer) in CI. Treat warnings as errors unless explicitly suppressed with justification.

## Common Mistakes

- Using `+=` on arrays in loops — creates a new array each iteration. Use `[System.Collections.Generic.List[object]]::new()` or a pipeline.
- Comparing with `==` — PowerShell uses `-eq`.
- Forgetting that `-eq` on arrays returns the matching elements, not a boolean.
- Using `$null -eq $var` (correct) vs. `$var -eq $null` (wrong pattern per PSScriptAnalyzer).
- Assuming `Get-Content` returns a single string — it returns an array of lines by default. Use `-Raw` for a single string.
