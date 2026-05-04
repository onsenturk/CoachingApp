---
description: "Use when creating, editing, or reviewing draw.io diagrams and mxGraph XML in .drawio, .drawio.svg, or .drawio.png files."
applyTo: "**/*.drawio,**/*.drawio.svg,**/*.drawio.png"
---

# draw.io Diagram Standards

> **Skill**: Load `.github/skills/draw-io-diagram-generator/SKILL.md` for full workflow, XML recipes, and troubleshooting before generating or editing any `.drawio` file.

---

## Required Workflow

Follow these steps for every draw.io task:

1. **Identify** the diagram type (flowchart / architecture / sequence / ER / UML / network / BPMN)
2. **Select** the matching template from `.github/skills/draw-io-diagram-generator/assets/templates/` and adapt it, or start from the minimal skeleton
3. **Plan** the layout on paper before writing XML — define tiers, actors, or entities first
4. **Generate** valid mxGraph XML following the rules below
5. **Validate** using `python .github/skills/draw-io-diagram-generator/scripts/validate-drawio.py <file>`
6. **Confirm** the file renders by opening it in VS Code with the draw.io extension (`hediet.vscode-drawio`)

---

## XML Structure Rules (Non-Negotiable)

```xml
<!-- Set modified to the current ISO 8601 timestamp when generating a new file -->
<mxfile host="Electron" modified="" version="26.0.0">
  <diagram id="unique-id" name="Page Name">
    <mxGraphModel ...>
      <root>
        <mxCell id="0" />                          <!-- REQUIRED: always first -->
        <mxCell id="1" parent="0" />               <!-- REQUIRED: always second -->
        <!-- all other cells go here -->
      </root>
    </mxGraphModel>
  </diagram>
</mxfile>
```

- `id="0"` and `id="1"` **must** be present and must be the first two cells — no exceptions
- Every cell `id` must be **unique** within the diagram
- Every vertex (`vertex="1"`) must have a child `<mxGeometry x y width height as="geometry">`
- Every edge (`edge="1"`) must have `source`/`target` pointing to existing vertex ids — **exception**: floating edges (sequence diagram lifelines) use `<mxPoint as="sourcePoint">` and `<mxPoint as="targetPoint">` inside `<mxGeometry>` instead of `source`/`target` attributes
- Every cell except id=0 must have `parent` pointing to an existing id
- Children of a container (swimlane) use **coordinates relative to their parent**, not the canvas

---

## Mandatory Style Conventions

### Semantic Color Palette — Use consistently across the project

| Role | fillColor | strokeColor |
|---|---|---|
| Primary / Info (default) | `#dae8fc` | `#6c8ebf` |
| Success / Start / Positive | `#d5e8d4` | `#82b366` |
| Warning / Decision | `#fff2cc` | `#d6b656` |
| Error / End / Danger | `#f8cecc` | `#b85450` |
| Neutral / Interface | `#f5f5f5` | `#666666` |
| External / Partner | `#e1d5e7` | `#9673a6` |

### Always include on vertex shapes

```
whiteSpace=wrap;html=1;
```

### Use `html=1` whenever a label contains HTML tags (`<b>`, `<i>`, `<br>`)

### Standard connectors

```
edgeStyle=orthogonalEdgeStyle;html=1;
```

---

## Azure Architecture Diagrams (Required)

When the diagram represents an **Azure architecture**, you MUST use the official Azure shape library — never plain rectangles for Azure services.

### Shape library

Use the modern Azure 2019+ stencils (`mxgraph.azure2_*`). The legacy `mxgraph.azure_*` library is acceptable only if a 2019+ equivalent does not exist.

Style pattern:

```
sketch=0;points=[[0,0,0],[0.5,0,0],[1,0,0],[1,0.5,0],[1,1,0],[0.5,1,0],[0,1,0],[0,0.5,0]];
outlineConnect=0;fontColor=#232F3E;gradientColor=none;fillColor=#ffffff;strokeColor=none;
dashed=0;verticalLabelPosition=bottom;verticalAlign=top;align=center;html=1;
shape=mxgraph.azure2.<service-name>;
```

Standard size for Azure service icons: **64 × 64** px (with label below). Tier swimlanes still group them.

### Common Azure stencil names

| Service                       | `shape=` value                                          |
| ----------------------------- | ------------------------------------------------------- |
| App Service                   | `mxgraph.azure2.app_services`                           |
| Function App                  | `mxgraph.azure2.function_apps`                          |
| Container Apps                | `mxgraph.azure2.container_instances` (closest)          |
| AKS                           | `mxgraph.azure2.kubernetes_services`                    |
| Static Web Apps               | `mxgraph.azure2.app_service_plans`                      |
| API Management                | `mxgraph.azure2.api_management_services`                |
| Azure SQL                     | `mxgraph.azure2.sql_database`                           |
| PostgreSQL Flexible Server    | `mxgraph.azure2.azure_database_postgre_sql_server`      |
| Cosmos DB                     | `mxgraph.azure2.azure_cosmos_db`                        |
| Storage Account / Blob        | `mxgraph.azure2.storage_accounts`                       |
| Key Vault                     | `mxgraph.azure2.key_vaults`                             |
| Application Insights          | `mxgraph.azure2.application_insights`                   |
| Log Analytics                 | `mxgraph.azure2.log_analytics_workspaces`               |
| Entra ID                      | `mxgraph.azure2.azure_active_directory`                 |
| Front Door / CDN              | `mxgraph.azure2.front_doors`                            |
| Application Gateway           | `mxgraph.azure2.application_gateways`                   |
| Virtual Network               | `mxgraph.azure2.virtual_networks`                       |
| Private Endpoint              | `mxgraph.azure2.private_endpoint`                       |
| Service Bus                   | `mxgraph.azure2.service_bus`                            |
| Event Grid                    | `mxgraph.azure2.event_grid_topics`                      |
| Event Hub                     | `mxgraph.azure2.event_hubs`                             |
| AI Foundry / OpenAI           | `mxgraph.azure2.cognitive_services`                     |
| AI Search                     | `mxgraph.azure2.search_services`                        |
| Container Registry            | `mxgraph.azure2.container_registries`                   |

> If unsure of the exact stencil name, open draw.io desktop/web → enable the **Azure / Azure 2019** shape library → search for the service → right-click → "Edit Style" to copy the exact `shape=` value.

### Containers, subscriptions, and regions

Wrap Azure resources in containers that mirror the Azure hierarchy:

- **Subscription / Resource Group** — `swimlane` with light fill, label at top
- **Region** — outer container labelled e.g. `Region: East US 2`
- **VNet / Subnet** — `dashed=1` rectangle with label

Use the semantic color palette (Primary `#dae8fc`/`#6c8ebf`) for these wrapper containers; the icons themselves keep their official Azure colors.

### Connectors and direction

- Use `edgeStyle=orthogonalEdgeStyle;html=1;` with arrow direction matching data/request flow.
- Label every cross-tier edge (e.g. `HTTPS`, `AMQP 5671`, `Private Endpoint`).
- For Private Endpoint connections use `dashed=1` to distinguish from public traffic.

### Always include a legend

Add a small legend cell on every Azure architecture diagram showing: public traffic (solid), private traffic (dashed), management plane (dotted).

---

## Diagram-Type Quick Reference

| Type | Container | Key shapes | Connector style |
|---|---|---|---|
| Flowchart | None | `ellipse` (start/end), `rounded=1` (process), `rhombus` (decision) | `orthogonalEdgeStyle` |
| Architecture | `swimlane` per tier | `rounded=1` services, cloud/DB shapes | `orthogonalEdgeStyle` with labels |
| Sequence | None | `mxgraph.uml.actor`, dashed lifeline edges | `endArrow=block` (sync), `endArrow=open;dashed=1` (return) |
| ER Diagram | `shape=table;childLayout=tableLayout` | `shape=tableRow`, `shape=partialRectangle` | `entityRelationEdgeStyle;endArrow=ERmany;startArrow=ERone` |
| UML Class | `swimlane` per class | text rows for attributes/methods | `endArrow=block;endFill=0` (inherit), `dashed=1` (realize) |

---

## Layout Best Practices

- Align all coordinates to the **10 px grid** (values divisible by 10)
- **Horizontal**: 40–60 px gap between same-row shapes
- **Vertical**: 80–120 px gap between tier rows
- Standard shape size: `120 × 60` px (process), `200 × 100` px (decision diamond)
- Default canvas: A4 landscape `1169 × 827` px
- Maximum **40 cells per page** — split into multiple pages for larger diagrams
- Add a **title text cell** at top of every page:
  ```
  style="text;strokeColor=none;fillColor=none;fontSize=18;fontStyle=1;align=center;"
  ```

---

## File and Naming Conventions

- Extension: `.drawio` for version-controlled diagrams, `.drawio.svg` for files embedded in Markdown
- Naming: `kebab-case` — e.g. `order-flow.drawio`, `database-schema.drawio`
- Location: `docs/` or `architecture/` alongside the code they document
- Multi-page: use one `<diagram>` element per logical view within the same `<mxfile>`

---

## Validation Checklist (run before every commit)

- [ ] `<mxCell id="0" />` and `<mxCell id="1" parent="0" />` are the first two cells
- [ ] All cell ids are unique within their diagram
- [ ] All edge `source`/`target` ids resolve to existing vertices
- [ ] All vertex cells have `<mxGeometry as="geometry">`
- [ ] All cells (except id=0) have a valid `parent`
- [ ] XML is well-formed — no unclosed tags, no bare `&`, `<`, `>` in attribute values
- [ ] Semantic color palette used consistently
- [ ] Title cell present on every page

```bash
# Run automated validation
python .github/skills/draw-io-diagram-generator/scripts/validate-drawio.py <file.drawio>
```

---

## Reference Files

| File | Use For |
|---|---|
| `.github/skills/draw-io-diagram-generator/SKILL.md` | Full agent workflow, recipes, troubleshooting |
| `.github/skills/draw-io-diagram-generator/references/drawio-xml-schema.md` | Complete mxCell attribute reference |
| `.github/skills/draw-io-diagram-generator/references/style-reference.md` | All style keys, shape names, edge types |
| `.github/skills/draw-io-diagram-generator/references/shape-libraries.md` | Shape library catalog with style strings |
| `.github/skills/draw-io-diagram-generator/assets/templates/` | Ready-to-use `.drawio` templates per diagram type |
| `.github/skills/draw-io-diagram-generator/scripts/validate-drawio.py` | XML structure validator |
| `.github/skills/draw-io-diagram-generator/scripts/add-shape.py` | CLI: add a shape to an existing diagram |
