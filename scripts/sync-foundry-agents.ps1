#requires -Version 7
<#
.SYNOPSIS
  Sync local Foundry agent manifest to Azure AI Foundry via REST.

.DESCRIPTION
  Reads agents/foundry-agents.json, expands ${...} env-var references, and
  upserts each agent into the Foundry project endpoint. Uses Azure CLI for
  auth (`az account get-access-token --resource https://ai.azure.com/`).

  Per `.github/copilot-instructions.md` Azure safety policy:
    - Read-only Azure ops are allowed.
    - This script CREATES/UPDATES Foundry agents. Do NOT run without explicit
      user confirmation. Pass `-Confirm:$false` to skip the prompt.

.PARAMETER ProjectEndpoint
  Foundry project endpoint, e.g.
    https://my-account.services.ai.azure.com/api/projects/my-project
  Defaults to $env:AZURE_FOUNDRY_PROJECT_ENDPOINT.

.PARAMETER ManifestPath
  Path to foundry-agents.json. Defaults to ./agents/foundry-agents.json.

.PARAMETER ApiVersion
  Foundry Agents REST API version. Defaults to 2025-11-15-preview.

.EXAMPLE
  pwsh ./scripts/sync-foundry-agents.ps1 -Confirm:$false
#>
[CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'High')]
param(
  [string]$ProjectEndpoint = $env:AZURE_FOUNDRY_PROJECT_ENDPOINT,
  [string]$ManifestPath = (Join-Path $PSScriptRoot '..' 'agents' 'foundry-agents.json'),
  [string]$ApiVersion = '2025-11-15-preview'
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

if (-not $ProjectEndpoint) {
  throw "ProjectEndpoint is required (set AZURE_FOUNDRY_PROJECT_ENDPOINT or pass -ProjectEndpoint)."
}
if (-not (Test-Path $ManifestPath)) {
  throw "Manifest not found: $ManifestPath"
}

# Resolve ${VAR} placeholders against the current environment.
function Expand-EnvPlaceholders {
  param([string]$Text)
  return [regex]::Replace($Text, '\$\{([A-Z0-9_]+)\}', {
      param($m)
      $name = $m.Groups[1].Value
      $val = [System.Environment]::GetEnvironmentVariable($name)
      if (-not $val) { throw "Required env var '$name' is not set." }
      return $val
    })
}

$rawText = Get-Content -Raw $ManifestPath
$expandedText = Expand-EnvPlaceholders -Text $rawText
$manifest = $expandedText | ConvertFrom-Json

Write-Host "Acquiring Foundry token..." -ForegroundColor Cyan
$tokenJson = az account get-access-token --resource 'https://ai.azure.com/' --output json | ConvertFrom-Json
if (-not $tokenJson.accessToken) {
  throw "Failed to acquire token. Run 'az login' first."
}
$headers = @{
  Authorization  = "Bearer $($tokenJson.accessToken)"
  'Content-Type' = 'application/json'
}

$baseUrl = "$($ProjectEndpoint.TrimEnd('/'))/agents"

foreach ($agent in $manifest.agents) {
  $agentName = "$($manifest.agentNamePrefix)-$($agent.useCaseId)"
  $url = "$baseUrl/$agentName" + "?api-version=$ApiVersion"
  $body = [ordered]@{
    name        = $agentName
    description = $agent.description
    model       = $manifest.modelDeploymentName
    instructions = $agent.baseInstruction
    tools       = @($agent.tools)
    temperature = $agent.temperature
    top_p       = $agent.topP
    metadata    = @{ useCaseId = $agent.useCaseId; sourceManifest = (Split-Path -Leaf $ManifestPath) }
  } | ConvertTo-Json -Depth 8

  if ($PSCmdlet.ShouldProcess($agentName, "PUT $url")) {
    Write-Host "Upserting $agentName..." -ForegroundColor Yellow
    try {
      $resp = Invoke-RestMethod -Method Put -Uri $url -Headers $headers -Body $body
      Write-Host "  ok ($($resp.id ?? $agentName))" -ForegroundColor Green
    }
    catch {
      Write-Error "Failed to upsert $agentName : $_"
    }
  }
}

Write-Host "Done." -ForegroundColor Cyan
