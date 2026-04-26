// ──────────────────────────────────────────────────────────────────────
// Azure AI Foundry — account + project + gpt-5.4 deployment for CoachingApp
//
// Scope: resource group (rg-coachingapp).
//
// Provisions:
//   1. Microsoft.CognitiveServices/accounts kind=AIServices with allowProjectManagement=true
//   2. A Foundry project under the account
//   3. A model deployment for gpt-5.4 (alias name "gpt-5-4" so it matches
//      AZURE_FOUNDRY_MODEL in .env and the agents manifest)
//   4. RBAC: Azure AI User on the account for the principal running deploy + agent sync
//
// Reference docs:
//   https://learn.microsoft.com/azure/ai-foundry/concepts/architecture
//   https://learn.microsoft.com/azure/templates/microsoft.cognitiveservices/accounts
// ──────────────────────────────────────────────────────────────────────

@description('Region for the Foundry account. Default Sweden Central per azure.md.')
param location string = resourceGroup().location

@description('Name of the AI Foundry account (Microsoft.CognitiveServices accounts resource).')
@minLength(2)
@maxLength(64)
param foundryAccountName string

@description('Name of the Foundry project under the account.')
@minLength(2)
@maxLength(64)
param foundryProjectName string

@description('Display name for the project (shown in Foundry portal).')
param foundryProjectDisplayName string = 'CoachingApp'

@description('Deployment name used by application code. Must match AZURE_FOUNDRY_MODEL env var.')
param modelDeploymentName string = 'gpt-5-4'

@description('Underlying model name. Use the dotted form per the model catalog.')
param modelName string = 'gpt-5.4'

@description('Model version. Pinned per the model catalog.')
param modelVersion string = '2026-03-05'

@description('Capacity in TPM units (1 = 1k tokens/min for GlobalStandard). 1 is enough for dev.')
@minValue(1)
@maxValue(2000)
param modelCapacity int = 1

@description('Object id of the Entra principal that should receive the Azure AI User role. Defaults to the deployer.')
param principalId string = deployer().objectId

@description('Tags applied to all resources.')
param tags object = {
  app: 'coachingapp'
  env: 'dev'
}

// ─── Foundry account (AIServices) ──────────────────────────────────────
resource foundryAccount 'Microsoft.CognitiveServices/accounts@2025-06-01' = {
  name: foundryAccountName
  location: location
  tags: tags
  kind: 'AIServices'
  sku: {
    name: 'S0'
  }
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    // Required for Foundry projects.
    allowProjectManagement: true
    // Required for AAD-only auth (no API keys).
    disableLocalAuth: true
    customSubDomainName: foundryAccountName
    publicNetworkAccess: 'Enabled'
    networkAcls: {
      defaultAction: 'Allow'
    }
  }
}

// ─── Foundry project ───────────────────────────────────────────────────
resource foundryProject 'Microsoft.CognitiveServices/accounts/projects@2025-06-01' = {
  parent: foundryAccount
  name: foundryProjectName
  location: location
  tags: tags
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    displayName: foundryProjectDisplayName
    description: 'CoachingApp AI Foundry project (plan-generator, daily-adjustment, coach-chat, activity-summary).'
  }
}

// ─── Model deployment (gpt-5.4 → alias gpt-5-4) ────────────────────────
resource modelDeployment 'Microsoft.CognitiveServices/accounts/deployments@2025-06-01' = {
  parent: foundryAccount
  name: modelDeploymentName
  sku: {
    name: 'GlobalStandard'
    capacity: modelCapacity
  }
  properties: {
    model: {
      format: 'OpenAI'
      name: modelName
      version: modelVersion
    }
    // Block model swap without redeploy → safer for prod.
    versionUpgradeOption: 'NoAutoUpgrade'
    raiPolicyName: 'Microsoft.DefaultV2'
  }
}

// ─── RBAC: Azure AI User on account for deployer / sync principal ─────
// "Azure AI User" gives data-plane access to invoke agents and the inference API.
var azureAiUserRoleId = '53ca6127-db72-4b80-b1b0-d745d6d5456d'

resource aiUserAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  scope: foundryAccount
  name: guid(foundryAccount.id, principalId, azureAiUserRoleId)
  properties: {
    principalId: principalId
    roleDefinitionId: subscriptionResourceId(
      'Microsoft.Authorization/roleDefinitions',
      azureAiUserRoleId
    )
    principalType: 'User'
  }
}

// ─── Outputs ───────────────────────────────────────────────────────────
@description('Foundry project endpoint to put in AZURE_FOUNDRY_PROJECT_ENDPOINT.')
output projectEndpoint string = 'https://${foundryAccount.name}.services.ai.azure.com/api/projects/${foundryProject.name}'

@description('Inference endpoint for direct Chat Completions calls (not used by agent flows).')
output inferenceEndpoint string = '${foundryAccount.properties.endpoint}models'

output accountName string = foundryAccount.name
output projectName string = foundryProject.name
output modelDeploymentNameOut string = modelDeployment.name
