---
description: 'Bicep authoring standards for Azure IaC, including Azure Verified Modules (AVM) usage'
applyTo: '**/*.{bicep,bicepparam}'
---

# Bicep Authoring Guidelines

Standards for writing Bicep (`.bicep`) and Bicep parameter (`.bicepparam`) files. Aligns with `.github/agents/engineering-standards.agent.md`.

## Azure Verified Modules (AVM) First

- **AVM is the default.** Before writing a custom resource block, check the [Azure Verified Modules registry](https://azure.github.io/Azure-Verified-Modules/) for a matching module.
- Reference AVM resource modules with `br/public:avm/res/<provider>/<resource>:<version>`.
- Reference AVM pattern modules with `br/public:avm/ptn/<pattern>:<version>`.
- **Pin exact versions** (e.g., `0.4.0`). Never use `:latest` or floating ranges.
- When no AVM module exists, write custom Bicep following AVM conventions (diagnostics, RBAC, tags, locks parameters).

## Project Layout

```
infra/
├── env/
│   ├── dev/
│   │   ├── main.bicep
│   │   └── main.dev.bicepparam
│   └── prd/
│       ├── main.bicep
│       └── main.prd.bicepparam
└── modules/
    └── <feature>/
        └── main.bicep
```

- One folder per module. `main.bicep` is the entrypoint.
- Use `.bicepparam` files — never JSON parameter files.
- Never hardcode environment-specific values in modules; pass via parameters.

## Parameters

- Prefer **user-defined types** over open types (`object`, `array`).
- Mark secrets with `@secure()`.
- Add `@description()` to every parameter and output.
- Use `@allowed([...])` for constrained enums.
- Validate ranges: `@minLength`, `@maxLength`, `@minValue`, `@maxValue`.

```bicep
@description('Environment short code used for naming.')
@allowed(['dev', 'tst', 'prd'])
param environment string

@description('Admin password for the SQL server.')
@secure()
param sqlAdminPassword string
```

## Resources

- Use **symbolic references** (`resource.id`, `resource.properties.x`) — never `resourceId()` or `reference()`.
- Use the `parent` property for child resources — not slash-separated names.
  ```bicep
  resource db 'Microsoft.Sql/servers/databases@2023-08-01' = {
    parent: sqlServer
    name: 'appdb'
    // ...
  }
  ```
- Use the latest stable API version for each resource type.
- Prefer **managed identities** over connection strings and keys.

## Security & Governance

- **Every resource gets tags.** Use a standard tag object:
  ```bicep
  var standardTags = {
    environment: environment
    project: projectName
    owner: ownerEmail
    costCenter: costCenter
  }
  ```
- **RBAC over keys.** Assign roles via `role_assignments` parameters on AVM modules.
- **Diagnostics on.** Route logs/metrics to Log Analytics or Application Insights.
- **Locks** on production resources (`CanNotDelete` or `ReadOnly`).
- **Private endpoints** where the resource supports them and networking requires it.
- **No public access** unless explicitly justified — default to private networking.

## Outputs

- Expose only what downstream modules need.
- **Never** output secrets. If you must return a reference to a secret, output the Key Vault URI and reference, not the value.
- Add `@description()` to every output.

## Formatting

- 2-space indentation.
- Use `bicep format` before commit — it is the canonical formatter.
- Keep modules under ~300 lines. Split larger modules into sub-modules.

## Common Mistakes

- Hardcoding subscription IDs, resource group names, or location strings.
- Using `resourceId()` instead of symbolic references — it breaks compile-time validation.
- Forgetting `@secure()` on sensitive parameters — values will appear in deployment history.
- Using `listKeys()` / `listSecrets()` in outputs — exposes secrets in deployment output.
- Creating role assignments with GUID role definition IDs in raw form instead of the `roleDefinitionIdOrName` helper.
- Mixing environments in a single `main.bicep` via `if` conditions — prefer one deployment per environment.

## Validation

Before committing:

```powershell
bicep build main.bicep           # compile check
bicep format main.bicep          # canonical formatting
az deployment group what-if ...  # preview changes (read-only)
```
