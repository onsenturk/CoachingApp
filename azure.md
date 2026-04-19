# Azure Configuration

> Fill these in before running `pnpm agents:sync` or any Azure operations.

## Tenant & Subscription

- **Tenant ID**: `<TBD>`
- **Subscription ID**: `<TBD>`
- **Default region**: `<TBD>` (e.g. `swedencentral`, `westeurope`)

## Azure AI Foundry

- **Resource group**: `<TBD>`
- **Foundry account name**: `<TBD>`
- **Foundry project name**: `<TBD>`
- **Project endpoint**: `https://<account>.services.ai.azure.com/api/projects/<project>`
- **Deployed model**: `<TBD>` (e.g. `gpt-4o`, `gpt-5-4`)
- **Agent name prefix**: `coaching`

## Authorization

The principal running agent sync needs **Azure AI User** (or higher) role on the Foundry project.

```pwsh
az role assignment create `
  --assignee <principal-id> `
  --role "Azure AI User" `
  --scope "/subscriptions/<sub>/resourceGroups/<rg>/providers/Microsoft.CognitiveServices/accounts/<account>/projects/<project>"
```

## Safety policy

This repository follows the Azure Safety Policy in `.github/copilot-instructions.md`:

- Read-only Azure operations are allowed without prompting.
- **No deployments, role assignments, or resource mutations without explicit user confirmation.**
- v1 of the app runs **locally via Docker Compose**. Cloud deployment (Container Apps / Bicep) is out of scope until user opts in.
