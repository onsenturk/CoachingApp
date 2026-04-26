#requires -Version 7
<#
.SYNOPSIS
  Sync local Foundry agent manifest to Azure AI Foundry via REST.

.DESCRIPTION
  Reads agents/foundry-agents.json, expands ${...} env-var references, and
  upserts each agent into the Foundry project endpoint as a "prompt" agent.

  Foundry hosted/prompt-agent REST flow (api-version=v1):
    - POST {endpoint}/agents                            → create new agent (v1)
    - POST {endpoint}/agents/{name}/versions            → add new version
    - DELETE {endpoint}/agents/{name}                   → delete

  Auth: az account get-access-token --resource https://ai.azure.com/

  Per `.github/copilot-instructions.md` Azure safety policy:
    - Read-only Azure ops are allowed.
    - This script CREATES/UPDATES Foundry agents. Pass `-Confirm:$false` to skip prompt.

.PARAMETER ProjectEndpoint
  Foundry project endpoint, e.g.
    https://my-account.services.ai.azure.com/api/projects/my-project
  Defaults to $env:AZURE_FOUNDRY_PROJECT_ENDPOINT.

.PARAMETER ManifestPath
  Path to foundry-agents.json. Defaults to ./agents/foundry-agents.json.

.PARAMETER ApiVersion
  Foundry Agents REST API version. Defaults to v1.

.EXAMPLE
  pwsh ./scripts/sync-foundry-agents.ps1 -Confirm:$false
#>
[CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'High')]
param(
  [string]$ProjectEndpoint = $env:AZURE_FOUNDRY_PROJECT_ENDPOINT,
  [string]$ManifestPath = (Join-Path $PSScriptRoot '..' 'agents' 'foundry-agents.json'),
  [string]$ApiVersion = 'v1'
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

  # Build the prompt-agent definition. tools/temperature/top_p go inside `definition`.
  $definition = [ordered]@{
    kind         = 'prompt'
    model        = $manifest.modelDeploymentName
    instructions = $agent.baseInstruction
  }
  if ($agent.tools -and $agent.tools.Count -gt 0) { $definition.tools = @($agent.tools) }
  if ($null -ne $agent.temperature) { $definition.temperature = $agent.temperature }
  if ($null -ne $agent.topP) { $definition.top_p = $agent.topP }

  $metadata = @{ useCaseId = $agent.useCaseId; sourceManifest = (Split-Path -Leaf $ManifestPath) }

  # Probe whether the agent exists.
  $existsUrl = "$baseUrl/$agentName" + "?api-version=$ApiVersion"
  $exists = $false
  try {
    Invoke-RestMethod -Method Get -Uri $existsUrl -Headers $headers | Out-Null
    $exists = $true
  }
  catch {
    if ($_.Exception.Response.StatusCode.value__ -ne 404) { throw }
  }

  if ($exists) {
    # Update → POST a new version.
    $url = "$baseUrl/$agentName/versions" + "?api-version=$ApiVersion"
    $body = [ordered]@{
      description = $agent.description
      definition  = $definition
      metadata    = $metadata
    } | ConvertTo-Json -Depth 8

    if ($PSCmdlet.ShouldProcess($agentName, "POST $url (new version)")) {
      Write-Host "Updating $agentName (new version)..." -ForegroundColor Yellow
      try {
        $resp = Invoke-RestMethod -Method Post -Uri $url -Headers $headers -Body $body
        $ver = if ($resp.version) { $resp.version } else { '?' }
        Write-Host "  ok (version $ver)" -ForegroundColor Green
      }
      catch {
        Write-Error "Failed to update $agentName : $($_.ErrorDetails.Message)"
      }
    }
  }
  else {
    # Create → POST to /agents.
    $url = "$baseUrl" + "?api-version=$ApiVersion"
    $body = [ordered]@{
      name        = $agentName
      description = $agent.description
      definition  = $definition
      metadata    = $metadata
    } | ConvertTo-Json -Depth 8

    if ($PSCmdlet.ShouldProcess($agentName, "POST $url (create)")) {
      Write-Host "Creating $agentName..." -ForegroundColor Yellow
      try {
        $resp = Invoke-RestMethod -Method Post -Uri $url -Headers $headers -Body $body
        $id = if ($resp.id) { $resp.id } else { $agentName }
        Write-Host "  ok ($id)" -ForegroundColor Green
      }
      catch {
        Write-Error "Failed to create $agentName : $($_.ErrorDetails.Message)"
      }
    }
  }
}

Write-Host "Done." -ForegroundColor Cyan
